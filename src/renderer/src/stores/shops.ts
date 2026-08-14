// 店铺 store（任务 3）：店铺清单/默认店铺来自数据库，顶栏与导入页共用
import { defineStore } from 'pinia'

export interface ShopItem {
  id: number
  name: string
  platform: string
  shopCode?: string | null
}

interface ShopsState {
  shops: ShopItem[]
  defaultId: number | null
  loaded: boolean
}

export const useShopsStore = defineStore('shops', {
  state: (): ShopsState => ({
    shops: [],
    defaultId: null,
    loaded: false
  }),
  getters: {
    defaultShop(state): ShopItem | null {
      return state.shops.find((s) => s.id === state.defaultId) ?? null
    },
    names(state): string[] {
      return state.shops.map((s) => s.name)
    }
  },
  actions: {
    async load(): Promise<void> {
      try {
        const res = await window.api.shops.list()
        this.shops = (res.shops ?? []) as unknown as ShopItem[]
        this.defaultId = res.defaultId
        this.loaded = true
      } catch {
        this.shops = []
        this.defaultId = null
        this.loaded = true
      }
    },
    async refresh(): Promise<void> {
      await this.load()
    },
    async create(name: string, platform = '天猫'): Promise<number> {
      const id = await window.api.shops.create({ name, platform })
      await this.refresh()
      return id
    },
    async update(id: number, patch: { name?: string; platform?: string; shopCode?: string | null }): Promise<void> {
      await window.api.shops.update(id, patch)
      await this.refresh()
    },
    async remove(id: number): Promise<void> {
      await window.api.shops.remove(id)
      await this.refresh()
    },
    async setDefault(id: number | null): Promise<void> {
      await window.api.shops.setDefault(id)
      this.defaultId = id
    }
  }
})