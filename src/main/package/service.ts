// 任务 8 数据包导出/导入（核心服务，与 Electron 解耦可单测）
// 数据包 = zip：manifest.json + ecai-data.db（独立 SQLite 副本，禁 JSON 存数据）+ product-images/
// 导出：选店铺+日期范围 → 相关表写入独立 SQLite 副本 → 逐表行数/校验和写入 manifest → 可选密码 zip 打包
// 导入：解包（密码校验）→ manifest 行数+校验和双重校验 → 按业务主键合并入库（重复导入不重复）→ 图片文件还原
import { createHash } from 'node:crypto'
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync, createWriteStream } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import archiver from 'archiver'
import archiverZipEncrypted from 'archiver-zip-encrypted'
import AdmZip from 'adm-zip'
import { AppDatabase } from '../db/database'
import { getShop, upsertShop } from '../db/repo'

export const PACKAGE_FORMAT = 'ecai-data-package'
export const PACKAGE_FORMAT_VERSION = 1
export const MANIFEST_FILE = 'manifest.json'
export const DB_FILE = 'ecai-data.db'
export const IMAGES_DIR = 'product-images'

export interface ExportTableMeta {
  table: string
  label: string
  /** 日期过滤列（YYYY-MM-DD）；refund_orders 用 payment_time 前 10 位 */
  dateColumn?: string
}

/**
 * 数据包包含的业务表（全局配置/模型 key/导入历史/聊天/导出记录等本机属性不随包走）：
 * - 全部含 shop_id，除 shops（店铺本身一行）
 * - refund_orders 按 payment_time 过滤（NULL 时间视为在范围内，避免漏包）
 */
export const PACKAGE_TABLES: ExportTableMeta[] = [
  { table: 'shops', label: '店铺' },
  { table: 'daily_metrics', label: '经营日报', dateColumn: 'date' },
  { table: 'product_daily', label: '商品日报', dateColumn: 'date' },
  { table: 'promo_daily', label: '推广日报', dateColumn: 'date' },
  { table: 'refund_orders', label: '退款单', dateColumn: 'payment_time' },
  { table: 'cs_daily', label: '客服日报', dateColumn: 'date' },
  { table: 'search_keywords', label: '搜索词', dateColumn: 'date' },
  { table: 'dsr_daily', label: 'DSR 日维度', dateColumn: 'date' },
  { table: 'dsr_180d', label: 'DSR 180天', dateColumn: 'snapshot_date' },
  { table: 'ai_analyses', label: 'AI 评语', dateColumn: 'date' },
  { table: 'product_images', label: '商品图片绑定' }
]

export interface ExportOptions {
  shopId: number
  dateStart?: string | null
  dateEnd?: string | null
  password?: string | null
  appVersion?: string
  /** 测试可注入固定导出时间 */
  exportedAt?: string
}

export interface PackageTableStat {
  table: string
  label: string
  rows: number
  sha256: string
}

export interface ImageFileStat {
  path: string
  size: number
  sha256: string
}

export interface DataPackageManifest {
  format: string
  formatVersion: number
  appVersion: string
  exportedAt: string
  shop: { name: string; platform: string; shopCode: string | null }
  dateRange: { start: string | null; end: string | null }
  dbFile: string
  tables: Record<string, PackageTableStat>
  images: { dir: string; enabled: boolean; files: ImageFileStat[] }
}

export interface PackageTableResult {
  table: string
  label: string
  rows: number
  imported: number
  skipped: number
}

export interface PackageImportResult {
  ok: true
  shopId: number
  shopName: string
  shopCreated: boolean
  dateRange: { start: string | null; end: string | null }
  tables: PackageTableResult[]
  images: { files: number; restored: number }
  exportedAt: string
  appVersion: string
}

function nowStamp(): string {
  const d = new Date()
  const p = (n: number): string => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`
}

function sha256(buf: Buffer | string): string {
  return createHash('sha256').update(buf).digest('hex')
}

function serializeValue(v: unknown): string {
  if (v === null || v === undefined) return 'n'
  if (typeof v === 'number') return Number.isInteger(v) ? `i:${v}` : `d:${v}`
  if (typeof v === 'bigint') return `i:${v}`
  return `s:${String(v)}`
}

/** 表校验和：按 rowid 顺序逐行逐列序列化后 sha256（导出与导入两端同算法，真实可复算） */
export function tableChecksum(db: AppDatabase, table: string): string {
  const rows = db.raw.prepare(`SELECT * FROM "${table}" ORDER BY rowid`).all() as Array<Record<string, unknown>>
  const h = createHash('sha256')
  for (const row of rows) {
    for (const key of Object.keys(row)) h.update(serializeValue(row[key]))
    h.update('\u0000')
  }
  return h.digest('hex')
}

function tableColumns(db: AppDatabase, table: string): string[] {
  return (db.raw.prepare(`PRAGMA table_info("${table}")`).all() as Array<{ name: string }>).map((c) => c.name)
}

interface ScopeSql {
  sql: string
  params: unknown[]
}

function scopeWhere(meta: ExportTableMeta, shopId: number, range: { start?: string | null; end?: string | null }): ScopeSql {
  if (meta.table === 'shops') return { sql: 'WHERE id = ?', params: [shopId] }
  if (!meta.dateColumn) return { sql: 'WHERE shop_id = ?', params: [shopId] }
  const start = range.start ?? null
  const end = range.end ?? null
  if (start && end) {
    if (meta.dateColumn === 'payment_time') {
      return { sql: 'WHERE shop_id = ? AND (payment_time IS NULL OR substr(payment_time,1,10) BETWEEN ? AND ?)', params: [shopId, start, end] }
    }
    return { sql: `WHERE shop_id = ? AND ${meta.dateColumn} BETWEEN ? AND ?`, params: [shopId, start, end] }
  }
  return { sql: 'WHERE shop_id = ?', params: [shopId] }
}

function scopeCount(db: AppDatabase, meta: ExportTableMeta, shopId: number, range: { start?: string | null; end?: string | null }): number {
  const { sql, params } = scopeWhere(meta, shopId, range)
  const row = db.raw.prepare(`SELECT COUNT(*) AS n FROM "${meta.table}" ${sql}`).get(...params) as { n: number }
  return row.n
}

/** 把所选店铺的数据写入独立 SQLite 副本（全新库建全量 schema，只保留本店数据；ATTACH 源库跨库批量复制） */
function buildCopyDb(src: AppDatabase, copyPath: string, opts: ExportOptions): void {
  const copy = new AppDatabase(copyPath)
  copy.init()
  try {
    // 副本只作快照：关闭外键约束（skills 等全局表不在包内，避免 ai_analyses.source_skill_id 悬空引用报错）
    copy.raw.pragma('foreign_keys = OFF')
    const range = { start: opts.dateStart, end: opts.dateEnd }
    copy.raw.exec(`ATTACH DATABASE '${src.path.replace(/'/g, "''")}' AS src`)
    try {
      for (const meta of PACKAGE_TABLES) {
        const cols = tableColumns(src, meta.table)
        const colSql = cols.join(', ')
        const { sql, params } = scopeWhere(meta, opts.shopId, range)
        const insertSql = `INSERT INTO "${meta.table}" (${colSql}) SELECT ${colSql} FROM src."${meta.table}" ${sql}`
        copy.raw.prepare(insertSql).run(...params)
      }
    } finally {
      copy.raw.exec('DETACH DATABASE src')
    }
  } finally {
    copy.close()
  }
}

function listImageFiles(imagesDir: string, shopId: number): ImageFileStat[] {
  const dir = join(imagesDir, String(shopId))
  if (!existsSync(dir)) return []
  const out: ImageFileStat[] = []
  for (const f of readdirSync(dir)) {
    const p = join(dir, f)
    let st: ReturnType<typeof statSync>
    try {
      st = statSync(p)
    } catch {
      continue
    }
    if (!st.isFile()) continue
    const buf = readFileSync(p)
    out.push({ path: `${shopId}/${f}`, size: buf.length, sha256: sha256(buf) })
  }
  return out.sort((a, b) => a.path.localeCompare(b.path))
}

function copyDirSync(from: string, to: string): void {
  mkdirSync(to, { recursive: true })
  for (const f of readdirSync(from)) {
    const src = join(from, f)
    const st = statSync(src)
    if (st.isDirectory()) {
      copyDirSync(src, join(to, f))
    } else if (st.isFile()) {
      copyFileSync(src, join(to, f))
    }
  }
}

let encryptedFormatRegistered = false
function ensureEncryptedFormat(): void {
  if (!encryptedFormatRegistered) {
    archiver.registerFormat('zip-encrypted', archiverZipEncrypted as never)
    encryptedFormatRegistered = true
  }
}

/** 打包 workDir 内容（manifest.json + ecai-data.db + product-images/）为 zip，可选密码（zip20/ZipCrypto） */
function zipWorkDir(workDir: string, outZipPath: string, password: string | null | undefined): Promise<void> {
  mkdirSync(dirname(outZipPath), { recursive: true })
  return new Promise((resolve, reject) => {
    const encrypted = !!password
    if (encrypted) ensureEncryptedFormat()
    const archive = archiver.create(encrypted ? 'zip-encrypted' : 'zip', {
      zlib: { level: 8 },
      ...(encrypted ? { encryptionMethod: 'zip20', password: String(password) } : {})
    } as never)
    const stream = createWriteStream(outZipPath)
    archive.on('error', reject)
    stream.on('close', resolve)
    stream.on('error', reject)
    archive.pipe(stream)
    archive.file(join(workDir, MANIFEST_FILE), { name: MANIFEST_FILE })
    archive.file(join(workDir, DB_FILE), { name: DB_FILE })
    const imgDir = join(workDir, IMAGES_DIR)
    if (existsSync(imgDir)) archive.directory(imgDir, IMAGES_DIR)
    void archive.finalize()
  })
}

export async function exportDataPackage(opts: {
  src: AppDatabase
  imagesDir: string
  outZipPath: string
  options: ExportOptions
}): Promise<DataPackageManifest> {
  const { src, options } = opts
  const shop = getShop(src, options.shopId)
  if (!shop) throw new Error(`店铺不存在：id=${options.shopId}`)
  const workDir = mkdtempSync(join(tmpdir(), 'ecai-pkg-export-'))
  try {
    const dbPath = join(workDir, DB_FILE)
    buildCopyDb(src, dbPath, options)
    const copy = new AppDatabase(dbPath)
    try {
      const tables: Record<string, PackageTableStat> = {}
      for (const meta of PACKAGE_TABLES) {
        tables[meta.table] = {
          table: meta.table,
          label: meta.label,
          rows: scopeCount(copy, meta, options.shopId, { start: options.dateStart, end: options.dateEnd }),
          sha256: tableChecksum(copy, meta.table)
        }
      }
      const files = listImageFiles(opts.imagesDir, options.shopId)
      if (files.length > 0) {
        const dst = join(workDir, IMAGES_DIR)
        copyDirSync(join(opts.imagesDir, String(options.shopId)), join(dst, String(options.shopId)))
      }
      const manifest: DataPackageManifest = {
        format: PACKAGE_FORMAT,
        formatVersion: PACKAGE_FORMAT_VERSION,
        appVersion: options.appVersion ?? '',
        exportedAt: options.exportedAt ?? nowStamp(),
        shop: { name: shop.name, platform: shop.platform, shopCode: shop.shopCode ?? null },
        dateRange: { start: options.dateStart ?? null, end: options.dateEnd ?? null },
        dbFile: DB_FILE,
        tables,
        images: { dir: IMAGES_DIR, enabled: true, files }
      }
      writeFileSync(join(workDir, MANIFEST_FILE), JSON.stringify(manifest, null, 2), 'utf8')
      await awaitZip(workDir, opts.outZipPath, options.password)
      return manifest
    } finally {
      copy.close()
    }
  } finally {
    rmSync(workDir, { recursive: true, force: true })
  }
}

function awaitZip(workDir: string, outZipPath: string, password?: string | null): Promise<void> {
  return zipWorkDir(workDir, outZipPath, password ?? null)
}


/** 校验 manifest 图片路径安全（防目录穿越） */
function assertSafeImagePath(p: string): void {
  if (!p || p.includes('..') || p.startsWith('/') || /^[a-zA-Z]:/.test(p)) {
    throw new Error(`数据包图片路径非法：${p}`)
  }
}

export function inspectDataPackage(opts: { zipPath: string; password?: string | null }): { manifest: DataPackageManifest | null; encrypted: boolean } {
  const zip = new AdmZip(opts.zipPath)
  const entries = zip.getEntries()
  const encrypted = entries.some((e) => {
    const h = (e as { header?: { encrypted?: boolean } }).header
    return h?.encrypted === true
  })
  if (encrypted && !opts.password) return { manifest: null, encrypted: true }
  let manifest: DataPackageManifest | null = null
  try {
    const buf = zip.readFile(MANIFEST_FILE, opts.password || undefined)
    if (!buf) throw new Error('数据包中缺少 manifest.json')
    manifest = JSON.parse(buf.toString('utf8')) as DataPackageManifest
  } catch (e) {
    const msg = (e as Error).message
    if (/wrong password/i.test(msg)) throw new Error('数据包密码错误，请检查后重试')
    if (/incompatible password/i.test(msg)) throw new Error('该数据包已加密，请先输入密码')
    throw new Error(`读取数据包清单失败：${msg}`)
  }
  return { manifest, encrypted }
}

/** 解出数据库副本并逐表校验行数 + 校验和（任一不符拒绝导入） */
function extractAndVerify(zip: AdmZip, manifest: DataPackageManifest, password: string | null | undefined, workDir: string): void {
  const dbBuf = zip.readFile(manifest.dbFile || DB_FILE, password || undefined)
  if (!dbBuf) throw new Error('数据包中缺少数据库副本文件')
  const dbPath = join(workDir, DB_FILE)
  writeFileSync(dbPath, dbBuf)
  const copy = new AppDatabase(dbPath)
  try {
    if (copy.integrityCheck() !== 'ok') throw new Error('数据包内数据库完整性检查未通过，拒绝导入')
    for (const meta of PACKAGE_TABLES) {
      const st = manifest.tables[meta.table]
      if (!st) throw new Error(`数据包清单缺少 ${meta.label} 校验信息`)
      const rows = copy.raw.prepare(`SELECT COUNT(*) AS n FROM "${meta.table}"`).get() as { n: number }
      if (rows.n !== st.rows) {
        throw new Error(`数据包校验失败：${meta.label} 行数 ${rows.n} ≠ 清单 ${st.rows}，已拒绝导入`)
      }
      if (tableChecksum(copy, meta.table) !== st.sha256) {
        throw new Error(`数据包校验失败：${meta.label} 校验和与清单不一致，已拒绝导入`)
      }
    }
  } finally {
    copy.close()
  }
}

/** 按 manifest 逐文件校验（sha256+size）并解出到 workDir/product-images/ */
function extractImages(zip: AdmZip, manifest: DataPackageManifest, password: string | null | undefined, workDir: string): ImageFileStat[] {
  const files = manifest.images?.files ?? []
  const out: ImageFileStat[] = []
  for (const f of files) {
    assertSafeImagePath(f.path)
    const buf = zip.readFile(`${IMAGES_DIR}/${f.path}`, password || undefined)
    if (!buf) throw new Error(`数据包校验失败：图片 ${f.path} 缺失`)
    if (buf.length !== f.size || sha256(buf) !== f.sha256) {
      throw new Error(`数据包校验失败：图片 ${f.path} 校验和与清单不一致，已拒绝导入`)
    }
    const dst = join(workDir, IMAGES_DIR, f.path)
    mkdirSync(dirname(dst), { recursive: true })
    writeFileSync(dst, buf)
    out.push(f)
  }
  return out
}

function mergeIntoDb(
  db: AppDatabase,
  imagesDir: string,
  copyPath: string,
  manifest: DataPackageManifest,
  images: ImageFileStat[],
  workDir: string
): PackageImportResult {
  const copy = new AppDatabase(copyPath)
  try {
    // 店铺：已存在则合并，不存在自动创建（结果页明示）
    const shopRow = copy.raw.prepare('SELECT name, platform, shop_code AS shopCode FROM shops ORDER BY id LIMIT 1').get() as { name: string; platform: string; shopCode: string | null } | undefined
    if (!shopRow) throw new Error('数据包中缺少店铺信息')
    const existing = db.raw.prepare('SELECT id FROM shops WHERE name = ?').get(shopRow.name) as { id: number } | undefined
    let shopId: number
    let shopCreated = false
    if (existing) {
      shopId = existing.id
    } else {
      shopId = upsertShop(db, { name: shopRow.name, platform: shopRow.platform, shopCode: shopRow.shopCode })
      shopCreated = true
    }

    // 图片文件先落盘（已按 manifest 校验），再写库，避免失败留悬空记录
    for (const f of images) {
      const fileName = f.path.split('/').pop() ?? ''
      const srcPath = join(workDir, IMAGES_DIR, f.path)
      const dstDir = join(imagesDir, String(shopId))
      mkdirSync(dstDir, { recursive: true })
      copyFileSync(srcPath, join(dstDir, fileName))
    }

    const result: PackageImportResult = {
      ok: true,
      shopId,
      shopName: shopRow.name,
      shopCreated,
      dateRange: manifest.dateRange,
      tables: [],
      images: { files: images.length, restored: images.length },
      exportedAt: manifest.exportedAt,
      appVersion: manifest.appVersion
    }

    const tx = db.raw.transaction(() => {
      for (const meta of PACKAGE_TABLES) {
        if (meta.table === 'shops') continue
        const st = manifest.tables[meta.table]
        const rows = copy.raw.prepare(`SELECT * FROM "${meta.table}" ORDER BY rowid`).all() as Array<Record<string, unknown>>
        const cols = tableColumns(copy, meta.table)
        const insertSql = `INSERT OR IGNORE INTO "${meta.table}" (${cols.join(', ')}) VALUES (${cols.map((c) => '@' + c).join(', ')})`
        let imported = 0
        for (const row of rows) {
          const mapped: Record<string, unknown> = { ...row }
          if (cols.includes('shop_id')) mapped.shop_id = shopId
          if (meta.table === 'ai_analyses') mapped.source_skill_id = null // 技能绑定属本机配置，不跨机传递
          const info = db.raw.prepare(insertSql).run(mapped)
          if (info.changes > 0) imported++
        }
        // 图片绑定记录按目标店铺 id 重写 rel_path（源路径含源店铺 id）
        if (meta.table === 'product_images') {
          for (const row of rows) {
            const rel = row.rel_path ? String(row.rel_path) : ''
            if (!rel) continue
            const parts = rel.split('/')
            const fileName = parts[parts.length - 1] ?? ''
            const targetRel = `${shopId}/${fileName}`
            db.raw.prepare('UPDATE product_images SET rel_path = ? WHERE shop_id = ? AND product_id = ?').run(targetRel, shopId, String(row.product_id))
          }
        }
        result.tables.push({ table: meta.table, label: meta.label, rows: st?.rows ?? rows.length, imported, skipped: rows.length - imported })
      }
    })
    tx()
    return result
  } finally {
    copy.close()
  }
}

export function importDataPackage(opts: { db: AppDatabase; imagesDir: string; zipPath: string; password?: string | null }): PackageImportResult {
  const { manifest } = inspectDataPackage({ zipPath: opts.zipPath, password: opts.password })
  if (!manifest) throw new Error('该数据包已加密，请先输入密码再导入')
  if (manifest.format !== PACKAGE_FORMAT || manifest.formatVersion !== PACKAGE_FORMAT_VERSION) {
    throw new Error(`数据包格式不兼容（格式 ${manifest.format} v${manifest.formatVersion}，本应用需要 ${PACKAGE_FORMAT} v${PACKAGE_FORMAT_VERSION}）`)
  }
  const zip = new AdmZip(opts.zipPath)
  const workDir = mkdtempSync(join(tmpdir(), 'ecai-pkg-import-'))
  try {
    extractAndVerify(zip, manifest, opts.password ?? null, workDir)
    const images = extractImages(zip, manifest, opts.password ?? null, workDir)
    return mergeIntoDb(opts.db, opts.imagesDir, join(workDir, DB_FILE), manifest, images, workDir)
  } finally {
    rmSync(workDir, { recursive: true, force: true })
  }
}
