import { defineStore } from 'pinia'

export interface ModelItem {
  id: number
  name: string
  provider: string
  baseUrl: string | null
  apiKeySet: boolean
  enabled: number
  isDefault: number
  createdAt: string
}

// 模型配置 store：增删改/设默认/测速（key 只回「已设置/未设置」，绝不回传明文）
export const useModelsStore = defineStore('models', {
  state: () => ({
    models: [] as ModelItem[],
    defaultId: null as number | null,
    loaded: false
  }),
  actions: {
    async load(): Promise<void> {
      this.models = (await window.api.models.list()) as unknown as ModelItem[]
      this.defaultId = await window.api.models.getDefault()
      this.loaded = true
    },
    async create(row: { name: string; provider?: string; baseUrl: string; apiKey?: string }): Promise<number> {
      const id = await window.api.models.create(row)
      await this.load()
      return id
    },
    async update(id: number, patch: { name?: string; provider?: string; baseUrl?: string; apiKey?: string; enabled?: boolean }): Promise<boolean> {
      const ok = await window.api.models.update(id, patch)
      await this.load()
      return ok
    },
    async remove(id: number): Promise<boolean> {
      const ok = await window.api.models.remove(id)
      await this.load()
      return ok
    },
    async setDefault(id: number | null): Promise<boolean> {
      const ok = await window.api.models.setDefault(id)
      await this.load()
      return ok
    },
    async test(id: number): Promise<{ ok: boolean; elapsedMs: number; message?: string; model?: string }> {
      return window.api.models.test(id)
    }
  }
})
