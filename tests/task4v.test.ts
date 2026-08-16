// 任务 4V：04 搜索口径修正（搜索人数=搜索引导访客数）+ 08 全量显示（keywordBlock/consultTop 去 LIMIT）+ 05/08 图片绑定前置数据
import { describe, expect, it } from 'vitest'
import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { AppDatabase } from '../src/main/db/database'
import { upsertProductDaily, upsertSearchKeyword, upsertShop } from '../src/main/db/repo'
import { consultTop, keywordBlock, productDailySeries, productTop } from '../src/main/db/dashboard'
import { parseSourceFile } from '../src/main/import/parsers'
import { readSourceFile } from '../src/main/import/reader'
import { rowsFromRecords } from '../src/main/import/fallback'
import { specOf } from '../src/main/import/specs'
import { KEYWORD_FILE, PRODUCT_REPORT_FILE, TEMPLATE_DIR } from './helpers/load-fixtures'

const F = (name: string): string => join(TEMPLATE_DIR, name)

// bp-utils.ts 位于渲染层 components 目录，不在 tsconfig.node.json 项目文件清单内（composite 静态引用报 TS6307），
// 沿用 4S/4U 先例：变量动态导入取真实模块（非 mock、不放宽断言，仍测真实实现）
interface BpDailyRow {
  d: string
  sales: number | null
  promo: number | null
  profit: number | null
  search: number | null
  consult: number | null
  refund: number | null
}
interface BpDailySnapshot {
  d: string
  sales: number
  refund: number | null
  promo: number
  profit: number
  search: number | null
  consult: number
}
interface BpProductDailyRowInput {
  date: string
  payAmountFen?: number | null
  refundAmountFen?: number | null
  promoCostFen?: number | null
  profitFen?: number | null
  visitors?: number | null
  searchGuideVisitors?: number | null
  consultCount?: number | null
}
type BuildProductDailyRowsFn = (
  days: Array<{ d: string }>,
  rows: BpProductDailyRowInput[],
  snapshot: BpDailySnapshot | null,
  promoByDay?: Record<string, number>
) => BpDailyRow[]

const BP_UTILS_SPEC = '../src/renderer/src/components/dashboard/bp/bp-utils'
const bpUtilsMod = (await import(BP_UTILS_SPEC)) as { buildProductDailyRows: BuildProductDailyRowsFn }
const { buildProductDailyRows } = bpUtilsMod

function freshDb(): AppDatabase {
  const dir = mkdtempSync(join(tmpdir(), 'ecai-4v-'))
  const db = new AppDatabase(join(dir, '4v.db'))
  db.init()
  return db
}

function importRealProductReport(db: AppDatabase, shopId: number): void {
  const p = parseSourceFile(F(PRODUCT_REPORT_FILE), readSourceFile(F(PRODUCT_REPORT_FILE)), 'product_report')
  if (p.rows.target === 'product_daily') {
    for (const r of p.rows.rows) upsertProductDaily(db, { ...r, shopId })
  }
}

// ---------- 导入 ----------
describe('4V 导入：商品_全部 searchGuideVisitors=590（搜索引导访客数）', () => {
  it('真实模板 974661273911：visitors=734 且 searchGuideVisitors=590（同行双字段，红=只有 734）', () => {
    const p = parseSourceFile(F(PRODUCT_REPORT_FILE), readSourceFile(F(PRODUCT_REPORT_FILE)), 'product_report')
    expect(p.ok).toBe(true)
    const rows = p.rows.target === 'product_daily' ? p.rows.rows : []
    const hit = rows.find((r) => r.productId === '974661273911')
    expect(hit?.visitors).toBe(734)
    expect(hit?.searchGuideVisitors).toBe(590)
  })

  it('导入落库：search_guide_visitors=590', () => {
    const db = freshDb()
    const shopId = upsertShop(db, { name: '佰泰康车品旗舰店' })
    importRealProductReport(db, shopId)
    const row = db.raw.prepare('SELECT search_guide_visitors FROM product_daily WHERE product_id=? AND shop_id=?').get('974661273911', shopId) as { search_guide_visitors: number | null }
    expect(row.search_guide_visitors).toBe(590)
    db.close()
  })

  it('V9 旧库升级：runMigrations 后 product_daily 新增 search_guide_visitors 列、user_version=10', () => {
    const dir = mkdtempSync(join(tmpdir(), 'ecai-4v-up-'))
    const db = new AppDatabase(join(dir, 'up.db'))
    db.raw.exec('CREATE TABLE product_daily (shop_id INTEGER NOT NULL, product_id TEXT NOT NULL, date TEXT NOT NULL, PRIMARY KEY (shop_id, product_id, date))')
    db.raw.pragma('user_version = 9')
    db.runMigrations()
    const cols = db.raw.prepare('PRAGMA table_info(product_daily)').all() as Array<{ name: string }>
    expect(cols.some((c) => c.name === 'search_guide_visitors')).toBe(true)
    expect(db.userVersion()).toBe(10)
    db.close()
  })
})

// ---------- buildProductDailyRows 新口径 ----------
describe('4V buildProductDailyRows：search=searchGuideVisitors（红=visitors 734）', () => {
  const days = [{ d: '2026-08-10' }, { d: '2026-08-11' }]
  const snap: BpDailySnapshot = { d: '2026-08-11', sales: 999, refund: 123.45, promo: 88, profit: 77, search: 66, consult: 55 }

  it('同一行 visitors=734 + searchGuideVisitors=590 → search=590（反向验证红 734→绿 590）', () => {
    const out = buildProductDailyRows(days, [{ date: '2026-08-11', payAmountFen: 903600, visitors: 734, searchGuideVisitors: 590 }], snap, {})
    expect(out[1].search).toBe(590)
    expect(out[1].sales).toBe(9036)
  })

  it('缺 searchGuideVisitors 列（旧数据容错）→ search=null，不回落到 visitors', () => {
    const out = buildProductDailyRows(days, [{ date: '2026-08-11', payAmountFen: 903600, visitors: 734 }], snap, {})
    expect(out[1].search).toBeNull()
  })

  it('searchGuideVisitors 显式 null → search=null（其余字段真实）', () => {
    const out = buildProductDailyRows(days, [{ date: '2026-08-11', payAmountFen: 100, searchGuideVisitors: null, consultCount: 2 }], snap, {})
    expect(out[1].search).toBeNull()
    expect(out[1].sales).toBe(1)
    expect(out[1].consult).toBe(2)
  })

  it('无行非快照日 → search=null；快照日 → 回落 snapshot.search', () => {
    const out = buildProductDailyRows(days, [], snap, {})
    expect(out[0].search).toBeNull()
    expect(out[1].search).toBe(66)
  })
})

// ---------- productTop / productDailySeries ----------
describe('4V 查询：productTop/productDailySeries 聚合新列', () => {
  it('真实模板 → productTop 974661273911 searchGuideVisitors=590 且 visitors=734 保留', () => {
    const db = freshDb()
    const shopId = upsertShop(db, { name: '佰泰康车品旗舰店' })
    importRealProductReport(db, shopId)
    const top = productTop(db, shopId, '2026-08-11', '2026-08-11', 12)
    const p1 = top.find((x) => x.productId === '974661273911')
    expect(p1?.visitors).toBe(734)
    expect(p1?.searchGuideVisitors).toBe(590)
    db.close()
  })

  it('多日聚合：SUM(search_guide_visitors) 窗口相加', () => {
    const db = freshDb()
    const shopId = upsertShop(db, { name: 'S' })
    upsertProductDaily(db, { shopId, productId: 'P1', date: '2026-08-11', searchGuideVisitors: 590 })
    upsertProductDaily(db, { shopId, productId: 'P1', date: '2026-08-12', searchGuideVisitors: 100 })
    const top = productTop(db, shopId, '2026-08-11', '2026-08-12', 5)
    expect(top[0].searchGuideVisitors).toBe(690)
    db.close()
  })

  it('无新列数据（旧行）→ productTop searchGuideVisitors=0（COALESCE），visitors 保留', () => {
    const db = freshDb()
    const shopId = upsertShop(db, { name: 'S' })
    upsertProductDaily(db, { shopId, productId: 'P1', date: '2026-08-11', visitors: 734 })
    const top = productTop(db, shopId, '2026-08-11', '2026-08-11', 5)
    expect(top[0].searchGuideVisitors).toBe(0)
    expect(top[0].visitors).toBe(734)
    db.close()
  })

  it('productDailySeries 返回 searchGuideVisitors 键（真实导入=590）', () => {
    const db = freshDb()
    const shopId = upsertShop(db, { name: '佰泰康车品旗舰店' })
    importRealProductReport(db, shopId)
    const series = productDailySeries(db, shopId, '974661273911', '2026-08-11', '2026-08-11')
    expect(series[0].searchGuideVisitors).toBe(590)
    db.close()
  })
})

// ---------- 08 全量 ----------
describe('4V 08 全量：keywordBlock/consultTop 去 LIMIT', () => {
  it('真实搜索词模板 → keywordBlock 返回全部（≥100，修前 10），与库内 COUNT 一致', () => {
    const db = freshDb()
    const shopId = upsertShop(db, { name: 'S' })
    const p = parseSourceFile(F(KEYWORD_FILE), readSourceFile(F(KEYWORD_FILE)), 'keyword')
    const rows = p.rows.target === 'search_keywords' ? p.rows.rows : []
    for (const r of rows) upsertSearchKeyword(db, { ...r, shopId })
    const kw = keywordBlock(db, shopId, '2026-08-11', '2026-08-11')
    const top = kw.top as unknown[]
    expect(top.length).toBeGreaterThanOrEqual(100)
    expect(top.length).toBe(rows.length)
    const dbN = (db.raw.prepare('SELECT COUNT(*) n FROM search_keywords WHERE shop_id=?').get(shopId) as { n: number }).n
    expect(top.length).toBe(dbN)
    db.close()
  })

  it('造 13 条搜索词 → 全部返回且按访客降序（修前 10 条截断）', () => {
    const db = freshDb()
    const shopId = upsertShop(db, { name: 'S' })
    for (let i = 1; i <= 13; i++) {
      upsertSearchKeyword(db, { shopId, date: '2026-08-11', keyword: '词' + i, visitors: i, payBuyerCount: i, payAmountFen: i * 100 })
    }
    const kw = keywordBlock(db, shopId, '2026-08-11', '2026-08-11')
    const top = kw.top as Array<{ keyword: string; visitors: number }>
    expect(top).toHaveLength(13)
    expect(top[0].keyword).toBe('词13')
    expect(top[12].keyword).toBe('词1')
    db.close()
  })

  it('造 12 商品咨询 → consultTop 返回全部（修前 10）且 total/sum 正确', () => {
    const db = freshDb()
    const shopId = upsertShop(db, { name: 'S' })
    for (let i = 1; i <= 12; i++) {
      upsertProductDaily(db, { shopId, productId: 'P' + i, date: '2026-08-11', consultCount: i })
    }
    const c = consultTop(db, shopId, '2026-08-11')
    expect(c.rows).toHaveLength(12)
    expect(c.total).toBe(12)
    expect(c.sum).toBe(78)
    expect(c.rows[0].productId).toBe('P12')
    db.close()
  })
})

// ---------- fallback ----------
describe('4V fallback：fieldMap 与 product_report 分支带 searchGuideVisitors', () => {
  it('rowsFromRecords product_report：records 带 searchGuideVisitors → 行含 590（visitors 保留 734）', () => {
    const out = rowsFromRecords(specOf('product_report'), 'product_report', 'x.xls', [
      { productId: '974661273911', date: '2026-08-11', productName: '坐垫', visitors: 734, searchGuideVisitors: 590, pageViews: 2059, payAmountFen: 9036, refundAmountFen: 954, payRate: 0.0354 }
    ])
    const rows = out.target === 'product_daily' ? out.rows : []
    expect(rows[0].searchGuideVisitors).toBe(590)
    expect(rows[0].visitors).toBe(734)
  })

  it('rowsFromRecords product_report：records 缺 searchGuideVisitors → null（旧文件兜底不失败）', () => {
    const out = rowsFromRecords(specOf('product_report'), 'product_report', 'x.xls', [
      { productId: '974661273911', date: '2026-08-11', productName: '坐垫', visitors: 734, pageViews: 2059, payAmountFen: 9036, refundAmountFen: 954, payRate: 0.0354 }
    ])
    const rows = out.target === 'product_daily' ? out.rows : []
    expect(rows[0].searchGuideVisitors).toBeNull()
  })

  it('fieldMap（FIELD_DESC）含 searchGuideVisitors：搜索引导访客数', () => {
    const src = readFileSync(join(process.cwd(), 'src', 'main', 'import', 'fallback.ts'), 'utf8')
    expect(src).toContain("searchGuideVisitors: '搜索引导访客数'")
  })
})