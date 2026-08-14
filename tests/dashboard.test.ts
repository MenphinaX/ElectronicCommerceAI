import { describe, expect, it } from 'vitest'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { AppDatabase } from '../src/main/db/database'
import { setSetting, upsertShop } from '../src/main/db/repo'
import {
  consultTop, coverage, csBlock, dsrBlock, keywordBlock, kpiBlock, monthBlock, monthlyProgress, pctChange,
  productCounts, productDailySeries, productTop, promoBlock, promoDetail, refundBlock, refundRows, shiftDate, shopCompare,
  todayStr, windowRange, yesterdayGaps
} from '../src/main/db/dashboard'
import { loadFixtures } from './helpers/load-fixtures'

function freshDb(): AppDatabase {
  const dir = mkdtempSync(join(tmpdir(), 'ecai-dash-'))
  const db = new AppDatabase(join(dir, 'dash.db'))
  db.init()
  return db
}

function loadReal(db: AppDatabase, shopId: number): void {
  const fx = loadFixtures(shopId)
  for (const r of fx.dailyMetrics) db.raw.prepare('INSERT INTO daily_metrics (shop_id, date, pay_amount_fen, net_sales_fen, profit_fen, visitors, refund_amount_fen, promo_cost_fen, pay_rate, sales_count) VALUES (@shopId,@date,@payAmountFen,@netSalesFen,@profitFen,@visitors,@refundAmountFen,@promoCostFen,@payRate,@salesCount)').run({ ...r })
  for (const r of fx.productDaily) db.raw.prepare('INSERT INTO product_daily (shop_id, product_id, date, product_name, visitors, page_views, pay_amount_fen, refund_amount_fen, promo_cost_fen, profit_fen, net_sales_fen, sales_count, consult_count, pay_rate) VALUES (@shopId,@productId,@date,@productName,@visitors,@pageViews,@payAmountFen,@refundAmountFen,@promoCostFen,@profitFen,@netSalesFen,@salesCount,@consultCount,@payRate)').run({ ...r })
  for (const r of fx.promoDaily) db.raw.prepare('INSERT INTO promo_daily (shop_id, date, ad_entity_id, ad_entity_name, impressions, clicks, cost_fen, ctr, roas, pay_amount_fen, sales_count, pay_rate) VALUES (@shopId,@date,@adEntityId,@adEntityName,@impressions,@clicks,@costFen,@ctr,@roas,@payAmountFen,@salesCount,@payRate)').run({ ...r })
  for (const r of fx.refundOrders) db.raw.prepare('INSERT INTO refund_orders (shop_id, order_no, refund_no, product_id, product_title, refund_amount_fen, buyer_pay_amount_fen, refund_status, goods_status, after_sale_type, payment_time, refund_finish_time, refund_apply_time, refund_reason) VALUES (@shopId,@orderNo,@refundNo,@productId,@productTitle,@refundAmountFen,@buyerPayAmountFen,@refundStatus,@goodsStatus,@afterSaleType,@paymentTime,@refundFinishTime,@refundApplyTime,@refundReason)').run({ ...r, refundNo: shopId === 1 ? r.refundNo : 'S' + shopId + '-' + r.refundNo })
  for (const r of fx.csDaily) db.raw.prepare('INSERT INTO cs_daily VALUES (@shopId,@date,@staffName,@inquiryFinalPayCount,@inquiryCount,@inquiryFinalPayRate,@firstResponseSeconds,@avgResponseSeconds,@satisfactionRate,@replyRate,@inquiryFinalPayAmountFen,@refundAmountFen)').run({ ...r })
  for (const r of fx.searchKeywords) db.raw.prepare('INSERT INTO search_keywords VALUES (@shopId,@date,@keyword,@visitors,@cartAddCount,@favoriteCount,@payBuyerCount,@payRate,@payAmountFen,@unitPriceFen,@uvValueFen)').run({ ...r })
  for (const r of fx.dsrDaily) db.raw.prepare('INSERT INTO dsr_daily VALUES (@shopId,@date,@descriptionScore,@logisticsScore,@serviceScore)').run({ ...r })
  for (const r of fx.dsr180d) db.raw.prepare('INSERT INTO dsr_180d (shop_id, snapshot_date, indicator, score, trend, industry_avg, compare_text, target, gap_text) VALUES (@shopId,@snapshotDate,@indicator,@score,@trend,@industryAvg,@compareText,@target,@gapText)').run({ ...r })
}

describe('看板复刻：新查询（蓝本 04/05/06/08）', () => {
  it('推广明细 TOP12（蓝本 05）：单日快照按计划，banner 用 top 求和', () => {
    const db = freshDb()
    const shopId = upsertShop(db, { name: 'XX旗舰店' })
    loadReal(db, shopId)
    const rows = promoDetail(db, 1, '2026-08-07', '2026-08-13')
    expect(rows).toHaveLength(12)
    const cost = rows.reduce((s2, r) => s2 + r.costFen, 0)
    const pay = rows.reduce((s2, r) => s2 + r.payAmountFen, 0)
    expect(cost).toBe(117742) // TOP12 花费合计 1177.42
    expect(pay).toBe(1208650) // TOP12 成交合计 12086.50
    expect(rows.reduce((s2, r) => s2 + r.salesCount, 0)).toBe(47)
    expect(rows[0].adEntityId).toBe('974661273911')
    expect(rows[0].costFen).toBe(59636)
    expect(rows[0].payAmountFen).toBe(795000)
    expect(rows[0].salesCount).toBe(31)
    expect(rows[0].clicks).toBe(742)
    expect(rows[0].payRate).toBeCloseTo(0.04178, 4) // 点击转化率
    db.close()
  })

  it('咨询 TOP（蓝本 08）：最近一日快照', () => {
    const db = freshDb()
    const shopId = upsertShop(db, { name: 'XX旗舰店' })
    loadReal(db, shopId)
    const c = consultTop(db, shopId, '2026-08-11')
    expect(c.total).toBe(30)
    expect(c.sum).toBe(150)
    expect(c.rows[0].consultCount).toBe(76)
    expect(c.rows[0].productId).toBe('974661273911')
    db.close()
  })

  it('退款明细行（蓝本 06）：窗口完结 121 笔 / 25,385.48 元', () => {
    const db = freshDb()
    const shopId = upsertShop(db, { name: 'XX旗舰店' })
    loadReal(db, shopId)
    const rows = refundRows(db, shopId, '2026-08-07', '2026-08-13')
    expect(rows).toHaveLength(121)
    const fen = rows.reduce((s2, r) => s2 + Number(r.fen), 0)
    expect(fen).toBe(2538548)
    const wf = rows.filter((r) => r.afterSaleType === '仅退款' && r.goodsStatus === '未发货')
    const jr = rows.filter((r) => r.afterSaleType === '仅退款' && r.goodsStatus !== '未发货')
    const rt = rows.filter((r) => r.afterSaleType === '退货退款')
    expect(wf.length + jr.length + rt.length).toBeLessThanOrEqual(121)
    db.close()
  })

  it('商品动销计数（蓝本 04 副标题）', () => {
    const db = freshDb()
    const shopId = upsertShop(db, { name: 'XX旗舰店' })
    loadReal(db, shopId)
    const c = productCounts(db, shopId, '2026-08-07', '2026-08-13')
    expect(c.total).toBe(112)
    expect(c.sold).toBe(15) // 动销=支付金额>0 商品（商品报表单日快照）
    db.close()
  })
})

describe('看板：窗口口径', () => {
  it('近7天窗口与环比区间（基准日=电脑日期 2026-08-13）', () => {
    const w = windowRange('7', '2026-08-13')
    expect(w.start).toBe('2026-08-07')
    expect(w.end).toBe('2026-08-13')
    expect(w.prevStart).toBe('2026-07-31')
    expect(w.prevEnd).toBe('2026-08-06')
    expect(w.days).toBe(7)
    const y = windowRange('yesterday', '2026-08-13')
    expect(y.start).toBe('2026-08-12')
    expect(y.end).toBe('2026-08-12')
    expect(shiftDate('2026-08-01', -1)).toBe('2026-07-31')
  })

  it('环比百分比：分母为 0 返回 null', () => {
    expect(pctChange(100, 50)).toBe(1)
    expect(pctChange(0, 0)).toBeNull()
    expect(pctChange(100, 0)).toBeNull()
  })
})

describe('看板：核心 KPI 聚合（真实九源数据）', () => {
  it('近7/15/30 天支付金额与源文件一致（基准 412,208.36 元）', () => {
    const db = freshDb()
    const shopId = upsertShop(db, { name: 'XX旗舰店' })
    loadReal(db, shopId)
    const full = kpiBlock(db, shopId, { mode: '30', label: '近30天', days: 30, start: '2026-07-12', end: '2026-08-11', prevStart: '2026-06-12', prevEnd: '2026-07-11' })
    expect(full.payAmountFen).toBe(41220836)
    const w7 = kpiBlock(db, shopId, windowRange('7', '2026-08-13'))
    expect(w7.days).toBe(5)
    expect(w7.payAmountFen).toBe(6170947)
    expect(w7.netSalesFen).toBe(3696306)
    expect(w7.profitFen).toBe(154858)
    expect(w7.visitors).toBe(10695)
    expect(w7.refundAmountFen).toBe(2175241)
    expect(w7.promoCostFen).toBe(569533)
    expect(w7.salesCount).toBe(235) // 近7天 销售单数(支付) 08-07~08-11 = 45+40+38+55+57
    const w15 = kpiBlock(db, shopId, windowRange('15', '2026-08-13'))
    expect(w15.payAmountFen).toBe(18338003)
    const w30 = kpiBlock(db, shopId, windowRange('30', '2026-08-13'))
    expect(w30.payAmountFen).toBe(37124246)
    expect(w30.salesCount).toBe(1491) // 30 天窗口 07-15~08-13 实际覆盖 07-15~08-11 共 28 天（源文件 07-15 起累计）
    const y = kpiBlock(db, shopId, windowRange('yesterday', '2026-08-13'))
    expect(y.payAmountFen).toBe(0)
    expect(y.days).toBe(0)
    db.close()
  })

  it('月度汇总 monthBlock：2026-08 实际覆盖 11/31 天，订单合计 579（销售单数(支付) 可回溯），最近一天 08-11=57', () => {
    const db = freshDb()
    const shopId = upsertShop(db, { name: 'S' })
    loadReal(db, shopId)
    const m = monthBlock(db, shopId, '2026-08-13')
    expect(m.ym).toBe('2026-08')
    expect(m.covered).toBe(11)
    expect(m.total).toBe(31)
    expect(m.agg.payAmountFen).toBe(16008203)
    expect(m.agg.salesCount).toBe(579)
    expect(m.agg.refundAmountFen).toBe(4835811)
    expect(m.lastDate).toBe('2026-08-11')
    expect(m.last?.salesCount).toBe(57)
    expect(m.last?.payAmountFen).toBe(1534550)
    expect(m.last?.visitors).toBe(2213)
    expect(m.last?.cv).toBeCloseTo((57 / 2213) * 100, 3)
    db.close()
  })

  it('环比与库中计算一致：近7天支付金额环比 -42.79%', () => {
    const db = freshDb()
    const shopId = upsertShop(db, { name: 'S' })
    loadReal(db, shopId)
    const w7 = kpiBlock(db, shopId, windowRange('7', '2026-08-13'))
    expect(w7.prev.payAmountFen).toBe(10786756)
    expect(w7.change.payAmountPct).toBeCloseTo(-0.4279, 3)
    expect(w7.change.visitorsPct).toBeCloseTo((10695 - 15432) / 15432, 3)
    db.close()
  })

  it('趋势图按日序列返回窗口内有效数据', () => {
    const db = freshDb()
    const shopId = upsertShop(db, { name: 'S' })
    loadReal(db, shopId)
    const w7 = kpiBlock(db, shopId, windowRange('7', '2026-08-13'))
    expect(w7.trend).toHaveLength(5)
    expect(w7.trend[0].date).toBe('2026-08-07')
    expect(w7.trend[4].date).toBe('2026-08-11')
    db.close()
  })
})

describe('看板：单品/推广/退款/客服/DSR/搜索词', () => {
  it('单品 TOP：近7天第一单品 974661273911（支付 9,036.00 元）', () => {
    const db = freshDb()
    const shopId = upsertShop(db, { name: 'S' })
    loadReal(db, shopId)
    const top = productTop(db, shopId, '2026-08-07', '2026-08-13')
    expect(top[0].productId).toBe('974661273911')
    expect(top[0].payAmountFen).toBe(903600)
    expect(top[0].salesCount).toBe(27)
    expect(top[0].consultCount).toBe(76)
    const series = productDailySeries(db, shopId, '974661273911', '2026-08-07', '2026-08-13')
    expect(series.length).toBe(1)
    expect(Number(series[0].payAmountFen)).toBe(903600)
    db.close()
  })

  it('退款三档与明细：近7天 121 笔 / 25,385.48 元', () => {
    const db = freshDb()
    const shopId = upsertShop(db, { name: 'S' })
    loadReal(db, shopId)
    const rf = refundBlock(db, shopId, '2026-08-07', '2026-08-13')
    expect(rf.total).toEqual({ count: 121, fen: 2538548 })
    expect(rf.wf).toEqual({ count: 35, fen: 777253 })
    expect(rf.jr).toEqual({ count: 34, fen: 277746 })
    expect(rf.rt).toEqual({ count: 50, fen: 1482850 })
    expect(rf.other.count).toBe(2)
    expect(rf.byProduct.length).toBeGreaterThan(0)
    // 单品三档拆解（任务4B）：byProduct 每行含 wf/jr/rt 三档，且三档合计=行合计
    const top = rf.byProduct[0]
    expect(top.wf.count + top.jr.count + top.rt.count).toBeLessThanOrEqual(top.count)
    expect(top.wf.fen + top.jr.fen + top.rt.fen).toBeLessThanOrEqual(top.fen)
    expect(rf.recent.length).toBeGreaterThan(0)
    db.close()
  })

  it('推广：08-11 单日 113 主体 / 花费 1,219.46 元 / 展现 39,664', () => {
    const db = freshDb()
    const shopId = upsertShop(db, { name: 'S' })
    loadReal(db, shopId)
    const p = promoBlock(db, shopId, '2026-08-07', '2026-08-13')
    expect(p.totals.costFen).toBe(121946)
    expect(p.totals.impressions).toBe(39664)
    expect(p.totals.clicks).toBe(2178)
    expect(p.totals.payAmountFen).toBe(1250850) // 单日快照 08-11 总成交金额合计 12508.50
    expect(p.totals.salesCount).toBe(51)
    expect(p.totals.payRate).toBeCloseTo(51 / 2178, 4) // 点击转化率按点击加权
    expect(p.entities[0].costFen).toBe(59636)
    db.close()
  })

  it('客服：8 名客服，孙春莲询单最终付款 12 人', () => {
    const db = freshDb()
    const shopId = upsertShop(db, { name: 'S' })
    loadReal(db, shopId)
    const cs = csBlock(db, shopId, '2026-08-07', '2026-08-13')
    expect(cs).toHaveLength(8)
    expect(cs[0].staffName).toBe('孙春莲')
    expect(cs[0].inquiryFinalPayCount).toBe(12)
    db.close()
  })

  it('DSR：日维度 2026-08-11 三项满分 + 180 天 3 指标', () => {
    const db = freshDb()
    const shopId = upsertShop(db, { name: 'S' })
    loadReal(db, shopId)
    const dsr = dsrBlock(db, shopId, '2026-08-07', '2026-08-13')
    expect((dsr.daily as { date: string }).date).toBe('2026-08-11')
    expect((dsr.daily as { descriptionScore: number }).descriptionScore).toBe(5)
    expect((dsr.snapshot as Array<Record<string, unknown>>)).toHaveLength(3)
    db.close()
  })

  it('搜索词：TOP1 汽车座套访客 12、窗口日期 08-11', () => {
    const db = freshDb()
    const shopId = upsertShop(db, { name: 'S' })
    loadReal(db, shopId)
    const kw = keywordBlock(db, shopId, '2026-08-07', '2026-08-13')
    expect((kw.top as Array<Record<string, unknown>>)[0].keyword).toBe('汽车座套')
    expect((kw.top as Array<Record<string, unknown>>)[0].visitors).toBe(12)
    expect(kw.dates).toEqual(['2026-08-11'])
    db.close()
  })
})

describe('看板：覆盖天数 / 缺口 / 月度目标 / 店铺对比', () => {
  it('覆盖如实标注：近7天经营 5/7 天，退款按完结日期覆盖', () => {
    const db = freshDb()
    const shopId = upsertShop(db, { name: 'S' })
    loadReal(db, shopId)
    const cov = coverage(db, shopId, '2026-08-07', '2026-08-13', 7)
    const daily = cov.find((c) => c.key === 'daily')!
    expect(daily.coveredDays).toBe(5)
    expect(daily.expectedDays).toBe(7)
    expect(daily.lastDate).toBe('2026-08-11')
    const product = cov.find((c) => c.key === 'product')!
    expect(product.coveredDays).toBe(1)
    const refund = cov.find((c) => c.key === 'refund')!
    expect(refund.lastDate).toBe('2026-08-12')
    db.close()
  })

  it('昨日缺口：昨日=08-12 缺经营/商品/推广/客服/搜索词/DSR，不缺退款', () => {
    const db = freshDb()
    const shopId = upsertShop(db, { name: 'S' })
    loadReal(db, shopId)
    const gaps = yesterdayGaps(db, shopId, '2026-08-12')
    const keys = gaps.map((g) => g.key)
    expect(keys).toContain('daily')
    expect(keys).toContain('product')
    expect(keys).toContain('promo')
    expect(keys).toContain('cs')
    expect(keys).toContain('keyword')
    expect(keys).toContain('dsr')
    expect(keys).not.toContain('refund')
    db.close()
  })

  it('月度目标：目标 20 万元，本月完成 160,082.03 元 → 80.04%', () => {
    const db = freshDb()
    const shopId = upsertShop(db, { name: 'S' })
    loadReal(db, shopId)
    setSetting(db, 'monthly_target_fen', '20000000')
    const m = monthlyProgress(db, shopId, '2026-08-13')
    expect(m.month).toBe('2026-08')
    expect(m.payFen).toBe(16008203)
    expect(m.pct).toBeCloseTo(0.8004, 3)
    const none = monthlyProgress(db, shopId, '2026-08-13')
    expect(none.targetFen).toBe(20000000)
    db.close()
  })

  it('店铺对比：同份九源导入 A/B 两店，8 行 KPI 数字一致', () => {
    const db = freshDb()
    const a = upsertShop(db, { name: 'A店' })
    const b = upsertShop(db, { name: 'B店' })
    loadReal(db, a)
    loadReal(db, b)
    const cmp = shopCompare(db, [a, b], '2026-07-12', '2026-08-11')
    expect(cmp.shops).toHaveLength(2)
    expect(cmp.rows).toHaveLength(8)
    const pay = cmp.rows.find((r) => r.key === 'payAmountFen')!
    expect(pay.label).toBe('支付金额')
    expect(pay.values[0].value).toBe(pay.values[1].value)
    expect(pay.values[0].value).toBe(41220836)
    db.close()
  })
})
