// 任务 8 数据包导出/导入（TDD 测试）
import { describe, expect, it } from 'vitest'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { AppDatabase } from '../src/main/db/database'
import { upsertShop } from '../src/main/db/repo'
import { saveProductImage, type ImageExt, type ProcessedImage } from '../src/main/images/service'
import {
  PACKAGE_FORMAT, PACKAGE_FORMAT_VERSION, PACKAGE_TABLES, exportDataPackage, importDataPackage,
  inspectDataPackage, type DataPackageManifest
} from '../src/main/package/service'

function freshDb(tag: string): { db: AppDatabase; dir: string } {
  const dir = mkdtempSync(join(tmpdir(), `ecai-pkg-${tag}-`))
  const db = new AppDatabase(join(dir, 'pkg.db'))
  db.init()
  return { db, dir }
}

const imagesDir = (dir: string): string => join(dir, 'product-images')
const fakeProcess = (bytes: Buffer, ext: ImageExt): ProcessedImage => ({ bytes, width: 400, height: 300, ext: ext === 'webp' ? 'png' : ext })

function seedShop(db: AppDatabase, shopId: number, dates: string[]): void {
  const insDaily = db.raw.prepare('INSERT OR IGNORE INTO daily_metrics (shop_id, date, pay_amount_fen, visitors) VALUES (?,?,?,?)')
  const insProduct = db.raw.prepare('INSERT OR IGNORE INTO product_daily (shop_id, product_id, date, pay_amount_fen, sales_count) VALUES (?,?,?,?,?)')
  const insPromo = db.raw.prepare('INSERT OR IGNORE INTO promo_daily (shop_id, date, ad_entity_id, cost_fen) VALUES (?,?,?,?)')
  const insCs = db.raw.prepare('INSERT OR IGNORE INTO cs_daily (shop_id, date, staff_name) VALUES (?,?,?)')
  const insKw = db.raw.prepare('INSERT OR IGNORE INTO search_keywords (shop_id, date, keyword) VALUES (?,?,?)')
  for (const d of dates) {
    insDaily.run(shopId, d, 12345, 100)
    insProduct.run(shopId, '1001', d, 5000, 2)
    insPromo.run(shopId, d, 'ad-1', 300)
    insCs.run(shopId, d, '客服甲')
    insKw.run(shopId, d, '车载支架')
  }
}

function seedRefunds(db: AppDatabase, shopId: number, n: number): void {
  const ins = db.raw.prepare('INSERT OR IGNORE INTO refund_orders (shop_id, order_no, refund_no, refund_amount_fen, payment_time) VALUES (?,?,?,?,?)')
  for (let i = 1; i <= n; i++) {
    ins.run(shopId, `O-${i}`, `R-${i}`, 100 * i, `2026-08-0${i % 9 + 1} 10:00:00`)
  }
}

function counts(db: AppDatabase, shopId: number, table: string): number {
  if (table === 'shops') return 1
  const row = db.raw.prepare(`SELECT COUNT(*) n FROM ${table} WHERE shop_id = ?`).get(shopId) as { n: number }
  return row.n
}

function zipManifest(zipPath: string, password?: string): DataPackageManifest {
  const info = inspectDataPackage({ zipPath, password })
  if (!info.manifest) throw new Error('无 manifest')
  return info.manifest
}

describe('数据包：常量与表清单', async () => {
  it('格式常量与 11 张业务表', async () => {
    expect(PACKAGE_FORMAT).toBe('ecai-data-package')
    expect(PACKAGE_FORMAT_VERSION).toBe(1)
    expect(PACKAGE_TABLES.map((t) => t.table)).toEqual([
      'shops', 'daily_metrics', 'product_daily', 'promo_daily', 'refund_orders', 'cs_daily',
      'search_keywords', 'dsr_daily', 'dsr_180d', 'ai_analyses', 'product_images'
    ])
  })
})

describe('数据包：导出', async () => {
  it('生成 zip（manifest.json + ecai-data.db），manifest 行数与库一致、校验和可复算', async () => {
    const src = freshDb('export')
    const shopId = upsertShop(src.db, { name: '佰泰康车品旗舰店' })
    seedShop(src.db, shopId, ['2026-08-01', '2026-08-02'])
    seedRefunds(src.db, shopId, 3)
    const out = join(src.dir, 'out.zip')
    await exportDataPackage({ src: src.db, imagesDir: imagesDir(src.dir), outZipPath: out, options: { shopId, appVersion: '0.0.1' } })

    expect(existsSync(out)).toBe(true)
    const m = zipManifest(out)
    expect(m.format).toBe(PACKAGE_FORMAT)
    expect(m.formatVersion).toBe(PACKAGE_FORMAT_VERSION)
    expect(m.shop.name).toBe('佰泰康车品旗舰店')
    expect(m.tables.daily_metrics.rows).toBe(2)
    expect(m.tables.product_daily.rows).toBe(2)
    expect(m.tables.promo_daily.rows).toBe(2)
    expect(m.tables.cs_daily.rows).toBe(2)
    expect(m.tables.search_keywords.rows).toBe(2)
    expect(m.tables.refund_orders.rows).toBe(3)
    expect(m.tables.settings).toBeUndefined()
    expect(m.tables.daily_metrics.rows).toBe(counts(src.db, shopId, 'daily_metrics'))
    expect(m.tables.daily_metrics.sha256).toMatch(/^[0-9a-f]{64}$/)
    expect(m.tables.refund_orders.sha256).toMatch(/^[0-9a-f]{64}$/)
    src.db.close()
    rmSync(src.dir, { recursive: true, force: true })
  })

  it('日期范围过滤：manifest 行数只统计范围内数据', async () => {
    const src = freshDb('range')
    const shopId = upsertShop(src.db, { name: 'S' })
    seedShop(src.db, shopId, ['2026-08-01', '2026-08-10', '2026-08-11'])
    seedRefunds(src.db, shopId, 4)
    const out = join(src.dir, 'out.zip')
    const manifest = await exportDataPackage({ src: src.db, imagesDir: imagesDir(src.dir), outZipPath: out, options: { shopId, dateStart: '2026-08-01', dateEnd: '2026-08-02', appVersion: '0.0.1' } })
    expect(manifest.dateRange).toEqual({ start: '2026-08-01', end: '2026-08-02' })
    expect(manifest.tables.daily_metrics.rows).toBe(1)
    expect(manifest.tables.refund_orders.rows).toBe(1)
    src.db.close()
    rmSync(src.dir, { recursive: true, force: true })
  })
})

describe('数据包：导入往返', async () => {
  it('导出→清库（全新库）→导入：各表行数与导出前一致，店铺自动创建', async () => {
    const src = freshDb('src')
    const shopId = upsertShop(src.db, { name: '佰泰康车品旗舰店' })
    seedShop(src.db, shopId, ['2026-08-01', '2026-08-02', '2026-08-03'])
    seedRefunds(src.db, shopId, 5)
    const out = join(src.dir, 'out.zip')
    const manifest = await exportDataPackage({ src: src.db, imagesDir: imagesDir(src.dir), outZipPath: out, options: { shopId, appVersion: '0.0.1' } })
    const before = manifest.tables

    const tgt = freshDb('tgt')
    const result = importDataPackage({ db: tgt.db, imagesDir: imagesDir(tgt.dir), zipPath: out })
    expect(result.ok).toBe(true)
    expect(result.shopCreated).toBe(true)
    expect(result.shopName).toBe('佰泰康车品旗舰店')
    const tgtShopId = result.shopId
    for (const meta of PACKAGE_TABLES) {
      if (meta.table === 'shops') continue
      const after = counts(tgt.db, tgtShopId, meta.table)
      expect(after, meta.table).toBe(before[meta.table].rows)
    }
    for (const t of result.tables) {
      if (t.table === 'shops') continue
      expect(t.imported).toBe(before[t.table].rows)
      expect(t.skipped).toBe(0)
    }
    tgt.db.close()
    src.db.close()
    rmSync(src.dir, { recursive: true, force: true })
    rmSync(tgt.dir, { recursive: true, force: true })
  })

  it('同一数据包导入两次：行数不翻倍，第二次全部跳过', async () => {
    const src = freshDb('src2')
    const shopId = upsertShop(src.db, { name: 'S店' })
    seedShop(src.db, shopId, ['2026-08-01', '2026-08-02'])
    seedRefunds(src.db, shopId, 2)
    const out = join(src.dir, 'out.zip')
    const manifest = await exportDataPackage({ src: src.db, imagesDir: imagesDir(src.dir), outZipPath: out, options: { shopId, appVersion: '0.0.1' } })

    const tgt = freshDb('tgt2')
    const r1 = importDataPackage({ db: tgt.db, imagesDir: imagesDir(tgt.dir), zipPath: out })
    const r2 = importDataPackage({ db: tgt.db, imagesDir: imagesDir(tgt.dir), zipPath: out })
    for (const meta of PACKAGE_TABLES) {
      if (meta.table === 'shops') continue
      const n1 = counts(tgt.db, r1.shopId, meta.table)
      expect(n1, meta.table + ' 第一次').toBe(manifest.tables[meta.table].rows)
      expect(counts(tgt.db, r1.shopId, meta.table), meta.table + ' 第二次不翻倍').toBe(n1)
    }
    for (const t of r2.tables) {
      if (t.table === 'shops') continue
      expect(t.imported).toBe(0)
      expect(t.skipped).toBe(manifest.tables[t.table].rows)
    }
    tgt.db.close()
    src.db.close()
    rmSync(src.dir, { recursive: true, force: true })
    rmSync(tgt.dir, { recursive: true, force: true })
  })

  it('店铺已存在则合并：不新建店铺行，数据并入已有店铺', async () => {
    const src = freshDb('src3')
    const shopId = upsertShop(src.db, { name: '佰泰康车品旗舰店' })
    seedShop(src.db, shopId, ['2026-08-01'])
    const out = join(src.dir, 'out.zip')
    await exportDataPackage({ src: src.db, imagesDir: imagesDir(src.dir), outZipPath: out, options: { shopId, appVersion: '0.0.1' } })

    const tgt = freshDb('tgt3')
    const existing = upsertShop(tgt.db, { name: '佰泰康车品旗舰店' })
    const r = importDataPackage({ db: tgt.db, imagesDir: imagesDir(tgt.dir), zipPath: out })
    expect(r.shopCreated).toBe(false)
    expect(r.shopId).toBe(existing)
    expect((tgt.db.raw.prepare('SELECT COUNT(*) n FROM shops').get() as { n: number }).n).toBe(1)
    expect(counts(tgt.db, existing, 'daily_metrics')).toBe(1)
    tgt.db.close()
    src.db.close()
    rmSync(src.dir, { recursive: true, force: true })
    rmSync(tgt.dir, { recursive: true, force: true })
  })

  it('导入结果包含每表 导入/跳过 行数', async () => {
    const src = freshDb('src4')
    const shopId = upsertShop(src.db, { name: 'S' })
    seedShop(src.db, shopId, ['2026-08-01'])
    const out = join(src.dir, 'out.zip')
    await exportDataPackage({ src: src.db, imagesDir: imagesDir(src.dir), outZipPath: out, options: { shopId, appVersion: '0.0.1' } })
    const tgt = freshDb('tgt4')
    const r = importDataPackage({ db: tgt.db, imagesDir: imagesDir(tgt.dir), zipPath: out })
    const daily = r.tables.find((t) => t.table === 'daily_metrics')
    expect(daily).toBeDefined()
    expect(daily!.rows).toBe(1)
    expect(daily!.imported).toBe(1)
    expect(daily!.skipped).toBe(0)
    tgt.db.close()
    src.db.close()
    rmSync(src.dir, { recursive: true, force: true })
    rmSync(tgt.dir, { recursive: true, force: true })
  })
})

describe('数据包：密码', async () => {
  it('设密码导出→无密码/错密码导入报错，正确密码成功', async () => {
    const src = freshDb('pwd')
    const shopId = upsertShop(src.db, { name: 'S' })
    seedShop(src.db, shopId, ['2026-08-01'])
    const out = join(src.dir, 'out.zip')
    await exportDataPackage({ src: src.db, imagesDir: imagesDir(src.dir), outZipPath: out, options: { shopId, password: 'ecai-123', appVersion: '0.0.1' } })
    const info = inspectDataPackage({ zipPath: out })
    expect(info.encrypted).toBe(true)

    const tgt1 = freshDb('a')
    expect(() => importDataPackage({ db: tgt1.db, imagesDir: '', zipPath: out })).toThrow(/密码/)
    const tgt2 = freshDb('b')
    expect(() => importDataPackage({ db: tgt2.db, imagesDir: '', zipPath: out, password: 'wrong' })).toThrow(/密码/)
    const tgt3 = freshDb('c')
    const r = importDataPackage({ db: tgt3.db, imagesDir: '', zipPath: out, password: 'ecai-123' })
    expect(r.ok).toBe(true)
    expect(counts(tgt3.db, r.shopId, 'daily_metrics')).toBe(1)
    for (const t of [tgt1, tgt2, tgt3]) t.db.close()
    src.db.close()
    rmSync(src.dir, { recursive: true, force: true })
    for (const d of [tgt1.dir, tgt2.dir, tgt3.dir]) rmSync(d, { recursive: true, force: true })
  })
})

describe('数据包：商品图片还原', async () => {
  it('源店铺 id≠目标店铺 id：图片文件与绑定记录完整还原，rel_path 重写', async () => {
    const src = freshDb('imgsrc')
    // 前面 4 个占位店让「佰泰康车品旗舰店」获得 id=5，与目标库分配的 id 错开，验证 rel_path 真实重写
    for (const n of ['A店', 'B店', 'C店', 'D店']) upsertShop(src.db, { name: n })
    const shopId = upsertShop(src.db, { name: '佰泰康车品旗舰店' })
    seedShop(src.db, shopId, ['2026-08-01'])
    const bytes = Buffer.from('fake-png-bytes-任务8')
    saveProductImage(src.db, imagesDir(src.dir), { shopId, productId: '1001', bytes, origName: '主图.png' }, fakeProcess)
    expect(existsSync(join(imagesDir(src.dir), String(shopId), '1001.png'))).toBe(true)

    const out = join(src.dir, 'out.zip')
    const manifest = await exportDataPackage({ src: src.db, imagesDir: imagesDir(src.dir), outZipPath: out, options: { shopId, appVersion: '0.0.1' } })
    expect(manifest.images.enabled).toBe(true)
    expect(manifest.images.files).toHaveLength(1)
    expect(manifest.images.files[0].path).toBe(`${shopId}/1001.png`)
    expect(manifest.images.files[0].size).toBe(bytes.length)

    const tgt = freshDb('imgtgt')
    upsertShop(tgt.db, { name: '占位店' })
    const r = importDataPackage({ db: tgt.db, imagesDir: imagesDir(tgt.dir), zipPath: out })
    const tgtShopId = r.shopId
    expect(tgtShopId).toBe(2)
    expect(tgtShopId).not.toBe(shopId)
    const rec = tgt.db.raw.prepare('SELECT rel_path, size_bytes FROM product_images WHERE shop_id=? AND product_id=?').get(tgtShopId, '1001') as { rel_path: string; size_bytes: number }
    expect(rec).toBeDefined()
    expect(rec.rel_path).toBe(`${tgtShopId}/1001.png`)
    expect(rec.size_bytes).toBe(bytes.length)
    const file = join(imagesDir(tgt.dir), String(tgtShopId), '1001.png')
    expect(existsSync(file)).toBe(true)
    expect(readFileSync(file).equals(bytes)).toBe(true)
    expect(r.images.files).toBe(1)
    expect(r.images.restored).toBe(1)
    tgt.db.close()
    src.db.close()
    rmSync(src.dir, { recursive: true, force: true })
    rmSync(tgt.dir, { recursive: true, force: true })
  })
})

describe('数据包：校验和真实校验', async () => {
  it('篡改包内数据库（删一行）后导入被拒绝', async () => {
    const src = freshDb('tamper')
    const shopId = upsertShop(src.db, { name: 'S' })
    seedShop(src.db, shopId, ['2026-08-01', '2026-08-02'])
    const out = join(src.dir, 'out.zip')
    await exportDataPackage({ src: src.db, imagesDir: imagesDir(src.dir), outZipPath: out, options: { shopId, appVersion: '0.0.1' } })

    const work = join(src.dir, 'work')
    mkdirSync(work, { recursive: true })
    const AdmZip = require('adm-zip')
    const zip = new AdmZip(out)
    writeFileSync(join(work, 'ecai-data.db'), zip.readFile('ecai-data.db'))
    const db2 = new AppDatabase(join(work, 'ecai-data.db'))
    db2.raw.prepare('DELETE FROM daily_metrics WHERE date = ?').run('2026-08-02')
    db2.close()
    const out2 = join(src.dir, 'tampered.zip')
    const z2 = new AdmZip()
    z2.addFile('ecai-data.db', readFileSync(join(work, 'ecai-data.db')))
    z2.addFile('manifest.json', Buffer.from(JSON.stringify(zipManifest(out))))
    z2.writeZip(out2)

    const tgt = freshDb('tampertgt')
    expect(() => importDataPackage({ db: tgt.db, imagesDir: imagesDir(tgt.dir), zipPath: out2 })).toThrow(/校验|行数/)
    tgt.db.close()
    src.db.close()
    rmSync(src.dir, { recursive: true, force: true })
  })

  it('导入不悄悄丢数据：完整往返行数逐表一致（含 refund/cs/keywords）', async () => {
    const src = freshDb('full')
    const shopId = upsertShop(src.db, { name: '佰泰康车品旗舰店' })
    seedShop(src.db, shopId, ['2026-08-01', '2026-08-02', '2026-08-03', '2026-08-04'])
    seedRefunds(src.db, shopId, 6)
    const out = join(src.dir, 'out.zip')
    const manifest = await exportDataPackage({ src: src.db, imagesDir: imagesDir(src.dir), outZipPath: out, options: { shopId, appVersion: '0.0.1' } })
    const tgt = freshDb('fulltgt')
    const r = importDataPackage({ db: tgt.db, imagesDir: imagesDir(tgt.dir), zipPath: out })
    for (const meta of PACKAGE_TABLES) {
      if (meta.table === 'shops') continue
      expect(counts(tgt.db, r.shopId, meta.table), meta.table).toBe(manifest.tables[meta.table].rows)
    }
    tgt.db.close()
    src.db.close()
    rmSync(src.dir, { recursive: true, force: true })
    rmSync(tgt.dir, { recursive: true, force: true })
  })
})
