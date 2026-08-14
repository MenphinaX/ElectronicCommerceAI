// 任务 4K 回归测试（TDD）：①bp 色板映射完整（7 主题）且暗色=4B 蓝本 Spotify 色板 1:1
// ②.bp-replica 作用域零硬编码色（只走变量别名）③各主题核心色对比度可读 ④无 emoji、无死规则
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { THEMES } from '../src/renderer/src/data/themes'

const ROOT = join(__dirname, '..')
const CSS = readFileSync(join(ROOT, 'src/renderer/src/assets/dashboard-blueprint.css'), 'utf8')
const EMOJI_RE = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}\u{2B00}-\u{2BFF}]/u

/** 每个主题色板必须含的颜色键 */
const REQUIRED_KEYS = [
  '--bp-bg', '--bp-bg-soft', '--bp-card', '--bp-card2', '--bp-card3',
  '--bp-border', '--bp-border2', '--bp-text', '--bp-text2', '--bp-text3',
  '--bp-accent', '--bp-accent2', '--bp-accent-dim',
  '--bp-bull', '--bp-bear', '--bp-amber', '--bp-blue', '--bp-purple',
  '--bp-shadow', '--bp-topbar-bg', '--bp-on-accent',
  '--bp-accent-border', '--bp-accent-shadow', '--bp-accent-glow', '--bp-accent-wash',
  '--bp-danger-soft', '--bp-danger-border', '--bp-bull-soft',
  '--bp-bear-soft', '--bp-bear-soft2', '--bp-bear-border',
  '--bp-amber-soft', '--bp-amber-soft2', '--bp-amber-border',
  '--bp-blue-soft', '--bp-blue-border', '--bp-hover', '--bp-hover-soft', '--bp-white-track'
]

function themeBlock(id: string): string {
  const re = new RegExp(`:root\\[data-theme="${id}"\\]\\{([^}]*)\\}`)
  const m = CSS.match(re)
  expect(m, `主题 ${id} 应有色板块`).not.toBeNull()
  return m![1]
}

function varValue(block: string, key: string): string {
  const re = new RegExp(`${key}:\\s*([^;]+);`)
  const m = block.match(re)
  expect(m, `${key} 应存在`).not.toBeNull()
  return m![1].trim()
}

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '')
  const n = h.length === 3 ? h.split('').map((x) => x + x).join('') : h
  return [parseInt(n.slice(0, 2), 16), parseInt(n.slice(2, 4), 16), parseInt(n.slice(4, 6), 16)]
}
function luminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex).map((v) => {
    const s = v / 255
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4)
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}
function contrast(a: string, b: string): number {
  const la = luminance(a)
  const lb = luminance(b)
  const hi = Math.max(la, lb)
  const lo = Math.min(la, lb)
  return (hi + 0.05) / (lo + 0.05)
}

describe('任务4K ① 色板映射完整：7 主题全有、暗色=4B 蓝本 1:1、其余主题真实换色', () => {
  it('7 个主题都定义完整 bp 色板块（含全部颜色键）', () => {
    expect(THEMES.length).toBeGreaterThanOrEqual(7)
    for (const t of THEMES) {
      const block = themeBlock(t.id)
      for (const key of REQUIRED_KEYS) {
        expect(block).toContain(key)
      }
    }
  })

  it('dark 主题与 4B 蓝本 Spotify 色板 1:1（数字/布局不受影响，只动颜色）', () => {
    const dark = themeBlock('dark')
    const expected: Array<[string, string]> = [
      ['--bp-bg', '#121212'], ['--bp-bg-soft', '#0f0f0f'], ['--bp-card', '#181818'],
      ['--bp-card2', '#1e1e1e'], ['--bp-card3', '#232323'],
      ['--bp-border', 'rgba(255,255,255,.08)'], ['--bp-border2', 'rgba(255,255,255,.15)'],
      ['--bp-text', '#f5f5f5'], ['--bp-text2', '#b3b3b3'], ['--bp-text3', '#7a7a7a'],
      ['--bp-accent', '#1DB954'], ['--bp-accent2', '#1ED760'], ['--bp-accent-dim', 'rgba(29,185,84,.13)'],
      ['--bp-bull', '#2ecc71'], ['--bp-bear', '#ff5c5c'], ['--bp-amber', '#f0b429'],
      ['--bp-blue', '#4da3ff'], ['--bp-purple', '#a78bfa']
    ]
    for (const [key, val] of expected) {
      expect(varValue(dark, key).toLowerCase(), key).toBe(val.toLowerCase())
    }
  })

  it('非暗色主题背景/卡片/文字与 dark 不同（真实换色，防只改表面）', () => {
    const darkBg = varValue(themeBlock('dark'), '--bp-bg')
    const darkText = varValue(themeBlock('dark'), '--bp-text')
    for (const t of THEMES.filter((x) => x.id !== 'dark')) {
      const block = themeBlock(t.id)
      expect(varValue(block, '--bp-bg'), `${t.id} bg 应换色`).not.toBe(darkBg)
      expect(varValue(block, '--bp-text'), `${t.id} text 应换色`).not.toBe(darkText)
    }
  })
})

describe('任务4K ② .bp-replica 作用域零硬编码色，只走变量别名', () => {
  it('别名块只含 var(--bp-*) 引用，无 hex/rgba', () => {
    const start = CSS.indexOf('.bp-replica{')
    const end = CSS.indexOf('.bp-replica *{')
    const aliasBlock = CSS.slice(start, end)
    expect(aliasBlock).toMatch(/--bg:var\(--bp-bg\)/)
    expect(aliasBlock).toMatch(/--accent:var\(--bp-accent\)/)
    expect(aliasBlock).not.toMatch(/#[0-9a-fA-F]{3,8}\b|rgba?\(/)
  })

  it('别名块与规则区无任何硬编码颜色', () => {
    const rules = CSS.slice(CSS.indexOf('.bp-replica{'))
    expect(rules).not.toMatch(/#[0-9a-fA-F]{3,8}\b|rgba?\(/)
  })

  it('死规则已移除：不再有 .bp-replica [data-theme="light"] .topbar 硬编码', () => {
    expect(CSS).not.toContain('data-theme="light"] .topbar')
  })
})

describe('任务4K ③ 各主题核心色对比度可读（深底不配深字）', () => {
  it('正文 text vs bg 对比度 ≥ 4.5（WCAG AA）', () => {
    for (const t of THEMES) {
      const block = themeBlock(t.id)
      const c = contrast(varValue(block, '--bp-text'), varValue(block, '--bp-bg'))
      expect(c, `${t.id} text/bg 对比度`).toBeGreaterThanOrEqual(4.5)
    }
  })

  it('次要文字 text2 vs card 对比度 ≥ 3', () => {
    for (const t of THEMES) {
      const block = themeBlock(t.id)
      const c = contrast(varValue(block, '--bp-text2'), varValue(block, '--bp-card'))
      expect(c, `${t.id} text2/card 对比度`).toBeGreaterThanOrEqual(3)
    }
  })

  it('按钮文字 on-accent vs accent 对比度 ≥ 3.5', () => {
    for (const t of THEMES) {
      const block = themeBlock(t.id)
      const c = contrast(varValue(block, '--bp-on-accent'), varValue(block, '--bp-accent'))
      expect(c, `${t.id} on-accent/accent 对比度`).toBeGreaterThanOrEqual(3.5)
    }
  })
})

describe('任务4K ④ 无 emoji、接线完整', () => {
  it('dashboard-blueprint.css 无 emoji', () => {
    expect(CSS).not.toMatch(EMOJI_RE)
  })

  it('DashboardView 无叠加覆盖硬编码色（:deep 仅滚动边距）', () => {
    const src = readFileSync(join(ROOT, 'src/renderer/src/views/DashboardView.vue'), 'utf8')
    expect(src).toContain(':deep(.bp-replica h2)')
    expect(src).not.toMatch(/#[0-9a-fA-F]{3,8}\b/)
  })
})
