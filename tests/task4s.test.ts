// 任务 4S：商品卡每日数据（buildProductDailyRows 纯函数）+ 导入覆盖聚合（getImportCoverage）+ QA 默认提示词内置
import { describe, expect, it } from 'vitest'
import { existsSync, mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { AppDatabase } from '../src/main/db/database'
import {
  getImportCoverage, insertImport, insertRefundOrder, upsertCsDaily, upsertDailyMetric, upsertDsrDaily,
  upsertProductDaily, upsertProductImage, upsertPromoDaily, upsertSearchKeyword, upsertShop
} from '../src/main/db/repo'
// bp-utils.ts 位于渲染层 components 目录，不在 tsconfig.node.json 的项目文件清单内（composite 项目静态引用报 TS6307），
// 故用变量动态导入取真实模块（非 mock、不放宽断言，仍测真实实现）；运行时由 vitest/esbuild 正常解析
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
const buildProductDailyRows = bpUtilsMod.buildProductDailyRows

function freshDb(): AppDatabase {
  const dir = mkdtempSync(join(tmpdir(), 'ecai-4s-'))
  const db = new AppDatabase(join(dir, '4s.db'))
  db.init()
  return db
}

// ---------- buildProductDailyRows ----------
describe('4S buildProductDailyRows：按日真实优先，缺日回落快照', () => {
  const days = [
    { d: '2026-08-11' },
    { d: '2026-08-12' },
    { d: '2026-08-13' },
    { d: '2026-08-14' }
  ]
  const snap: BpDailySnapshot = { d: '2026-08-14', sales: 999, refund: 42, promo: 88, profit: 77, search: 66, consult: 55 }

  it('该日有行 → 真实值（分→元换算，含 0 显示 0 非 null）', () => {
    const rows: BpProductDailyRowInput[] = [
      { date: '2026-08-12', payAmountFen: 12345, promoCostFen: 0, profitFen: -500, searchGuideVisitors: 30, consultCount: 4 },
      { date: '2026-08-13', payAmountFen: 0, promoCostFen: 0, profitFen: 0, searchGuideVisitors: 0, consultCount: 0 }
    ]
    const out = buildProductDailyRows(days, rows, snap, {})
    // 4U 规格翻转：推广费改取 promo_daily 聚合，无推广行 → null（显示 —）
    expect(out[1]).toEqual({ d: '2026-08-12', sales: 123.45, promo: null, profit: -5, search: 30, consult: 4, refund: 0 })
    expect(out[2]).toEqual({ d: '2026-08-13', sales: 0, promo: null, profit: 0, search: 0, consult: 0, refund: 0 })
  })

  it('无行且非快照日 → 字段 null', () => {
    const out = buildProductDailyRows(days, [{ date: '2026-08-12', payAmountFen: 100 }], snap, {})
    // 4U 规格翻转：无行退款 → 回落快照/—（null），不再取退款单分日
    expect(out[0]).toEqual({ d: '2026-08-11', sales: null, promo: null, profit: null, search: null, consult: null, refund: null })
    expect(out[3]).toEqual({ d: '2026-08-14', sales: 999, promo: 88, profit: 77, search: 66, consult: 55, refund: 42 })
  })

  it('无行但为快照日 → 回落快照当日', () => {
    const out = buildProductDailyRows(days, [], snap, {})
    expect(out[3].sales).toBe(999)
    expect(out[3].promo).toBe(88)
    expect(out[3].profit).toBe(77)
    expect(out[3].search).toBe(66)
    expect(out[3].consult).toBe(55)
    expect(out[3].refund).toBe(42) // 4U 规格翻转：快照日回落 snapshot.refund
  })

  it('快照为 null → 全部回落 null', () => {
    const out = buildProductDailyRows(days, [], null, {})
    expect(out.every((r) => r.sales === null && r.promo === null && r.profit === null && r.search === null && r.consult === null)).toBe(true)
    expect(out).toHaveLength(4)
  })

  it('refund 按商品日报 refundAmountFen（4U 规格翻转：删除退款单 refundByDay 入参，退款=成功退款金额）', () => {
    const rows: BpProductDailyRowInput[] = [
      { date: '2026-08-12', payAmountFen: 100, refundAmountFen: 1234 },
      { date: '2026-08-13', payAmountFen: 100, refundAmountFen: 0 }
    ]
    const out = buildProductDailyRows(days, rows, snap, {})
    expect(out[0].refund).toBeNull() // 无行非快照日 → —
    expect(out[1].refund).toBe(12.34) // 行内真实值（分→元）
    expect(out[2].refund).toBe(0) // 行内 0 → 真实值 0
    expect(out[3].refund).toBe(42) // 快照日回落 snapshot.refund
  })

  it('searchGuideVisitors 为 null → search 为 null（其余真实）', () => {
    const out = buildProductDailyRows(days, [{ date: '2026-08-12', payAmountFen: 100, searchGuideVisitors: null, consultCount: 2 }], snap, {})
    expect(out[1].search).toBeNull()
    expect(out[1].sales).toBe(1)
    expect(out[1].consult).toBe(2)
  })
})

// ---------- getImportCoverage ----------
describe('4S getImportCoverage：9 源+图片聚合', () => {
  it('各表有数据 → rows/lastDate/coverageRange 正确（含退款按完结时间）', () => {
    const db = freshDb()
    const shopId = upsertShop(db, { name: '覆盖店' })
    upsertDailyMetric(db, { shopId, date: '2026-08-10', payAmountFen: 1, netSalesFen: 1, profitFen: 1, visitors: 1, refundAmountFen: 0, promoCostFen: 0 })
    upsertDailyMetric(db, { shopId, date: '2026-08-12', payAmountFen: 2, netSalesFen: 2, profitFen: 2, visitors: 2, refundAmountFen: 0, promoCostFen: 0 })
    upsertProductDaily(db, { shopId, productId: 'P1', date: '2026-08-13', payAmountFen: 100, promoCostFen: 10, profitFen: 50, netSalesFen: 90, salesCount: 1, visitors: 5, consultCount: 2 })
    upsertPromoDaily(db, { shopId, date: '2026-08-14', adEntityId: 'A1', impressions: 1, clicks: 1, costFen: 1 })
    insertRefundOrder(db, { shopId, orderNo: 'O1', refundNo: 'R1', refundAmountFen: 100, refundFinishTime: '2026-08-11 10:00:00' })
    upsertCsDaily(db, { shopId, date: '2026-08-15', staffName: '张三', inquiryCount: 1 })
    upsertSearchKeyword(db, { shopId, date: '2026-08-16', keyword: '坐垫', visitors: 1 })
    upsertDsrDaily(db, { shopId, date: '2026-08-17', descriptionScore: 4.9 })
    upsertProductImage(db, { shopId, productId: 'P1', relPath: 'x.png', sizeBytes: 1 })
    upsertProductImage(db, { shopId, productId: 'P2', relPath: 'y.png', sizeBytes: 2 })

    const cov = getImportCoverage(db, shopId, '2026-08-16')
    const by = Object.fromEntries(cov.map((r) => [r.source, r]))
    expect(cov).toHaveLength(10)
    expect(by.daily).toMatchObject({ label: '经营', lastDate: '2026-08-12', coverageRange: '2026-08-10~2026-08-12', rows: 2 })
    expect(by.product_report).toMatchObject({ lastDate: '2026-08-13', rows: 1 })
    expect(by.product_detail).toMatchObject({ lastDate: '2026-08-13', rows: 1 })
    expect(by.consult).toMatchObject({ lastDate: '2026-08-13', rows: 1 })
    expect(by.promo).toMatchObject({ lastDate: '2026-08-14', rows: 1 })
    expect(by.refund).toMatchObject({ lastDate: '2026-08-11', rows: 1 })
    expect(by.cs).toMatchObject({ lastDate: '2026-08-15', rows: 1 })
    expect(by.keyword).toMatchObject({ lastDate: '2026-08-16', rows: 1 })
    expect(by.dsr).toMatchObject({ lastDate: '2026-08-17', rows: 1 })
    expect(by.images).toMatchObject({ label: '图片', lastDate: null, rows: 2, coverageRange: null })
    db.close()
  })

  it('空库 → 全部 lastDate null/rows 0/todayImported false，图片 0', () => {
    const db = freshDb()
    const shopId = upsertShop(db, { name: '空店' })
    const cov = getImportCoverage(db, shopId, '2026-08-16')
    expect(cov).toHaveLength(10)
    for (const r of cov) {
      expect(r.lastDate).toBeNull()
      expect(r.rows).toBe(0)
      expect(r.todayImported).toBe(false)
      expect(r.coverageRange).toBeNull()
      expect(r.lastSourceFile).toBeNull()
    }
    db.close()
  })

  it('今日判定（4T 规格翻转）：T-1 源 lastDate=today → true、lastDate=today-1 → true（平台延迟内均算已交）', () => {
    const db = freshDb()
    const shopId = upsertShop(db, { name: '今日店' })
    upsertDailyMetric(db, { shopId, date: '2026-08-16', payAmountFen: 1, netSalesFen: 1, profitFen: 1, visitors: 1, refundAmountFen: 0, promoCostFen: 0 })
    upsertPromoDaily(db, { shopId, date: '2026-08-15', adEntityId: 'A1', impressions: 1, clicks: 1, costFen: 1 })
    const cov = getImportCoverage(db, shopId, '2026-08-16')
    const by = Object.fromEntries(cov.map((r) => [r.source, r]))
    expect(by.daily.todayImported).toBe(true)
    expect(by.promo.todayImported).toBe(true)
    db.close()
  })

  it('最近来源文件取 imports 同 shop 同源最新一条（跨店/跨源不串）', () => {
    const db = freshDb()
    const shopA = upsertShop(db, { name: 'A 店' })
    const shopB = upsertShop(db, { name: 'B 店' })
    insertImport(db, { shopId: shopA, sourceType: 'daily', sourceFile: '老文件.xlsx', rowCount: 1 })
    insertImport(db, { shopId: shopA, sourceType: 'daily', sourceFile: '最新文件.xlsx', rowCount: 2 })
    insertImport(db, { shopId: shopA, sourceType: 'keyword', sourceFile: '搜索词文件.xls', rowCount: 3 })
    insertImport(db, { shopId: shopB, sourceType: 'daily', sourceFile: 'B店文件.xlsx', rowCount: 4 })
    const cov = getImportCoverage(db, shopA, '2026-08-16')
    const by = Object.fromEntries(cov.map((r) => [r.source, r]))
    expect(by.daily.lastSourceFile).toBe('最新文件.xlsx')
    expect(by.keyword.lastSourceFile).toBe('搜索词文件.xls')
    expect(by.daily.lastImportedAt).toBeTruthy()
    db.close()
  })
})

// ---------- QA 默认提示词内置 ----------
describe('4S QA 默认提示词内置资源', () => {
  const resource = join(process.cwd(), 'resources', 'qa-default-prompt.md')

  it('resources/qa-default-prompt.md 存在、UTF-8 无 BOM、含「# 你现在的角色」与「二十五」节', () => {
    expect(existsSync(resource)).toBe(true)
    const buf = readFileSync(resource)
    expect(buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf).toBe(false)
    const text = buf.toString('utf8')
    expect(text).toContain('# 你现在的角色')
    expect(text).toContain('# 二十五')
    expect(text.length).toBeGreaterThan(1000)
  })

  it('loadDefaultPrompt 等价路径（开发态项目根 resources/）读取非空且含关键节', () => {
    // qa-ipc.ts 开发态 defaultPromptPath() = join(app.getAppPath(), 'resources', 'qa-default-prompt.md')
    // vitest/electron-vite dev 均以项目根为 cwd/app 路径，此处按同一文件做等价读取
    const text = readFileSync(resource, 'utf8')
    expect(text.trim().length).toBeGreaterThan(0)
    expect(text).toContain('电商客服聊天质检与指导分析师')
    expect(text).toContain('最重要的执行原则')
  })
})
