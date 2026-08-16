// 看板聚合查询（任务 4）：窗口口径 + 9 大区块数据，一律从 daily 表按 店铺+日期窗口 聚合
// 口径：金额=分、比率=0~1、日期=YYYY-MM-DD；窗口基准日=电脑当前日期
import type { AppDatabase } from './database'
import { dailyKpi } from './repo'

export type WindowMode = 'yesterday' | '7' | '15' | '30'

export interface WindowRange {
  mode: WindowMode
  label: string
  days: number
  start: string
  end: string
  prevStart: string
  prevEnd: string
}

function pad(n: number): string {
  return String(n).padStart(2, '0')
}

/** 电脑当前日期（本地时区，YYYY-MM-DD） */
export function todayStr(d = new Date()): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

export function shiftDate(date: string, delta: number): string {
  const d = new Date(`${date}T00:00:00`)
  d.setDate(d.getDate() + delta)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/** 窗口区间：昨日=今天-1；近 N 天=从今天往前推 N 个自然日（含今天）；环比=同天数往前推 */
export function windowRange(mode: WindowMode, today = todayStr()): WindowRange {
  const days = mode === 'yesterday' ? 1 : Number(mode)
  const end = mode === 'yesterday' ? shiftDate(today, -1) : today
  const start = shiftDate(end, -(days - 1))
  const prevEnd = shiftDate(start, -1)
  const prevStart = shiftDate(prevEnd, -(days - 1))
  const label = mode === 'yesterday' ? '昨日' : `近${days}天`
  return { mode, label, days, start, end, prevStart, prevEnd }
}

/** 环比变化（%）：分母为 0 时返回 null（无法计算） */
export function pctChange(cur: number, prev: number): number | null {
  if (!Number.isFinite(cur) || !Number.isFinite(prev)) return null
  if (prev === 0) return null
  return (cur - prev) / Math.abs(prev)
}

/** 加权平均（分母 0 → null） */
export function weightedAvg(sum: number, weight: number): number | null {
  if (!weight) return null
  return sum / weight
}

// ---------- 核心 KPI（摘要/指标卡/趋势图共用） ----------
export interface KpiPoint {
  date: string
  payAmountFen: number
  netSalesFen: number
  profitFen: number
  visitors: number
  salesCount: number
  refundAmountFen: number
  promoCostFen: number
  payRate: number | null
  refundRate: number | null
}

export interface KpiBlock {
  days: number
  payAmountFen: number
  netSalesFen: number
  profitFen: number
  visitors: number
  salesCount: number
  refundAmountFen: number
  promoCostFen: number
  roi: number | null
  payRate: number | null
  refundRate: number | null
  prev: KpiTotals
  change: {
    payAmountPct: number | null
    netSalesPct: number | null
    profitPct: number | null
    visitorsPct: number | null
    refundAmountPct: number | null
    promoCostPct: number | null
  }
  trend: KpiPoint[]
  prevTrend: KpiPoint[]
}

interface KpiTotals {
  days: number
  payAmountFen: number
  netSalesFen: number
  profitFen: number
  visitors: number
  salesCount: number
  refundAmountFen: number
  promoCostFen: number
  roi: number | null
  payRate: number | null
  refundRate: number | null
}

function kpiTotals(db: AppDatabase, shopId: number, from: string, to: string): KpiTotals {
  const k = dailyKpi(db, shopId, from, to)
  const payRateRows = db.raw
    .prepare(`SELECT COALESCE(SUM(pay_rate*visitors),0) AS w, COALESCE(SUM(visitors),0) AS v FROM daily_metrics WHERE shop_id=@shopId AND date>=@from AND date<=@to`)
    .get({ shopId, from, to }) as { w: number; v: number }
  const roi = k.promoCostFen > 0 ? k.payAmountFen / k.promoCostFen : null
  const payRate = weightedAvg(payRateRows.w, payRateRows.v)
  const refundRate = k.payAmountFen > 0 ? k.refundAmountFen / k.payAmountFen : null
  return { days: k.days, payAmountFen: k.payAmountFen, netSalesFen: k.netSalesFen, profitFen: k.profitFen, visitors: k.visitors, salesCount: k.salesCount, refundAmountFen: k.refundAmountFen, promoCostFen: k.promoCostFen, roi, payRate, refundRate }
}

export function kpiBlock(db: AppDatabase, shopId: number, w: WindowRange): KpiBlock {
  const cur = kpiTotals(db, shopId, w.start, w.end)
  const prev = kpiTotals(db, shopId, w.prevStart, w.prevEnd)
  const rows = db.raw
    .prepare(`SELECT date, pay_amount_fen AS payAmountFen, net_sales_fen AS netSalesFen, profit_fen AS profitFen,
      visitors, sales_count AS salesCount, refund_amount_fen AS refundAmountFen, promo_cost_fen AS promoCostFen, pay_rate AS payRate
      FROM daily_metrics WHERE shop_id=@shopId AND date>=@from AND date<=@to ORDER BY date`)
    .all({ shopId, from: w.start, to: w.end }) as Array<Record<string, unknown>>
  const trend: KpiPoint[] = rows.map((r) => {
    const pay = Number(r.payAmountFen) || 0
    const refund = Number(r.refundAmountFen) || 0
    return {
      date: String(r.date), payAmountFen: pay, netSalesFen: Number(r.netSalesFen) || 0,
      profitFen: Number(r.profitFen) || 0, visitors: Number(r.visitors) || 0, salesCount: Number(r.salesCount) || 0,
      refundAmountFen: refund, promoCostFen: Number(r.promoCostFen) || 0,
      payRate: r.payRate == null ? null : Number(r.payRate),
      refundRate: pay > 0 ? refund / pay : null
    }
  })
  const prevRows = db.raw
    .prepare(`SELECT date, pay_amount_fen AS payAmountFen, net_sales_fen AS netSalesFen, profit_fen AS profitFen,
      visitors, sales_count AS salesCount, refund_amount_fen AS refundAmountFen, promo_cost_fen AS promoCostFen, pay_rate AS payRate
      FROM daily_metrics WHERE shop_id=@shopId AND date>=@from AND date<=@to ORDER BY date`)
    .all({ shopId, from: w.prevStart, to: w.prevEnd }) as Array<Record<string, unknown>>
  const prevTrend: KpiPoint[] = prevRows.map((r) => ({
    date: String(r.date), payAmountFen: Number(r.payAmountFen) || 0, netSalesFen: Number(r.netSalesFen) || 0,
    profitFen: Number(r.profitFen) || 0, visitors: Number(r.visitors) || 0, salesCount: Number(r.salesCount) || 0,
    refundAmountFen: Number(r.refundAmountFen) || 0, promoCostFen: Number(r.promoCostFen) || 0,
    payRate: r.payRate == null ? null : Number(r.payRate), refundRate: null
  }))
  const change = {
    payAmountPct: pctChange(cur.payAmountFen, prev.payAmountFen),
    netSalesPct: pctChange(cur.netSalesFen, prev.netSalesFen),
    profitPct: pctChange(cur.profitFen, prev.profitFen),
    visitorsPct: pctChange(cur.visitors, prev.visitors),
    refundAmountPct: pctChange(cur.refundAmountFen, prev.refundAmountFen),
    promoCostPct: pctChange(cur.promoCostFen, prev.promoCostFen)
  }
  return { ...cur, prev, change, trend, prevTrend }
}

// ---------- 单品分析 ----------
export interface ProductRow {
  productId: string
  productName: string | null
  payAmountFen: number
  refundAmountFen: number
  profitFen: number
  netSalesFen: number
  salesCount: number
  visitors: number
  consultCount: number
  promoCostFen: number
  days: number
}

export function productTop(db: AppDatabase, shopId: number, from: string, to: string, limit = 8): ProductRow[] {
  return db.raw
    .prepare(`SELECT product_id AS productId, MAX(product_name) AS productName,
      COALESCE(SUM(pay_amount_fen),0) AS payAmountFen, COALESCE(SUM(refund_amount_fen),0) AS refundAmountFen,
      COALESCE(SUM(profit_fen),0) AS profitFen, COALESCE(SUM(net_sales_fen),0) AS netSalesFen,
      COALESCE(SUM(sales_count),0) AS salesCount, COALESCE(SUM(visitors),0) AS visitors,
      COALESCE(SUM(consult_count),0) AS consultCount, COALESCE(SUM(promo_cost_fen),0) AS promoCostFen,
      COUNT(*) AS days
      FROM product_daily WHERE shop_id=@shopId AND date>=@from AND date<=@to
      GROUP BY product_id ORDER BY payAmountFen DESC LIMIT @limit`)
    .all({ shopId, from, to, limit }) as unknown as ProductRow[]
}

export function productDailySeries(db: AppDatabase, shopId: number, productId: string, from: string, to: string): Array<Record<string, unknown>> {
  return db.raw
    .prepare(`SELECT date, pay_amount_fen AS payAmountFen, refund_amount_fen AS refundAmountFen, profit_fen AS profitFen,
      promo_cost_fen AS promoCostFen, sales_count AS salesCount, visitors, consult_count AS consultCount
      FROM product_daily WHERE shop_id=@shopId AND product_id=@productId AND date>=@from AND date<=@to ORDER BY date`)
    .all({ shopId, productId, from, to }) as Array<Record<string, unknown>>
}

// ---------- 退款分析（三档，窗口=退款完结时间） ----------
export interface RefundTier {
  count: number
  fen: number
}

export interface RefundBlock {
  total: RefundTier
  wf: RefundTier
  jr: RefundTier
  rt: RefundTier
  other: RefundTier
  byProduct: Array<{ productId: string | null; productTitle: string | null; count: number; fen: number; wf: RefundTier; jr: RefundTier; rt: RefundTier }>
  recent: Array<{ orderNo: string; productTitle: string | null; fen: number; finishDate: string; reason: string | null; afterSaleType: string | null; goodsStatus: string | null }>
}

const RF_DATE = `substr(refund_finish_time,1,10)`

export function refundBlock(db: AppDatabase, shopId: number, from: string, to: string, limit = 6): RefundBlock {
  // 单次扫描同时算总量与三档（10 万行性能：避免 4 次全表扫描）
  const agg = db.raw
    .prepare(`SELECT COUNT(*) AS n, COALESCE(SUM(refund_amount_fen),0) AS fen,
      COALESCE(SUM(CASE WHEN after_sale_type='仅退款' AND goods_status='未发货' THEN 1 ELSE 0 END),0) AS wfN,
      COALESCE(SUM(CASE WHEN after_sale_type='仅退款' AND goods_status='未发货' THEN refund_amount_fen ELSE 0 END),0) AS wfF,
      COALESCE(SUM(CASE WHEN after_sale_type='仅退款' AND goods_status<>'未发货' THEN 1 ELSE 0 END),0) AS jrN,
      COALESCE(SUM(CASE WHEN after_sale_type='仅退款' AND goods_status<>'未发货' THEN refund_amount_fen ELSE 0 END),0) AS jrF,
      COALESCE(SUM(CASE WHEN after_sale_type='退货退款' THEN 1 ELSE 0 END),0) AS rtN,
      COALESCE(SUM(CASE WHEN after_sale_type='退货退款' THEN refund_amount_fen ELSE 0 END),0) AS rtF
      FROM refund_orders WHERE shop_id=@shopId AND ${RF_DATE}>=@from AND ${RF_DATE}<=@to`)
    .get({ shopId, from, to }) as Record<string, number>
  const total: RefundTier = { count: agg.n, fen: agg.fen }
  const wf: RefundTier = { count: agg.wfN, fen: agg.wfF }
  const jr: RefundTier = { count: agg.jrN, fen: agg.jrF }
  const rt: RefundTier = { count: agg.rtN, fen: agg.rtF }
  const other: RefundTier = { count: total.count - wf.count - jr.count - rt.count, fen: total.fen - wf.fen - jr.fen - rt.fen }
  const rows = db.raw
    .prepare(`SELECT product_id AS productId, MAX(product_title) AS productTitle, COUNT(*) AS count, COALESCE(SUM(refund_amount_fen),0) AS fen,
      COALESCE(SUM(CASE WHEN after_sale_type='仅退款' AND goods_status='未发货' THEN 1 ELSE 0 END),0) AS wfN,
      COALESCE(SUM(CASE WHEN after_sale_type='仅退款' AND goods_status='未发货' THEN refund_amount_fen ELSE 0 END),0) AS wfF,
      COALESCE(SUM(CASE WHEN after_sale_type='仅退款' AND goods_status<>'未发货' THEN 1 ELSE 0 END),0) AS jrN,
      COALESCE(SUM(CASE WHEN after_sale_type='仅退款' AND goods_status<>'未发货' THEN refund_amount_fen ELSE 0 END),0) AS jrF,
      COALESCE(SUM(CASE WHEN after_sale_type='退货退款' THEN 1 ELSE 0 END),0) AS rtN,
      COALESCE(SUM(CASE WHEN after_sale_type='退货退款' THEN refund_amount_fen ELSE 0 END),0) AS rtF
      FROM refund_orders WHERE shop_id=@shopId AND ${RF_DATE}>=@from AND ${RF_DATE}<=@to
      GROUP BY product_id ORDER BY fen DESC LIMIT @limit`)
    .all({ shopId, from, to, limit }) as Array<{ productId: string | null; productTitle: string | null; count: number; fen: number; wfN: number; wfF: number; jrN: number; jrF: number; rtN: number; rtF: number }>
  const byProduct = rows.map((r) => ({
    productId: r.productId, productTitle: r.productTitle, count: r.count, fen: r.fen,
    wf: { count: r.wfN, fen: r.wfF }, jr: { count: r.jrN, fen: r.jrF }, rt: { count: r.rtN, fen: r.rtF }
  }))
  const recent = db.raw
    .prepare(`SELECT order_no AS orderNo, product_title AS productTitle, refund_amount_fen AS fen, substr(refund_finish_time,1,10) AS finishDate,
      refund_reason AS reason, after_sale_type AS afterSaleType, goods_status AS goodsStatus
      FROM refund_orders WHERE shop_id=@shopId AND ${RF_DATE}>=@from AND ${RF_DATE}<=@to
      ORDER BY refund_finish_time DESC LIMIT 8`)
    .all({ shopId, from, to }) as Array<{ orderNo: string; productTitle: string | null; fen: number; finishDate: string; reason: string | null; afterSaleType: string | null; goodsStatus: string | null }>
  return { total, wf, jr, rt, other, byProduct, recent }
}

// ---------- 推广分析 ----------
export interface PromoEntity {
  adEntityId: string
  adEntityName: string | null
  impressions: number
  clicks: number
  costFen: number
  ctr: number | null
  netRoi: number | null
  payAmountFen: number
  salesCount: number
  payRate: number | null
}

/** 净ROI = 直接成交金额 ÷ 花费（领导口径 05：不用平台 roas；花费=0 → null 显示 --） */
export function netRoiOf(payAmountFen: number | null | undefined, costFen: number | null | undefined): number | null {
  const pay = Number(payAmountFen) || 0
  const cost = Number(costFen) || 0
  return cost > 0 ? pay / cost : null
}

export function promoBlock(db: AppDatabase, shopId: number, from: string, to: string, limit = 6): { totals: PromoEntity; entities: PromoEntity[] } {
  const rows = db.raw
    .prepare(`SELECT ad_entity_id AS adEntityId, MAX(ad_entity_name) AS adEntityName,
      COALESCE(SUM(impressions),0) AS impressions, COALESCE(SUM(clicks),0) AS clicks, COALESCE(SUM(cost_fen),0) AS costFen,
      COALESCE(SUM(ctr*impressions),0) AS ctrW,
      COALESCE(SUM(pay_amount_fen),0) AS payAmountFen, COALESCE(SUM(sales_count),0) AS salesCount,
      COALESCE(SUM(pay_rate*clicks),0) AS payRateW
      FROM promo_daily WHERE shop_id=@shopId AND date>=@from AND date<=@to
      GROUP BY ad_entity_id ORDER BY costFen DESC`)
    .all({ shopId, from, to }) as Array<Record<string, unknown>>
  const map = (r: Record<string, unknown>): PromoEntity => {
    const costFen = Number(r.costFen) || 0
    return {
      adEntityId: String(r.adEntityId), adEntityName: r.adEntityName == null ? null : String(r.adEntityName),
      impressions: Number(r.impressions) || 0, clicks: Number(r.clicks) || 0, costFen,
      ctr: weightedAvg(Number(r.ctrW) || 0, Number(r.impressions) || 0),
      netRoi: netRoiOf(Number(r.payAmountFen) || 0, costFen),
      payAmountFen: Number(r.payAmountFen) || 0, salesCount: Number(r.salesCount) || 0,
      payRate: weightedAvg(Number(r.payRateW) || 0, Number(r.clicks) || 0)
    }
  }
  const totals = { impressions: 0, clicks: 0, costFen: 0, ctrW: 0, payAmountFen: 0, salesCount: 0, payRateW: 0 }
  for (const r of rows) {
    totals.impressions += Number(r.impressions) || 0
    totals.clicks += Number(r.clicks) || 0
    totals.costFen += Number(r.costFen) || 0
    totals.ctrW += Number(r.ctrW) || 0
    totals.payAmountFen += Number(r.payAmountFen) || 0
    totals.salesCount += Number(r.salesCount) || 0
    totals.payRateW += Number(r.payRateW) || 0
  }
  return {
    totals: { adEntityId: 'ALL', adEntityName: null, impressions: totals.impressions, clicks: totals.clicks, costFen: totals.costFen, ctr: weightedAvg(totals.ctrW, totals.impressions), netRoi: netRoiOf(totals.payAmountFen, totals.costFen), payAmountFen: totals.payAmountFen, salesCount: totals.salesCount, payRate: weightedAvg(totals.payRateW, totals.clicks) },
    entities: rows.slice(0, limit).map(map)
  }
}

// ---------- 推广明细（05：商品报表按主体，花费>0 取 TOP，banner 由前端对 top 求和；净ROI=直接成交金额÷花费） ----------
export interface PromoDetailRow {
  adEntityId: string
  adEntityName: string | null
  impressions: number
  clicks: number
  costFen: number
  ctr: number | null
  netRoi: number | null
  payAmountFen: number
  salesCount: number
  payRate: number | null
}

export function promoDetail(db: AppDatabase, shopId: number, from: string, to: string, limit = 12): PromoDetailRow[] {
  const rows = db.raw
    .prepare(`SELECT ad_entity_id AS adEntityId, ad_entity_name AS adEntityName, impressions, clicks, cost_fen AS costFen,
      ctr, pay_amount_fen AS payAmountFen, sales_count AS salesCount, pay_rate AS payRate
      FROM promo_daily WHERE shop_id=@shopId AND date>=@from AND date<=@to AND cost_fen>0
      ORDER BY cost_fen DESC LIMIT @limit`)
    .all({ shopId, from, to, limit }) as Array<Record<string, unknown>>
  return rows.map((r) => ({
    adEntityId: String(r.adEntityId), adEntityName: r.adEntityName == null ? null : String(r.adEntityName),
    impressions: Number(r.impressions) || 0, clicks: Number(r.clicks) || 0, costFen: Number(r.costFen) || 0,
    ctr: r.ctr == null ? null : Number(r.ctr),
    netRoi: netRoiOf(Number(r.payAmountFen) || 0, Number(r.costFen) || 0),
    payAmountFen: Number(r.payAmountFen) || 0, salesCount: Number(r.salesCount) || 0,
    payRate: r.payRate == null ? null : Number(r.payRate)
  }))
}

// ---------- 推广按商品日花费（04 商品卡推广费口径：商品报表同主体ID=商品ID 花费相加，日=当日 SUM、窗口=窗口 SUM） ----------
export function promoDailyByProduct(db: AppDatabase, shopId: number, productId: string, from: string, to: string): Array<{ date: string; costFen: number }> {
  return db.raw
    .prepare(`SELECT date, COALESCE(SUM(cost_fen),0) AS costFen FROM promo_daily
      WHERE shop_id=@shopId AND ad_entity_id=@productId AND date>=@from AND date<=@to
      GROUP BY date ORDER BY date`)
    .all({ shopId, productId, from, to }) as Array<{ date: string; costFen: number }>
}

/** 批量版：一次 IPC 取窗口内全部商品（BpProducts 免逐品 N+1） */
export function promoDailyByProducts(db: AppDatabase, shopId: number, productIds: string[], from: string, to: string): Record<string, Array<{ date: string; costFen: number }>> {
  const out: Record<string, Array<{ date: string; costFen: number }>> = {}
  for (const pid of productIds) {
    if (!pid) continue
    out[pid] = promoDailyByProduct(db, shopId, pid, from, to)
  }
  return out
}

// ---------- 商品咨询 TOP（蓝本 08：最近一日快照） ----------
export function consultTop(db: AppDatabase, shopId: number, date: string, limit = 10): { total: number; sum: number; rows: Array<{ productId: string; productName: string | null; consultCount: number }> } {
  const agg = db.raw.prepare(`SELECT COUNT(*) AS n, COALESCE(SUM(consult_count),0) AS s FROM product_daily WHERE shop_id=? AND date=? AND consult_count>0`).get(shopId, date) as { n: number; s: number }
  const rows = db.raw
    .prepare(`SELECT product_id AS productId, MAX(product_name) AS productName, COALESCE(SUM(consult_count),0) AS consultCount
      FROM product_daily WHERE shop_id=? AND date=? AND consult_count>0 GROUP BY product_id ORDER BY consultCount DESC LIMIT ?`)
    .all(shopId, date, limit) as Array<{ productId: string; productName: string | null; consultCount: number }>
  return { total: agg.n, sum: agg.s, rows }
}

// ---------- 退款明细行（蓝本 06 订单表：窗口内完结，含三档归类字段） ----------
export function refundRows(db: AppDatabase, shopId: number, from: string, to: string, limit = 600): Array<Record<string, unknown>> {
  return db.raw
    .prepare(`SELECT order_no AS orderNo, refund_no AS refundNo, product_id AS productId, product_title AS productTitle,
      refund_amount_fen AS fen, buyer_pay_amount_fen AS buyerPayFen, substr(refund_finish_time,1,10) AS finishDate,
      substr(payment_time,1,10) AS paymentTime, after_sale_type AS afterSaleType, goods_status AS goodsStatus, refund_reason AS reason
      FROM refund_orders WHERE shop_id=? AND ${RF_DATE}>=? AND ${RF_DATE}<=? ORDER BY refund_finish_time DESC LIMIT ?`)
    .all(shopId, from, to, limit) as Array<Record<string, unknown>>
}

// ---------- 商品动销计数（蓝本 04 副标题：动销/总商品） ----------
export function productCounts(db: AppDatabase, shopId: number, from: string, to: string): { total: number; sold: number } {
  const agg = db.raw
    .prepare(`SELECT COUNT(DISTINCT product_id) AS total,
      COUNT(DISTINCT CASE WHEN pay_amount_fen>0 THEN product_id END) AS sold
      FROM product_daily WHERE shop_id=? AND date>=? AND date<=?`).get(shopId, from, to) as { total: number; sold: number }
  return { total: agg.total, sold: agg.sold }
}

// ---------- 客服绩效 ----------
export function csBlock(db: AppDatabase, shopId: number, from: string, to: string): Array<Record<string, unknown>> {
  return db.raw
    .prepare(`SELECT date, staff_name AS staffName, inquiry_final_pay_count AS inquiryFinalPayCount, inquiry_count AS inquiryCount,
      inquiry_final_pay_rate AS inquiryFinalPayRate, first_response_seconds AS firstResponseSeconds,
      avg_response_seconds AS avgResponseSeconds, satisfaction_rate AS satisfactionRate, reply_rate AS replyRate,
      inquiry_final_pay_amount_fen AS inquiryFinalPayAmountFen, refund_amount_fen AS refundAmountFen
      FROM cs_daily WHERE shop_id=@shopId AND date>=@from AND date<=@to ORDER BY inquiryFinalPayCount DESC`)
    .all({ shopId, from, to }) as Array<Record<string, unknown>>
}

export function csDates(db: AppDatabase, shopId: number, from: string, to: string): string[] {
  const rows = db.raw.prepare(`SELECT DISTINCT date FROM cs_daily WHERE shop_id=? AND date>=? AND date<=? ORDER BY date`).all(shopId, from, to) as Array<{ date: string }>
  return rows.map((r) => r.date)
}

// ---------- DSR（快照型） ----------
export function dsrBlock(db: AppDatabase, shopId: number, from: string, to: string): Record<string, unknown> {
  const daily = db.raw
    .prepare(`SELECT date, description_score AS descriptionScore, logistics_score AS logisticsScore, service_score AS serviceScore
      FROM dsr_daily WHERE shop_id=@shopId AND date>=@from AND date<=@to ORDER BY date DESC LIMIT 1`)
    .get({ shopId, from, to }) as Record<string, unknown> | undefined
  const snap = db.raw
    .prepare(`SELECT indicator, score, trend, industry_avg AS industryAvg, compare_text AS compareText, target, gap_text AS gapText
      FROM dsr_180d WHERE shop_id=@shopId ORDER BY snapshot_date DESC, id`)
    .all({ shopId }) as Array<Record<string, unknown>>
  const latestSnapDate = db.raw.prepare(`SELECT MAX(snapshot_date) AS d FROM dsr_180d WHERE shop_id=?`).get(shopId) as { d: string | null }
  return { daily: daily ?? null, snapshot: snap, snapshotDate: latestSnapDate.d }
}

// ---------- 搜索词 ----------
export function keywordBlock(db: AppDatabase, shopId: number, from: string, to: string, limit = 10): Record<string, unknown> {
  const totals = db.raw
    .prepare(`SELECT COALESCE(SUM(visitors),0) AS visitors, COALESCE(SUM(pay_buyer_count),0) AS payBuyerCount,
      COALESCE(SUM(pay_amount_fen),0) AS payAmountFen, COALESCE(SUM(uv_value_fen),0) AS uvValueFen
      FROM search_keywords WHERE shop_id=@shopId AND date>=@from AND date<=@to`)
    .get({ shopId, from, to }) as Record<string, unknown>
  const top = db.raw
    .prepare(`SELECT keyword, COALESCE(SUM(visitors),0) AS visitors, COALESCE(SUM(pay_buyer_count),0) AS payBuyerCount,
      COALESCE(SUM(pay_amount_fen),0) AS payAmountFen, COALESCE(SUM(uv_value_fen),0) AS uvValueFen,
      MAX(pay_rate) AS payRate
      FROM search_keywords WHERE shop_id=@shopId AND date>=@from AND date<=@to
      GROUP BY keyword ORDER BY visitors DESC LIMIT @limit`)
    .all({ shopId, from, to, limit }) as Array<Record<string, unknown>>
  const dates = (db.raw.prepare(`SELECT DISTINCT date FROM search_keywords WHERE shop_id=? AND date>=? AND date<=? ORDER BY date`).all(shopId, from, to) as Array<{ date: string }>).map((r) => r.date)
  return { totals, top, dates }
}

// ---------- 覆盖天数与缺口 ----------
export interface SourceCoverage {
  key: string
  label: string
  snapshot: boolean
  expectedDays: number
  coveredDays: number
  dates: string[]
  lastDate: string | null
}

function dateList(db: AppDatabase, table: string, col: string, shopId: number, from: string, to: string): string[] {
  const rows = db.raw.prepare(`SELECT DISTINCT ${col} AS d FROM ${table} WHERE shop_id=? AND ${col}>=? AND ${col}<=? ORDER BY ${col}`).all(shopId, from, to) as Array<{ d: string }>
  return rows.map((r) => String(r.d))
}

export function coverage(db: AppDatabase, shopId: number, from: string, to: string, windowDays: number): SourceCoverage[] {
  const defs: Array<{ key: string; label: string; snapshot: boolean; dates: string[] }> = [
    { key: 'daily', label: '经营', snapshot: false, dates: dateList(db, 'daily_metrics', 'date', shopId, from, to) },
    { key: 'product', label: '商品', snapshot: true, dates: dateList(db, 'product_daily', 'date', shopId, from, to) },
    { key: 'promo', label: '推广', snapshot: true, dates: dateList(db, 'promo_daily', 'date', shopId, from, to) },
    { key: 'refund', label: '退款', snapshot: false, dates: dateList(db, 'refund_orders', 'substr(refund_finish_time,1,10)', shopId, from, to) },
    { key: 'cs', label: '客服', snapshot: true, dates: dateList(db, 'cs_daily', 'date', shopId, from, to) },
    { key: 'keyword', label: '搜索词', snapshot: true, dates: dateList(db, 'search_keywords', 'date', shopId, from, to) },
    { key: 'dsr', label: 'DSR', snapshot: true, dates: dateList(db, 'dsr_daily', 'date', shopId, from, to) }
  ]
  return defs.map((d) => {
    const last = (db.raw.prepare(`SELECT MAX(${d.key === 'refund' ? RF_DATE : 'date'}) AS d FROM ${d.key === 'refund' ? 'refund_orders' : { daily: 'daily_metrics', product: 'product_daily', promo: 'promo_daily', cs: 'cs_daily', keyword: 'search_keywords', dsr: 'dsr_daily' }[d.key as string]} WHERE shop_id=?`).get(shopId) as { d: string | null }).d
    return { key: d.key, label: d.label, snapshot: d.snapshot, expectedDays: d.snapshot ? 1 : windowDays, coveredDays: d.dates.length, dates: d.dates, lastDate: last }
  })
}

/** 昨日缺口：某源最近数据日期 < 昨日 → 缺（返回缺失源与最近日期） */
export function yesterdayGaps(db: AppDatabase, shopId: number, yesterday: string): Array<{ key: string; label: string; lastDate: string | null }> {
  const cov = coverage(db, shopId, shiftDate(yesterday, -365), yesterday, 1)
  return cov.filter((c) => !c.lastDate || c.lastDate < yesterday).map((c) => ({ key: c.key, label: c.label, lastDate: c.lastDate }))
}

// ---------- 店铺对比 ----------
export interface CompareRow {
  key: string
  label: string
  values: Array<{ shopId: number; shopName: string; value: number | null; display: string }>
}

export function shopCompare(db: AppDatabase, shopIds: number[], from: string, to: string): { shops: Array<{ id: number; name: string }>; rows: CompareRow[] } {
  const shops = (db.raw.prepare(`SELECT id, name FROM shops WHERE id IN (${shopIds.map(() => '?').join(',')}) ORDER BY id`).all(...shopIds) as Array<{ id: number; name: string }>)
  const labels: Array<{ key: string; label: string; fmt: 'yuan' | 'count' | 'ratio' | 'roi' }> = [
    { key: 'payAmountFen', label: '支付金额', fmt: 'yuan' },
    { key: 'netSalesFen', label: '净销售额', fmt: 'yuan' },
    { key: 'profitFen', label: '利润', fmt: 'yuan' },
    { key: 'refundAmountFen', label: '退款金额', fmt: 'yuan' },
    { key: 'promoCostFen', label: '推广花费', fmt: 'yuan' },
    { key: 'roi', label: '投入产出比(ROI)', fmt: 'roi' },
    { key: 'payRate', label: '支付转化率', fmt: 'ratio' },
    { key: 'visitors', label: '访客数', fmt: 'count' }
  ]
  const rows: CompareRow[] = labels.map((l) => ({ key: l.key, label: l.label, values: [] }))
  for (const s of shops) {
    const k = kpiTotals(db, s.id, from, to)
    const vals: Array<number | null> = [k.payAmountFen, k.netSalesFen, k.profitFen, k.refundAmountFen, k.promoCostFen, k.roi, k.payRate, k.visitors]
    rows.forEach((r, i) => {
      const v = vals[i]
      const display = v == null ? '--' : lfmt(labels[i].fmt, v)
      r.values.push({ shopId: s.id, shopName: s.name, value: v, display })
    })
  }
  return { shops, rows }
}

function lfmt(fmt: string, v: number): string {
  if (fmt === 'yuan') return `¥${(v / 100).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  if (fmt === 'count') return v.toLocaleString('zh-CN')
  if (fmt === 'ratio') return `${(v * 100).toFixed(2)}%`
  return v.toFixed(2)
}

// ---------- 月度目标 ----------

// ---------- 月度汇总（任务4B 复刻蓝本 02 KPI：当月汇总 + 最近一天，口径=经营源「销售单数(支付)」） ----------
export interface MonthAgg {
  days: number
  payAmountFen: number
  netSalesFen: number
  profitFen: number
  visitors: number
  salesCount: number
  refundAmountFen: number
  promoCostFen: number
  up: number
  dn: number
  rr: number | null
  pr: number | null
  cv: number | null
}

export interface MonthBlock {
  ym: string
  covered: number
  total: number
  agg: MonthAgg
  last: MonthAgg | null
  lastDate: string | null
}

export function monthBlock(db: AppDatabase, shopId: number, today = todayStr()): MonthBlock {
  const ym = today.slice(0, 7)
  const monthStart = `${ym}-01`
  const rows = db.raw
    .prepare(`SELECT date, pay_amount_fen AS payAmountFen, net_sales_fen AS netSalesFen, profit_fen AS profitFen,
      visitors, sales_count AS salesCount, refund_amount_fen AS refundAmountFen, promo_cost_fen AS promoCostFen
      FROM daily_metrics WHERE shop_id=@shopId AND date>=@monthStart AND date<=@today ORDER BY date`)
    .all({ shopId, monthStart, today }) as Array<Record<string, unknown>>
  const make = (list: Array<Record<string, unknown>>): MonthAgg => {
    const a: MonthAgg = { days: list.length, payAmountFen: 0, netSalesFen: 0, profitFen: 0, visitors: 0, salesCount: 0, refundAmountFen: 0, promoCostFen: 0, up: 0, dn: 0, rr: null, pr: null, cv: null }
    for (const r of list) {
      const pay = Number(r.payAmountFen) || 0
      a.payAmountFen += pay
      a.netSalesFen += Number(r.netSalesFen) || 0
      a.profitFen += Number(r.profitFen) || 0
      a.visitors += Number(r.visitors) || 0
      a.salesCount += Number(r.salesCount) || 0
      a.refundAmountFen += Number(r.refundAmountFen) || 0
      a.promoCostFen += Number(r.promoCostFen) || 0
      if ((Number(r.profitFen) || 0) >= 0) a.up++; else a.dn++
    }
    a.rr = a.payAmountFen > 0 ? a.refundAmountFen / a.payAmountFen : null
    a.pr = a.payAmountFen > 0 ? a.profitFen / a.payAmountFen : null
    a.cv = a.visitors > 0 ? (a.salesCount / a.visitors) * 100 : null
    return a
  }
  const total = new Date(Number(ym.slice(0, 4)), Number(ym.slice(5, 7)), 0).getDate()
  const lastRow = rows.length ? rows[rows.length - 1] : null
  return {
    ym,
    covered: rows.length,
    total,
    agg: make(rows),
    last: lastRow ? make([lastRow]) : null,
    lastDate: lastRow ? String(lastRow.date) : null
  }
}

export function monthlyProgress(db: AppDatabase, shopId: number, today = todayStr()): { month: string; targetFen: number; payFen: number; monthDays: number; coveredDays: number; pct: number | null } {
  const month = today.slice(0, 7)
  const monthStart = `${month}-01`
  const targetRow = db.raw.prepare(`SELECT value FROM settings WHERE key='monthly_target_fen'`).get() as { value?: string } | undefined
  const targetFen = Number(targetRow?.value ?? '0') || 0
  const k = dailyKpi(db, shopId, monthStart, today)
  const monthDays = Number(today.slice(8)) // 本月已过的自然日（1 号起）
  return { month, targetFen, payFen: k.payAmountFen, monthDays, coveredDays: k.days, pct: targetFen > 0 ? k.payAmountFen / targetFen : null }
}
