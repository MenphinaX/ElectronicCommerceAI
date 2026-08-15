// 评语 store（任务 6）：按 店铺+窗口 读取/生成 AI 评语；自动生成开关在设置页
import { defineStore } from 'pinia'
import { useShopsStore } from './shops'
import { useDashboardStore } from './dashboard'

export interface CommentItem {
  module: string
  label: string
  content: string | null
  skillId: number | null
  skillName: string | null
  model: string | null
  status: string
  error: string | null
  loading?: boolean
}

export interface RuleHit {
  rule: string
  severity: string
  evidence: string
}

export interface CommentsPayload {
  window: { end: string; label: string; start: string }
  configured: boolean
  rules: RuleHit[]
  items: Array<CommentItem & { status?: string; error?: string | null }>
}

export const useCommentsStore = defineStore('comments', {
  state: () => ({
    windowKey: '' as string,
    configured: false,
    rules: [] as RuleHit[],
    items: [] as CommentItem[],
    loading: false,
    error: '' as string,
    enabled: true
  }),
  getters: {
    byModule(state): Record<string, CommentItem> {
      const m: Record<string, CommentItem> = {}
      for (const it of state.items) m[it.module] = it
      return m
    }
  },
  actions: {
    shopId(): number {
      return useShopsStore().defaultId ?? 0
    },
    apply(payload: CommentsPayload, loading: boolean): void {
      this.configured = payload.configured
      this.rules = payload.rules ?? []
      const key = payload.window ? `${this.shopId()}:${payload.window.end}` : this.windowKey
      if (loading || key) this.windowKey = key
      this.items = (payload.items ?? []).map((it) => ({ ...it, loading: false }))
      this.loading = loading
      this.error = ''
    },
    async load(): Promise<void> {
      this.loading = true
      try {
        const res = (await window.api.comments.list({ shopId: this.shopId(), mode: useDashboardStore().mode })) as unknown as CommentsPayload
        this.apply(res, false)
      } catch (e) {
        this.error = e instanceof Error ? e.message : String(e)
        this.loading = false
      }
    },
    async auto(): Promise<void> {
      if (!this.enabled) return
      this.loading = true
      try {
        const res = (await window.api.comments.auto({ shopId: this.shopId(), mode: useDashboardStore().mode })) as unknown as CommentsPayload
        this.apply(res, true)
      } catch (e) {
        this.error = e instanceof Error ? e.message : String(e)
        this.loading = false
      }
    },
    async regenerate(module?: string): Promise<void> {
      if (module) {
        const it = this.items.find((x) => x.module === module)
        if (it) it.loading = true
        const res = (await window.api.comments.regenerateModule({ shopId: this.shopId(), mode: useDashboardStore().mode, module })) as unknown as CommentsPayload
        this.apply(res, false)
      } else {
        this.loading = true
        const res = (await window.api.comments.regenerate({ shopId: this.shopId(), mode: useDashboardStore().mode })) as unknown as CommentsPayload
        this.apply(res, true)
      }
    },
    async loadEnabled(): Promise<void> {
      const v = await window.api.setting.get('aiCommentsEnabled')
      this.enabled = v !== '0'
    },
    async setEnabled(on: boolean): Promise<void> {
      this.enabled = on
      await window.api.setting.set('aiCommentsEnabled', on ? '1' : '0')
    }
  }
})
