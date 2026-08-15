// 任务 10：日志/诊断包脱敏（机器码 / API key / 订单号 / 金额）
import { describe, expect, it } from 'vitest'
import { sanitizeLine, sanitizeText } from '../src/main/system/sanitize'

describe('sanitizeLine', () => {
  it('打码机器码', () => {
    const line = 'machine=ECAI-6973e848160ae207e11a688cd083da7325d58104cb9dee5d54f99b33159d75b6-34ec13f06ce063d095bf13fdd17aa4334f690c16590b20c73d342ceb08ea198c ok'
    const out = sanitizeLine(line)
    expect(out).toContain('ECAI-***')
    expect(out).not.toContain('6973e848')
    expect(out).not.toContain('34ec13f0')
  })

  it('打码 API key（sk- 与 apiKey=）', () => {
    expect(sanitizeLine('key sk-abcdef1234567890xyz')).toContain('sk-***')
    expect(sanitizeLine('sk-abcdef1234567890xyz').includes('abcdef1234567890')).toBe(false)
    expect(sanitizeLine('apiKey="sk-secret123456789"')).toContain('apiKey=***')
    expect(sanitizeLine('apiKey=sk-secret123456789').includes('sk-secret123456789')).toBe(false)
  })

  it('打码 16 位以上数字串（订单号）', () => {
    const line = 'order 12345678901234567890 done'
    const out = sanitizeLine(line)
    expect(out).toContain('***')
    expect(out).not.toContain('12345678901234567890')
  })

  it('打码金额', () => {
    expect(sanitizeLine('pay ¥123,456.78')).toBe('pay ¥***')
    expect(sanitizeLine('refund 999.99元')).toContain('***元')
  })

  it('保留正常文本', () => {
    const line = 'app start ok version 1.0.3'
    expect(sanitizeLine(line)).toBe(line)
  })
})

describe('sanitizeText', () => {
  it('多行逐行脱敏', () => {
    const out = sanitizeText('a ECAI-abc123456789012345678901234567890 b\nc 12345678901234567890 d')
    expect(out).toContain('ECAI-***')
    expect(out).not.toContain('12345678901234567890')
  })
})