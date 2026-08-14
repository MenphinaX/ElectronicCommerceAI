// 任务 10：密码锁哈希（scrypt 加盐，错误密码/空存储不通过）
import { describe, expect, it } from 'vitest'
import { hashPassword, verifyPassword } from '../src/main/system/password'

describe('password lock', () => {
  it('正确密码通过，错误密码拒绝', () => {
    const h = hashPassword('ecai-2026')
    expect(verifyPassword('ecai-2026', h)).toBe(true)
    expect(verifyPassword('wrong', h)).toBe(false)
    expect(verifyPassword('', h)).toBe(false)
  })

  it('每次哈希盐不同，存储格式为 salt:hash', () => {
    const a = hashPassword('same')
    const b = hashPassword('same')
    expect(a).not.toBe(b)
    expect(a.split(':').length).toBe(2)
    expect(a.split(':')[1]).toMatch(/^[0-9a-f]{128}$/)
  })

  it('非法存储值拒绝', () => {
    expect(verifyPassword('x', '')).toBe(false)
    expect(verifyPassword('x', 'nosalt:badhash')).toBe(false)
    expect(verifyPassword('x', 'onlysalt')).toBe(false)
  })
})