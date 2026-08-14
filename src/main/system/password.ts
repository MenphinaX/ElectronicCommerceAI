// 密码锁核心（纯函数，可单测）：scrypt 加盐哈希，恒定时间比较
import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto'

export function hashPassword(pwd: string): string {
  const salt = randomBytes(16).toString('hex')
  const hash = scryptSync(String(pwd), salt, 64).toString('hex')
  return `${salt}:${hash}`
}

export function verifyPassword(pwd: string, stored: string): boolean {
  const [salt, hash] = String(stored).split(':')
  if (!salt || !hash) return false
  try {
    const candidate = scryptSync(String(pwd), salt, 64)
    const expected = Buffer.from(hash, 'hex')
    return candidate.length === expected.length && timingSafeEqual(candidate, expected)
  } catch {
    return false
  }
}