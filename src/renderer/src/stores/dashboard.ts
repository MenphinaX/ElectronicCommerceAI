// 看板 store（任务 4）：窗口模式 + 数据 + 加载态；窗口记忆存 settings.json
import { defineStore } from 'pinia'
import { useShopsStore } from './shops'

export type WindowMode = 'yesterday' | '7' | '15' | '30'

export interface DashboardData {
  today: string
  window: {
    mode: WindowMode
    label: string
    days: number
    start: string
    end: string
    prevStart: string
    prevEnd: string
  }
  hasShop: boolean
  hasData: boolean
  kpi: Record<string, unknown> | null
  product: Array<Record<string, unknown>>
  promo: Record<string, unknown>
  refund: Record<string, unknown> | null
  cs: { dates: string[]; staff: Array<Record<string, unknown>> }
  dsr: Record<string, unknown>
  keywords: Record<string, unknown>
  promoDetail: Array<Record<string, unknown>>
  consult: { total: number; sum: number; rows: Array<Record<string, unknown>> }
  refundRows: Array<Record<string, unknown>>
  productCounts: { total: number; sold: number }
  lastDay: string | null
  monthlyBlock: Record<string, unknown> | null
  coverage: Array<Record<string, unknown>>
  gaps: Array<{ key: string; label: string; lastDate: string | null }>
  monthly: Record<string, unknown> | null
}

export const useDashboardStore = defineStore('dashboard', {
  state: () => ({
    mode: '7' as WindowMode,
    data: null as DashboardData | null,
    loading: false,
    loaded: false,
    error: '' as string
  }),
  getters: {
    shopId(): number {
      const shops = useShopsStore()
      return shops.defaultId ?? 0
    }
  },
  actions: {
    async load(): Promise<void> {
      const shops = useShopsStore()
      if (!shops.loaded) await shops.load()
      const shopId = shops.defaultId ?? 0
      this.loading = true
      this.error = ''
      try {
        this.data = (await window.api.dashboard.get({ shopId, mode: this.mode })) as unknown as DashboardData
        this.loaded = true
      } catch (e) {
        this.error = e instanceof Error ? e.message : String(e)
      } finally {
        this.loading = false
      }
    },
    async setMode(mode: WindowMode): Promise<void> {
      if (this.mode === mode) return
      this.mode = mode
      await window.api.settings.set({ dashboardWindow: mode })
      await this.load()
    },
    async init(): Promise<void> {
      const s = (await window.api.settings.get()) as Partial<{ dashboardWindow: string }>
      if (s.dashboardWindow === 'yesterday' || s.dashboardWindow === '7' || s.dashboardWindow === '15' || s.dashboardWindow === '30') {
        this.mode = s.dashboardWindow as WindowMode
      }
      await this.load()
    }
  }
})
