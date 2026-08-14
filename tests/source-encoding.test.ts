// 源码编码守卫（任务 6 联验新增）：防止中文源码被错误编码写成乱码（GBK 误读为 UTF-8 的特征字）
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const ROOT = join(__dirname, '..', 'src')

function collectFiles(dir: string): string[] {
  const out: string[] = []
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) out.push(...collectFiles(p))
    else if (/\.(ts|vue|mjs)$/.test(name)) out.push(p)
  }
  return out
}

// GBK 字节被按 UTF-8 解码时出现的特征碎片（出现即代表中文被写坏）
const MOJIBAKE = ['妯', '鎺', '杩斿洖', '鍥炴', '蹇界暐', '澶氭ā', '鏂囨湰', '娴佸紡', '閫愪唤', '閫€鍥', '鐢ㄦ硶', '锛?']

describe('源码编码完整性', () => {
  it('src 下所有 ts/vue/mjs 文件无乱码特征碎片', () => {
    const files = collectFiles(ROOT)
    expect(files.length).toBeGreaterThan(50)
    const bad: string[] = []
    for (const f of files) {
      const text = readFileSync(f, 'utf8')
      if (MOJIBAKE.some((m) => text.includes(m))) bad.push(f)
    }
    expect(bad).toEqual([])
  })

  it('模型接口错误文案为可读中文（用户可见，禁乱码）', () => {
    const mc = readFileSync(join(ROOT, 'main', 'import', 'model-client.ts'), 'utf8')
    expect(mc).toContain('模型接口返回')
    expect(mc).toContain('模型接口无流式响应')
  })
})
