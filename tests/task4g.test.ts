// 任务 4G 测试（TDD）：投产比公式（模板口径）+ 反推/保本 + 历史 CSV + calculator_runs 表 + 一键带入窗口聚合
import { describe, expect, it } from 'vitest'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { AppDatabase } from '../src/main/db/database'
import { ALL_TABLES, SCHEMA_VERSION } from '../src/main/db/schema'
import { deleteCalculatorRun, getDefaultShopId, listCalculatorRuns, saveCalculatorRun, setDefaultShopId } from '../src/main/db/repo'
import { roiWindowData } from '../src/main/roi/window'
import { buildRoiHistoryCsv } from '../src/renderer/src/utils/roi-export'
import { computeRoi, toNumberOrNull } from '../src/renderer/src/utils/roi'

function freshDb(): AppDatabase {
  const dir = mkdtempSync(join(tmpdir(), 'ecai-4g-'))
  const db = new AppDatabase(join(dir, '4g.db'))
  db.init()
  return db
}

describe('任务4G ① 公式口径（任务书模板：花费10/成交130/退款率0.4/毛利率30%/目标营销占比16%）', () => {
  const base = { spend: 10, sales: 130, refundAmount: null, refundRate: 0.4, grossMargin: 0.3, targetMarketingRatio: 0.16 }

  it('模板示例：投产比=13、净成交率=0.6、净成交额=78、营销占比=12.82%、16% 红线达标', () => {
    const r = computeRoi(base)
    expect(r.roi).toBeCloseTo(13, 6)
    expect(r.netSalesRate).toBeCloseTo(0.6, 6)
    expect(r.netSales).toBeCloseTo(78, 6)
    expect(r.marketingRatio).toBeCloseTo(10 / 78, 6)
    expect(r.marketingRatio! * 100).toBeCloseTo(12.82, 2)
    expect(r.passed).toBe(true)
  })

  it('反推：最低投产比红线=10.42、可承受花费上限=12.48（与手算一致）', () => {
    const r = computeRoi(base)
    expect(r.minRoi).toBeCloseTo(1 / (0.16 * 0.6), 6)
    expect(Number(r.minRoi!.toFixed(2))).toBe(10.42)
    expect(r.maxSpend).toBeCloseTo(130 * 0.6 * 0.16, 6)
    expect(Number(r.maxSpend!.toFixed(2))).toBe(12.48)
  })

  it('保本：毛利率 30% → 保本投产比 3.33', () => {
    const r = computeRoi(base)
    expect(r.breakEvenRoi).toBeCloseTo(1 / 0.3, 6)
    expect(Number(r.breakEvenRoi!.toFixed(2))).toBe(3.33)
  })

  it('超红线告警：花费 15 > 可承受 12.48 → 未达标，需压低 2.52 元 / 投产比需提升到 10.42', () => {
    const r = computeRoi({ ...base, spend: 15 })
    expect(r.passed).toBe(false)
    expect(r.marketingRatio).toBeCloseTo(15 / 78, 6)
    expect(r.spend - r.maxSpend!).toBeCloseTo(2.52, 6)
    expect(r.roi).toBeCloseTo(130 / 15, 6)
    expect(Number(r.minRoi!.toFixed(2))).toBe(10.42)
  })

  it('输入退款金额等价于输入退款率：退款 52 = 退款率 0.4，结果一致', () => {
    const r = computeRoi({ ...base, refundAmount: 52, refundRate: null })
    expect(r.refundRate).toBeCloseTo(0.4, 6)
    expect(r.marketingRatio).toBeCloseTo(10 / 78, 6)
    expect(r.passed).toBe(true)
  })

  it('红线可改：目标营销占比 10% → 不达标（12.82% > 10%）', () => {
    const r = computeRoi({ ...base, targetMarketingRatio: 0.1 })
    expect(r.passed).toBe(false)
    expect(Number(r.minRoi!.toFixed(2))).toBe(Number((1 / (0.1 * 0.6)).toFixed(2)))
  })
})

describe('任务4G ② 边界：除零/非法输入不崩且字段置空', () => {
  it('花费 0 → 投产比/营销占比为空，判定不达标', () => {
    const r = computeRoi({ spend: 0, sales: 130, refundAmount: null, refundRate: 0.4, grossMargin: 0.3, targetMarketingRatio: 0.16 })
    expect(r.roi).toBeNull()
    expect(r.marketingRatio).toBeNull()
    expect(r.passed).toBe(false)
  })

  it('成交 0 → 退款率/净成交率/净成交额为空', () => {
    const r = computeRoi({ spend: 10, sales: 0, refundAmount: null, refundRate: 0.4, grossMargin: 0.3, targetMarketingRatio: 0.16 })
    expect(r.roi).toBeNull()
    expect(r.netSalesRate).toBeNull()
    expect(r.netSales).toBeNull()
    expect(r.marketingRatio).toBeNull()
  })

  it('退款率 ≥ 1（净成交率 ≤ 0）→ 营销占比/红线/可承受花费为空', () => {
    const r = computeRoi({ spend: 10, sales: 130, refundAmount: null, refundRate: 1, grossMargin: 0.3, targetMarketingRatio: 0.16 })
    expect(r.netSalesRate).toBe(0)
    expect(r.marketingRatio).toBeNull()
    expect(r.minRoi).toBeNull()
    expect(r.maxSpend).toBeNull()
  })

  it('毛利率 0 → 保本投产比为空；目标营销占比 0 → 红线/可承受花费为空', () => {
    const r = computeRoi({ spend: 10, sales: 130, refundAmount: null, refundRate: 0.4, grossMargin: 0, targetMarketingRatio: 0 })
    expect(r.breakEvenRoi).toBeNull()
    expect(r.minRoi).toBeNull()
    expect(r.maxSpend).toBeNull()
  })
})

describe('任务4G ③ 历史导出 CSV：表头/映射/转义', () => {
  it('表头与一行数据映射符合验收口径（UTF-8 BOM 由渲染层下载时加）', () => {
    const csv = buildRoiHistoryCsv([
      {
        id: 1, createdAt: '2026-08-14 17:00:00', name: '模板示例', passed: 1,
        params: { spend: 10, sales: 130, refundRate: 0.4, grossMargin: 0.3, targetMarketingRatio: 0.16 },
        result: { roi: 13, netSalesRate: 0.6, netSales: 78, marketingRatio: 0.1282051282051282, minRoi: 10.416666666666666, maxSpend: 12.48, breakEvenRoi: 3.3333333333333335 }
      }
    ])
    const lines = csv.split('\r\n').filter(Boolean)
    expect(lines[0]).toBe('时间,名称,推广花费(元),成交金额(元),退款率,毛利率,目标营销占比,实际投产比,营销占比,是否达标,最低投产比,可承受花费(元),保本投产比')
    expect(lines[1]).toContain('2026-08-14 17:00:00,模板示例,10.00,130.00,40.00%,30.00%,16.00%,13.00,12.82%,达标,10.42,12.48,3.33')
  })

  it('未达标标记为「未达标」，逗号/引号转义不破坏列结构', () => {
    const csv = buildRoiHistoryCsv([
      {
        id: 9, createdAt: '2026-08-14 18:00:00', name: 'A,超"线"', passed: 0,
        params: { spend: 15, sales: 130, refundRate: 0.4, grossMargin: 0.3, targetMarketingRatio: 0.16 },
        result: { roi: 8.67, netSalesRate: 0.6, netSales: 78, marketingRatio: 0.19230769230769232, minRoi: 10.42, maxSpend: 12.48, breakEvenRoi: 3.33 }
      }
    ])
    const line = csv.split('\r\n').filter(Boolean)[1]
    expect(line).toContain('"A,超""线""",15.00,130.00,40.00%,30.00%,16.00%,8.67,19.23%,未达标')
  })
})

describe('任务4G ④ calculator_runs 表：幂等建表 + 迁移 v9 + 增删查', () => {
  it('SCHEMA_VERSION=9 且 ALL_TABLES 含 calculator_runs；新库重复 init 不报错', () => {
    expect(SCHEMA_VERSION).toBe(10)
    expect(ALL_TABLES).toContain('calculator_runs')
    const db = freshDb()
    db.init()
    expect(db.userVersion()).toBe(10)
    const cols = db.raw.prepare('PRAGMA table_info(calculator_runs)').all() as Array<{ name: string; type: string }>
    expect(cols.map((c) => c.name).sort()).toEqual(['created_at', 'id', 'name', 'params_json', 'passed', 'result_json'])
    db.close()
  })

  it('保存→列表→删除 全流程：params/result JSON 原样回读', () => {
    const db = freshDb()
    const id = saveCalculatorRun(db, {
      name: '模板示例', passed: true,
      paramsJson: JSON.stringify({ spend: 10, sales: 130 }),
      resultJson: JSON.stringify({ roi: 13, passed: true })
    })
    expect(id).toBeGreaterThan(0)
    const rows = listCalculatorRuns(db) as Array<Record<string, unknown>>
    expect(rows).toHaveLength(1)
    expect(String(rows[0].name)).toBe('模板示例')
    expect(Number(rows[0].passed)).toBe(1)
    expect(rows[0].paramsJson).toBe(JSON.stringify({ spend: 10, sales: 130 }))
    expect(rows[0].resultJson).toBe(JSON.stringify({ roi: 13, passed: true }))
    expect(String(rows[0].createdAt)).toMatch(/^\d{4}-\d{2}-\d{2}/)
    expect(deleteCalculatorRun(db, id)).toBe(true)
    expect(listCalculatorRuns(db)).toHaveLength(0)
    expect(deleteCalculatorRun(db, 99999)).toBe(false)
    db.close()
  })

  it('calculator_runs 不在数据包 PACKAGE_TABLES（本地工具数据不出包）', async () => {
    const { PACKAGE_TABLES } = await import('../src/main/package/service')
    expect(PACKAGE_TABLES.map((m) => m.table)).not.toContain('calculator_runs')
  })
})

describe('任务4G ⑤ 一键带入：窗口聚合与看板口径一致（dailyKpi 同源）', () => {
  it('近 7/15/30 天窗口数据 = daily_metrics 同窗口 SUM（pay/promo/refund）', () => {
    const db = freshDb()
    db.raw.prepare(`INSERT INTO shops (id, name) VALUES (1, '测试店')`).run()
    const upsert = db.raw.prepare(`INSERT INTO daily_metrics (shop_id, date, pay_amount_fen, refund_amount_fen, promo_cost_fen)
      VALUES (?, ?, ?, ?, ?) ON CONFLICT(shop_id, date) DO UPDATE SET
        pay_amount_fen = excluded.pay_amount_fen, refund_amount_fen = excluded.refund_amount_fen, promo_cost_fen = excluded.promo_cost_fen`)
    for (let i = 1; i <= 40; i++) {
      const d = `2026-08-${String(i).padStart(2, '0')}`
      upsert.run(1, d, i * 100, i * 10, i * 5)
    }
    for (const mode of ['7', '15', '30'] as const) {
      const wd = roiWindowData(db, 1, mode, '2026-08-31')
      expect(wd).not.toBeNull()
      if (!wd) throw new Error('roiWindowData 不应为 null')
      const w = wd.window
      const sum = db.raw
        .prepare(`SELECT COALESCE(SUM(pay_amount_fen),0) pay, COALESCE(SUM(promo_cost_fen),0) promo, COALESCE(SUM(refund_amount_fen),0) refund FROM daily_metrics WHERE shop_id=1 AND date>=? AND date<=?`)
        .get(w.start, w.end) as { pay: number; promo: number; refund: number }
      expect(wd.salesFen).toBe(sum.pay)
      expect(wd.promoFen).toBe(sum.promo)
      expect(wd.refundFen).toBe(sum.refund)
      expect(wd.salesFen).toBeGreaterThan(0)
    }
    db.close()
  })

  it('无店铺数据时返回 null（渲染层提示无数据）', () => {
    const db = freshDb()
    const wd = roiWindowData(db, 999, '7', '2026-08-31')
    expect(wd).toBeNull()
    db.close()
  })
})

describe('任务4G ⑨ 输入容错：Vue 3.5 对 type="number" 的 v-model 自动转 number，渲染层不崩', () => {
  it('number/string/空白/非法值均安全转换', () => {
    expect(toNumberOrNull(10)).toBe(10)
    expect(toNumberOrNull(10.5)).toBe(10.5)
    expect(toNumberOrNull('10')).toBe(10)
    expect(toNumberOrNull(' 10.50 ')).toBe(10.5)
    expect(toNumberOrNull('0.4')).toBeCloseTo(0.4, 6)
    expect(toNumberOrNull('')).toBeNull()
    expect(toNumberOrNull('   ')).toBeNull()
    expect(toNumberOrNull(null)).toBeNull()
    expect(toNumberOrNull(undefined)).toBeNull()
    expect(toNumberOrNull('abc')).toBeNull()
    expect(toNumberOrNull(NaN)).toBeNull()
    expect(toNumberOrNull(Infinity)).toBeNull()
  })
})

describe('任务4G ⑧ 默认店铺兜底：存储的 default_shop_id 已不存在时回退第一个店铺', () => {
  it('无效 default_shop_id → 回退第一个店铺；有效则原样返回；无店铺返回 null', () => {
    const db = freshDb()
    expect(getDefaultShopId(db)).toBeNull()
    db.raw.prepare(`INSERT INTO shops (id, name) VALUES (1, '店A')`).run()
    db.raw.prepare(`INSERT INTO shops (id, name) VALUES (2, '店B')`).run()
    setDefaultShopId(db, 99)
    expect(getDefaultShopId(db)).toBe(1)
    setDefaultShopId(db, 2)
    expect(getDefaultShopId(db)).toBe(2)
    db.close()
  })
})