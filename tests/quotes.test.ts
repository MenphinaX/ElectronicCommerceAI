// 任务 10：开屏问候时段分级 + 语录（≥30 条、无 emoji、按日期轮换不重复）
import { describe, expect, it } from 'vitest'
import { greetingForHour, ECOMMERCE_QUOTES, quoteForDate } from '../src/renderer/src/data/quotes'

describe('greetingForHour', () => {
  const cases: Array<[number, string]> = [
    [0, '夜深了'],
    [4, '夜深了'],
    [5, '早上好'],
    [10, '早上好'],
    [11, '中午好'],
    [12, '中午好'],
    [13, '下午好'],
    [17, '下午好'],
    [18, '晚上好'],
    [22, '晚上好'],
    [23, '夜深了']
  ]
  for (const [hour, expected] of cases) {
    it(`hour ${hour} -> ${expected}`, () => {
      expect(greetingForHour(hour)).toBe(expected)
    })
  }
})

describe('quotes', () => {
  it('至少 30 条且全部唯一', () => {
    expect(ECOMMERCE_QUOTES.length).toBeGreaterThanOrEqual(30)
    expect(new Set(ECOMMERCE_QUOTES).size).toBe(ECOMMERCE_QUOTES.length)
  })

  it('不含 emoji 与测试残留文字', () => {
    const emoji = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}]/u
    for (const q of ECOMMERCE_QUOTES) {
      expect(emoji.test(q)).toBe(false)
      expect(q.includes('???')).toBe(false)
      expect(q.includes('测试')).toBe(false)
    }
  })

  it('按日期轮换：不同日期不同语录，同日期稳定', () => {
    const a = quoteForDate('2026-08-14')
    const b = quoteForDate('2026-08-15')
    const again = quoteForDate('2026-08-14')
    expect(again).toBe(a)
    expect(b).not.toBe(a)
  })
})