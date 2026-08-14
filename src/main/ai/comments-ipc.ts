// 任务 6 评语 IPC：列表 / 自动生成（设置开关+去重）/ 手动重新生成（force）
// 渲染层不碰 SQL 与文件；未配 key 返回 configured=false，由 UI 显示「未配置模型」
import { ipcMain } from 'electron'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { AppDatabase } from '../db/database'
import { windowRange, type WindowMode } from '../db/dashboard'
import { getSetting, listSkills } from '../db/repo'
import { chatComplete, resolveModelConfig } from '../import/model-client'
import { decryptApiKey } from './models-ipc'
import { parseSkillMarkdown } from './skills-core'
import { generateComments, runRules, windowKey, COMMENT_BLOCKS, type CommentGenerateResult } from './comments'

interface CommentOpts {
  shopId: number
  mode: WindowMode
  today?: string
  module?: string
}

export function readSkillBody(rootDir: string, db: AppDatabase): (skillId: number) => { name: string; body: string } | null {
  const rows = listSkills(db) as Array<Record<string, unknown>>
  return (skillId: number) => {
    const row = rows.find((x) => Number(x.id) === skillId)
    if (!row || !row.path) return null
    try {
      const text = readFileSync(join(rootDir, String(row.path)), 'utf8')
      const parsed = parseSkillMarkdown(text)
      return { name: String(row.name), body: parsed ? parsed.body : text }
    } catch {
      return null
    }
  }
}

export function registerCommentsIpc(getDb: () => AppDatabase, rootDir: () => string): void {
  const payload = async (db: AppDatabase, opts: CommentOpts, generate: boolean, force: boolean): Promise<Record<string, unknown>> => {
    const shopId = Number(opts.shopId) || 0
    const today = opts.today || undefined
    const w = windowRange(opts.mode, today)
    const cfg = resolveModelConfig(db, null, decryptApiKey)
    const configured = !!cfg
    const readSkill = readSkillBody(rootDir(), db)
    const caller = cfg
      ? async (req: { system: string; user: string }) => {
          const text = await chatComplete(cfg, [
            { role: 'system', content: req.system },
            { role: 'user', content: req.user }
          ], { temperature: 0.4, maxTokens: 300, timeoutMs: 60000 })
          return { text, model: cfg.model }
        }
      : undefined
    let results: CommentGenerateResult[] = []
    if (generate) {
      const enabled = getSetting(db, 'aiCommentsEnabled') !== '0'
      if (enabled || force) {
        results = await generateComments(db, {
          shopId,
          w,
          force,
          configured,
          modules: opts.module ? [opts.module] : undefined,
          caller,
          readSkill
        })
      } else {
        // 设置关闭：只列出已有结果，不调模型
        results = COMMENT_BLOCKS.filter((b) => !opts.module || b.module === opts.module).map((b) => {
          const existing = getAnalysisRow(db, shopId, b.module, windowKey(w))
          return {
            module: b.module,
            label: b.label,
            status: existing ? 'reuse' : 'no-key',
            content: existing?.content ?? null,
            skillId: existing?.sourceSkillId ?? null,
            skillName: existing?.skillName ?? null,
            model: existing?.model ?? null,
            error: existing ? null : '自动生成已关闭'
          }
        })
      }
    } else {
      results = COMMENT_BLOCKS.filter((b) => !opts.module || b.module === opts.module).map((b) => {
        const existing = getAnalysisRow(db, shopId, b.module, windowKey(w))
        return {
          module: b.module,
          label: b.label,
          status: existing ? 'reuse' : 'no-key',
          content: existing?.content ?? null,
          skillId: existing?.sourceSkillId ?? null,
          skillName: existing?.skillName ?? null,
          model: existing?.model ?? null,
          error: existing ? null : (configured ? null : '未配置模型')
        }
      })
    }
    return {
      window: w,
      configured,
      rules: shopId > 0 ? runRules(db, shopId, w) : [],
      items: results
    }
  }

  ipcMain.handle('comments:list', (_e, opts: CommentOpts) => {
    const db = getDb()
    return payload(db, opts, false, false)
  })
  ipcMain.handle('comments:auto', (_e, opts: CommentOpts) => {
    const db = getDb()
    return payload(db, opts, true, false)
  })
  ipcMain.handle('comments:regenerate', (_e, opts: CommentOpts) => {
    const db = getDb()
    return payload(db, opts, true, true)
  })
  ipcMain.handle('comments:regenerate-module', (_e, opts: CommentOpts) => {
    const db = getDb()
    return payload(db, opts, true, true)
  })
}

interface AnalysisRowLite {
  content: string
  sourceSkillId: number | null
  skillName: string | null
  model: string | null
}

function getAnalysisRow(db: AppDatabase, shopId: number, module: string, date: string): AnalysisRowLite | null {
  const row = db.raw
    .prepare(`SELECT a.content, a.source_skill_id AS sourceSkillId, a.model, s.name AS skillName
      FROM ai_analyses a LEFT JOIN skills s ON s.id = a.source_skill_id
      WHERE a.shop_id=? AND a.module=? AND a.date=?`)
    .get(shopId, module, date) as AnalysisRowLite | undefined
  return row ?? null
}
