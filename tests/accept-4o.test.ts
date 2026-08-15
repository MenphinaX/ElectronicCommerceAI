// 任务 4O 真实文件验收（2026-08-15 实盘）：商品总览 12/13/14（409/409/397 列）+ DSR AI 12/13/14（仅 180 天区块）
// 反向验证：修复前 08-14 col_count(397) / DSR AI header_row 拦截；修复后全部 ok 且 DSR 180 天 3 行入库
import { describe, expect, it } from 'vitest'
import { existsSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import * as XLSX from 'xlsx'
import { AppDatabase } from '../src/main/db/database'
import { importFiles } from '../src/main/import/import-service'
import { parseSourceFile } from '../src/main/import/parsers'
import { readSourceFile } from '../src/main/import/reader'
import { detectType } from '../src/main/import/validate'
import { upsertShop } from '../src/main/db/repo'
import { DSR_FILE, SHOP_NAME, TEMPLATE_DIR } from './helpers/load-fixtures'

XLSX.set_fs(await import('node:fs'))

const REAL_DIR = process.env.EC_AI_4O_REAL_DIR ?? 'C:/Users/Administrator/Desktop/新建文件夹'
const F = (name: string): string => join(REAL_DIR, name)
const T = (name: string): string => join(TEMPLATE_DIR, name)
const OVERVIEW = [
  '商品总览_天猫_佰泰康车品旗舰店_2026-08-12.xlsx',
  '商品总览_天猫_佰泰康车品旗舰店_2026-08-13.xlsx',
  '商品总览_天猫_佰泰康车品旗舰店_2026-08-14.xlsx'
]
const DSR_AI = ['店铺DSR数据_2026-08-12.xlsx', '店铺DSR数据_2026-08-13.xlsx', '店铺DSR数据_2026-08-14.xlsx']

function freshDb(): { db: AppDatabase; shopId: number; archiveDir: string } {
  const dir = mkdtempSync(join(tmpdir(), 'ecai-4o-'))
  const db = new AppDatabase(join(dir, '4o.db'))
  db.init()
  const shopId = upsertShop(db, { name: SHOP_NAME })
  return { db, shopId, archiveDir: join(dir, 'archives') }
}

describe('任务 4O：商品总览列数波动（409/397 vs 402）不再拦截', () => {
  it.each(OVERVIEW)('%s 解析 ok=dataRows 正常，列数只进 warnings', (name) => {
    const p = join(REAL_DIR, name)
    if (!existsSync(p)) throw new Error(`真实文件缺失：${p}`)
    const raw = readSourceFile(p)
    expect(raw.decodeError).toBeUndefined()
    const d = detectType(p, raw)
    expect(d?.type).toBe('product_detail')
    const parsed = parseSourceFile(p, raw, d!.type)
    expect({ ok: parsed.ok, issues: parsed.issues.map((i) => i.message) }).toEqual({ ok: true, issues: [] })
    expect(parsed.dataRows).toBeGreaterThan(100)
    expect((parsed.warnings ?? []).some((w) => w.code === 'col_count')).toBe(true)
  })
})

describe('任务 4O：DSR AI 文件（仅 180 天区块，表头文案不同）宽容解析', () => {
  it.each(DSR_AI)('%s 导入 ok 且 180 天 3 行入库', async (name) => {
    const p = join(REAL_DIR, name)
    if (!existsSync(p)) throw new Error(`真实文件缺失：${p}`)
    const raw = readSourceFile(p)
    expect(raw.decodeError).toBeUndefined()
    const d = detectType(p, raw)
    expect(d?.type).toBe('dsr')
    const parsed = parseSourceFile(p, raw, d!.type)
    expect({ ok: parsed.ok, issues: parsed.issues.map((i) => i.message) }).toEqual({ ok: true, issues: [] })
    expect((parsed.warnings ?? []).some((w) => w.message.includes('未检测到日维度/商品维度区块'))).toBe(true)
    if (parsed.rows.target !== 'dsr') throw new Error('unexpected')
    expect(parsed.rows.rows.d180).toHaveLength(3)
    expect(parsed.rows.rows.daily).toHaveLength(0)

    const { db, shopId, archiveDir } = freshDb()
    const [r] = await importFiles(db, [p], { shopId, archiveDir, allowFallback: false })
    expect({ status: r.status, rows: r.rows, issues: r.issues }).toEqual({ status: 'ok', rows: 3, issues: [] })
    expect(db.rowCounts().dsr_180d).toBe(3)
    expect(db.rowCounts().dsr_daily).toBe(0)
    db.close()
  })
})

describe('任务 4O 回归：标准 DSR 08-11 模板仍 ok（三区块）', () => {
  it('DSR 标准模板：180 天 3 行 + 日维度 1 行，全部入库', async () => {
    const p = T(DSR_FILE)
    const { db, shopId, archiveDir } = freshDb()
    const [r] = await importFiles(db, [p], { shopId, archiveDir, allowFallback: false })
    expect({ status: r.status, rows: r.rows, issues: r.issues }).toEqual({ status: 'ok', rows: 4, issues: [] })
    expect(db.rowCounts().dsr_180d).toBe(3)
    expect(db.rowCounts().dsr_daily).toBe(1)
    db.close()
  })
})
