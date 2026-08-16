// 看板 IPC（任务 4）：渲染层只走这里取聚合数据，不直接碰 SQL/文件
import { ipcMain } from 'electron'
import type { AppDatabase } from '../db/database'
import {
  consultTop, coverage, csBlock, csDates, dsrBlock, keywordBlock, kpiBlock, monthBlock, monthlyProgress,
  productCounts, productDailySeries, productTop, promoBlock, promoDailyByProducts, promoDetail, refundBlock, refundRows, shopCompare, todayStr,
  windowRange, yesterdayGaps
} from '../db/dashboard'
import type { WindowMode } from '../db/dashboard'
import { getSetting, setSetting } from '../db/repo'

interface DashboardOpts {
  shopId: number
  mode: WindowMode
  today?: string
}

export function registerDashboardIpc(getDb: () => AppDatabase): void {
  ipcMain.handle('dashboard:get', (_e, opts: DashboardOpts) => {
    const db = getDb()
    const shopId = Number(opts.shopId) || 0
    const today = opts.today || todayStr()
    const w = windowRange(opts.mode, today)
    const hasShop = db.raw.prepare('SELECT COUNT(*) n FROM shops').get() as { n: number }
    const hasData = shopId > 0 && ((db.raw.prepare('SELECT COUNT(*) n FROM daily_metrics WHERE shop_id=?').get(shopId) as { n: number }).n > 0 ||
      (db.raw.prepare('SELECT COUNT(*) n FROM refund_orders WHERE shop_id=?').get(shopId) as { n: number }).n > 0)
    const csDatesList = shopId > 0 ? csDates(db, shopId, w.start, w.end) : []
    const lastDayRow = shopId > 0 ? (db.raw.prepare('SELECT MAX(date) d FROM daily_metrics WHERE shop_id=?').get(shopId) as { d: string | null }) : null
    return {
      today,
      window: w,
      hasShop: hasShop.n > 0,
      hasData,
      kpi: shopId > 0 ? kpiBlock(db, shopId, w) : null,
      product: shopId > 0 ? productTop(db, shopId, w.start, w.end, 12) : [],
      promo: shopId > 0 ? promoBlock(db, shopId, w.start, w.end) : { totals: null, entities: [] },
      refund: shopId > 0 ? refundBlock(db, shopId, w.start, w.end, 8) : null,
      cs: shopId > 0 ? { dates: csDatesList, staff: csDatesList.length ? csBlock(db, shopId, w.start, w.end) : [] } : { dates: [], staff: [] },
      dsr: shopId > 0 ? dsrBlock(db, shopId, w.start, w.end) : { daily: null, snapshot: [], snapshotDate: null },
      keywords: shopId > 0 ? keywordBlock(db, shopId, w.start, w.end) : { totals: null, top: [], dates: [] },
      promoDetail: shopId > 0 ? promoDetail(db, shopId, w.start, w.end) : [],
      consult: shopId > 0 && lastDayRow?.d ? consultTop(db, shopId, lastDayRow.d) : { total: 0, sum: 0, rows: [] },
      refundRows: shopId > 0 ? refundRows(db, shopId, w.start, w.end) : [],
      productCounts: shopId > 0 ? productCounts(db, shopId, w.start, w.end) : { total: 0, sold: 0 },
      lastDay: lastDayRow?.d ?? null,
      coverage: shopId > 0 ? coverage(db, shopId, w.start, w.end, w.days) : [],
      gaps: shopId > 0 ? yesterdayGaps(db, shopId, windowRange('yesterday', today).end) : [],
      monthly: shopId > 0 ? monthlyProgress(db, shopId, today) : null,
      monthlyBlock: shopId > 0 ? monthBlock(db, shopId, today) : null
    }
  })

  // 趋势图点击某天：当天经营明细 + 当天商品 TOP + 当天退款汇总 + 当天推广
  ipcMain.handle('dashboard:day-detail', (_e, opts: { shopId: number; date: string }) => {
    const db = getDb()
    const { shopId, date } = opts
    const daily = db.raw.prepare(`SELECT date, pay_amount_fen AS payAmountFen, net_sales_fen AS netSalesFen, profit_fen AS profitFen,
      visitors, refund_amount_fen AS refundAmountFen, promo_cost_fen AS promoCostFen, pay_rate AS payRate
      FROM daily_metrics WHERE shop_id=? AND date=?`).get(shopId, date) ?? null
    const products = db.raw.prepare(`SELECT product_id AS productId, MAX(product_name) AS productName,
      COALESCE(SUM(pay_amount_fen),0) AS payAmountFen, COALESCE(SUM(refund_amount_fen),0) AS refundAmountFen,
      COALESCE(SUM(profit_fen),0) AS profitFen, COALESCE(SUM(sales_count),0) AS salesCount
      FROM product_daily WHERE shop_id=? AND date=? GROUP BY product_id ORDER BY payAmountFen DESC LIMIT 6`).all(shopId, date)
    const refund = db.raw.prepare(`SELECT COUNT(*) AS n, COALESCE(SUM(refund_amount_fen),0) AS fen
      FROM refund_orders WHERE shop_id=? AND substr(refund_finish_time,1,10)=?`).get(shopId, date)
    const promo = db.raw.prepare(`SELECT COALESCE(SUM(cost_fen),0) AS costFen, COALESCE(SUM(impressions),0) AS impressions,
      COALESCE(SUM(clicks),0) AS clicks FROM promo_daily WHERE shop_id=? AND date=?`).get(shopId, date)
    return { daily, products, refund, promo }
  })

  // 单品卡展开：单品每日序列 + 单品退款明细
  ipcMain.handle('dashboard:product-detail', (_e, opts: { shopId: number; productId: string; from: string; to: string }) => {
    const db = getDb()
    const { shopId, productId, from, to } = opts
    const series = productDailySeries(db, shopId, productId, from, to)
    const refunds = db.raw.prepare(`SELECT COUNT(*) AS n, COALESCE(SUM(refund_amount_fen),0) AS fen FROM refund_orders
      WHERE shop_id=? AND product_id=? AND substr(refund_finish_time,1,10)>=? AND substr(refund_finish_time,1,10)<=?`).get(shopId, productId, from, to)
    const rows = db.raw.prepare(`SELECT order_no AS orderNo, refund_no AS refundNo, refund_amount_fen AS fen, buyer_pay_amount_fen AS buyerPayFen, substr(refund_finish_time,1,10) AS finishDate,
      substr(payment_time,1,10) AS paymentTime, after_sale_type AS afterSaleType, goods_status AS goodsStatus, refund_reason AS reason
      FROM refund_orders WHERE shop_id=? AND product_id=? AND substr(refund_finish_time,1,10)>=? AND substr(refund_finish_time,1,10)<=?
      ORDER BY refund_finish_time DESC LIMIT 80`).all(shopId, productId, from, to)
    return { series, refunds, rows }
  })

  ipcMain.handle('dashboard:compare', (_e, opts: { shopIds: number[]; mode: WindowMode; today?: string }) => {
    const db = getDb()
    const today = opts.today || todayStr()
    const w = windowRange(opts.mode, today)
    const ids = (opts.shopIds ?? []).filter((n) => Number(n) > 0)
    if (ids.length < 2) return { shops: [], rows: [], window: w, enough: false }
    return { ...shopCompare(db, ids, w.start, w.end), window: w, enough: true }
  })

  // 04 商品卡推广费口径：窗口内批量取各商品 promo_daily 按日 SUM(cost_fen)
  ipcMain.handle('dashboard:promo-daily-by-products', (_e, opts: { shopId: number; productIds: string[]; from: string; to: string }) => {
    const db = getDb()
    const shopId = Number(opts.shopId) || 0
    const ids = Array.isArray(opts.productIds) ? opts.productIds.map((x) => String(x)) : []
    if (shopId <= 0 || !ids.length) return {}
    return promoDailyByProducts(db, shopId, ids, String(opts.from ?? ''), String(opts.to ?? ''))
  })

  // 设置（数据库 settings 表）：月度目标等个性化项
  ipcMain.handle('setting:get', (_e, key: string) => getSetting(getDb(), key))
  ipcMain.handle('setting:set', (_e, key: string, value: string) => {
    setSetting(getDb(), key, value)
    return getSetting(getDb(), key)
  })
}
