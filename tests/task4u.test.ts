// 任务 4U：04/05 统计口径按领导修正——buildProductDailyRows 新口径（refund 按行/promo 按聚合/缺行回落）、
// promoDailyByProduct 聚合、净ROI/百分比展示纯函数、回填脚本幂等
import { describe, expect, it } from 'vitest'
import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { AppDatabase } from '../src/main/db/database'
import { upsertPromoDaily, upsertShop } from '../src/main/db/repo'
import { netRoiOf, promoDailyByProduct, promoDailyByProducts, promoBlock, promoDetail } from '../src/main/db/dashboard'
import { applyPromoBackfill, parsePromoDirectCsv } from '../scripts/backfill-4u'
import { TEMPLATE_DIR } from './helpers/load-fixtures'

// bp-utils.ts 位于渲染层 components 目录，不在 tsconfig.node.json 项目文件清单内（composite 静态引用报 TS6307），
// 故用变量动态导入取真实模块（非 mock、不放宽断言）；运行时由 vitest/esbuild 正常解析
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
  consultCount?: number | null
}
type BuildProductDailyRowsFn = (
  days: Array<{ d: string }>,
  rows: BpProductDailyRowInput[],
  snapshot: BpDailySnapshot | null,
  promoByDay?: Record<string, number>
) => BpDailyRow[]

const BP_UTILS_SPEC = '../src/renderer/src/components/dashboard/bp/bp-utils'
const bpUtilsMod = (await import(BP_UTILS_SPEC)) as {
  buildProductDailyRows: BuildProductDailyRowsFn
  bpPct: (n: unknown, digits?: number) => string
}
const { buildProductDailyRows, bpPct } = bpUtilsMod

function freshDb(): AppDatabase {
  const dir = mkdtempSync(join(tmpdir(), 'ecai-4u-'))
  const db = new AppDatabase(join(dir, '4u.db'))
  db.init()
  return db
}

// ---------- buildProductDailyRows 新口径 ----------
describe('4U buildProductDailyRows：refund 按行（成功退款金额）、promo 按聚合（promo_daily SUM）、缺行回落', () => {
  const days = [
    { d: '2026-08-09' },
    { d: '2026-08-10' },
    { d: '2026-08-11' }
  ]
  const snap: BpDailySnapshot = { d: '2026-08-11', sales: 999, refund: 123.45, promo: 88, profit: 77, search: 66, consult: 55 }

  it('refund 按行：有行取 refundAmountFen 分→元（真实值）', () => {
    const rows: BpProductDailyRowInput[] = [
      { date: '2026-08-11', payAmountFen: 903600, refundAmountFen: 95400, promoCostFen: 59636 }
    ]
    const out = buildProductDailyRows(days, rows, snap, { '2026-08-11': 596.36 })
    expect(out[2].refund).toBe(954)
    expect(out[2].sales).toBe(9036)
  })

  it('refund 行内为 0 → 显示真实值 0（非 null 非回落）', () => {
    const rows: BpProductDailyRowInput[] = [{ date: '2026-08-11', refundAmountFen: 0 }]
    const out = buildProductDailyRows(days, rows, snap, {})
    expect(out[2].refund).toBe(0)
  })

  it('refund 无行且非快照日 → null（显示 —）', () => {
    const rows: BpProductDailyRowInput[] = [{ date: '2026-08-11', refundAmountFen: 95400 }]
    const out = buildProductDailyRows(days, rows, snap, {})
    expect(out[0].refund).toBeNull()
    expect(out[1].refund).toBeNull()
  })

  it('refund 无行但为快照日 → 回落 snapshot.refund', () => {
    const out = buildProductDailyRows(days, [], snap, {})
    expect(out[2].refund).toBe(123.45)
  })

  it('promo 按聚合：有推广行 → promoByDay 当日 SUM 值（元）', () => {
    const rows: BpProductDailyRowInput[] = [{ date: '2026-08-11', refundAmountFen: 95400 }]
    const promoByDay = { '2026-08-11': 596.36 }
    const out = buildProductDailyRows(days, rows, snap, promoByDay)
    expect(out[2].promo).toBe(596.36)
  })

  it('promo 有行日但无推广行 → null；快照日无推广行 → 回落 snapshot.promo', () => {
    const rows: BpProductDailyRowInput[] = [
      { date: '2026-08-10', refundAmountFen: 100 },
      { date: '2026-08-11', refundAmountFen: 200 }
    ]
    const out = buildProductDailyRows(days, rows, snap, { '2026-08-10': 12.34 })
    expect(out[1].promo).toBe(12.34)
    expect(out[2].promo).toBe(88) // 快照日无推广行 → 回落快照
    const out2 = buildProductDailyRows(days, rows, snap, {})
    expect(out2[1].promo).toBeNull()
    expect(out2[2].promo).toBe(88)
  })

  it('无行非快照日 → sales/profit/search/consult 全 null（与原行为一致）', () => {
    const rows: BpProductDailyRowInput[] = [{ date: '2026-08-11', payAmountFen: 100, refundAmountFen: 50, profitFen: 30, visitors: 20, consultCount: 5 }]
    const out = buildProductDailyRows(days, rows, snap, {})
    expect(out[0]).toEqual({ d: '2026-08-09', sales: null, promo: null, profit: null, search: null, consult: null, refund: null })
    expect(out[2].sales).toBe(1)
    expect(out[2].promo).toBe(88) // 快照日无推广行 → 回落快照值
    expect(out[2].profit).toBe(0.3)
    expect(out[2].search).toBe(20)
    expect(out[2].consult).toBe(5)
  })

  it('snapshot 为 null 且无行 → 全部回落 null（含 refund）', () => {
    const out = buildProductDailyRows(days, [], null, {})
    expect(out.every((r) => r.sales === null && r.promo === null && r.profit === null && r.search === null && r.consult === null && r.refund === null)).toBe(true)
  })
})

// ---------- promoDailyByProduct 聚合 ----------
describe('4U promoDailyByProduct(s)：promo_daily 按 ad_entity_id+日期 聚合 cost_fen', () => {
  it('单商品多日期 → 按日 SUM 返回 {date, costFen}', () => {
    const db = freshDb()
    const shopId = upsertShop(db, { name: 'S' })
    upsertPromoDaily(db, { shopId, date: '2026-08-11', adEntityId: '974661273911', costFen: 59636 })
    upsertPromoDaily(db, { shopId, date: '2026-08-12', adEntityId: '974661273911', costFen: 18409 })
    upsertPromoDaily(db, { shopId, date: '2026-08-13', adEntityId: '974661273911', costFen: 12271 })
    const rows = promoDailyByProduct(db, shopId, '974661273911', '2026-08-01', '2026-08-31')
    expect(rows).toEqual([
      { date: '2026-08-11', costFen: 59636 },
      { date: '2026-08-12', costFen: 18409 },
      { date: '2026-08-13', costFen: 12271 }
    ])
    db.close()
  })

  it('窗口过滤：区间外日期不返回', () => {
    const db = freshDb()
    const shopId = upsertShop(db, { name: 'S' })
    upsertPromoDaily(db, { shopId, date: '2026-08-10', adEntityId: 'P1', costFen: 100 })
    upsertPromoDaily(db, { shopId, date: '2026-08-12', adEntityId: 'P1', costFen: 200 })
    const rows = promoDailyByProduct(db, shopId, 'P1', '2026-08-11', '2026-08-13')
    expect(rows).toEqual([{ date: '2026-08-12', costFen: 200 }])
    db.close()
  })

  it('无推广数据 → 空数组；其他主体不串', () => {
    const db = freshDb()
    const shopId = upsertShop(db, { name: 'S' })
    upsertPromoDaily(db, { shopId, date: '2026-08-11', adEntityId: 'A', costFen: 50 })
    expect(promoDailyByProduct(db, shopId, 'B', '2026-08-01', '2026-08-31')).toEqual([])
    expect(promoDailyByProduct(db, shopId, 'A', '2026-08-01', '2026-08-31')).toEqual([{ date: '2026-08-11', costFen: 50 }])
    db.close()
  })

  it('批量版 promoDailyByProducts：一次取多商品 map（空 id 跳过）', () => {
    const db = freshDb()
    const shopId = upsertShop(db, { name: 'S' })
    upsertPromoDaily(db, { shopId, date: '2026-08-11', adEntityId: 'P1', costFen: 100 })
    upsertPromoDaily(db, { shopId, date: '2026-08-11', adEntityId: 'P2', costFen: 200 })
    const map = promoDailyByProducts(db, shopId, ['P1', 'P2', ''], '2026-08-01', '2026-08-31')
    expect(map.P1).toEqual([{ date: '2026-08-11', costFen: 100 }])
    expect(map.P2).toEqual([{ date: '2026-08-11', costFen: 200 }])
    expect(Object.keys(map)).toEqual(['P1', 'P2'])
    db.close()
  })
})

// ---------- 净ROI / 百分比展示纯函数 ----------
describe('4U 净ROI/百分比展示纯函数', () => {
  it('netRoiOf = 直接成交金额 ÷ 花费；花费=0 → null；成交=0 花费>0 → 0', () => {
    expect(netRoiOf(734600, 59636)).toBeCloseTo(734600 / 59636, 10)
    expect(netRoiOf(795000, 0)).toBeNull()
    expect(netRoiOf(0, 59636)).toBe(0)
    expect(netRoiOf(null, null)).toBeNull()
  })

  it('百分比展示：值×100，toFixed(2)+%（表内小数 0.06667 → 6.67%）', () => {
    expect(bpPct(0.06667 * 100, 2)).toBe('6.67%')
    expect(bpPct(0.06181 * 100, 2)).toBe('6.18%')
    expect(bpPct(0.04178 * 100, 2)).toBe('4.18%')
  })

  it('promoBlock 净ROI 总计=Σpay/Σcost，明细行净ROI=pay/cost；ctr/payRate 仍按加权平均', () => {
    const db = freshDb()
    const shopId = upsertShop(db, { name: 'S' })
    upsertPromoDaily(db, { shopId, date: '2026-08-11', adEntityId: 'A', impressions: 1000, clicks: 100, costFen: 10000, ctr: 0.1, payRate: 0.05, payAmountFen: 30000, salesCount: 3 })
    upsertPromoDaily(db, { shopId, date: '2026-08-11', adEntityId: 'B', impressions: 2000, clicks: 200, costFen: 20000, ctr: 0.2, payRate: 0.1, payAmountFen: 60000, salesCount: 6 })
    const p = promoBlock(db, shopId, '2026-08-01', '2026-08-31')
    expect(p.totals.payAmountFen).toBe(90000)
    expect(p.totals.costFen).toBe(30000)
    expect(p.totals.netRoi).toBeCloseTo(3, 10)
    expect(p.totals.ctr).toBeCloseTo((0.1 * 1000 + 0.2 * 2000) / 3000, 10)
    expect(p.totals.payRate).toBeCloseTo((0.05 * 100 + 0.1 * 200) / 300, 10)
    const a = p.entities.find((e) => e.adEntityId === 'A')!
    expect(a.netRoi).toBeCloseTo(3, 10)
    expect(a.payAmountFen).toBe(30000)
    db.close()
  })

  it('promoDetail 明细行净ROI=pay/cost（不再返回平台 roas）', () => {
    const db = freshDb()
    const shopId = upsertShop(db, { name: 'S' })
    upsertPromoDaily(db, { shopId, date: '2026-08-11', adEntityId: 'A', costFen: 59636, roas: 13.33, payAmountFen: 734600, salesCount: 22 })
    const rows = promoDetail(db, shopId, '2026-08-01', '2026-08-31')
    expect(rows[0].netRoi).toBeCloseTo(734600 / 59636, 10)
    expect((rows[0] as unknown as Record<string, unknown>).roas).toBeUndefined()
    expect(rows[0].payAmountFen).toBe(734600)
    db.close()
  })
})

// ---------- 回填脚本幂等 ----------
describe('4U 回填脚本（直接成交口径）：解析模板 + 幂等', () => {
  const tpl = join(TEMPLATE_DIR, '商品报表_8月11.csv')
  const csvText = new TextDecoder('gbk').decode(readFileSync(tpl))

  it('解析模板：113 行，TOP 商品 直接成交金额 734600 分/22 笔/点击转化率 0.04178', () => {
    const rows = parsePromoDirectCsv(csvText)
    expect(rows.length).toBe(113)
    const top = rows.find((r) => r.adEntityId === '974661273911')!
    expect(top.date).toBe('2026-08-11')
    expect(top.payAmountFen).toBe(734600)
    expect(top.salesCount).toBe(22)
    expect(top.payRate).toBeCloseTo(0.04178, 6)
  })

  it('applyPromoBackfill 幂等：旧值 → 直接口径，重复跑结果不变', () => {
    const db = freshDb()
    const shopId = upsertShop(db, { name: 'S' })
    upsertPromoDaily(db, { shopId, date: '2026-08-11', adEntityId: '974661273911', costFen: 59636, payAmountFen: 795000, salesCount: 31, payRate: 0.04178 })
    upsertPromoDaily(db, { shopId, date: '2026-08-11', adEntityId: '1058530190418', costFen: 23100, payAmountFen: 51800, salesCount: 1, payRate: 0.01087 })
    const rows = parsePromoDirectCsv(csvText)
    const first = applyPromoBackfill(db.raw, rows)
    expect(first.updated).toBe(2)
    expect(first.missing).toBe(111)
    const v1 = db.raw.prepare("SELECT pay_amount_fen, sales_count, pay_rate FROM promo_daily WHERE ad_entity_id='974661273911'").get() as { pay_amount_fen: number; sales_count: number; pay_rate: number | null }
    expect(v1.pay_amount_fen).toBe(734600)
    expect(v1.sales_count).toBe(22)
    const second = applyPromoBackfill(db.raw, rows)
    expect(second.updated).toBe(2)
    const v2 = db.raw.prepare("SELECT pay_amount_fen, sales_count, pay_rate FROM promo_daily WHERE ad_entity_id='974661273911'").get() as { pay_amount_fen: number; sales_count: number; pay_rate: number | null }
    expect(v2).toEqual(v1)
    db.close()
  })

  it('未匹配主体计入 missing 且不落脏数据', () => {
    const db = freshDb()
    const shopId = upsertShop(db, { name: 'S2' })
    upsertPromoDaily(db, { shopId, date: '2026-08-11', adEntityId: 'NOPE', costFen: 100, payAmountFen: 0, salesCount: 0, payRate: null })
    const rows = parsePromoDirectCsv(csvText)
    const res = applyPromoBackfill(db.raw, rows)
    expect(res.updated).toBe(0)
    expect(res.missing).toBe(113)
    db.close()
  })
})