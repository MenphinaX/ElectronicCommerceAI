// 数据仓库：唯一查询/写入入口（主进程内部使用；渲染层走 IPC，不直接碰库）
import type { AppDatabase } from './database'
import { isDate, isTimestamp, nowTimestamp } from './units'

export interface DailyMetricRow {
  shopId: number
  date: string
  payAmountFen: number
  netSalesFen: number
  profitFen: number
  visitors: number
  salesCount?: number
  refundAmountFen: number
  promoCostFen: number
  payRate?: number | null
}

export interface ProductDailyRow {
  shopId: number
  productId: string
  date: string
  productName?: string | null
  visitors?: number
  searchGuideVisitors?: number | null
  pageViews?: number
  payAmountFen?: number
  refundAmountFen?: number
  promoCostFen?: number
  profitFen?: number
  netSalesFen?: number
  salesCount?: number
  consultCount?: number
  payRate?: number | null
}

export interface PromoDailyRow {
  shopId: number
  date: string
  adEntityId: string
  adEntityName?: string | null
  impressions?: number
  clicks?: number
  costFen?: number
  ctr?: number | null
  roas?: number | null
  payAmountFen?: number
  salesCount?: number
  payRate?: number | null
}

export interface RefundOrderRow {
  shopId: number
  orderNo: string
  refundNo: string
  productId?: string | null
  productTitle?: string | null
  refundAmountFen?: number
  buyerPayAmountFen?: number
  refundStatus?: string | null
  goodsStatus?: string | null
  afterSaleType?: string | null
  paymentTime?: string | null
  refundFinishTime?: string | null
  refundApplyTime?: string | null
  refundReason?: string | null
}

export interface CsDailyRow {
  shopId: number
  date: string
  staffName: string
  inquiryFinalPayCount?: number
  inquiryCount?: number
  inquiryFinalPayRate?: number | null
  firstResponseSeconds?: number | null
  avgResponseSeconds?: number | null
  satisfactionRate?: number | null
  replyRate?: number | null
  inquiryFinalPayAmountFen?: number
  refundAmountFen?: number
}

export interface SearchKeywordRow {
  shopId: number
  date: string
  keyword: string
  visitors?: number
  cartAddCount?: number
  favoriteCount?: number
  payBuyerCount?: number
  payRate?: number | null
  payAmountFen?: number
  unitPriceFen?: number | null
  uvValueFen?: number | null
}

export interface DsrDailyRow {
  shopId: number
  date: string
  descriptionScore?: number | null
  logisticsScore?: number | null
  serviceScore?: number | null
}

export interface Dsr180dRow {
  shopId: number
  snapshotDate: string
  indicator: string
  score?: number | null
  trend?: string | null
  industryAvg?: number | null
  compareText?: string | null
  target?: number | null
  gapText?: string | null
}

function assertDate(v: string, field: string): void {
  if (!isDate(v)) throw new Error(`${field} 必须为 YYYY-MM-DD，收到：${v}`)
}

/** 可选参数统一补默认值，避免 better-sqlite3 报 Missing named parameter */
function withDefaults<T extends object>(row: T, defaults: Record<string, unknown>): Record<string, unknown> {
  return { ...defaults, ...row } as Record<string, unknown>
}

// ---------- settings ----------
export function getSetting(db: AppDatabase, key: string): string | null {
  const row = db.raw.prepare('SELECT value FROM settings WHERE key = ?').get(key) as { value: string } | undefined
  return row ? row.value : null
}

export function setSetting(db: AppDatabase, key: string, value: string): void {
  db.raw
    .prepare(
      `INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`
    )
    .run(key, value, nowTimestamp())
}

export function listSettings(db: AppDatabase): Record<string, string> {
  const rows = db.raw.prepare('SELECT key, value FROM settings ORDER BY key').all() as Array<{ key: string; value: string }>
  const out: Record<string, string> = {}
  for (const r of rows) out[r.key] = r.value
  return out
}

// ---------- shops ----------
export interface ShopRow {
  id: number
  name: string
  platform: string
  shopCode?: string | null
}

export function upsertShop(db: AppDatabase, row: { name: string; platform?: string; shopCode?: string | null }): number {
  const existing = db.raw.prepare('SELECT id FROM shops WHERE name = ?').get(row.name) as { id: number } | undefined
  if (existing) {
    db.raw
      .prepare(
        `UPDATE shops SET platform = COALESCE(?, platform), shop_code = COALESCE(?, shop_code), updated_at = ? WHERE id = ?`
      )
      .run(row.platform ?? null, row.shopCode ?? null, nowTimestamp(), existing.id)
    return existing.id
  }
  const info = db.raw
    .prepare('INSERT INTO shops (name, platform, shop_code) VALUES (?, ?, ?)')
    .run(row.name, row.platform ?? '天猫', row.shopCode ?? null)
  return Number(info.lastInsertRowid)
}

export function listShops(db: AppDatabase): ShopRow[] {
  return db.raw.prepare('SELECT id, name, platform, shop_code AS shopCode FROM shops ORDER BY id').all() as ShopRow[]
}

export function getShop(db: AppDatabase, id: number): ShopRow | null {
  return (db.raw.prepare('SELECT id, name, platform, shop_code AS shopCode FROM shops WHERE id = ?').get(id) as ShopRow) ?? null
}

// ---------- imports ----------
export interface ImportRow {
  shopId: number
  sourceType: string
  sourceFile: string
  rowCount?: number
  dateStart?: string | null
  dateEnd?: string | null
  fileHash?: string | null
  status?: string
  note?: string | null
  elapsedMs?: number
  fixLog?: string | null
  archivePath?: string | null
}

export function insertImport(db: AppDatabase, row: ImportRow): number {
  if (row.dateStart) assertDate(row.dateStart, 'dateStart')
  if (row.dateEnd) assertDate(row.dateEnd, 'dateEnd')
  const info = db.raw
    .prepare(
      `INSERT INTO imports (shop_id, source_type, source_file, row_count, date_start, date_end, file_hash, status, note)
       VALUES (@shopId, @sourceType, @sourceFile, @rowCount, @dateStart, @dateEnd, @fileHash, @status, @note)`
    )
    .run({
      shopId: row.shopId,
      sourceType: row.sourceType,
      sourceFile: row.sourceFile,
      rowCount: row.rowCount ?? 0,
      dateStart: row.dateStart ?? null,
      dateEnd: row.dateEnd ?? null,
      fileHash: row.fileHash ?? null,
      status: row.status ?? 'ok',
      note: row.note ?? null,
      elapsedMs: row.elapsedMs ?? 0,
      fixLog: row.fixLog ?? null,
      archivePath: row.archivePath ?? null
    })
  return Number(info.lastInsertRowid)
}

export function listImports(db: AppDatabase): Array<Record<string, unknown>> {
  return db.raw.prepare('SELECT * FROM imports ORDER BY id DESC').all() as Array<Record<string, unknown>>
}

export interface ImportHistoryRow {
  id: number
  shopId: number
  shopName: string
  sourceType: string
  sourceFile: string
  rowCount: number
  dateStart: string | null
  dateEnd: string | null
  fileHash: string | null
  status: string
  note: string | null
  fixLog: string | null
  elapsedMs: number
  archivePath: string | null
  importedAt: string
}

export function listImportsWithShop(db: AppDatabase): ImportHistoryRow[] {
  return db.raw
    .prepare(
      `SELECT i.id, i.shop_id AS shopId, COALESCE(s.name, '') AS shopName, i.source_type AS sourceType,
              i.source_file AS sourceFile, i.row_count AS rowCount, i.date_start AS dateStart, i.date_end AS dateEnd,
              i.file_hash AS fileHash, i.status, i.note, i.fix_log AS fixLog, i.elapsed_ms AS elapsedMs,
              i.archive_path AS archivePath, i.imported_at AS importedAt
       FROM imports i LEFT JOIN shops s ON s.id = i.shop_id ORDER BY i.id DESC LIMIT 500`
    )
    .all() as ImportHistoryRow[]
}

export function getImport(db: AppDatabase, id: number): ImportHistoryRow | null {
  return (db.raw
    .prepare(
      `SELECT i.id, i.shop_id AS shopId, COALESCE(s.name, '') AS shopName, i.source_type AS sourceType,
              i.source_file AS sourceFile, i.row_count AS rowCount, i.date_start AS dateStart, i.date_end AS dateEnd,
              i.file_hash AS fileHash, i.status, i.note, i.fix_log AS fixLog, i.elapsed_ms AS elapsedMs,
              i.archive_path AS archivePath, i.imported_at AS importedAt
       FROM imports i LEFT JOIN shops s ON s.id = i.shop_id WHERE i.id = ?`
    )
    .get(id) as ImportHistoryRow | undefined) ?? null
}

export function updateImportStatus(
  db: AppDatabase,
  id: number,
  patch: { status?: string; note?: string | null; fixLog?: string | null; rowCount?: number; elapsedMs?: number }
): void {
  db.raw
    .prepare(
      `UPDATE imports SET
        status = COALESCE(?, status),
        note = COALESCE(?, note),
        fix_log = COALESCE(?, fix_log),
        row_count = COALESCE(?, row_count),
        elapsed_ms = COALESCE(?, elapsed_ms)
       WHERE id = ?`
    )
    .run(patch.status ?? null, patch.note ?? null, patch.fixLog ?? null, patch.rowCount ?? null, patch.elapsedMs ?? null, id)
}

export function deleteImportRecord(db: AppDatabase, id: number): void {
  db.raw.prepare('DELETE FROM imports WHERE id = ?').run(id)
}

// ---------- 店铺 CRUD + 默认店铺（任务 3） ----------
export function updateShop(db: AppDatabase, id: number, patch: { name?: string; platform?: string; shopCode?: string | null }): void {
  db.raw
    .prepare('UPDATE shops SET name = COALESCE(?, name), platform = COALESCE(?, platform), shop_code = COALESCE(?, shop_code), updated_at = ? WHERE id = ?')
    .run(patch.name ?? null, patch.platform ?? null, patch.shopCode ?? null, nowTimestamp(), id)
}

export function deleteShop(db: AppDatabase, id: number): void {
  const hasData = db.raw
    .prepare(
      `SELECT (SELECT COUNT(*) FROM daily_metrics WHERE shop_id = ?) +
              (SELECT COUNT(*) FROM product_daily WHERE shop_id = ?) +
              (SELECT COUNT(*) FROM promo_daily WHERE shop_id = ?) +
              (SELECT COUNT(*) FROM refund_orders WHERE shop_id = ?) +
              (SELECT COUNT(*) FROM cs_daily WHERE shop_id = ?) +
              (SELECT COUNT(*) FROM search_keywords WHERE shop_id = ?) +
              (SELECT COUNT(*) FROM dsr_daily WHERE shop_id = ?) +
              (SELECT COUNT(*) FROM imports WHERE shop_id = ?) AS n`
    )
    .get(id, id, id, id, id, id, id, id) as { n: number }
  if (hasData.n > 0) {
    throw new Error('该店铺已有数据，禁止删除（可改名或改默认店铺）')
  }
  db.raw.prepare('DELETE FROM shops WHERE id = ?').run(id)
  const def = getDefaultShopId(db)
  if (def === id) setDefaultShopId(db, null)
}

export const DEFAULT_SHOP_KEY = 'default_shop_id'

export function getDefaultShopId(db: AppDatabase): number | null {
  const v = getSetting(db, DEFAULT_SHOP_KEY)
  const n = v ? Number(v) : NaN
  if (!Number.isInteger(n)) return null
  // 兜底：存储的默认店铺已不存在（旧库/重建残留）时回退到第一个店铺，避免看板与投产比带入空数据
  const exists = db.raw.prepare('SELECT 1 AS x FROM shops WHERE id = ?').get(n) as { x: number } | undefined
  if (exists) return n
  const first = db.raw.prepare('SELECT id FROM shops ORDER BY id LIMIT 1').get() as { id: number } | undefined
  return first ? first.id : null
}

export function setDefaultShopId(db: AppDatabase, id: number | null): void {
  setSetting(db, DEFAULT_SHOP_KEY, id === null ? '' : String(id))
}


// ---------- daily_metrics ----------
export function upsertDailyMetric(db: AppDatabase, row: DailyMetricRow): void {
  assertDate(row.date, 'date')
  db.raw
    .prepare(
      `INSERT INTO daily_metrics (shop_id, date, pay_amount_fen, net_sales_fen, profit_fen, visitors, sales_count, refund_amount_fen, promo_cost_fen, pay_rate)
       VALUES (@shopId, @date, @payAmountFen, @netSalesFen, @profitFen, @visitors, @salesCount, @refundAmountFen, @promoCostFen, @payRate)
       ON CONFLICT(shop_id, date) DO UPDATE SET
         pay_amount_fen = excluded.pay_amount_fen,
         net_sales_fen = excluded.net_sales_fen,
         profit_fen = excluded.profit_fen,
         visitors = excluded.visitors,
         sales_count = excluded.sales_count,
         refund_amount_fen = excluded.refund_amount_fen,
         promo_cost_fen = excluded.promo_cost_fen,
         pay_rate = excluded.pay_rate`
    )
    .run(withDefaults(row, { payRate: null, salesCount: 0 }))
}

export interface DailyKpi {
  days: number
  payAmountFen: number
  netSalesFen: number
  profitFen: number
  visitors: number
  salesCount: number
  refundAmountFen: number
  promoCostFen: number
}

/** 看板聚合 KPI（按店铺+日期范围，任务 4 复用） */
export function dailyKpi(db: AppDatabase, shopId: number, from?: string | null, to?: string | null): DailyKpi {
  let sql = `SELECT COUNT(*) AS days, COALESCE(SUM(pay_amount_fen),0) AS payAmountFen,
    COALESCE(SUM(net_sales_fen),0) AS netSalesFen, COALESCE(SUM(profit_fen),0) AS profitFen,
    COALESCE(SUM(visitors),0) AS visitors, COALESCE(SUM(sales_count),0) AS salesCount, COALESCE(SUM(refund_amount_fen),0) AS refundAmountFen,
    COALESCE(SUM(promo_cost_fen),0) AS promoCostFen
    FROM daily_metrics WHERE shop_id = @shopId`
  const params: Record<string, unknown> = { shopId }
  if (from) { sql += ' AND date >= @from'; params.from = from }
  if (to) { sql += ' AND date <= @to'; params.to = to }
  return db.raw.prepare(sql).get(params) as DailyKpi
}

export function listDailyMetrics(db: AppDatabase, shopId: number, from?: string | null, to?: string | null): Array<Record<string, unknown>> {
  let sql = 'SELECT * FROM daily_metrics WHERE shop_id = @shopId'
  const params: Record<string, unknown> = { shopId }
  if (from) { sql += ' AND date >= @from'; params.from = from }
  if (to) { sql += ' AND date <= @to'; params.to = to }
  sql += ' ORDER BY date'
  return db.raw.prepare(sql).all(params) as Array<Record<string, unknown>>
}

// ---------- product_daily ----------
export function upsertProductDaily(db: AppDatabase, row: ProductDailyRow): void {
  assertDate(row.date, 'date')
  // 多源合一语义：未提供的字段按「已有值不变/新行取默认 0」合并（COALESCE 按参数是否为 NULL 判断）
  db.raw
    .prepare(
      `INSERT INTO product_daily (shop_id, product_id, date, product_name, visitors, search_guide_visitors, page_views, pay_amount_fen,
         refund_amount_fen, promo_cost_fen, profit_fen, net_sales_fen, sales_count, consult_count, pay_rate)
       VALUES (@shopId, @productId, @date, COALESCE(@productName, NULL), COALESCE(@visitors, 0), COALESCE(@searchGuideVisitors, NULL),
         COALESCE(@pageViews, 0), COALESCE(@payAmountFen, 0), COALESCE(@refundAmountFen, 0),
         COALESCE(@promoCostFen, 0), COALESCE(@profitFen, 0), COALESCE(@netSalesFen, 0),
         COALESCE(@salesCount, 0), COALESCE(@consultCount, 0), COALESCE(@payRate, NULL))
       ON CONFLICT(shop_id, product_id, date) DO UPDATE SET
         product_name = COALESCE(@productName, product_daily.product_name),
         visitors = COALESCE(@visitors, product_daily.visitors),
         search_guide_visitors = COALESCE(@searchGuideVisitors, product_daily.search_guide_visitors),
         page_views = COALESCE(@pageViews, product_daily.page_views),
         pay_amount_fen = COALESCE(@payAmountFen, product_daily.pay_amount_fen),
         refund_amount_fen = COALESCE(@refundAmountFen, product_daily.refund_amount_fen),
         promo_cost_fen = COALESCE(@promoCostFen, product_daily.promo_cost_fen),
         profit_fen = COALESCE(@profitFen, product_daily.profit_fen),
         net_sales_fen = COALESCE(@netSalesFen, product_daily.net_sales_fen),
         sales_count = COALESCE(@salesCount, product_daily.sales_count),
         consult_count = COALESCE(@consultCount, product_daily.consult_count),
         pay_rate = COALESCE(@payRate, product_daily.pay_rate)`
    )
    .run(withDefaults(row, {
      productName: null, visitors: null, searchGuideVisitors: null, pageViews: null, payAmountFen: null, refundAmountFen: null,
      promoCostFen: null, profitFen: null, netSalesFen: null, salesCount: null, consultCount: null, payRate: null
    }))
}

// ---------- promo_daily ----------
export function upsertPromoDaily(db: AppDatabase, row: PromoDailyRow): void {
  assertDate(row.date, 'date')
  db.raw
    .prepare(
      `INSERT INTO promo_daily (shop_id, date, ad_entity_id, ad_entity_name, impressions, clicks, cost_fen, ctr, roas, pay_amount_fen, sales_count, pay_rate)
       VALUES (@shopId, @date, @adEntityId, @adEntityName, @impressions, @clicks, @costFen, @ctr, @roas, @payAmountFen, @salesCount, @payRate)
       ON CONFLICT(shop_id, date, ad_entity_id) DO UPDATE SET
         ad_entity_name = excluded.ad_entity_name,
         impressions = excluded.impressions,
         clicks = excluded.clicks,
         cost_fen = excluded.cost_fen,
         ctr = excluded.ctr,
         roas = excluded.roas,
         pay_amount_fen = excluded.pay_amount_fen,
         sales_count = excluded.sales_count,
         pay_rate = excluded.pay_rate`
    )
    .run(withDefaults(row, { adEntityName: null, impressions: 0, clicks: 0, costFen: 0, ctr: null, roas: null, payAmountFen: 0, salesCount: 0, payRate: null }))
}

// ---------- refund_orders ----------
export function insertRefundOrder(db: AppDatabase, row: RefundOrderRow): boolean {
  for (const f of ['paymentTime', 'refundFinishTime', 'refundApplyTime']) {
    const v = row[f as keyof RefundOrderRow]
    if (v && !isTimestamp(v as string)) throw new Error(`${f} 必须为 YYYY-MM-DD HH:MM:SS，收到：${v}`)
  }
  const info = db.raw
    .prepare(
      `INSERT OR IGNORE INTO refund_orders (shop_id, order_no, refund_no, product_id, product_title, refund_amount_fen,
         buyer_pay_amount_fen, refund_status, goods_status, after_sale_type, payment_time, refund_finish_time,
         refund_apply_time, refund_reason)
       VALUES (@shopId, @orderNo, @refundNo, @productId, @productTitle, @refundAmountFen,
         @buyerPayAmountFen, @refundStatus, @goodsStatus, @afterSaleType, @paymentTime, @refundFinishTime,
         @refundApplyTime, @refundReason)`
    )
    .run(withDefaults(row, {
      productId: null, productTitle: null, refundAmountFen: 0, buyerPayAmountFen: 0, refundStatus: null,
      goodsStatus: null, afterSaleType: null, paymentTime: null, refundFinishTime: null,
      refundApplyTime: null, refundReason: null
    }))
  return info.changes > 0
}

/** 退款聚合（按日），10 万行看板性能基线查询 */
export function refundDailySummary(db: AppDatabase, shopId: number, from?: string | null, to?: string | null): Array<Record<string, unknown>> {
  let sql = `SELECT substr(payment_time, 1, 10) AS date, COUNT(*) AS refundCount,
    COALESCE(SUM(refund_amount_fen), 0) AS refundAmountFen
    FROM refund_orders WHERE shop_id = @shopId`
  const params: Record<string, unknown> = { shopId }
  if (from) { sql += ' AND substr(payment_time,1,10) >= @from'; params.from = from }
  if (to) { sql += ' AND substr(payment_time,1,10) <= @to'; params.to = to }
  sql += ' GROUP BY substr(payment_time, 1, 10) ORDER BY date'
  return db.raw.prepare(sql).all(params) as Array<Record<string, unknown>>
}

// ---------- cs_daily ----------
export function upsertCsDaily(db: AppDatabase, row: CsDailyRow): void {
  assertDate(row.date, 'date')
  db.raw
    .prepare(
      `INSERT INTO cs_daily (shop_id, date, staff_name, inquiry_final_pay_count, inquiry_count, inquiry_final_pay_rate,
         first_response_seconds, avg_response_seconds, satisfaction_rate, reply_rate, inquiry_final_pay_amount_fen, refund_amount_fen)
       VALUES (@shopId, @date, @staffName, @inquiryFinalPayCount, @inquiryCount, @inquiryFinalPayRate,
         @firstResponseSeconds, @avgResponseSeconds, @satisfactionRate, @replyRate, @inquiryFinalPayAmountFen, @refundAmountFen)
       ON CONFLICT(shop_id, date, staff_name) DO UPDATE SET
         inquiry_final_pay_count = excluded.inquiry_final_pay_count,
         inquiry_count = excluded.inquiry_count,
         inquiry_final_pay_rate = excluded.inquiry_final_pay_rate,
         first_response_seconds = excluded.first_response_seconds,
         avg_response_seconds = excluded.avg_response_seconds,
         satisfaction_rate = excluded.satisfaction_rate,
         reply_rate = excluded.reply_rate,
         inquiry_final_pay_amount_fen = excluded.inquiry_final_pay_amount_fen,
         refund_amount_fen = excluded.refund_amount_fen`
    )
    .run(withDefaults(row, {
      inquiryFinalPayCount: 0, inquiryCount: 0, inquiryFinalPayRate: null, firstResponseSeconds: null,
      avgResponseSeconds: null, satisfactionRate: null, replyRate: null, inquiryFinalPayAmountFen: 0, refundAmountFen: 0
    }))
}

// ---------- search_keywords ----------
export function upsertSearchKeyword(db: AppDatabase, row: SearchKeywordRow): void {
  assertDate(row.date, 'date')
  db.raw
    .prepare(
      `INSERT INTO search_keywords (shop_id, date, keyword, visitors, cart_add_count, favorite_count, pay_buyer_count,
         pay_rate, pay_amount_fen, unit_price_fen, uv_value_fen)
       VALUES (@shopId, @date, @keyword, @visitors, @cartAddCount, @favoriteCount, @payBuyerCount,
         @payRate, @payAmountFen, @unitPriceFen, @uvValueFen)
       ON CONFLICT(shop_id, date, keyword) DO UPDATE SET
         visitors = excluded.visitors,
         cart_add_count = excluded.cart_add_count,
         favorite_count = excluded.favorite_count,
         pay_buyer_count = excluded.pay_buyer_count,
         pay_rate = excluded.pay_rate,
         pay_amount_fen = excluded.pay_amount_fen,
         unit_price_fen = excluded.unit_price_fen,
         uv_value_fen = excluded.uv_value_fen`
    )
    .run(withDefaults(row, {
      visitors: 0, cartAddCount: 0, favoriteCount: 0, payBuyerCount: 0, payRate: null,
      payAmountFen: 0, unitPriceFen: null, uvValueFen: null
    }))
}

// ---------- DSR ----------
export function upsertDsrDaily(db: AppDatabase, row: DsrDailyRow): void {
  assertDate(row.date, 'date')
  db.raw
    .prepare(
      `INSERT INTO dsr_daily (shop_id, date, description_score, logistics_score, service_score)
       VALUES (@shopId, @date, @descriptionScore, @logisticsScore, @serviceScore)
       ON CONFLICT(shop_id, date) DO UPDATE SET
         description_score = excluded.description_score,
         logistics_score = excluded.logistics_score,
         service_score = excluded.service_score`
    )
    .run(withDefaults(row, { descriptionScore: null, logisticsScore: null, serviceScore: null }))
}

export function upsertDsr180d(db: AppDatabase, row: Dsr180dRow): void {
  assertDate(row.snapshotDate, 'snapshotDate')
  db.raw
    .prepare(
      `INSERT INTO dsr_180d (shop_id, snapshot_date, indicator, score, trend, industry_avg, compare_text, target, gap_text)
       VALUES (@shopId, @snapshotDate, @indicator, @score, @trend, @industryAvg, @compareText, @target, @gapText)
       ON CONFLICT(shop_id, snapshot_date, indicator) DO UPDATE SET
         score = excluded.score, trend = excluded.trend, industry_avg = excluded.industry_avg,
         compare_text = excluded.compare_text, target = excluded.target, gap_text = excluded.gap_text`
    )
    .run(withDefaults(row, { score: null, trend: null, industryAvg: null, compareText: null, target: null, gapText: null }))
}

// ---------- models ----------
export interface ModelRow {
  name: string
  provider?: string
  baseUrl?: string | null
  apiKeyEnc?: string | null
  enabled?: boolean
  isDefault?: boolean
}

export function createModel(db: AppDatabase, row: ModelRow): number {
  const info = db.raw
    .prepare('INSERT INTO models (name, provider, base_url, api_key_enc, enabled) VALUES (?, ?, ?, ?, ?)')
    .run(row.name, row.provider ?? 'openai-compatible', row.baseUrl ?? null, row.apiKeyEnc ?? null, row.enabled === false ? 0 : 1)
  return Number(info.lastInsertRowid)
}

export function listModels(db: AppDatabase): Array<Record<string, unknown>> {
  return db.raw.prepare('SELECT id, name, provider, base_url AS baseUrl, api_key_enc AS apiKeyEnc, enabled, is_default AS isDefault, created_at AS createdAt, updated_at AS updatedAt FROM models ORDER BY id').all() as Array<Record<string, unknown>>
}

export interface ModelPatch {
  name?: string
  provider?: string
  baseUrl?: string | null
  apiKeyEnc?: string | null
  enabled?: boolean
}

export function updateModel(db: AppDatabase, id: number, patch: ModelPatch): boolean {
  const fields: string[] = []
  const args: unknown[] = []
  if (patch.name !== undefined) { fields.push('name = ?'); args.push(patch.name) }
  if (patch.provider !== undefined) { fields.push('provider = ?'); args.push(patch.provider) }
  if (patch.baseUrl !== undefined) { fields.push('base_url = ?'); args.push(patch.baseUrl ?? null) }
  if (patch.apiKeyEnc !== undefined) { fields.push('api_key_enc = ?'); args.push(patch.apiKeyEnc ?? null) }
  if (patch.enabled !== undefined) { fields.push('enabled = ?'); args.push(patch.enabled ? 1 : 0) }
  if (fields.length === 0) return false
  fields.push("updated_at = (datetime('now','localtime'))")
  const info = db.raw.prepare(`UPDATE models SET ${fields.join(', ')} WHERE id = ?`).run(...args, id)
  return info.changes > 0
}

export function deleteModel(db: AppDatabase, id: number): boolean {
  const info = db.raw.prepare('DELETE FROM models WHERE id = ?').run(id)
  return info.changes > 0
}

/** 设默认模型：先全清 is_default，再置指定 id（互斥；id=null 只清不设） */
export function setDefaultModel(db: AppDatabase, id: number | null): void {
  const run = db.raw.transaction(() => {
    db.raw.prepare('UPDATE models SET is_default = 0').run()
    if (id !== null) {
      db.raw.prepare(`UPDATE models SET is_default = 1, updated_at = (datetime('now','localtime')) WHERE id = ?`).run(id)
    }
  })
  run()
}

export function getDefaultModelId(db: AppDatabase): number | null {
  const row = db.raw.prepare('SELECT id FROM models WHERE is_default = 1 LIMIT 1').get() as { id: number } | undefined
  return row ? row.id : null
}

// ---------- conversations / messages ----------
export function createConversation(db: AppDatabase, shopId: number | null, title: string | null): number {
  const info = db.raw.prepare('INSERT INTO conversations (shop_id, title) VALUES (?, ?)').run(shopId, title)
  return Number(info.lastInsertRowid)
}

export interface ConversationRow {
  id: number
  shopId: number | null
  title: string | null
  createdAt: string
  updatedAt: string
  messageCount: number
  lastPreview: string | null
}

export function listConversations(db: AppDatabase, shopId?: number | null): ConversationRow[] {
  const sql = `SELECT c.id, c.shop_id AS shopId, c.title, c.created_at AS createdAt, c.updated_at AS updatedAt,
    (SELECT COUNT(*) FROM messages m WHERE m.conversation_id = c.id) AS messageCount,
    (SELECT content FROM messages m WHERE m.conversation_id = c.id ORDER BY m.id DESC LIMIT 1) AS lastPreview
    FROM conversations c${shopId ? ' WHERE c.shop_id = ?' : ''} ORDER BY c.updated_at DESC`
  const rows = shopId ? db.raw.prepare(sql).all(shopId) : db.raw.prepare(sql).all()
  return rows as ConversationRow[]
}

export function getConversation(db: AppDatabase, id: number): Record<string, unknown> | null {
  return (db.raw
    .prepare('SELECT id, shop_id AS shopId, title, created_at AS createdAt, updated_at AS updatedAt FROM conversations WHERE id = ?')
    .get(id) as Record<string, unknown>) ?? null
}

export function renameConversation(db: AppDatabase, id: number, title: string): void {
  db.raw.prepare('UPDATE conversations SET title = ?, updated_at = ? WHERE id = ?').run(title, nowTimestamp(), id)
}

export function deleteConversation(db: AppDatabase, id: number): void {
  db.raw.prepare('DELETE FROM conversations WHERE id = ?').run(id)
}

export function appendMessage(db: AppDatabase, conversationId: number, role: string, content: string, skillId: number | null = null): number {
  const info = db.raw
    .prepare('INSERT INTO messages (conversation_id, role, content, skill_id) VALUES (?, ?, ?, ?)')
    .run(conversationId, role, content, skillId)
  db.raw.prepare('UPDATE conversations SET updated_at = ? WHERE id = ?').run(nowTimestamp(), conversationId)
  return Number(info.lastInsertRowid)
}

export function listMessages(db: AppDatabase, conversationId: number): Array<Record<string, unknown>> {
  return db.raw
    .prepare(`SELECT m.id, m.role, m.content, m.skill_id AS skillId, s.name AS skillName, m.created_at AS createdAt
      FROM messages m LEFT JOIN skills s ON s.id = m.skill_id WHERE m.conversation_id = ? ORDER BY m.id`)
    .all(conversationId) as Array<Record<string, unknown>>
}

// ---------- reports ----------
export interface ReportRow {
  shopId: number
  type: string
  reportDate: string
  content?: string | null
  filePath?: string | null
}

export function insertReport(db: AppDatabase, row: ReportRow): number {
  assertDate(row.reportDate, 'reportDate')
  const info = db.raw
    .prepare('INSERT INTO reports (shop_id, type, report_date, content, file_path) VALUES (?, ?, ?, ?, ?)')
    .run(row.shopId, row.type, row.reportDate, row.content ?? null, row.filePath ?? null)
  return Number(info.lastInsertRowid)
}

// ---------- ai_analyses ----------
export interface AnalysisRow {
  shopId: number
  module: string
  date: string
  content: string
  sourceSkillId?: number | null
  model?: string | null
}

export function upsertAnalysis(db: AppDatabase, row: AnalysisRow): void {
  assertDate(row.date, 'date')
  db.raw
    .prepare(
      `INSERT INTO ai_analyses (shop_id, module, date, content, source_skill_id, model)
       VALUES (@shopId, @module, @date, @content, @sourceSkillId, @model)
       ON CONFLICT(shop_id, module, date) DO UPDATE SET
         content = excluded.content, source_skill_id = excluded.source_skill_id, model = excluded.model,
         created_at = excluded.created_at`
    )
    .run({ shopId: row.shopId, module: row.module, date: row.date, content: row.content, sourceSkillId: row.sourceSkillId ?? null, model: row.model ?? null })
}

export function getAnalysis(db: AppDatabase, shopId: number, module: string, date: string): Record<string, unknown> | null {
  return (db.raw
    .prepare('SELECT id, module, date, content, source_skill_id AS sourceSkillId, model, created_at AS createdAt FROM ai_analyses WHERE shop_id = ? AND module = ? AND date = ?')
    .get(shopId, module, date) as Record<string, unknown>) ?? null
}

export function listAnalysesForWindow(db: AppDatabase, shopId: number, date: string): Array<Record<string, unknown>> {
  return db.raw
    .prepare(`SELECT a.module, a.date, a.content, a.source_skill_id AS sourceSkillId, a.model, a.created_at AS createdAt, s.name AS skillName
      FROM ai_analyses a LEFT JOIN skills s ON s.id = a.source_skill_id
      WHERE a.shop_id = ? AND a.date = ?`)
    .all(shopId, date) as Array<Record<string, unknown>>
}

export function listAnalyses(db: AppDatabase, shopId: number, module: string): Array<Record<string, unknown>> {
  return db.raw
    .prepare('SELECT id, module, date, content, source_skill_id AS sourceSkillId, model, created_at AS createdAt FROM ai_analyses WHERE shop_id = ? AND module = ? ORDER BY date')
    .all(shopId, module) as Array<Record<string, unknown>>
}

// ---------- qa_runs（聊天质检历史） ----------
export interface QaRunRow {
  shopId?: number | null
  fileCount: number
  sessionCount: number
  agentCount?: number
  model?: string | null
  elapsedMs: number
  status: string
  report?: string | null
}

export function insertQaRun(db: AppDatabase, row: QaRunRow): number {
  const info = db.raw
    .prepare(`INSERT INTO qa_runs (shop_id, file_count, session_count, agent_count, model, elapsed_ms, status, report)
      VALUES (@shopId, @fileCount, @sessionCount, @agentCount, @model, @elapsedMs, @status, @report)`)
    .run({ shopId: row.shopId ?? null, fileCount: row.fileCount, sessionCount: row.sessionCount, agentCount: row.agentCount ?? 0, model: row.model ?? null, elapsedMs: row.elapsedMs, status: row.status, report: row.report ?? null })
  return Number(info.lastInsertRowid)
}

export function listQaRuns(db: AppDatabase, limit = 50): Array<Record<string, unknown>> {
  return db.raw
    .prepare('SELECT id, file_count AS fileCount, session_count AS sessionCount, agent_count AS agentCount, model, elapsed_ms AS elapsedMs, status, report, created_at AS createdAt FROM qa_runs ORDER BY id DESC LIMIT ?')
    .all(limit) as Array<Record<string, unknown>>
}

// ---------- skills / module_skills ----------
export function upsertSkill(db: AppDatabase, row: { name: string; description?: string | null; path: string; enabled?: boolean }): number {
  const info = db.raw
    .prepare(
      `INSERT INTO skills (name, description, path, enabled)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(name) DO UPDATE SET
         description = excluded.description, path = excluded.path, enabled = excluded.enabled, updated_at = (datetime('now','localtime'))`
    )
    .run(row.name, row.description ?? null, row.path, row.enabled === false ? 0 : 1)
  const got = db.raw.prepare('SELECT id FROM skills WHERE name = ?').get(row.name) as { id: number }
  return got.id
}

export function listSkills(db: AppDatabase): Array<Record<string, unknown>> {
  return db.raw.prepare('SELECT id, name, description, path, enabled, installed_at AS installedAt FROM skills ORDER BY id').all() as Array<Record<string, unknown>>
}

export function bindModuleSkill(db: AppDatabase, module: string, skillId: number, priority = 0): void {
  db.raw
    .prepare(
      `INSERT INTO module_skills (module, skill_id, priority) VALUES (?, ?, ?)
       ON CONFLICT(module, skill_id) DO UPDATE SET priority = excluded.priority`
    )
    .run(module, skillId, priority)
}

export function getSkill(db: AppDatabase, id: number): Record<string, unknown> | null {
  return (db.raw.prepare('SELECT id, name, description, path, enabled, installed_at AS installedAt, updated_at AS updatedAt FROM skills WHERE id = ?').get(id) as Record<string, unknown> | undefined) ?? null
}

export function deleteSkill(db: AppDatabase, id: number): boolean {
  const info = db.raw.prepare('DELETE FROM skills WHERE id = ?').run(id)
  return info.changes > 0
}

/** 模块绑定替换语义：某模块只保留一个绑定（null=解除）；模块不存在则插入 */
export function setModuleSkill(db: AppDatabase, module: string, skillId: number | null): void {
  const run = db.raw.transaction(() => {
    db.raw.prepare('DELETE FROM module_skills WHERE module = ?').run(module)
    if (skillId !== null) {
      db.raw.prepare('INSERT INTO module_skills (module, skill_id) VALUES (?, ?)').run(module, skillId)
    }
  })
  run()
}

export function unbindModuleSkill(db: AppDatabase, module: string): void {
  db.raw.prepare('DELETE FROM module_skills WHERE module = ?').run(module)
}

export function listModuleBindings(db: AppDatabase): Array<Record<string, unknown>> {
  return db.raw
    .prepare(
      `SELECT ms.module, ms.priority, ms.skill_id AS skillId, s.name AS skillName
       FROM module_skills ms JOIN skills s ON s.id = ms.skill_id
       ORDER BY ms.module, ms.priority DESC`
    )
    .all() as Array<Record<string, unknown>>
}

export function moduleSkills(db: AppDatabase, module: string): Array<Record<string, unknown>> {
  return db.raw
    .prepare(
      `SELECT ms.module, ms.priority, s.id AS skillId, s.name AS skillName, s.path AS skillPath
       FROM module_skills ms JOIN skills s ON s.id = ms.skill_id
       WHERE ms.module = ? ORDER BY ms.priority DESC`
    )
    .all(module) as Array<Record<string, unknown>>
}

// ---------- product_images 商品图片（任务 4A）：店铺ID+商品ID 绑定、替换删旧、按店铺列出 ----------
export interface ProductImageRow {
  shopId: number
  productId: string
  relPath: string
  origName: string | null
  sizeBytes: number
  width: number | null
  height: number | null
  updatedAt: string
}

export function upsertProductImage(
  db: AppDatabase,
  row: { shopId: number; productId: string; relPath: string; origName?: string | null; sizeBytes: number; width?: number | null; height?: number | null }
): void {
  db.raw
    .prepare(
      `INSERT INTO product_images (shop_id, product_id, rel_path, orig_name, size_bytes, width, height, updated_at)
       VALUES (@shopId, @productId, @relPath, @origName, @sizeBytes, @width, @height, @updatedAt)
       ON CONFLICT(shop_id, product_id) DO UPDATE SET
         rel_path = excluded.rel_path, orig_name = excluded.orig_name, size_bytes = excluded.size_bytes,
         width = excluded.width, height = excluded.height, updated_at = excluded.updated_at`
    )
    .run({ shopId: row.shopId, productId: row.productId, relPath: row.relPath, origName: row.origName ?? null, sizeBytes: row.sizeBytes, width: row.width ?? null, height: row.height ?? null, updatedAt: nowTimestamp() })
}

export function getProductImage(db: AppDatabase, shopId: number, productId: string): ProductImageRow | null {
  return (db.raw
    .prepare(`SELECT shop_id AS shopId, product_id AS productId, rel_path AS relPath, orig_name AS origName,
      size_bytes AS sizeBytes, width, height, updated_at AS updatedAt
      FROM product_images WHERE shop_id=? AND product_id=?`)
    .get(shopId, productId) as ProductImageRow | undefined) ?? null
}

export function deleteProductImageRecord(db: AppDatabase, shopId: number, productId: string): ProductImageRow | null {
  const row = getProductImage(db, shopId, productId)
  if (row) db.raw.prepare('DELETE FROM product_images WHERE shop_id=? AND product_id=?').run(shopId, productId)
  return row
}

export function listProductImages(db: AppDatabase, shopId: number): ProductImageRow[] {
  return db.raw
    .prepare(`SELECT shop_id AS shopId, product_id AS productId, rel_path AS relPath, orig_name AS origName,
      size_bytes AS sizeBytes, width, height, updated_at AS updatedAt
      FROM product_images WHERE shop_id=? ORDER BY product_id`)
    .all(shopId) as ProductImageRow[]
}

// ---------- calculator_runs 投产比计算历史（任务 4G）：本地工具数据，不进数据包 ----------
export interface CalculatorRunInsert {
  name: string
  paramsJson: string
  resultJson: string
  passed: boolean
}

export function saveCalculatorRun(db: AppDatabase, row: CalculatorRunInsert): number {
  const info = db.raw
    .prepare(`INSERT INTO calculator_runs (name, params_json, result_json, passed) VALUES (?, ?, ?, ?)`)
    .run(row.name, row.paramsJson, row.resultJson, row.passed ? 1 : 0)
  return Number(info.lastInsertRowid)
}

export function listCalculatorRuns(db: AppDatabase): Array<Record<string, unknown>> {
  return db.raw
    .prepare(`SELECT id, name, params_json AS paramsJson, result_json AS resultJson, passed, created_at AS createdAt
      FROM calculator_runs ORDER BY id DESC`)
    .all() as Array<Record<string, unknown>>
}

export function deleteCalculatorRun(db: AppDatabase, id: number): boolean {
  const info = db.raw.prepare('DELETE FROM calculator_runs WHERE id = ?').run(id)
  return info.changes > 0
}

// ---------- 数据覆盖（4S）：9 源+图片聚合（MAX(date)+COUNT；来源文件取 imports 同 shop 最近一条） ----------
export interface ImportCoverageRow {
  source: string
  label: string
  lastDate: string | null
  delayDays: number | null
  todayImported: boolean
  coverageRange: string | null
  rows: number
  lastSourceFile: string | null
  lastImportedAt: string | null
}

function covToday(): string {
  const d = new Date()
  const pad = (n: number): string => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/** 纯函数：YYYY-MM-DD 加减 n 天（本地时区，跨月/跨年正确） */
export function addDays(dateStr: string, n: number): string {
  const [y, m, d] = dateStr.split('-').map(Number)
  const dt = new Date(y, m - 1, d)
  dt.setDate(dt.getDate() + n)
  const pad = (x: number): string => String(x).padStart(2, '0')
  return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}`
}

/** 9 源 → 业务表映射（dateExpr 为内部常量，非用户输入） */
const COVERAGE_SOURCES: Array<{ source: string; label: string; table: string; dateExpr: string; delayDays: number }> = [
  { source: 'daily', label: '经营', table: 'daily_metrics', dateExpr: 'date', delayDays: 1 },
  { source: 'product_report', label: '商品报表', table: 'product_daily', dateExpr: 'date', delayDays: 1 },
  { source: 'product_detail', label: '商品总览', table: 'product_daily', dateExpr: 'date', delayDays: 1 },
  { source: 'consult', label: '咨询', table: 'product_daily', dateExpr: 'date', delayDays: 1 },
  { source: 'promo', label: '推广', table: 'promo_daily', dateExpr: 'date', delayDays: 1 },
  { source: 'refund', label: '退款', table: 'refund_orders', dateExpr: 'substr(refund_finish_time,1,10)', delayDays: 1 },
  { source: 'cs', label: '客服', table: 'cs_daily', dateExpr: 'date', delayDays: 3 },
  { source: 'keyword', label: '搜索词', table: 'search_keywords', dateExpr: 'date', delayDays: 1 },
  { source: 'dsr', label: 'DSR', table: 'dsr_daily', dateExpr: 'date', delayDays: 1 }
]

export function getImportCoverage(db: AppDatabase, shopId: number, today = covToday()): ImportCoverageRow[] {
  const sid = Number(shopId) || 0
  const out: ImportCoverageRow[] = []
  for (const s of COVERAGE_SOURCES) {
    const agg = db.raw
      .prepare(`SELECT MAX(${s.dateExpr}) AS lastDate, MIN(${s.dateExpr}) AS minDate, COUNT(*) AS rows FROM ${s.table} WHERE shop_id=@shopId`)
      .get({ shopId: sid }) as { lastDate: string | null; minDate: string | null; rows: number }
    const imp = db.raw
      .prepare('SELECT source_file AS sourceFile, imported_at AS importedAt FROM imports WHERE shop_id=@shopId AND source_type=@source ORDER BY id DESC LIMIT 1')
      .get({ shopId: sid, source: s.source }) as { sourceFile: string; importedAt: string } | undefined
    const lastDate = agg.lastDate ?? null
    const coverageRange = lastDate
      ? agg.minDate && agg.minDate !== lastDate ? `${agg.minDate}~${lastDate}` : lastDate
      : null
    out.push({
      source: s.source,
      label: s.label,
      lastDate,
      delayDays: s.delayDays,
      todayImported: !!lastDate && lastDate >= addDays(today, -s.delayDays),
      coverageRange,
      rows: Number(agg.rows) || 0,
      lastSourceFile: imp?.sourceFile ?? null,
      lastImportedAt: imp?.importedAt ?? null
    })
  }
  // 图片：product_images COUNT（无日期列，仅行数）
  const imgCount = (db.raw.prepare('SELECT COUNT(*) AS n FROM product_images WHERE shop_id=@shopId').get({ shopId: sid }) as { n: number }).n
  out.push({
    source: 'images',
    label: '图片',
    lastDate: null,
    delayDays: null,
    todayImported: false,
    coverageRange: null,
    rows: Number(imgCount) || 0,
    lastSourceFile: null,
    lastImportedAt: null
  })
  return out
}
