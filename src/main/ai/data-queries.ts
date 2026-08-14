// 任务 6 取数分析：白名单只读查询模板（渲染层不直连 SQL，禁止任意 SQL 注入）
// 模板全部为 SELECT，参数经 better-sqlite3 命名参数绑定；新增模板必须走本文件白名单
import type { AppDatabase } from '../db/database'

export interface QueryTemplate {
  id: string
  label: string
  desc: string
  sql: string
}

export const QUERY_TEMPLATES: QueryTemplate[] = [
  {
    id: 'daily-range',
    label: '窗口每日经营',
    desc: '窗口内每天支付/净销/利润/访客/退款/推广费',
    sql: `SELECT date, pay_amount_fen/100.0 AS pay_yuan, net_sales_fen/100.0 AS net_sales_yuan,
      profit_fen/100.0 AS profit_yuan, visitors, refund_amount_fen/100.0 AS refund_yuan,
      promo_cost_fen/100.0 AS promo_yuan
      FROM daily_metrics WHERE shop_id=@shopId AND date>=@from AND date<=@to ORDER BY date`
  },
  {
    id: 'product-top',
    label: '窗口商品支付 TOP10',
    desc: '窗口内商品支付/利润/销量/访客 TOP10',
    sql: `SELECT MAX(product_name) AS product_name, COALESCE(SUM(pay_amount_fen),0)/100.0 AS pay_yuan,
      COALESCE(SUM(profit_fen),0)/100.0 AS profit_yuan, COALESCE(SUM(sales_count),0) AS sales_count,
      COALESCE(SUM(visitors),0) AS visitors
      FROM product_daily WHERE shop_id=@shopId AND date>=@from AND date<=@to
      GROUP BY product_id ORDER BY pay_yuan DESC LIMIT @limit`
  },
  {
    id: 'promo-top',
    label: '窗口推广花费 TOP10',
    desc: '窗口内推广计划花费/曝光/点击/ROI',
    sql: `SELECT MAX(ad_entity_name) AS ad_entity_name, COALESCE(SUM(cost_fen),0)/100.0 AS cost_yuan,
      COALESCE(SUM(impressions),0) AS impressions, COALESCE(SUM(clicks),0) AS clicks,
      CASE WHEN COALESCE(SUM(cost_fen),0)>0 THEN ROUND(COALESCE(SUM(roas*cost_fen),0)/SUM(cost_fen),2) ELSE NULL END AS roas
      FROM promo_daily WHERE shop_id=@shopId AND date>=@from AND date<=@to
      GROUP BY ad_entity_id ORDER BY cost_yuan DESC LIMIT @limit`
  },
  {
    id: 'refund-top',
    label: '窗口退款 TOP 商品',
    desc: '窗口内退款金额最多的商品（按退款完结时间）',
    sql: `SELECT MAX(product_title) AS product_title, COUNT(*) AS refund_count,
      COALESCE(SUM(refund_amount_fen),0)/100.0 AS refund_yuan
      FROM refund_orders WHERE shop_id=@shopId AND substr(refund_finish_time,1,10)>=@from AND substr(refund_finish_time,1,10)<=@to
      GROUP BY product_id ORDER BY refund_yuan DESC LIMIT @limit`
  },
  {
    id: 'keyword-top',
    label: '窗口搜索词 TOP10',
    desc: '窗口内搜索词访客/支付买家数/支付金额',
    sql: `SELECT keyword, COALESCE(SUM(visitors),0) AS visitors, COALESCE(SUM(pay_buyer_count),0) AS pay_buyers,
      COALESCE(SUM(pay_amount_fen),0)/100.0 AS pay_yuan
      FROM search_keywords WHERE shop_id=@shopId AND date>=@from AND date<=@to
      GROUP BY keyword ORDER BY visitors DESC LIMIT @limit`
  },
  {
    id: 'cs-reply',
    label: '窗口客服回复率',
    desc: '窗口内客服询单/回复率/满意率',
    sql: `SELECT staff_name, COALESCE(SUM(inquiry_count),0) AS inquiry_count,
      COALESCE(SUM(inquiry_final_pay_count),0) AS final_pay_count,
      CASE WHEN COALESCE(SUM(inquiry_count),0)>0 THEN ROUND(COALESCE(SUM(inquiry_final_pay_count),0)/SUM(inquiry_count),4) ELSE NULL END AS final_pay_rate
      FROM cs_daily WHERE shop_id=@shopId AND date>=@from AND date<=@to
      GROUP BY staff_name ORDER BY inquiry_count DESC`
  }
]

export function listQueryTemplates(): Array<{ id: string; label: string; desc: string }> {
  return QUERY_TEMPLATES.map((t) => ({ id: t.id, label: t.label, desc: t.desc }))
}

export interface QueryResult {
  templateId: string
  label: string
  columns: string[]
  rows: Array<Array<string | number | null>>
  rowCount: number
}

export function runQuery(db: AppDatabase, templateId: string, params: Record<string, unknown>): QueryResult {
  const t = QUERY_TEMPLATES.find((x) => x.id === templateId)
  if (!t) throw new Error('未知查询模板（不在白名单）')
  const stmt = db.raw.prepare(t.sql)
  const columns = stmt.columns().map((c) => c.name)
  const data = stmt.all(params) as Array<Record<string, unknown>>
  const rows = data.map((r) => columns.map((c) => {
    const v = r[c]
    if (v == null) return null
    if (typeof v === 'number') return Number.isInteger(v) ? v : Math.round(v * 100) / 100
    return String(v)
  }))
  return { templateId: t.id, label: t.label, columns, rows, rowCount: rows.length }
}
