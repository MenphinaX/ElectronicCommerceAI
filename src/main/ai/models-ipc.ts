// 任务 5 模型配置 IPC：models 表 CRUD + 测速 + 设默认
// API key 一律 safeStorage 加密落库，界面/返回值只见「已设置/未设置」，日志禁明文
import { ipcMain, safeStorage } from 'electron'
import type { AppDatabase } from '../db/database'
import {
  createModel, deleteModel, getDefaultModelId, listModels, setDefaultModel,
  updateModel, type ModelPatch
} from '../db/repo'
import { chatComplete } from '../import/model-client'

function encryptKey(key: string): string {
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error('系统加密不可用（safeStorage），无法安全保存 API key')
  }
  return safeStorage.encryptString(key.trim()).toString('base64')
}

export function decryptApiKey(enc: string): string | null {
  try {
    return safeStorage.decryptString(Buffer.from(enc, 'base64'))
  } catch {
    return null
  }
}

interface ModelApiRow {
  id: number
  name: string
  provider: string
  baseUrl: string | null
  apiKeySet: boolean
  enabled: number
  isDefault: number
  createdAt: string
}

export interface ModelConnectivityResult {
  ok: boolean
  elapsedMs: number
  model: string
  note?: string
  message?: string
}

/** models:test 核心逻辑（不依赖 DB/IPC，可单测）：HTTP 200 即连通，content 空附提示不判失败 */
export async function testModelConnectivity(cfg: { baseUrl: string; apiKey: string; model: string }): Promise<ModelConnectivityResult> {
  const t0 = Date.now()
  try {
    const content = await chatComplete(
      { baseUrl: cfg.baseUrl, apiKey: cfg.apiKey, model: cfg.model },
      [{ role: 'user', content: '你好，请回复两个字：正常' }],
      { maxTokens: 20, timeoutMs: 20000 }
    )
    const empty = content === undefined || content === null || String(content).trim() === ''
    return {
      ok: true, elapsedMs: Date.now() - t0, model: cfg.model,
      ...(empty ? { note: '接口已连通，但模型未返回文本' } : {})
    }
  } catch (e) {
    const msg = (e as Error).message
    // HTTP 200 但 content 空：chatComplete 抛「模型未返回内容」，按连通处理
    if (msg === '模型未返回内容') {
      return { ok: true, elapsedMs: Date.now() - t0, model: cfg.model, note: '接口已连通，但模型未返回文本' }
    }
    return { ok: false, elapsedMs: Date.now() - t0, model: cfg.model, message: msg }
  }
}

/** models:fetch-list 核心逻辑（GET {base}/models，OpenAI 兼容/Anthropic/Ollama 同接口；不落库） */
export async function fetchModelList(baseUrl: string, apiKey: string): Promise<{ ok: boolean; models?: string[]; error?: string }> {
  const b = baseUrl?.trim()
  if (!b) return { ok: false, error: 'base_url 必填' }
  const key = apiKey?.trim() ?? ''
  const url = b.replace(/\/+$/, '') + '/models'
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), 20000)
  try {
    const res = await fetch(url, {
      headers: key ? { Authorization: `Bearer ${key}` } : {},
      signal: ctrl.signal
    })
    if (!res.ok) {
      const body = await res.text().catch(() => '')
      const kind = res.status === 401 || res.status === 403 ? '认证失败（401/403）' : `接口返回 ${res.status}`
      return { ok: false, error: `${kind}：${body.slice(0, 200)}` }
    }
    const data = (await res.json().catch(() => null)) as { data?: Array<{ id?: unknown }> } | null
    if (!data || !Array.isArray(data.data)) {
      return { ok: false, error: '响应格式不符：未找到 data[] 模型列表' }
    }
    const ids = data.data
      .map((m) => (typeof m?.id === 'string' ? m.id : typeof m?.id === 'number' ? String(m.id) : null))
      .filter((v): v is string => !!v)
    return { ok: true, models: [...new Set(ids)].sort() }
  } catch (e) {
    const msg = (e as Error).message
    const aborted = (e as Error).name === 'AbortError' || /aborted|fetch failed|ECONNREFUSED|ENOTFOUND/i.test(msg)
    return { ok: false, error: aborted ? `请求超时或网络错误：${msg}` : `拉取失败：${msg}` }
  } finally {
    clearTimeout(timer)
  }
}
export function registerModelsIpc(getDb: () => AppDatabase): void {
  // 列表：绝不回传密文，只给 apiKeySet 布尔
  ipcMain.handle('models:list', () => {
    const rows = listModels(getDb()) as Array<Record<string, unknown>>
    return rows.map((r) => {
      const out: ModelApiRow = {
        id: r.id as number,
        name: r.name as string,
        provider: r.provider as string,
        baseUrl: (r.baseUrl as string | null) ?? null,
        apiKeySet: !!r.apiKeyEnc,
        enabled: r.enabled as number,
        isDefault: r.isDefault as number,
        createdAt: r.createdAt as string
      }
      return out
    })
  })

  ipcMain.handle('models:create', (_e, row: { name: string; provider?: string; baseUrl: string; apiKey?: string }) => {
    const name = row.name?.trim()
    const baseUrl = row.baseUrl?.trim()
    if (!name) throw new Error('模型名必填')
    if (!baseUrl) throw new Error('base_url 必填')
    const apiKeyEnc = row.apiKey?.trim() ? encryptKey(row.apiKey) : null
    return createModel(getDb(), { name, provider: row.provider ?? 'openai-compatible', baseUrl, apiKeyEnc })
  })

  ipcMain.handle('models:update', (_e, id: number, patch: { name?: string; provider?: string; baseUrl?: string; apiKey?: string; enabled?: boolean }) => {
    const p: ModelPatch = {}
    if (patch.name !== undefined) {
      const name = patch.name.trim()
      if (!name) throw new Error('模型名不能为空')
      p.name = name
    }
    if (patch.provider !== undefined) p.provider = patch.provider
    if (patch.baseUrl !== undefined) {
      const baseUrl = patch.baseUrl.trim()
      if (!baseUrl) throw new Error('base_url 不能为空')
      p.baseUrl = baseUrl
    }
    if (patch.enabled !== undefined) p.enabled = patch.enabled
    if (patch.apiKey?.trim()) p.apiKeyEnc = encryptKey(patch.apiKey)
    return updateModel(getDb(), id, p)
  })

  ipcMain.handle('models:delete', (_e, id: number) => deleteModel(getDb(), id))

  ipcMain.handle('models:set-default', (_e, id: number | null) => {
    setDefaultModel(getDb(), id)
    return true
  })

  ipcMain.handle('models:get-default', () => getDefaultModelId(getDb()))

  // 测速：发最小请求（不含经营数据），量往返耗时；HTTP 200 即算连通，
  // content 空不判失败（附提示），401/403/超时/网络错仍报失败（任务 4O）
  ipcMain.handle('models:test', async (_e, id: number) => {
    const rows = listModels(getDb()) as Array<{ id: number; name: string; baseUrl: string | null; apiKeyEnc: string | null }>
    const m = rows.find((r) => r.id === id)
    if (!m) throw new Error('模型不存在')
    if (!m.baseUrl || !m.apiKeyEnc) throw new Error('模型缺少 base_url 或 API key，无法测速')
    const apiKey = decryptApiKey(m.apiKeyEnc)
    if (!apiKey) throw new Error('API key 解密失败，请重新保存 key')
    const r = await testModelConnectivity({ baseUrl: m.baseUrl, apiKey, model: m.name })
    return { ok: r.ok, elapsedMs: r.elapsedMs, model: r.model, ...(r.note ? { note: r.note } : {}), ...(r.message ? { message: r.message } : {}) }
  })

  // 从服务商拉取模型列表（OpenAI 兼容 / Anthropic / Ollama 均为 GET {base}/models）；不落库（任务 4O）
  ipcMain.handle('models:fetch-list', (_e, input: { baseUrl: string; apiKey: string; provider?: string }) =>
    fetchModelList(input.baseUrl ?? '', input.apiKey ?? '')
  )
}
