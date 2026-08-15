// 任务 3 解析层测试：9 个真实模板文件逐类识别+解析+严苛校验；改版文件必须本地失败
import { describe, expect, it } from 'vitest'
import { join } from 'node:path'
import { parseSourceFile } from '../src/main/import/parsers'
import { readSourceFile } from '../src/main/import/reader'
import { detectType } from '../src/main/import/validate'
import { CONSULT_FILE, CS_FILE, DAILY_FILE, DSR_FILE, KEYWORD_FILE, PRODUCT_DETAIL_FILE, PRODUCT_REPORT_FILE, PROMO_FILE, REFUND_FILE, TEMPLATE_DIR } from './helpers/load-fixtures'

const F = (name: string): string => join(TEMPLATE_DIR, name)

describe('识别：9 个真实文件 文件名关键词+表头双重判断', () => {
  const cases: Array<[string, string]> = [
    ['咨询', CONSULT_FILE], ['搜索词', KEYWORD_FILE], ['商品报表', PRODUCT_REPORT_FILE],
    ['商品明细', PRODUCT_DETAIL_FILE], ['推广', PROMO_FILE], ['经营', DAILY_FILE],
    ['DSR', DSR_FILE], ['客服', CS_FILE], ['退款', REFUND_FILE]
  ]
  it.each(cases)('%s 识别正确', (label, name) => {
    const raw = readSourceFile(F(name))
    expect(raw.decodeError).toBeUndefined()
    const d = detectType(F(name), raw)
    expect(d).not.toBeNull()
    expect(d!.reason).toBe('filename')
  })
})

describe('解析：9 个真实文件 行数与关键数字对得上数据源清单', () => {
  it('咨询 csv：30 行，商品id 去「ID：」前缀为纯数字', () => {
    const p = parseSourceFile(F(CONSULT_FILE), readSourceFile(F(CONSULT_FILE)), 'consult')
    expect(p.ok).toBe(true)
    expect(p.dataRows).toBe(30)
    expect(p.rows.target).toBe('product_daily')
    const rows = p.rows.target === 'product_daily' ? p.rows.rows : []
    expect(rows.every((r) => /^\d+$/.test(r.productId))).toBe(true)
    const hit = rows.find((r) => r.productId === '974661273911')
    expect(hit?.consultCount).toBe(76)
    expect(p.dateStart).toBe('2026-08-11')
  })

  it('搜索词 xls：133 行，日期 YYYY-MM-DD', () => {
    const p = parseSourceFile(F(KEYWORD_FILE), readSourceFile(F(KEYWORD_FILE)), 'keyword')
    expect(p.ok).toBe(true)
    expect(p.dataRows).toBe(133)
    const rows = p.rows.target === 'search_keywords' ? p.rows.rows : []
    expect(rows[0].date).toBe('2026-08-11')
    const hit = rows.find((r) => r.keyword === '汽车座套')
    expect(hit?.visitors).toBe(12)
    expect(hit?.payAmountFen).toBe(36800)
  })

  it('商品报表 xls：110 行，表头第 5 行', () => {
    const p = parseSourceFile(F(PRODUCT_REPORT_FILE), readSourceFile(F(PRODUCT_REPORT_FILE)), 'product_report')
    expect(p.ok).toBe(true)
    expect(p.headerRow).toBe(5)
    expect(p.dataRows).toBe(110)
    const rows = p.rows.target === 'product_daily' ? p.rows.rows : []
    const hit = rows.find((r) => r.productId === '974661273911')
    expect(hit?.visitors).toBe(734)
    expect(hit?.pageViews).toBe(2059)
    expect(hit?.payAmountFen).toBe(903600)
    expect(hit?.refundAmountFen).toBe(95400)
    expect(hit?.payRate).toBeCloseTo(0.0354, 4)
  })

  it('商品明细 xlsx：111 行，跳过第 2 行重复表头', () => {
    const p = parseSourceFile(F(PRODUCT_DETAIL_FILE), readSourceFile(F(PRODUCT_DETAIL_FILE)), 'product_detail')
    expect(p.ok).toBe(true)
    expect(p.dataRows).toBe(111)
    expect(p.dateStart).toBe('2026-08-11')
  })

  it('推广 csv(gbk)：113 行，日期序列号转 YYYY-MM-DD，花费合计 121,946 分', () => {
    const p = parseSourceFile(F(PROMO_FILE), readSourceFile(F(PROMO_FILE)), 'promo')
    expect(p.ok).toBe(true)
    expect(p.dataRows).toBe(113)
    const rows = p.rows.target === 'promo_daily' ? p.rows.rows : []
    expect(rows.every((r) => /^\d{4}-\d{2}-\d{2}$/.test(r.date))).toBe(true)
    const costSum = rows.reduce((a, r) => a + (r.costFen ?? 0), 0)
    expect(costSum).toBe(121946)
    expect(rows[0].adEntityId).toBeTruthy()
  })

  it('经营 xlsx：31 天，支付金额合计 41,220,836 分', () => {
    const p = parseSourceFile(F(DAILY_FILE), readSourceFile(F(DAILY_FILE)), 'daily')
    expect(p.ok).toBe(true)
    expect(p.dataRows).toBe(31)
    expect(p.dateStart).toBe('2026-07-12')
    expect(p.dateEnd).toBe('2026-08-11')
    const rows = p.rows.target === 'daily_metrics' ? p.rows.rows : []
    const paySum = rows.reduce((a, r) => a + r.payAmountFen, 0)
    expect(paySum).toBe(41220836)
  })

  it('DSR xlsx：180 天 3 行 + 日维度 1 行', () => {
    const p = parseSourceFile(F(DSR_FILE), readSourceFile(F(DSR_FILE)), 'dsr')
    expect(p.ok).toBe(true)
    if (p.rows.target !== 'dsr') throw new Error('unexpected')
    expect(p.rows.rows.d180).toHaveLength(3)
    expect(p.rows.rows.daily).toHaveLength(1)
    expect(p.rows.rows.daily[0].date).toBe('2026-08-11')
  })

  it('客服 xlsx：8 员工行，末 6 行汇总剔除，日期取文件名', () => {
    const p = parseSourceFile(F(CS_FILE), readSourceFile(F(CS_FILE)), 'cs')
    expect(p.ok).toBe(true)
    expect(p.dataRows).toBe(8)
    const rows = p.rows.target === 'cs_daily' ? p.rows.rows : []
    expect(rows).toHaveLength(8)
    expect(rows.every((r) => r.date === '2026-08-09')).toBe(true)
    expect(rows.some((r) => r.staffName === '魏文艳' && r.avgResponseSeconds === 32.67)).toBe(true)
  })

  it('退款单 xlsx：2096 行，退款总额合计 40,219,806 分', () => {
    const p = parseSourceFile(F(REFUND_FILE), readSourceFile(F(REFUND_FILE)), 'refund')
    expect(p.ok).toBe(true)
    expect(p.dataRows).toBe(2096)
    const rows = p.rows.target === 'refund_orders' ? p.rows.rows : []
    const sum = rows.reduce((a, r) => a + (r.refundAmountFen ?? 0), 0)
    expect(sum).toBe(40219806)
    expect(new Set(rows.map((r) => r.refundNo)).size).toBe(2096)
  })
})

describe('改版文件：本地解析必须失败（转兜底/人工）', () => {
  it('搜索词表头挪到第 8 行 → 表头行校验失败', () => {
    const shifted = shiftedKeywordRows()
    const raw = { rows: shifted, encoding: 'xls' }
    const p = parseSourceFile('shifted.xls', raw, 'keyword')
    expect(p.ok).toBe(false)
    expect(p.issues.some((i) => i.code === 'header_row')).toBe(true)
    // 文件名关键词仍命中 keyword_only
    const d = detectType('【生意参谋】选词助手-引流搜索词-店外-无线-20260811.xls', raw)
    expect(d?.type).toBe('keyword')
    expect(d?.reason).toBe('keyword_only')
  })

  it('退款单 2 列改名 → 缺必填列', () => {
    const rows = renamedRefundRows()
    const p = parseSourceFile('refund-renamed.xlsx', { rows, encoding: 'xlsx' }, 'refund')
    expect(p.ok).toBe(false)
    expect(p.issues.length).toBeGreaterThan(0)
  })

  it('表头彻底找不到 → 识别失败', () => {
    const rows = Array.from({ length: 12 }, (_, i) => [`值${i}`, i * 3, 'x', 'y'])
    expect(detectType('garbage.xlsx', { rows, encoding: 'xlsx' })).toBeNull()
    const p = parseSourceFile('garbage.xlsx', { rows, encoding: 'xlsx' }, 'refund')
    expect(p.ok).toBe(false)
  })
})

// ---------- 测试辅助：造改版文件 ----------
function shiftedKeywordRows(): Array<Array<string | number | null>> {
  const base = readSourceFile(F(KEYWORD_FILE)).rows
  const header = base[5] // 原第 6 行表头
  const before = base.slice(0, 5)
  const after = base.slice(6)
  return [...before, [], [], header, ...after]
}

function renamedRefundRows(): Array<Array<string | number | null>> {
  const base = readSourceFile(F(REFUND_FILE)).rows
  const header = (base[0] ?? []).map((c) => {
    const s = String(c)
    if (s === '订单编号') return '订单号'
    if (s === '退款总额') return '退款金额'
    return c
  })
  return [header, ...base.slice(1)]
}

describe('波动行数：小店铺/正常波动不再拦截（2026-08-15 删除行数硬校验）', () => {
  it('搜索词 116 行（真实模板删 17 行波动样本）→ ok=true、dataRows=116', () => {
    const base = readSourceFile(F(KEYWORD_FILE)).rows
    const raw = { rows: [...base.slice(0, 6), ...base.slice(6, 6 + 116)], encoding: 'xls' }
    const p = parseSourceFile('kw-116.xls', raw, 'keyword')
    expect(p.ok).toBe(true)
    expect(p.dataRows).toBe(116)
  })

  it('搜索词 1 行（新店）→ ok=true', () => {
    const base = readSourceFile(F(KEYWORD_FILE)).rows
    const raw = { rows: [...base.slice(0, 6), base[6]], encoding: 'xls' }
    const p = parseSourceFile('kw-1.xls', raw, 'keyword')
    expect(p.ok).toBe(true)
    expect(p.dataRows).toBe(1)
  })

  it('退款 2 行（新店）→ ok=true', () => {
    const base = readSourceFile(F(REFUND_FILE)).rows
    const raw = { rows: [base[0], base[1], base[2]], encoding: 'xlsx' }
    const p = parseSourceFile('rf-2.xlsx', raw, 'refund')
    expect(p.ok).toBe(true)
    expect(p.dataRows).toBe(2)
  })
})
