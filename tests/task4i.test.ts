// 任务 4I 回归测试（TDD）：①头像协议 URL 解析（host 旧格式 / path 新格式都能取对文件名，403 拦截不丢）
// ②前端 avatarFileUrl 生成新格式（固定 host local，文件名放 pathname）③主进程 handler 接线与守卫
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { avatarNameFromUrl } from '../src/main/system/avatar-url'
import { avatarFileUrl } from '../src/renderer/src/data/avatars'

const ROOT = join(__dirname, '..')

describe('任务4I ① 头像协议 URL 解析（主进程取文件名，host/path 双取）', () => {
  it('新格式 path 形式 ecai-avatar://local/文件名 → 取到文件名', () => {
    expect(avatarNameFromUrl('ecai-avatar://local/avatar-1786718461300.jpg')).toBe('avatar-1786718461300.jpg')
  })

  it('旧格式 host 形式 ecai-avatar://文件名 → 兼容取到文件名', () => {
    expect(avatarNameFromUrl('ecai-avatar://avatar-1786718461300.jpg')).toBe('avatar-1786718461300.jpg')
  })

  it('文件名带编码字符（空格/中文）→ 解码还原', () => {
    expect(avatarNameFromUrl('ecai-avatar://local/avatar%20%E6%B5%8B.jpg')).toBe('avatar 测.jpg')
    expect(avatarNameFromUrl('ecai-avatar://avatar%20%E6%B5%8B.jpg')).toBe('avatar 测.jpg')
  })

  it('403 拦截保留：目录穿越/反斜杠/空文件名/非头像协议', () => {
    expect(avatarNameFromUrl('ecai-avatar://local/..%2Fsecret.jpg')).toBeNull()
    expect(avatarNameFromUrl('ecai-avatar://local/avatar%2F..%2Fsecret.jpg')).toBeNull()
    expect(avatarNameFromUrl('ecai-avatar://local/..%5Csecret.jpg')).toBeNull()
    expect(avatarNameFromUrl('ecai-avatar://local/')).toBeNull()
    expect(avatarNameFromUrl('ecai-img://local/avatar-1.jpg')).toBeNull()
    expect(avatarNameFromUrl('http://local/avatar-1.jpg')).toBeNull()
    expect(avatarNameFromUrl('not a url')).toBeNull()
  })
})

describe('任务4I ② 前端 avatarFileUrl 生成新格式（固定 host local）', () => {
  it('file:文件名 → ecai-avatar://local/文件名（编码）', () => {
    expect(avatarFileUrl('file:avatar-1786718461300.jpg')).toBe('ecai-avatar://local/avatar-1786718461300.jpg')
    expect(avatarFileUrl('file:avatar 测.jpg')).toBe('ecai-avatar://local/avatar%20%E6%B5%8B.jpg')
  })

  it('非 file: 内置头像 → 空串（不生成协议 URL）', () => {
    expect(avatarFileUrl('a2')).toBe('')
    expect(avatarFileUrl('brand')).toBe('')
    expect(avatarFileUrl('')).toBe('')
  })
})

describe('任务4I ③ 主进程 handler 接线：双取解析 + 403/404 守卫不丢', () => {
  it('index.ts 头像 handler 调用 avatarNameFromUrl 并保留 403/404', () => {
    const src = readFileSync(join(ROOT, 'src/main/index.ts'), 'utf8')
    const start = src.indexOf("protocol.handle('ecai-avatar'")
    expect(start).toBeGreaterThan(-1)
    const block = src.slice(start, start + 1500)
    expect(block).toContain('avatarNameFromUrl(request.url)')
    expect(block).toContain('status: 403')
    expect(block).toContain('status: 404')
    expect(block).toContain('status: 400')
  })
})
