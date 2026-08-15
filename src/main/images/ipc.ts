// 商品图片 IPC（任务 4A）：渲染层传字节 → 主进程校验/缩放（nativeImage，最长边 400px）→ 落盘 userData/product-images → 落库
import { app, ipcMain, nativeImage } from 'electron'
import { join } from 'node:path'
import type { AppDatabase } from '../db/database'
import {
  MAX_IMAGE_EDGE, deleteProductImage, listProductImages, saveProductImage, type ImageExt, type ProcessedImage
} from './service'

function imagesDir(): string {
  return join(app.getPath('userData'), 'product-images')
}

/** 主进程图片处理：nativeImage 解码 → 最长边 400px 等比缩放 → 按原格式输出（webp 转 png） */
function nativeProcess(bytes: Buffer, ext: ImageExt): ProcessedImage {
  const img = nativeImage.createFromBuffer(bytes)
  if (img.isEmpty()) throw new Error('无法解析图片，请换一张有效的 png/jpg/webp 图片')
  const { width: w, height: h } = img.getSize()
  if (!w || !h) throw new Error('无法解析图片尺寸')
  const maxEdge = Math.max(w, h)
  const scale = maxEdge > MAX_IMAGE_EDGE ? MAX_IMAGE_EDGE / maxEdge : 1
  const resized = scale < 1 ? img.resize({ width: Math.max(1, Math.round(w * scale)), height: Math.max(1, Math.round(h * scale)) }) : img
  const outSize = resized.getSize()
  let bytesOut: Buffer
  let extOut: string
  if (ext === 'jpg' || ext === 'jpeg') {
    bytesOut = resized.toJPEG(85)
    extOut = 'jpg'
  } else {
    bytesOut = resized.toPNG()
    extOut = 'png'
  }
  return { bytes: bytesOut, width: outSize.width, height: outSize.height, ext: extOut }
}

export function registerImagesIpc(getDb: () => AppDatabase): void {
  ipcMain.handle('productImages:save', (_e, opts: { shopId: number; productId: string; bytes: Uint8Array; origName: string }) => {
    const db = getDb()
    db.backup('product-image')
    return saveProductImage(
      db,
      imagesDir(),
      { shopId: Number(opts.shopId), productId: String(opts.productId), bytes: Buffer.from(opts.bytes), origName: String(opts.origName) },
      nativeProcess
    )
  })
  ipcMain.handle('productImages:list', (_e, shopId: number) => listProductImages(getDb(), imagesDir(), Number(shopId)))
  ipcMain.handle('productImages:delete', (_e, opts: { shopId: number; productId: string }) => {
    const db = getDb()
    const ok = deleteProductImage(db, imagesDir(), Number(opts.shopId), String(opts.productId))
    if (ok) db.backup('product-image-delete')
    return { ok }
  })
  ipcMain.handle('productImages:dir', () => imagesDir())
}
