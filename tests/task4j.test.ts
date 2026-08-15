// 任务 4J 回归测试（TDD）：①主题 ≥7 且无 emoji ②背景图协议 URL 解析/生成 ③背景图大小与扩展名校验
// ④开屏时长纯函数 ⑤接线与防作弊（协议注册/handler/光标/角标/设置页/持久化字段）
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { THEMES, themeFileUrl } from '../src/renderer/src/data/themes'
import { themeNameFromUrl } from '../src/main/system/theme-url'
import { MAX_THEME_BG_BYTES, assertThemeBgSize, themeBgAllowed, themeBgOutExt } from '../src/main/system/theme'
import { DEFAULT_SPLASH_DURATION, SPLASH_DURATION_OPTIONS, splashDelayMs, splashHintText } from '../src/renderer/src/utils/splash'

const ROOT = join(__dirname, '..')
const EMOJI_RE = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}\u{2B00}-\u{2BFF}]/u

describe('任务4J ① 多主题：≥7 个、id 唯一、含新增四主题、无 emoji、CSS 变量齐全', () => {
  it('主题数量 ≥7 且 id 唯一', () => {
    expect(THEMES.length).toBeGreaterThanOrEqual(7)
    expect(new Set(THEMES.map((t) => t.id)).size).toBe(THEMES.length)
  })

  it('新增午夜蓝/森林绿/暖阳/樱花', () => {
    const ids = THEMES.map((t) => t.id)
    expect(ids).toContain('midnight')
    expect(ids).toContain('forest')
    expect(ids).toContain('warm-sun')
    expect(ids).toContain('sakura')
  })

  it('每个主题 label/desc 非空且无 emoji', () => {
    for (const t of THEMES) {
      expect(t.label.length).toBeGreaterThan(0)
      expect(t.desc.length).toBeGreaterThan(0)
      expect(t.label).not.toMatch(EMOJI_RE)
      expect(t.desc).not.toMatch(EMOJI_RE)
    }
  })

  it('全部主题在 base.css 有 data-theme 变量块', () => {
    const css = readFileSync(join(ROOT, 'src/renderer/src/assets/base.css'), 'utf8')
    for (const t of THEMES) {
      expect(css).toContain(`[data-theme="${t.id}"]`)
    }
  })
})

describe('任务4J ② 背景图协议 URL（仿头像，防目录穿越）', () => {
  it('themeFileUrl 生成 ecai-theme://local/文件名（编码）', () => {
    expect(themeFileUrl('theme-bg-1.png')).toBe('ecai-theme://local/theme-bg-1.png')
    expect(themeFileUrl('theme bg 测.jpg')).toBe('ecai-theme://local/theme%20bg%20%E6%B5%8B.jpg')
  })

  it('空文件名不生成 URL', () => {
    expect(themeFileUrl('')).toBe('')
  })

  it('themeNameFromUrl 双取：path 形式 + host 形式 + 编码还原', () => {
    expect(themeNameFromUrl('ecai-theme://local/theme-bg-1.png')).toBe('theme-bg-1.png')
    expect(themeNameFromUrl('ecai-theme://theme-bg-1.png')).toBe('theme-bg-1.png')
    expect(themeNameFromUrl('ecai-theme://local/theme%20bg%20%E6%B5%8B.jpg')).toBe('theme bg 测.jpg')
  })

  it('403 拦截保留：目录穿越/反斜杠/空/非协议', () => {
    expect(themeNameFromUrl('ecai-theme://local/..%2Fsecret.png')).toBeNull()
    expect(themeNameFromUrl('ecai-theme://local/a%2F..%2Fb.png')).toBeNull()
    expect(themeNameFromUrl('ecai-theme://local/..%5Csecret.png')).toBeNull()
    expect(themeNameFromUrl('ecai-theme://local/')).toBeNull()
    expect(themeNameFromUrl('ecai-avatar://local/theme-bg-1.png')).toBeNull()
    expect(themeNameFromUrl('http://local/theme-bg-1.png')).toBeNull()
    expect(themeNameFromUrl('not a url')).toBeNull()
  })
})

describe('任务4J ③ 背景图校验：≤8MB、仅 jpg/png/webp', () => {
  it('大小边界：8MB 内通过，超限抛错', () => {
    expect(() => assertThemeBgSize(Buffer.alloc(MAX_THEME_BG_BYTES))).not.toThrow()
    expect(() => assertThemeBgSize(Buffer.alloc(MAX_THEME_BG_BYTES + 1))).toThrow(/8MB/)
  })

  it('扩展名白名单：jpg/jpeg/png/webp 通过，其余拒绝', () => {
    expect(themeBgAllowed('jpg')).toBe(true)
    expect(themeBgAllowed('JPEG')).toBe(true)
    expect(themeBgAllowed('png')).toBe(true)
    expect(themeBgAllowed('webp')).toBe(true)
    expect(themeBgAllowed('gif')).toBe(false)
    expect(themeBgAllowed('bmp')).toBe(false)
  })

  it('输出扩展名：jpeg 归一 jpg，其余保留', () => {
    expect(themeBgOutExt('a.jpeg')).toBe('jpg')
    expect(themeBgOutExt('a.jpg')).toBe('jpg')
    expect(themeBgOutExt('a.png')).toBe('png')
    expect(themeBgOutExt('a.webp')).toBe('webp')
  })
})

describe('任务4J ④ 开屏时长纯函数：默认 4 秒、0=永不自动、性能模式短、文案一致', () => {
  it('默认 4 秒；选项 2/4/6/0', () => {
    expect(DEFAULT_SPLASH_DURATION).toBe(4)
    expect(SPLASH_DURATION_OPTIONS).toEqual([2, 4, 6, 0])
  })

  it('splashDelayMs：常规=秒×1000；0=null 不自动；性能模式=600', () => {
    expect(splashDelayMs(4, false)).toBe(4000)
    expect(splashDelayMs(2, false)).toBe(2000)
    expect(splashDelayMs(6, false)).toBe(6000)
    expect(splashDelayMs(0, false)).toBeNull()
    expect(splashDelayMs(4, true)).toBe(600)
  })

  it('splashHintText 与延时一致', () => {
    expect(splashHintText(4)).toBe('点击任意位置或等待 4 秒自动进入')
    expect(splashHintText(2)).toBe('点击任意位置或等待 2 秒自动进入')
    expect(splashHintText(0)).toBe('点击任意位置进入工作台')
  })
})

describe('任务4J ⑤ 接线与防作弊', () => {
  it('index.ts 注册 ecai-theme scheme，handler 用 themeNameFromUrl + 403/404/400', () => {
    const src = readFileSync(join(ROOT, 'src/main/index.ts'), 'utf8')
    expect(src).toContain("scheme: 'ecai-theme'")
    const start = src.indexOf("protocol.handle('ecai-theme'")
    expect(start).toBeGreaterThan(-1)
    const block = src.slice(start, start + 1500)
    expect(block).toContain('themeNameFromUrl(request.url)')
    expect(block).toContain('status: 403')
    expect(block).toContain('status: 404')
    expect(block).toContain('status: 400')
  })

  it('问AI 光标：cursor pointer 且无 not-allowed', () => {
    const src = readFileSync(join(ROOT, 'src/renderer/src/components/TopBar.vue'), 'utf8')
    const start = src.indexOf('.ask-btn')
    expect(start).toBeGreaterThan(-1)
    const block = src.slice(start, start + 600)
    expect(block).toContain('cursor: pointer')
    expect(block).not.toContain('cursor: not-allowed')
  })

  it('店铺对比「测试版」角标：可被选择器断言', () => {
    const src = readFileSync(join(ROOT, 'src/renderer/src/components/SidebarNav.vue'), 'utf8')
    expect(src).toContain('测试版')
    expect(src).toContain('nav-badge')
    expect(src).toContain('data-test="compare-badge"')
    expect(src).toContain("name: 'compare'")
  })

  it('设置页含开屏停留时长与背景图上传/移除', () => {
    const src = readFileSync(join(ROOT, 'src/renderer/src/views/SettingsView.vue'), 'utf8')
    expect(src).toContain('开屏停留时长')
    expect(src).toContain('永不自动')
    expect(src).toContain('上传背景图')
    expect(src).toContain('移除背景图')
    expect(src).toContain('themeFileUrl')
  })

  it('settings store 兼容旧 settings.json：缺字段走默认、支持 backgroundImage', () => {
    const src = readFileSync(join(ROOT, 'src/renderer/src/stores/settings.ts'), 'utf8')
    expect(src).toContain('splashDuration: DEFAULT_SPLASH_DURATION')
    expect(src).toContain("typeof s.splashDuration === 'number'")
    expect(src).toContain('backgroundImage')
    expect(src).toContain('applyBackground')
  })

  it('背景图渲染走本地协议，无 http(s) 外链', () => {
    const src = readFileSync(join(ROOT, 'src/renderer/src/data/themes.ts'), 'utf8')
    expect(src).not.toMatch(/https?:\/\//)
    expect(themeFileUrl('x.png')).toMatch(/^ecai-theme:\/\//)
  })


  it('index.html CSP 放行 ecai-theme 协议（img-src）', () => {
    const html = readFileSync(join(ROOT, 'src/renderer/index.html'), 'utf8')
    const m = html.match(/img-src[^;]+/)
    expect(m).not.toBeNull()
    expect(m![0]).toContain('ecai-theme:')
  })
  it('settings-store 持久化字段：splashDuration/backgroundImage', () => {
    const src = readFileSync(join(ROOT, 'src/main/system/settings-store.ts'), 'utf8')
    expect(src).toContain('splashDuration?')
    expect(src).toContain('backgroundImage?')
  })
})
