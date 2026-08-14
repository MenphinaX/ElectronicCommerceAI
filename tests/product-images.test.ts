import { describe, expect, it } from 'vitest'
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { AppDatabase } from '../src/main/db/database'
import { ALL_TABLES, SCHEMA_VERSION } from '../src/main/db/schema'
import { deleteProductImageRecord, getProductImage, listProductImages, upsertProductImage, upsertShop } from '../src/main/db/repo'
import {
  MAX_IMAGE_BYTES, assertImageSize, deleteProductImage, imageUrl, listProductImages as listImages,
  normalizeImageExt, saveProductImage, type ImageExt, type ProcessedImage
} from '../src/main/images/service'

function freshDb(): { db: AppDatabase; dir: string } {
  const dir = mkdtempSync(join(tmpdir(), 'ecai-pimg-'))
  const db = new AppDatabase(join(dir, 'pimg.db'))
  db.init()
  return { db, dir }
}

const imagesDir = (dir: string): string => join(dir, 'product-images')

/** 测试用假处理器：不做真实解码/缩放，返回原字节 + 固定宽高（服务层与解码解耦） */
const fakeProcess = (bytes: Buffer, ext: ImageExt): ProcessedImage => ({
  bytes,
  width: 400,
  height: 300,
  ext: ext === 'webp' ? 'png' : ext
})

describe('product_images：建表与迁移', () => {
  it('SCHEMA_VERSION 且 ALL_TABLES 含 product_images', () => {
    expect(SCHEMA_VERSION).toBeGreaterThan(0)
    expect(ALL_TABLES).toContain('product_images')
  })

  it('init 后落盘库存在 product_images 表，user_version=3，幂等可重复 init', () => {
    const { db, dir } = freshDb()
    const rows = db.raw.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='product_images'").all()
    expect(rows).toHaveLength(1)
    expect(db.userVersion()).toBe(SCHEMA_VERSION)
    db.init()
    expect(db.userVersion()).toBe(SCHEMA_VERSION)
    expect(db.integrityCheck()).toBe('ok')
    db.close()
    rmSync(dir, { recursive: true, force: true })
  })

  it('列齐全：店铺/商品/相对路径/原文件名/字节数/宽高/更新时间，业务主键=店铺+商品', () => {
    const { db, dir } = freshDb()
    const cols = db.raw.prepare('PRAGMA table_info(product_images)').all() as Array<{ name: string; pk: number }>
    const names = cols.map((c) => c.name)
    for (const n of ['shop_id', 'product_id', 'rel_path', 'orig_name', 'size_bytes', 'width', 'height', 'updated_at']) {
      expect(names).toContain(n)
    }
    const pks = cols.filter((c) => c.pk > 0).map((c) => c.name).sort()
    expect(pks).toEqual(['product_id', 'shop_id'])
    db.close()
    rmSync(dir, { recursive: true, force: true })
  })
})

describe('product_images：格式与大小校验', () => {
  it('normalizeImageExt 接受 png/jpg/jpeg/webp（含大写）', () => {
    for (const n of ['a.png', 'a.jpg', 'a.jpeg', 'a.webp', 'A.PNG', 'b.JPEG']) {
      expect(normalizeImageExt(n)).toBeTruthy()
    }
  })
  it('normalizeImageExt 拒绝 gif/bmp/svg/无扩展名', () => {
    for (const n of ['a.gif', 'a.bmp', 'a.svg', 'a.ico', 'noext', '.png']) {
      expect(() => normalizeImageExt(n)).toThrow()
    }
  })
  it('assertImageSize：5MB 内通过，超 5MB 抛错', () => {
    assertImageSize(Buffer.alloc(MAX_IMAGE_BYTES))
    expect(() => assertImageSize(Buffer.alloc(MAX_IMAGE_BYTES + 1))).toThrow()
  })
})

describe('product_images：上传→持久化→读回→删除（服务层）', () => {
  it('保存：文件写入 product-images/{店铺}/{商品}.{ext}，DB 记录与文件一一对应', () => {
    const { db, dir } = freshDb()
    const shopId = upsertShop(db, { name: '?' })
    const bytes = Buffer.from('fake-png-bytes')
    const rec = saveProductImage(db, imagesDir(dir), { shopId: 1, productId: '1001', bytes, origName: '主图.png' }, fakeProcess)
    const file = join(imagesDir(dir), '1', '1001.png')
    expect(existsSync(file)).toBe(true)
    expect(readFileSync(file).equals(bytes)).toBe(true)
    expect(rec.relPath).toBe('1/1001.png')
    expect(rec.url).toBe(imageUrl('1/1001.png'))
    expect(rec.url.startsWith('ecai-img://')).toBe(true)
    expect(rec.origName).toBe('主图.png')
    expect(rec.sizeBytes).toBe(bytes.length)
    expect(rec.width).toBe(400)
    expect(rec.height).toBe(300)
    const got = getProductImage(db, 1, '1001')
    expect(got?.relPath).toBe('1/1001.png')
    expect(got?.sizeBytes).toBe(bytes.length)
    db.close()
    rmSync(dir, { recursive: true, force: true })
  })

  it('替换：同商品不同扩展名时旧文件删除、只留新文件，记录更新', () => {
    const { db, dir } = freshDb()
    upsertShop(db, { name: '?' })
    saveProductImage(db, imagesDir(dir), { shopId: 1, productId: '1001', bytes: Buffer.from('aaa'), origName: 'a.png' }, fakeProcess)
    saveProductImage(db, imagesDir(dir), { shopId: 1, productId: '1001', bytes: Buffer.from('bbb'), origName: 'b.jpg' }, fakeProcess)
    const files = readdirSync(join(imagesDir(dir), '1'))
    expect(files).toEqual(['1001.jpg'])
    const got = getProductImage(db, 1, '1001')
    expect(got?.relPath).toBe('1/1001.jpg')
    expect(got?.origName).toBe('b.jpg')
    expect(got?.sizeBytes).toBe(3)
    db.close()
    rmSync(dir, { recursive: true, force: true })
  })

  it('删除：文件与记录同时消失，重复删除返回 false', () => {
    const { db, dir } = freshDb()
    upsertShop(db, { name: '?' })
    saveProductImage(db, imagesDir(dir), { shopId: 1, productId: '1001', bytes: Buffer.from('x'), origName: 'x.png' }, fakeProcess)
    expect(deleteProductImage(db, imagesDir(dir), 1, '1001')).toBe(true)
    expect(existsSync(join(imagesDir(dir), '1', '1001.png'))).toBe(false)
    expect(getProductImage(db, 1, '1001')).toBeNull()
    expect(deleteProductImage(db, imagesDir(dir), 1, '1001')).toBe(false)
    db.close()
    rmSync(dir, { recursive: true, force: true })
  })

  it('店铺隔离：A/B 店同商品 ID 各绑各图，互不覆盖', () => {
    const { db, dir } = freshDb()
    upsertShop(db, { name: 'A?' })
    upsertShop(db, { name: 'B?' })
    saveProductImage(db, imagesDir(dir), { shopId: 1, productId: '1001', bytes: Buffer.from('A'), origName: 'a.png' }, fakeProcess)
    saveProductImage(db, imagesDir(dir), { shopId: 2, productId: '1001', bytes: Buffer.from('B'), origName: 'b.png' }, fakeProcess)
    expect(existsSync(join(imagesDir(dir), '1', '1001.png'))).toBe(true)
    expect(existsSync(join(imagesDir(dir), '2', '1001.png'))).toBe(true)
    expect(getProductImage(db, 1, '1001')?.relPath).toBe('1/1001.png')
    expect(getProductImage(db, 2, '1001')?.relPath).toBe('2/1001.png')
    const listA = listImages(db, imagesDir(dir), 1)
    const listB = listImages(db, imagesDir(dir), 2)
    expect(listA).toHaveLength(1)
    expect(listB).toHaveLength(1)
    expect(listA[0].url).not.toBe(listB[0].url)
    db.close()
    rmSync(dir, { recursive: true, force: true })
  })

  it('商品 ID 含路径分隔符时被清理，禁止目录逃逸', () => {
    const { db, dir } = freshDb()
    upsertShop(db, { name: '?' })
    const rec = saveProductImage(db, imagesDir(dir), { shopId: 1, productId: '../evil', bytes: Buffer.from('x'), origName: 'x.png' }, fakeProcess)
    expect(rec.relPath).not.toContain('..')
    expect(rec.relPath).toBe('1/_evil.png')
    expect(existsSync(join(imagesDir(dir), '1', '_evil.png'))).toBe(true)
    expect(existsSync(join(imagesDir(dir), '..', 'evil.png'))).toBe(false)
    const shopDir = readdirSync(join(imagesDir(dir), '1'))
    expect(shopDir).toHaveLength(1)
    db.close()
    rmSync(dir, { recursive: true, force: true })
  })

  it('repo 层：upsert/get/delete/list 语义正确', () => {
    const { db, dir } = freshDb()
    upsertShop(db, { name: '?' })
    upsertProductImage(db, { shopId: 1, productId: '9', relPath: '1/9.png', origName: 'n.png', sizeBytes: 5, width: 10, height: 20 })
    expect(getProductImage(db, 1, '9')?.width).toBe(10)
    upsertProductImage(db, { shopId: 1, productId: '9', relPath: '1/9.jpg', origName: 'n.jpg', sizeBytes: 6 })
    expect(getProductImage(db, 1, '9')?.relPath).toBe('1/9.jpg')
    expect(getProductImage(db, 1, '9')?.width).toBeNull()
    const before = deleteProductImageRecord(db, 1, '9')
    expect(before?.relPath).toBe('1/9.jpg')
    expect(getProductImage(db, 1, '9')).toBeNull()
    expect(deleteProductImageRecord(db, 1, '9')).toBeNull()
    expect(listProductImages(db, 1)).toHaveLength(0)
    db.close()
    rmSync(dir, { recursive: true, force: true })
  })

  it('文件与记录 1:1：保存 2 个商品 → 2 文件 2 记录；删 1 → 1 文件 1 记录', () => {
    const { db, dir } = freshDb()
    upsertShop(db, { name: '?' })
    saveProductImage(db, imagesDir(dir), { shopId: 1, productId: '1', bytes: Buffer.from('a'), origName: 'a.png' }, fakeProcess)
    saveProductImage(db, imagesDir(dir), { shopId: 1, productId: '2', bytes: Buffer.from('b'), origName: 'b.png' }, fakeProcess)
    const shopDir = join(imagesDir(dir), '1')
    expect(readdirSync(shopDir)).toHaveLength(2)
    expect(listImages(db, imagesDir(dir), 1)).toHaveLength(2)
    deleteProductImage(db, imagesDir(dir), 1, '1')
    expect(readdirSync(shopDir)).toHaveLength(1)
    expect(listImages(db, imagesDir(dir), 1)).toHaveLength(1)
    db.close()
    rmSync(dir, { recursive: true, force: true })
  })
})
