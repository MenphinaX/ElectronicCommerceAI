// 商品图片服务（任务 4A）：格式/大小校验 + 文件落盘 + DB 记录（与 Electron 解码解耦，便于单测）
// 职责：校验 → 处理（缩放由调用方注入，主进程用 nativeImage）→ 写 userData/product-images/{店铺}/{商品}.{ext} → 落库
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join, resolve, sep } from 'node:path'
import type { AppDatabase } from '../db/database'
import {
  deleteProductImageRecord, getProductImage, listProductImages as listDbRows, upsertProductImage
} from '../db/repo'

export const MAX_IMAGE_BYTES = 5 * 1024 * 1024
export const MAX_IMAGE_EDGE = 400
export const ALLOWED_IMAGE_EXTS = ['png', 'jpg', 'jpeg', 'webp'] as const
export type ImageExt = (typeof ALLOWED_IMAGE_EXTS)[number]

export interface ProcessedImage {
  bytes: Buffer
  width: number
  height: number
  /** 落盘扩展名（webp 会转成 png） */
  ext: string
}

export interface ProductImageRecord {
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

/** 从原文件名取扩展名，不在白名单抛错 */
export function normalizeImageExt(origName: string): ImageExt {
  const parts = String(origName).split('.')
  const ext = parts.pop()?.toLowerCase() ?? ''
  const base = parts.join('.')
  if (!base || !(ALLOWED_IMAGE_EXTS as readonly string[]).includes(ext)) {
    throw new Error(`仅支持 png/jpg/jpeg/webp 图片，收到：${ext || '无扩展名'}`)
  }
  return ext as ImageExt
}

/** 大小上限 5MB，超限抛错 */
export function assertImageSize(bytes: Buffer): void {
  if (bytes.length > MAX_IMAGE_BYTES) {
    throw new Error(`图片超过 5MB 上限（${(bytes.length / 1024 / 1024).toFixed(1)}MB）`)
  }
}

/** 商品 ID 清理：防路径穿越（真实商品 ID 为数字串） */
export function sanitizeProductId(productId: string): string {
  const clean = String(productId).replace(/[\\/]/g, '_').replace(/\.\./g, '').replace(/[^\w\u4e00-\u9fa5-]/g, '_')
  return clean || 'x'
}

function within(base: string, target: string): boolean {
  const b = resolve(base)
  const t = resolve(target)
  return t === b || t.startsWith(b + sep)
}

/** 渲染层显示用 URL（经主进程 ecai-img:// 安全协议读取，杜绝直接 file://） */
export function imageUrl(relPath: string): string {
  return `ecai-img://img/${String(relPath)
    .split('/')
    .map((seg) => encodeURIComponent(seg))
    .join('/')}`
}

export interface SaveImageInput {
  shopId: number
  productId: string
  bytes: Buffer
  origName: string
}

export function saveProductImage(
  db: AppDatabase,
  imagesDir: string,
  input: SaveImageInput,
  process: (bytes: Buffer, ext: ImageExt) => ProcessedImage
): ProductImageRecord {
  const ext = normalizeImageExt(input.origName)
  assertImageSize(input.bytes)
  const processed = process(input.bytes, ext)
  const safeId = sanitizeProductId(input.productId)
  const relPath = `${input.shopId}/${safeId}.${processed.ext}`
  const full = join(imagesDir, relPath)
  if (!within(imagesDir, full)) throw new Error('非法图片路径')
  // 替换：旧扩展名文件先删，避免孤儿文件
  const old = getProductImage(db, input.shopId, input.productId)
  if (old && old.relPath !== relPath) {
    const oldFull = join(imagesDir, old.relPath)
    if (within(imagesDir, oldFull) && existsSync(oldFull)) rmSync(oldFull)
  }
  mkdirSync(join(imagesDir, String(input.shopId)), { recursive: true })
  writeFileSync(full, processed.bytes)
  upsertProductImage(db, {
    shopId: input.shopId,
    productId: input.productId,
    relPath,
    origName: input.origName,
    sizeBytes: processed.bytes.length,
    width: processed.width,
    height: processed.height
  })
  const row = getProductImage(db, input.shopId, input.productId)!
  return { ...row, url: imageUrl(row.relPath) }
}

export function deleteProductImage(db: AppDatabase, imagesDir: string, shopId: number, productId: string): boolean {
  const row = getProductImage(db, shopId, productId)
  if (!row) return false
  const full = join(imagesDir, row.relPath)
  if (within(imagesDir, full) && existsSync(full)) rmSync(full)
  deleteProductImageRecord(db, shopId, productId)
  return true
}

export function listProductImages(db: AppDatabase, imagesDir: string, shopId: number): ProductImageRecord[] {
  void imagesDir
  return listDbRows(db, shopId).map((r) => ({ ...r, url: imageUrl(r.relPath) }))
}
