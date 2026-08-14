// 任务 6 对话服务：提示词组装 + 看板摘要注入 + 附件归一化 + 流式消息编排（纯逻辑，可单测）
import type { AppDatabase } from '../db/database'
import type { WindowRange } from '../db/dashboard'
import { buildWindowSummary } from './comments'
import type { ChatMessage, ContentPart } from '../import/model-client'

export interface AttachmentPayload {
  name: string
  text?: string
  image?: { base64: string; mime: string }
}

/** 附件文本块：文本/表格/PDF 归一化，供模型阅读；图片单独走多模态 content part */
export function renderAttachmentsText(atts: AttachmentPayload[]): string | null {
  const texts = atts.filter((a) => a.text && a.text.length > 0)
  if (!texts.length) return null
  return texts.map((a) => `--- 附件：${a.name} ---\n${a.text}`).join('\n\n')
}

export function imagesToParts(atts: AttachmentPayload[]): ContentPart[] {
  return atts
    .filter((a) => a.image && a.image.base64)
    .map((a) => ({ type: 'image_url' as const, image_url: { url: `data:${a.image!.mime};base64,${a.image!.base64}` } }))
}

export interface BuildChatOptions {
  system: string
  history: Array<{ role: 'user' | 'assistant'; content: string }>
  userText: string
  attachments: AttachmentPayload[]
  boardSummary: string | null
}

export function buildChatMessages(opts: BuildChatOptions): ChatMessage[] {
  const messages: ChatMessage[] = [{ role: 'system', content: opts.system }]
  for (const h of opts.history) messages.push({ role: h.role, content: h.content.slice(0, 4000) })
  const blocks: string[] = []
  if (opts.boardSummary) blocks.push(`【当前看板数据摘要】\n${opts.boardSummary}`)
  const attText = renderAttachmentsText(opts.attachments)
  if (attText) blocks.push(`【附件内容】\n${attText}`)
  blocks.push(opts.userText)
  const parts: ContentPart[] = [{ type: 'text', text: blocks.join('\n\n') }]
  parts.push(...imagesToParts(opts.attachments))
  messages.push({ role: 'user', content: parts })
  return messages
}

/** 会话系统提示词：经营顾问人设 + 斜杠所选 skill 正文（记录 skill_id） */
export function buildSystemPrompt(base: string, skillBody: string | null): string {
  return skillBody
    ? `${base}\n\n【本次回复按所选 skill 提示词组织】\n${skillBody}`
    : base
}

export const CHAT_SYSTEM_BASE =
  '你是电商店铺经营顾问 EC AI。规则：1) 只依据给定数据与用户输入回答，禁止编造数字/日期/商品名；2) 回答简洁、结论先行、可带表格与列表；3) 用户引用看板数据时，数字必须来自摘要，不得杜撰；4) 涉及建议时给出可执行步骤。'

export function windowSummaryForChat(db: AppDatabase, shopId: number, w: WindowRange): string {
  if (shopId <= 0) return ''
  return buildWindowSummary(db, shopId, w)
}
