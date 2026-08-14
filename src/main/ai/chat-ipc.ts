// 任务 6 对话页 IPC：会话 CRUD + 附件读取 + 白名单取数 + 流式收发（渲染层不碰 SQL/文件）
import { ipcMain } from 'electron'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { AppDatabase } from '../db/database'
import { windowRange, type WindowMode } from '../db/dashboard'
import {
  appendMessage, createConversation, deleteConversation, listConversations, listMessages,
  listSkills, renameConversation
} from '../db/repo'
import { chatCompleteStream, resolveModelConfig } from '../import/model-client'
import { decryptApiKey } from './models-ipc'
import { parseSkillMarkdown } from './skills-core'
import { readAttachments } from './attachments'
import { listQueryTemplates, runQuery } from './data-queries'
import { buildChatMessages, buildSystemPrompt, CHAT_SYSTEM_BASE, windowSummaryForChat, type AttachmentPayload } from './chat-service'

interface SendOpts {
  conversationId: number
  content: string
  skillId?: number | null
  useBoardData?: boolean
  attachments?: AttachmentPayload[]
  shopId?: number
  mode?: WindowMode
  today?: string
}

function skillBodyOf(rootDir: string, db: AppDatabase, skillId: number | null): { name: string; body: string } | null {
  if (!skillId) return null
  const row = (listSkills(db) as Array<Record<string, unknown>>).find((x) => Number(x.id) === skillId)
  if (!row || !row.path) return null
  try {
    const text = readFileSync(join(rootDir, String(row.path)), 'utf8')
    const parsed = parseSkillMarkdown(text)
    return { name: String(row.name), body: parsed ? parsed.body : text }
  } catch {
    return null
  }
}

export function registerChatIpc(getDb: () => AppDatabase, rootDir: () => string): void {
  ipcMain.handle('chat:conversations', (_e, opts: { shopId?: number | null }) => {
    return listConversations(getDb(), opts.shopId ?? null)
  })

  ipcMain.handle('chat:create', (_e, opts: { shopId?: number | null; title?: string | null }) => {
    const id = createConversation(getDb(), opts.shopId ?? null, opts.title?.trim() || '新会话')
    return { id }
  })

  ipcMain.handle('chat:rename', (_e, opts: { id: number; title: string }) => {
    renameConversation(getDb(), opts.id, opts.title.trim() || '新会话')
    return true
  })

  ipcMain.handle('chat:delete', (_e, opts: { id: number }) => {
    deleteConversation(getDb(), opts.id)
    return true
  })

  ipcMain.handle('chat:messages', (_e, opts: { conversationId: number }) => {
    return listMessages(getDb(), opts.conversationId)
  })

  // 附件读取：渲染层只给真实路径（来自文件选择器），主进程按类型解析
  ipcMain.handle('files:read', (_e, paths: string[]) => readAttachments(Array.isArray(paths) ? paths : []))

  // 白名单取数：模板下拉 + 只读 SELECT
  ipcMain.handle('data:templates', () => listQueryTemplates())
  ipcMain.handle('data:query', (_e, opts: { templateId: string; params: Record<string, unknown> }) => {
    const db = getDb()
    return runQuery(db, opts.templateId, opts.params ?? {})
  })

  // 流式收发：主进程调模型，逐块推送给渲染层（chat:start/chunk/done/error）
  ipcMain.handle('chat:send', async (e, opts: SendOpts) => {
    const db = getDb()
    const wc = e.sender
    const convId = Number(opts.conversationId) || 0
    const content = String(opts.content ?? '').trim()
    if (!convId || !content) return { ok: false, message: '消息不能为空' }
    const skill = skillBodyOf(rootDir(), db, opts.skillId ?? null)
    appendMessage(db, convId, 'user', content, opts.skillId ?? null)
    wc.send('chat:start', { conversationId: convId })
    const cfg = resolveModelConfig(db, null, decryptApiKey)
    if (!cfg) {
      appendMessage(db, convId, 'assistant', '未配置模型：请先在设置中配置 AI 模型（base_url / API key / 模型名）。')
      wc.send('chat:error', { conversationId: convId, message: '未配置模型' })
      return { ok: false, message: '未配置模型' }
    }
    const historyRows = listMessages(db, convId) as Array<Record<string, unknown>>
    const history = historyRows
      .filter((m) => m.role === 'user' || m.role === 'assistant')
      .slice(-12)
      .map((m) => ({ role: m.role as 'user' | 'assistant', content: String(m.content) }))
    let boardSummary: string | null = null
    if (opts.useBoardData && (opts.shopId ?? 0) > 0) {
      const w = windowRange(opts.mode ?? '7', opts.today)
      boardSummary = windowSummaryForChat(db, Number(opts.shopId), w)
    }
    const messages = buildChatMessages({
      system: buildSystemPrompt(CHAT_SYSTEM_BASE, skill?.body ?? null),
      history,
      userText: content,
      attachments: opts.attachments ?? [],
      boardSummary
    })
    try {
      let acc = ''
      for await (const chunk of chatCompleteStream(cfg, messages, { temperature: 0.5, maxTokens: 2000, timeoutMs: 120000 })) {
        acc += chunk
        wc.send('chat:chunk', { conversationId: convId, delta: chunk })
      }
      const footer = `\n\n---\n所用技能：${skill?.name ?? '默认顾问'} · 数据来源：本地经营数据`
      const finalText = acc.trim() + footer
      const messageId = appendMessage(db, convId, 'assistant', finalText, opts.skillId ?? null)
      wc.send('chat:done', { conversationId: convId, messageId, content: finalText })
      return { ok: true }
    } catch (err) {
      const msg = (err as Error).message
      appendMessage(db, convId, 'assistant', `生成失败：${msg}`, null)
      wc.send('chat:error', { conversationId: convId, message: msg })
      return { ok: false, message: msg }
    }
  })
}
