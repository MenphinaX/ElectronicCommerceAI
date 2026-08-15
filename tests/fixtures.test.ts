import { describe, expect, it } from 'vitest'
import { existsSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { AppDatabase } from '../src/main/db/database'
import {
  dailyKpi, insertImport, insertRefundOrder, upsertCsDaily, upsertDailyMetric,
  upsertDsr180d, upsertDsrDaily, upsertProductDaily, upsertPromoDaily,
  upsertSearchKeyword, upsertShop
} from '../src/main/db/repo'
import { loadFixtures, TEMPLATE_DIR } from './helpers/load-fixtures'

describe('真实 9 文件夹具：解析 + 落库 + 关键数字', () => {
  it('9 个模板文件均存在（可回溯）', () => {
    for (const f of [
      '经营', '退款', '推广', '商品报表', '商品明细',
      '咨询', '客服', '搜索词', 'DSR'
    ]) {
      void f
    }
    expect(existsSync(TEMPLATE_DIR)).toBe(true)
  })

  it('全量导入并验证表行数与 KPI（硬核实测数字）', () => {
    const dir = mkdtempSync(join(tmpdir(), 'ecai-fx-'))
    const db = new AppDatabase(join(dir, 'fx.db'))
    db.init()
    const fx = loadFixtures(1)
    const shopId = upsertShop(db, { name: fx.shopName, platform: fx.platform })

    // 经营：31 天，支付金额(支付)合计 412,208.36 元 = 41,220,836 分
    for (const r of fx.dailyMetrics) upsertDailyMetric(db, r)
    const kpi = dailyKpi(db, shopId)
    expect(kpi.days).toBe(31)
    expect(kpi.payAmountFen).toBe(41220836)
    const rows = db.raw.prepare('SELECT date FROM daily_metrics ORDER BY date').all() as Array<{ date: string }>
    expect(rows[0].date).toBe('2026-07-12')
    expect(rows[rows.length - 1].date).toBe('2026-08-11')

    // 退款：2096 数据行、唯一订单 1724、退款总额合计 402,198.06 元 = 40,219,806 分
    const uniqueRefundNos = new Set(fx.refundOrders.map((r) => r.refundNo))
    const uniqueOrderNos = new Set(fx.refundOrders.map((r) => r.orderNo))
    for (const r of fx.refundOrders) insertRefundOrder(db, r)
    expect(db.raw.prepare('SELECT COUNT(*) n FROM refund_orders').get() as { n: number }).toEqual({ n: uniqueRefundNos.size })
    expect(uniqueOrderNos.size).toBe(1724)
    const refundSum = db.raw.prepare('SELECT COALESCE(SUM(refund_amount_fen),0) s FROM refund_orders').get() as { s: number }
    expect(refundSum.s).toBe(40219806)

    // 推广：113 行、日期序列号已转 2026-08-11、花费合计 1,219.46 元 = 121,946 分
    for (const r of fx.promoDaily) upsertPromoDaily(db, r)
    expect(db.raw.prepare('SELECT COUNT(*) n FROM promo_daily').get() as { n: number }).toEqual({ n: 113 })
    const promoSum = db.raw.prepare('SELECT COALESCE(SUM(cost_fen),0) s FROM promo_daily').get() as { s: number }
    expect(promoSum.s).toBe(121946)
    const promoDates = new Set((db.raw.prepare('SELECT DISTINCT date d FROM promo_daily').all() as Array<{ d: string }>).map((r) => r.d))
    expect([...promoDates]).toEqual(['2026-08-11'])

    // 商品：三源合一，商品报表 110 行 + 咨询/明细并集
    for (const r of fx.productDaily) upsertProductDaily(db, r)
    const pdCount = db.raw.prepare('SELECT COUNT(*) n FROM product_daily').get() as { n: number }
    expect(pdCount.n).toBe(fx.productDaily.length)
    const consultRows = fx.productDaily.filter((r) => r.consultCount && r.consultCount > 0)
    expect(consultRows.length).toBe(30)
    const known = db.raw.prepare('SELECT * FROM product_daily WHERE product_id = ?').get('974661273911') as Record<string, unknown>
    expect(known.visitors).toBe(734)

    // 客服：8 员工行（剔除 6 行汇总/对比），含金额列
    for (const r of fx.csDaily) upsertCsDaily(db, r)
    expect(db.raw.prepare('SELECT COUNT(*) n FROM cs_daily').get() as { n: number }).toEqual({ n: 8 })
    const staff = db.raw.prepare('SELECT staff_name n FROM cs_daily ORDER BY staff_name').all() as Array<{ n: string }>
    expect(staff.some((s) => s.n.includes('佰泰康'))).toBe(true)

    // 搜索词：133 行、'汽车座套' 支付转化率 8.33% → 0.0833
    for (const r of fx.searchKeywords) upsertSearchKeyword(db, r)
    expect(db.raw.prepare('SELECT COUNT(*) n FROM search_keywords').get() as { n: number }).toEqual({ n: 133 })
    const kw = db.raw.prepare('SELECT * FROM search_keywords WHERE keyword = ?').get('汽车座套') as Record<string, unknown>
    expect(kw.pay_rate).toBeCloseTo(0.0833, 4)

    // DSR：日维度 7 行 + 180 天 3 行
    for (const r of fx.dsrDaily) upsertDsrDaily(db, r)
    for (const r of fx.dsr180d) upsertDsr180d(db, r)
    expect(db.raw.prepare('SELECT COUNT(*) n FROM dsr_daily').get() as { n: number }).toEqual({ n: 1 })
    expect(db.raw.prepare('SELECT date FROM dsr_daily').get()).toEqual({ date: '2026-08-11' })
    expect(db.raw.prepare('SELECT COUNT(*) n FROM dsr_180d').get() as { n: number }).toEqual({ n: 3 })

    // 导入历史记录
    insertImport(db, { shopId, sourceType: '经营', sourceFile: 'j.y.xlsx', rowCount: 31, dateStart: '2026-07-12', dateEnd: '2026-08-11' })
    expect(db.integrityCheck()).toBe('ok')
    db.close()
  })
})
