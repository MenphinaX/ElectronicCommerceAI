import { describe, expect, it } from 'vitest'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import * as XLSX from 'xlsx'
import { AppDatabase } from '../src/main/db/database'
import { upsertShop, upsertAnalysis } from '../src/main/db/repo'
import { windowKey } from '../src/main/ai/comments'
import type { WindowRange } from '../src/main/db/dashboard'
import {
  buildReportData, detailRows, exportReportHtml, renderReportHtml, writeDetailFile, escapeHtml
} from '../src/main/report/report-service'
import { loadFixtures } from './helpers/load-fixtures'

function freshDb(): AppDatabase {
  const dir = mkdtempSync(join(tmpdir(), 'ecai-rpt-'))
  const db = new AppDatabase(join(dir, 'rpt.db'))
  db.init()
  return db
}

function loadReal(db: AppDatabase, shopId: number): void {
  const fx = loadFixtures(shopId)
  for (const r of fx.dailyMetrics) db.raw.prepare('INSERT INTO daily_metrics (shop_id, date, pay_amount_fen, net_sales_fen, profit_fen, visitors, refund_amount_fen, promo_cost_fen, pay_rate, sales_count) VALUES (@shopId,@date,@payAmountFen,@netSalesFen,@profitFen,@visitors,@refundAmountFen,@promoCostFen,@payRate,@salesCount)').run({ ...r })
  for (const r of fx.productDaily) db.raw.prepare('INSERT INTO product_daily (shop_id, product_id, date, product_name, visitors, page_views, pay_amount_fen, refund_amount_fen, promo_cost_fen, profit_fen, net_sales_fen, sales_count, consult_count, pay_rate) VALUES (@shopId,@productId,@date,@productName,@visitors,@pageViews,@payAmountFen,@refundAmountFen,@promoCostFen,@profitFen,@netSalesFen,@salesCount,@consultCount,@payRate)').run({ ...r })
  for (const r of fx.promoDaily) db.raw.prepare('INSERT INTO promo_daily (shop_id, date, ad_entity_id, ad_entity_name, impressions, clicks, cost_fen, ctr, roas) VALUES (@shopId,@date,@adEntityId,@adEntityName,@impressions,@clicks,@costFen,@ctr,@roas)').run({ ...r })
  for (const r of fx.refundOrders) db.raw.prepare('INSERT INTO refund_orders (shop_id, order_no, refund_no, product_id, product_title, refund_amount_fen, buyer_pay_amount_fen, refund_status, goods_status, after_sale_type, payment_time, refund_finish_time, refund_apply_time, refund_reason) VALUES (@shopId,@orderNo,@refundNo,@productId,@productTitle,@refundAmountFen,@buyerPayAmountFen,@refundStatus,@goodsStatus,@afterSaleType,@paymentTime,@refundFinishTime,@refundApplyTime,@refundReason)').run({ ...r, refundNo: 'T' + r.refundNo })
  for (const r of fx.csDaily) db.raw.prepare('INSERT INTO cs_daily VALUES (@shopId,@date,@staffName,@inquiryFinalPayCount,@inquiryCount,@inquiryFinalPayRate,@firstResponseSeconds,@avgResponseSeconds,@satisfactionRate,@replyRate,@inquiryFinalPayAmountFen,@refundAmountFen)').run({ ...r })
  for (const r of fx.searchKeywords) db.raw.prepare('INSERT INTO search_keywords VALUES (@shopId,@date,@keyword,@visitors,@cartAddCount,@favoriteCount,@payBuyerCount,@payRate,@payAmountFen,@unitPriceFen,@uvValueFen)').run({ ...r })
  for (const r of fx.dsrDaily) db.raw.prepare('INSERT INTO dsr_daily VALUES (@shopId,@date,@descriptionScore,@logisticsScore,@serviceScore)').run({ ...r })
}

function seedComments(db: AppDatabase, shopId: number, date: string): void {
  for (const [module, text] of [
    ['摘要', '全店汇总：窗口支付金额 412208.36 元，整体经营平稳，建议关注退款率。'],
    ['指标', '核心指标：支付转化率环比略降，ROI 健康。'],
    ['商品', '单品分析：TOP 商品支付金额 9036 元。']
  ]) {
    upsertAnalysis(db, { shopId, module, date, content: text, sourceSkillId: null, model: 'test-model' })
  }
}

describe('任务7 修复：日报窗口回退与覆盖天数标注', () => {
  it('日报昨日无数据自动回退最近有数据日：窗口/KPI/文件名/滞后提示同口径', () => {
    const db = freshDb()
    const shopId = upsertShop(db, { name: '佰泰康车品旗舰店' })
    loadReal(db, shopId)
    const data = buildReportData(db, { shopId, mode: 'yesterday', type: 'daily', today: '2026-08-14' })
    expect(data.window.start).toBe('2026-08-11')
    expect(data.window.end).toBe('2026-08-11')
    expect(data.window.days).toBe(1)
    expect(data.requestedEnd).toBe('2026-08-13')
    expect(data.dataCutoff).toBe('2026-08-11')
    expect(data.lagNote).toContain('数据截止 2026-08-11，昨日无新数据')
    // 页面数字 = 回退日真实库数字
    const sum = db.raw.prepare('SELECT pay_amount_fen s FROM daily_metrics WHERE shop_id=? AND date=?').get(shopId, '2026-08-11') as { s: number }
    expect(data.kpi?.payAmountFen).toBe(sum.s)
    // 文件名口径 = 回退日
    expect(`${data.window.end}_日报.html`).toBe('2026-08-11_日报.html')
    // 覆盖标注：该日窗口经营 1/1 天
    const dailyCov = data.coverage.find((c) => (c as { key: string }).key === 'daily') as { coveredDays: number; expectedDays: number }
    expect(dailyCov.coveredDays).toBe(1)
    expect(dailyCov.expectedDays).toBe(1)
    const html = renderReportHtml(data)
    expect(html).toContain('数据截止 2026-08-11，昨日无新数据')
    expect(html).toContain('lag-alert')
    expect(html).toContain('数据覆盖')
    expect(html).toContain('经营 1/1 天')
  })

  it('周报覆盖天数如实标注：经营 4/7 天 + 数据截止 08-11（与看板口径一致）', () => {
    const db = freshDb()
    const shopId = upsertShop(db, { name: '佰泰康车品旗舰店' })
    loadReal(db, shopId)
    const data = buildReportData(db, { shopId, mode: '7', type: 'weekly', today: '2026-08-14' })
    expect(data.window.start).toBe('2026-08-08')
    expect(data.window.end).toBe('2026-08-14')
    const dailyCov = data.coverage.find((c) => (c as { key: string }).key === 'daily') as { coveredDays: number; expectedDays: number }
    expect(dailyCov.coveredDays).toBe(4)
    expect(dailyCov.expectedDays).toBe(7)
    expect(data.dataCutoff).toBe('2026-08-11')
    expect(data.lagNote).toBeNull()
    const html = renderReportHtml(data)
    expect(html).toContain('经营 4/7 天')
    expect(html).toContain('数据截止 2026-08-11')
  })

  it('回退窗口评语与页面同口径：复用该日 ai_analyses 记录', () => {
    const db = freshDb()
    const shopId = upsertShop(db, { name: '佰泰康车品旗舰店' })
    loadReal(db, shopId)
    seedComments(db, shopId, '2026-08-11')
    const data = buildReportData(db, { shopId, mode: 'yesterday', type: 'daily', today: '2026-08-14' })
    expect(data.window.end).toBe('2026-08-11')
    expect(data.comments.filter((c) => c.content).length).toBe(3)
    const summary = data.comments.find((c) => c.module === '摘要')
    expect(summary?.content).toContain('412208.36')
  })

  it('昨日有经营数据时不回退：保持昨日窗口且无滞后提示', () => {
    const db = freshDb()
    const shopId = upsertShop(db, { name: '佰泰康车品旗舰店' })
    loadReal(db, shopId)
    const data = buildReportData(db, { shopId, mode: 'yesterday', type: 'daily', today: '2026-08-12' })
    expect(data.window.end).toBe('2026-08-11')
    expect(data.lagNote).toBeNull()
    expect(data.requestedEnd).toBe('2026-08-11')
  })
})

describe('任务7 日报导出：聚合数据来自真实库', () => {
  it('buildReportData 的 KPI 与数据库 SUM 一致（可回溯）', () => {
    const db = freshDb()
    const shopId = upsertShop(db, { name: '佰泰康车品旗舰店' })
    loadReal(db, shopId)
    const data = buildReportData(db, { shopId, mode: '30', type: 'daily', today: '2026-08-11' })
    const { start, end } = data.window
    const sum = db.raw.prepare('SELECT COALESCE(SUM(pay_amount_fen),0) s FROM daily_metrics WHERE shop_id=? AND date>=? AND date<=?').get(shopId, start, end) as { s: number }
    expect(data.kpi?.payAmountFen).toBe(sum.s)
    expect(data.shopName).toBe('佰泰康车品旗舰店')
    expect(data.window.end).toBe('2026-08-11')
    expect(data.rowCounts.daily).toBeGreaterThan(0)
    expect(data.rowCounts.refund).toBeGreaterThan(0)
    expect(data.charts.trend.pay.length).toBeGreaterThan(0)
  })

  it('评语复用 ai_analyses：全店汇总 + 模块卡片都有真实内容', () => {
    const db = freshDb()
    const shopId = upsertShop(db, { name: '佰泰康车品旗舰店' })
    loadReal(db, shopId)
    const w: WindowRange = { mode: '30', label: '近30天', days: 30, start: '2026-07-13', end: '2026-08-11', prevStart: '2026-06-13', prevEnd: '2026-07-12' }
    seedComments(db, shopId, windowKey(w))
    const data = buildReportData(db, { shopId, mode: '30', today: '2026-08-11' })
    const summary = data.comments.find((c) => c.module === '摘要')
    expect(summary?.content).toContain('412208.36')
    const product = data.comments.find((c) => c.module === '商品')
    expect(product?.content).toContain('9036')
    expect(data.comments.filter((c) => c.content).length).toBe(3)
  })
})

describe('任务7 日报导出：HTML 渲染与离线', () => {
  it('渲染 HTML：标题/店铺/图表容器/内联 echarts/评语都在', () => {
    const db = freshDb()
    const shopId = upsertShop(db, { name: '佰泰康车品旗舰店' })
    loadReal(db, shopId)
    seedComments(db, shopId, '2026-08-11')
    const data = buildReportData(db, { shopId, mode: '30', today: '2026-08-11' })
    const html = renderReportHtml(data)
    expect(html).toContain('<title>经营日报</title>')
    expect(html).toContain('佰泰康车品旗舰店')
    expect(html).toContain('chart-trend')
    expect(html).toContain('chart-product')
    expect(html).toContain('chart-promo')
    expect(html).toContain('chart-refund')
    expect(html).toContain('chart-keyword')
    expect(html).toContain('全店汇总：窗口支付金额 412208.36 元')
    expect(html).toContain('TOP 商品支付金额 9036 元')
    // echarts 已内联（占位符已被替换，不是外链）
    expect(html).not.toContain('__ECHARTS_JS__')
    expect(html.length).toBeGreaterThan(5000)
  })

  it('无外网请求：HTML 无 script src / link href / @import / url(http', () => {
    const db = freshDb()
    const shopId = upsertShop(db, { name: '佰泰康车品旗舰店' })
    loadReal(db, shopId)
    const data = buildReportData(db, { shopId, mode: '30', today: '2026-08-11' })
    const html = renderReportHtml(data)
    expect(html).not.toMatch(/src\s*=\s*['"]https?:\/\//i)
    expect(html).not.toMatch(/href\s*=\s*['"]https?:\/\//i)
    expect(html).not.toMatch(/@import/i)
    expect(html).not.toMatch(/url\(\s*['"]?https?:/i)
  })

  it('导出的 HTML 文件可落盘且无乱码占位', () => {
    const db = freshDb()
    const shopId = upsertShop(db, { name: '佰泰康车品旗舰店' })
    loadReal(db, shopId)
    const data = buildReportData(db, { shopId, mode: '30', today: '2026-08-11' })
    const out = join(tmpdir(), `rpt-${Date.now()}.html`)
    exportReportHtml(data, out)
    const text = readFileSync(out, 'utf8')
    expect(text.startsWith('<!DOCTYPE html>')).toBe(true)
    expect(text).not.toContain('???')
    expect(text).toContain('window.__REPORT_DATA__ =')
  })

  it('escapeHtml 转义评语内容中的特殊字符', () => {
    expect(escapeHtml("<b>&\"'")).toBe("&lt;b&gt;&amp;&quot;&#39;")
  })
})

describe('任务7 明细导出：数字与库中一致', () => {
  it('退款单明细：合计金额与库中退款完结时间窗口一致', () => {
    const db = freshDb()
    const shopId = upsertShop(db, { name: '佰泰康车品旗舰店' })
    loadReal(db, shopId)
    const rows = detailRows(db, { shopId, mode: '30', kind: 'refund', today: '2026-08-11' })
    const sumDb = db.raw.prepare('SELECT COALESCE(SUM(refund_amount_fen),0) s FROM refund_orders WHERE shop_id=? AND substr(refund_finish_time,1,10)>=? AND substr(refund_finish_time,1,10)<=?').get(shopId, '2026-07-13', '2026-08-11') as { s: number }
    const sumRows = rows.reduce((acc, r) => acc + Number(r.退款总额元), 0)
    expect(Math.abs(sumRows - sumDb.s / 100)).toBeLessThan(0.01)
    expect(rows.length).toBeGreaterThan(0)
  })

  it('商品明细：行数 = 窗口内商品数，金额可核对', () => {
    const db = freshDb()
    const shopId = upsertShop(db, { name: '佰泰康车品旗舰店' })
    loadReal(db, shopId)
    const rows = detailRows(db, { shopId, mode: '30', kind: 'product', today: '2026-08-11' })
    const n = db.raw.prepare('SELECT COUNT(*) n FROM (SELECT product_id FROM product_daily WHERE shop_id=? AND date>=? AND date<=? GROUP BY product_id)').get(shopId, '2026-07-13', '2026-08-11') as { n: number }
    expect(rows.length).toBe(n.n)
    expect(rows[0].商品ID).toBeTruthy()
  })

  it('每日数据：行数 = 窗口天数，支付金额合计与库一致', () => {
    const db = freshDb()
    const shopId = upsertShop(db, { name: '佰泰康车品旗舰店' })
    loadReal(db, shopId)
    const rows = detailRows(db, { shopId, mode: '30', kind: 'daily', today: '2026-08-11' })
    const sumDb = db.raw.prepare('SELECT COALESCE(SUM(pay_amount_fen),0) s FROM daily_metrics WHERE shop_id=? AND date>=? AND date<=?').get(shopId, '2026-07-13', '2026-08-11') as { s: number }
    const sumRows = rows.reduce((acc, r) => acc + Number(r.支付金额元), 0)
    expect(Math.abs(sumRows - sumDb.s / 100)).toBeLessThan(0.01)
    expect(rows.length).toBeGreaterThan(0)
  })

  it('CSV 带 UTF-8 BOM 且表头完整；xlsx 可回读且数字一致', () => {
    const db = freshDb()
    const shopId = upsertShop(db, { name: '佰泰康车品旗舰店' })
    loadReal(db, shopId)
    const rows = detailRows(db, { shopId, mode: '30', kind: 'daily', today: '2026-08-11' })
    const dir = mkdtempSync(join(tmpdir(), 'ecai-rpt-out-'))
    const csvPath = join(dir, 'daily.csv')
    writeDetailFile(csvPath, rows, 'csv')
    const buf = readFileSync(csvPath)
    expect(buf[0]).toBe(0xef)
    expect(buf[1]).toBe(0xbb)
    expect(buf[2]).toBe(0xbf)
    const csvText = buf.toString('utf8')
    expect(csvText).toContain('日期')
    expect(csvText).toContain('支付金额元')
    const xlsxPath = join(dir, 'daily.xlsx')
    writeDetailFile(xlsxPath, rows, 'xlsx')
    const wb = XLSX.readFile(xlsxPath)
    const back = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]]) as Array<Record<string, unknown>>
    expect(back.length).toBe(rows.length)
    expect(Math.abs(Number(back[0].支付金额元) - Number(rows[0].支付金额元))).toBeLessThan(0.001)
  })
})
