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

  // 测速：发最小请求（只含 ping，绝不发经营数据），量往返耗时
  ipcMain.handle('models:test', async (_e, id: number) => {
    const rows = listModels(getDb()) as Array<{ id: number; name: string; baseUrl: string | null; apiKeyEnc: string | null }>
    const m = rows.find((r) => r.id === id)
    if (!m) throw new Error('模型不存在')
    if (!m.baseUrl || !m.apiKeyEnc) throw new Error('模型缺少 base_url 或 API key，无法测速')
    const apiKey = decryptApiKey(m.apiKeyEnc)
    if (!apiKey) throw new Error('API key 解密失败，请重新保存 key')
    const t0 = Date.now()
    try {
      await chatComplete(
        { baseUrl: m.baseUrl, apiKey, model: m.name },
        [{ role: 'user', content: 'ping' }],
        { maxTokens: 8, timeoutMs: 20000 }
      )
      return { ok: true, elapsedMs: Date.now() - t0, model: m.name }
    } catch (e) {
      return { ok: false, elapsedMs: Date.now() - t0, message: (e as Error).message }
    }
  })
}
