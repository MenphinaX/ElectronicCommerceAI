// 商品图片 store（任务 4A）：按店铺缓存绑定关系；上传/删除后即时更新，供三处商品图共用
import { defineStore } from 'pinia'

export interface ProductImageItem {
  shopId: number
  productId: string
  relPath: string
  url: string
  origName: string | null
  sizeBytes: number
  width: number | null
  height: number | null
  updatedAt: string
}

export const useProductImagesStore = defineStore('productImages', {
  state: () => ({
    byShop: {} as Record<number, Record<string, ProductImageItem>>,
    loadedShops: [] as number[]
  }),
  actions: {
    async ensure(shopId: number): Promise<void> {
      if (shopId <= 0) return
      if (!this.loadedShops.includes(shopId)) await this.load(shopId)
    },
    async load(shopId: number): Promise<void> {
      const list = (await window.api.productImages.list(shopId)) as unknown as ProductImageItem[]
      const map: Record<string, ProductImageItem> = {}
      for (const r of list) map[r.productId] = r
      this.byShop[shopId] = map
      if (!this.loadedShops.includes(shopId)) this.loadedShops.push(shopId)
    },
    async save(shopId: number, productId: string, bytes: Uint8Array, origName: string): Promise<ProductImageItem> {
      const rec = (await window.api.productImages.save({ shopId, productId, bytes, origName })) as unknown as ProductImageItem
      if (!this.byShop[shopId]) this.byShop[shopId] = {}
      this.byShop[shopId][productId] = rec
      return rec
    },
    async remove(shopId: number, productId: string): Promise<void> {
      await window.api.productImages.remove({ shopId, productId })
      if (this.byShop[shopId]) delete this.byShop[shopId][productId]
    }
  }
})
