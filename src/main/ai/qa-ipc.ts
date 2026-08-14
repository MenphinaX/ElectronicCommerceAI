// 任务 6 聊天质检 IPC：三格式解析预览 + 可编辑提示词 + 流式质检 + 历史留痕
import { ipcMain } from 'electron'
import { appendFileSync, existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { AppDatabase } from '../db/database'
import { getSetting, insertQaRun, listQaRuns, setSetting } from '../db/repo'
import { OutputTruncatedError, chatCompleteStream, resolveModelConfig } from '../import/model-client'
import { decryptApiKey } from './models-ipc'
import {
  buildQaBatchPrompt, buildQaPrompt, buildQaSummaryPrompt, clampQaMaxTokens,
  parseQaText, qaStats, splitQaBatches, withQaTruncationNote, type QaMessage
} from './qa-service'

// 开源版不内置本机绝对路径；默认提示词由界面内置模板/用户自行填写（原开发机路径已移除）
const DEFAULT_PROMPT_FILE = ''

function loadDefaultPrompt(): string {
  try {
    if (existsSync(DEFAULT_PROMPT_FILE)) return readFileSync(DEFAULT_PROMPT_FILE, 'utf8')
  } catch {
    // 忽略读取失败，返回空模板
  }
  return ''
}

function baseName(p: string): string {
  return p.split(/[\\/]/).pop() ?? p
}

/** 验收留痕（QA4D-*，仅 EC_AI_AUTOSHOT=1 时写入项目根 autoshot-debug.log；绝不写 API key） */
function qaLog(line: string): void {
  if (process.env.EC_AI_AUTOSHOT !== '1') return
  try {
    appendFileSync(join(process.cwd(), 'autoshot-debug.log'), `${line}\n`)
  } catch {
    // 日志写入失败不影响质检主流程
  }
}

export function registerQaIpc(getDb: () => AppDatabase): void {
  // 导入区：解析预览（csv/txt/json 多文件批量，归一化为 会话ID/发送者/角色/时间戳/类型/内容）
  ipcMain.handle('qa:parse', (_e, paths: string[]) => {
    const files: Array<Record<string, unknown>> = []
    const records: QaMessage[] = []
    for (const p of paths) {
      try {
        const text = readFileSync(p, 'utf8')
        const msgs = parseQaText(baseName(p), text)
        files.push({ name: baseName(p), count: msgs.length })
        records.push(...msgs)
      } catch (e) {
        files.push({ name: baseName(p), count: 0, error: (e as Error).message })
      }
    }
    return { files, records, stats: qaStats(records) }
  })

  // 提示词：默认载入 Desktop 提示词文件全文（原样），编辑保存到 settings 表，恢复默认重新读文件
  ipcMain.handle('qa:prompt-get', () => {
    const defaultText = loadDefaultPrompt()
    const saved = getSetting(getDb(), 'qaPromptText')
    return { defaultText, currentText: saved ?? defaultText, sourceFile: DEFAULT_PROMPT_FILE, exists: defaultText.length > 0 }
  })
  ipcMain.handle('qa:prompt-set', (_e, text: string) => {
    setSetting(getDb(), 'qaPromptText', String(text ?? ''))
    return true
  })
  ipcMain.handle('qa:prompt-reset', () => {
    setSetting(getDb(), 'qaPromptText', '')
    return { currentText: loadDefaultPrompt() }
  })

  // 历史留痕：时间/文件数/会话数/模型/耗时/状态/报告
  ipcMain.handle('qa:history', () => listQaRuns(getDb(), 30))

  // 开始质检：面板全文 + 归一化记录（按会话分批 + maxTokens 上调 + finish_reason 检查）→ 流式输出 → 落库
  ipcMain.handle('qa:run', async (e, opts: { paths: string[]; prompt: string }) => {
    const db = getDb()
    const wc = e.sender
    const t0 = Date.now()
    const cfg = resolveModelConfig(db, null, decryptApiKey)
    if (!cfg) return { ok: false, message: '未配置模型：请先在设置中配置 AI 模型' }
    const files: Array<Record<string, unknown>> = []
    const records: QaMessage[] = []
    for (const p of opts.paths ?? []) {
      try {
        const text = readFileSync(p, 'utf8')
        const msgs = parseQaText(baseName(p), text)
        files.push({ name: baseName(p), count: msgs.length })
        records.push(...msgs)
      } catch (err) {
        files.push({ name: baseName(p), count: 0, error: (err as Error).message })
      }
    }
    if (!records.length) return { ok: false, message: '没有解析到任何聊天记录' }
    const promptBody = String(opts.prompt ?? '').trim() || loadDefaultPrompt() || '请对客服聊天记录进行质检，输出 markdown 报告（含统计与逐会话问题与建议）。'
    const stats = qaStats(records)
    const maxTokens = clampQaMaxTokens(getSetting(db, 'qaMaxTokens'))
    const batches = splitQaBatches(records)
    let acc = ''
    // 任务 4F ②：单批被截断（finish_reason=length）不再中止整轮——保留已生成内容继续后续批次，
    // 整轮结束标记 truncated 并追加说明，保证报告完整落库
    const streamOne = async (system: string, user: string, tag: string): Promise<{ part: string; truncated: boolean }> => {
      let part = ''
      let finishReason: string | null = null
      let cut = false
      try {
        for await (const chunk of chatCompleteStream(cfg, [
          { role: 'system', content: system },
          { role: 'user', content: user }
        ], {
          temperature: 0.3,
          maxTokens,
          timeoutMs: 300000,
          onFinish: (fr) => {
            finishReason = fr
          }
        })) {
          part += chunk
          acc += chunk
          wc.send('qa:chunk', { delta: chunk })
        }
      } catch (err) {
        if (!(err instanceof OutputTruncatedError)) throw err
        cut = true
      } finally {
        qaLog(`QA4D-BATCH ${tag} finish_reason=${String(finishReason)} chars=${part.length} truncated=${cut}`)
      }
      return { part, truncated: cut }
    }
    try {
      let anyTruncated = false
      if (batches.length <= 1) {
        const { system, user, truncated: t } = buildQaPrompt(promptBody, records)
        if (t) wc.send('qa:notice', { message: '记录总量超限已截断，报告基于截断后数据' })
        const r = await streamOne(system, user, 'single')
        anyTruncated = r.truncated
        acc = r.part
      } else {
        const parts: string[] = []
        for (let i = 0; i < batches.length; i++) {
          const { system, user, truncated: t } = buildQaBatchPrompt(promptBody, batches[i], {
            batchIndex: i + 1, batchCount: batches.length, totalRecords: records.length, allStats: stats
          })
          if (t) wc.send('qa:notice', { message: `第 ${i + 1}/${batches.length} 批记录超限已截断` })
          const r = await streamOne(system, user, `batch${i + 1}/${batches.length}`)
          parts.push(r.part)
          anyTruncated = anyTruncated || r.truncated
        }
        const summary = buildQaSummaryPrompt(promptBody, parts, { totalRecords: records.length, allStats: stats })
        const s = await streamOne(summary.system, summary.user, 'summary')
        anyTruncated = anyTruncated || s.truncated
        acc = parts.join('\n\n---\n\n') + '\n\n' + s.part
      }
      const report = withQaTruncationNote(acc, anyTruncated).trim()
      const elapsedMs = Date.now() - t0
      insertQaRun(db, { fileCount: files.length, sessionCount: stats.sessions, agentCount: stats.agents.length, model: cfg.model, elapsedMs, status: 'ok', report })
      wc.send('qa:done', { content: report, stats, elapsedMs, truncated: anyTruncated })
      qaLog(`QA4D-DONE batches=${batches.length} chars=${report.length} sessions=${stats.sessions} truncated=${anyTruncated}`)
      return { ok: true, truncated: anyTruncated }
    } catch (err) {
      const msg = (err as Error).message
      const elapsedMs = Date.now() - t0
      const partial = acc.trim()
      const report = partial ? `${partial}\n\n> 注意：报告生成中断（${msg}），以上为已生成部分` : `生成失败：${msg}`
      insertQaRun(db, { fileCount: files.length, sessionCount: stats.sessions, agentCount: stats.agents.length, model: cfg.model, elapsedMs, status: 'error', report })
      wc.send('qa:error', { message: msg, truncated: true })
      qaLog(`QA4D-ERROR chars=${partial.length} msg=${msg}`)
      return { ok: false, message: msg, truncated: true }
    }
  })
}
