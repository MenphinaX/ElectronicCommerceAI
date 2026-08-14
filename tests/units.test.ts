import { describe, expect, it } from 'vitest'
import {
  dateFromTimestamp, fenFromYuan, intValue, isDate, isTimestamp, leadingNumber,
  normalizeDate, percentToDecimal, yuanFromFen
} from '../src/main/db/units'

describe('字段规范：金额/数量/比率/日期', () => {
  it('元 → 分：四舍五入，空值/非法归 0', () => {
    expect(fenFromYuan(412208.36)).toBe(41220836)
    expect(fenFromYuan('9,036.00')).toBe(903600)
    expect(fenFromYuan('68.00')).toBe(6800)
    expect(fenFromYuan(0.38)).toBe(38)
    expect(fenFromYuan(null)).toBe(0)
    expect(fenFromYuan('')).toBe(0)
    expect(fenFromYuan('abc')).toBe(0)
  })

  it('分 → 元', () => {
    expect(yuanFromFen(41220836)).toBeCloseTo(412208.36, 2)
  })

  it('数量：字符串千分位转整数', () => {
    expect(intValue('2,059')).toBe(2059)
    expect(intValue('734')).toBe(734)
    expect(intValue('')).toBe(0)
    expect(intValue('abc')).toBe(0)
  })

  it('比率：% 文本和小数统一转 0~1，‘-’/空为 null', () => {
    expect(percentToDecimal('8.33%')).toBeCloseTo(0.0833, 6)
    expect(percentToDecimal('2.35%')).toBeCloseTo(0.0235, 6)
    expect(percentToDecimal(0.06667)).toBeCloseTo(0.06667, 6)
    expect(percentToDecimal(1)).toBe(1)
    expect(percentToDecimal('-')).toBeNull()
    expect(percentToDecimal('')).toBeNull()
  })

  it("DSR 得分：'5.00 (0.00%)' 取前导数值", () => {
    expect(leadingNumber('5.00 (0.00%)')).toBe(5)
    expect(leadingNumber(4.78)).toBe(4.78)
    expect(leadingNumber('')).toBeNull()
  })

  it('日期统一 YYYY-MM-DD：斜杠/Excel 序列号/原样', () => {
    expect(normalizeDate('2026/08/11')).toBe('2026-08-11')
    expect(normalizeDate(46245)).toBe('2026-08-11')
    expect(normalizeDate('2026-08-11')).toBe('2026-08-11')
    expect(normalizeDate('2026/7/5')).toBe('2026-07-05')
    expect(normalizeDate('')).toBeNull()
    expect(normalizeDate('abc')).toBeNull()
  })

  it('时间戳口径', () => {
    expect(isDate('2026-08-11')).toBe(true)
    expect(isDate('2026/08/11')).toBe(false)
    expect(isTimestamp('2026-05-12 00:06:36')).toBe(true)
    expect(isTimestamp('2026-05-12')).toBe(false)
    expect(dateFromTimestamp('2026-05-12 00:06:36')).toBe('2026-05-12')
    expect(dateFromTimestamp('2026-05-12')).toBe('2026-05-12')
    expect(dateFromTimestamp('')).toBeNull()
  })
})
