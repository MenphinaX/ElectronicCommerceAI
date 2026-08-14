// LLM 兜底模型客户端：OpenAI 兼容 chat/completions；无配置抛出明确错误（不静默）
import type { AppDatabase } from '../db/database'
import { getSetting, listModels } from '../db/repo'

export interface ModelConfig {
  baseUrl: string
  apiKey: string
  model: string
  provider?: string
}

export class ModelNotConfiguredError extends Error {
  constructor() {
    super('未配置 AI 模型：请先在设置中配置服务商（base_url / API key / 模型名），否则跳过 LLM 兜底')
    this.name = 'ModelNotConfiguredError'
  }
}

/** 流式输出被模型以 finish_reason=length 截断（禁止静默收尾：已生成内容保留，明确抛错提示） */
export class OutputTruncatedError extends Error {
  constructor() {
    super('输出超长被模型截断（finish_reason=length）：已保留已生成内容，请调大输出上限或分批质检')
    this.name = 'OutputTruncatedError'
  }
}

const ENV_KEYS: Array<[keyof ModelConfig, string]> = [
  ['baseUrl', 'EC_AI_LLM_BASE_URL'],
  ['apiKey', 'EC_AI_LLM_API_KEY'],
  ['model', 'EC_AI_LLM_MODEL']
]

/**
 * 配置解析优先级：显式 overrides → 环境变量 → settings 表（llm_base_url/llm_model/llm_api_key_enc，密文经 decrypt 回调解开）→ models 表
 * 返回 null 表示未配置（UI 据此提示"不发送数据"）。
 */
export function resolveModelConfig(
  db: AppDatabase | null,
  overrides?: Partial<ModelConfig> | null,
  decrypt?: (enc: string) => string | null
): ModelConfig | null {
  if (overrides && overrides.baseUrl && overrides.apiKey && overrides.model) {
    return { baseUrl: overrides.baseUrl, apiKey: overrides.apiKey, model: overrides.model }
  }
  const fromEnv: Partial<ModelConfig> = {}
  for (const [k, env] of ENV_KEYS) {
    const v = process.env[env]
    if (v) fromEnv[k] = v
  }
  if (fromEnv.baseUrl && fromEnv.apiKey && fromEnv.model) {
    return { baseUrl: fromEnv.baseUrl, apiKey: fromEnv.apiKey, model: fromEnv.model }
  }
  if (db) {
    // 任务 5 起 models 表为主配置源：默认模型优先，其次首个启用且带 key 的模型
    const models = listModels(db) as Array<{ name: string; baseUrl: string | null; apiKeyEnc: string | null; enabled: number; isDefault: number }>
    const pick =
      models.find((x) => x.isDefault === 1 && x.enabled !== 0 && Boolean(x.baseUrl && x.apiKeyEnc && x.name)) ??
      models.find((x) => x.enabled !== 0 && Boolean(x.baseUrl && x.apiKeyEnc && x.name))
    if (pick?.baseUrl && pick.apiKeyEnc && pick.name) {
      return { baseUrl: pick.baseUrl, apiKey: decrypt ? (decrypt(pick.apiKeyEnc) ?? pick.apiKeyEnc) : pick.apiKeyEnc, model: pick.name }
    }
    // 旧版 settings 表配置（导入中心早期 LLM 兜底）降级兼容
    const baseUrl = getSetting(db, 'llm_base_url')
    const model = getSetting(db, 'llm_model')
    const encKey = getSetting(db, 'llm_api_key_enc')
    const apiKey = encKey ? (decrypt ? decrypt(encKey) : encKey) : null
    if (baseUrl && apiKey && model) {
      return { baseUrl, apiKey, model }
    }
  }
  return null
}

export interface ChatOptions {
  temperature?: number
  maxTokens?: number
  timeoutMs?: number
  /** 流结束回调：收到实际 finish_reason（'stop' | 'length' | 其他或 null） */
  onFinish?: (finishReason: string | null) => void
}

/** 多模态消息内容：纯文本或 OpenAI 风格 parts（图片走 data URL，视觉模型可读） */
export type ContentPart =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string } }

export type ChatContent = string | ContentPart[]

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: ChatContent
}

export function isTextContent(content: ChatContent): content is string {
  return typeof content === 'string'
}

function contentToText(content: ChatContent): string {
  if (typeof content === 'string') return content
  return content
    .map((p) => (p.type === 'text' ? p.text : p.type === 'image_url' ? '[图片]' : ''))
    .join('\n')
}

function normalizeBase(baseUrl: string): string {
  return baseUrl.replace(/\/+$/, '') + '/chat/completions'
}

/** 调 chat 接口，返回正文纯文本（OpenAI 兼容；Anthropic 走 messages API） */
export async function chatComplete(cfg: ModelConfig, messages: ChatMessage[], opts: ChatOptions = {}): Promise<string> {
  if ((cfg.provider ?? '').toLowerCase() === 'anthropic' || /anthropic\.com\/v1\/?$/i.test(cfg.baseUrl)) {
    return chatCompleteAnthropic(cfg, messages, opts)
  }
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), opts.timeoutMs ?? 60000)
  try {
    const res = await fetch(normalizeBase(cfg.baseUrl), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${cfg.apiKey}` },
      body: JSON.stringify({
        model: cfg.model,
        messages,
        temperature: opts.temperature ?? 0,
        max_tokens: opts.maxTokens ?? 3000,
        stream: false
      }),
      signal: ctrl.signal
    })
    if (!res.ok) {
      const body = await res.text().catch(() => '')
      throw new Error(`模型接口返回 ${res.status}：${body.slice(0, 200)}`)
    }
    const data = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>
      error?: { message?: string }
    }
    if (data.error?.message) throw new Error(`模型接口错误：${data.error.message}`)
    const content = data.choices?.[0]?.message?.content
    if (!content) throw new Error('模型未返回内容')
    return content
  } finally {
    clearTimeout(timer)
  }
}

/** Anthropic Messages API 适配（原生协议：/v1/messages + x-api-key） */
function toAnthropicContent(content: ChatContent): unknown {
  if (typeof content === 'string') return content
  return content.map((p) => {
    if (p.type === 'text') return { type: 'text', text: p.text }
    const m = p.image_url.url.match(/^data:(image\/[a-z+]+);base64,(.+)$/)
    return m ? { type: 'image', source: { type: 'base64', media_type: m[1], data: m[2] } } : { type: 'text', text: '[图片]' }
  })
}

async function chatCompleteAnthropic(cfg: ModelConfig, messages: ChatMessage[], opts: ChatOptions = {}): Promise<string> {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), opts.timeoutMs ?? 60000)
  try {
    const base = cfg.baseUrl.replace(/\/+$/, '') + '/messages'
    const system = messages.filter((m) => m.role === 'system').map((m) => contentToText(m.content)).join('\n')
    const chat = messages.filter((m) => m.role !== 'system').map((m) => ({ role: m.role, content: toAnthropicContent(m.content) }))
    const res = await fetch(base, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': cfg.apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: cfg.model,
        max_tokens: opts.maxTokens ?? 3000,
        temperature: opts.temperature ?? 0,
        system: system || undefined,
        messages: chat.length > 0 ? chat : [{ role: 'user', content: 'ping' }]
      }),
      signal: ctrl.signal
    })
    if (!res.ok) {
      const body = await res.text().catch(() => '')
      throw new Error(`模型接口返回 ${res.status}：${body.slice(0, 200)}`)
    }
    const data = (await res.json()) as { content?: Array<{ type?: string; text?: string }>; error?: { message?: string } }
    if (data.error?.message) throw new Error(`模型接口错误：${data.error.message}`)
    const text = data.content?.filter((c) => c.type === 'text').map((c) => c.text ?? '').join('')
    if (!text) throw new Error('模型未返回内容')
    return text
  } finally {
    clearTimeout(timer)
  }
}

/** 从模型输出里提取 JSON（容忍 ```json 围栏与首尾说明文字） */
/**
 * 流式调 chat 接口（OpenAI 兼容，SSE 逐份返回文本；Anthropic 退回流流程）
 * 用法：for await (const chunk of chatCompleteStream(...)) { ... }
 */
export async function* chatCompleteStream(cfg: ModelConfig, messages: ChatMessage[], opts: ChatOptions = {}): AsyncGenerator<string> {
  if ((cfg.provider ?? '').toLowerCase() === 'anthropic' || /anthropic\.com\/v1\/?$/i.test(cfg.baseUrl)) {
    const text = await chatComplete(cfg, messages, opts)
    yield text
    return
  }
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), opts.timeoutMs ?? 120000)
  try {
    const res = await fetch(normalizeBase(cfg.baseUrl), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${cfg.apiKey}` },
      body: JSON.stringify({
        model: cfg.model,
        messages,
        temperature: opts.temperature ?? 0,
        max_tokens: opts.maxTokens ?? 3000,
        stream: true
      }),
      signal: ctrl.signal
    })
    if (!res.ok) {
      const body = await res.text().catch(() => '')
      throw new Error(`模型接口返回 ${res.status}：${body.slice(0, 200)}`)
    }
    const reader = res.body?.getReader()
    if (!reader) throw new Error('模型接口无流式响应')
    const decoder = new TextDecoder()
    let buf = ''
    let done = false
    let lastFinishReason: string | null = null
    while (!done) {
      const { done: rd, value } = await reader.read()
      if (rd) break
      buf += decoder.decode(value, { stream: true })
      let nl = buf.indexOf('\n')
      while (nl >= 0) {
        const line = buf.slice(0, nl).trim()
        buf = buf.slice(nl + 1)
        if (line.startsWith('data:')) {
          const data = line.slice(5).trim()
          if (data === '[DONE]') {
            done = true
            break
          }
          try {
            const json = JSON.parse(data) as { choices?: Array<{ delta?: { content?: string }; finish_reason?: string | null }> }
            const choice = json.choices?.[0]
            if (choice) {
              if (typeof choice.finish_reason === 'string') lastFinishReason = choice.finish_reason
              const delta = choice.delta?.content
              if (typeof delta === 'string' && delta.length > 0) yield delta
            }
          } catch {
            // 忽略非 SSE 的心跳响应
          }
        }
        nl = buf.indexOf('\n')
      }
    }
    opts.onFinish?.(lastFinishReason)
    if (lastFinishReason === 'length') throw new OutputTruncatedError()
  } finally {
    clearTimeout(timer)
  }
}

export function extractJson<T>(text: string): T {
  let s = text.trim()
  const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (fence) s = fence[1].trim()
  const start = s.indexOf('{')
  const end = s.lastIndexOf('}')
  if (start < 0 || end <= start) throw new Error(`模型输出不是 JSON：${text.slice(0, 120)}`)
  return JSON.parse(s.slice(start, end + 1)) as T
}