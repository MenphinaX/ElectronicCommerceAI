// 任务 4K 真机验收（CDP 驱动打包态）：7 主题全切，9 大区块颜色联动断言（禁止读图）
// 断言：bp 区块背景==body 主题背景；卡片/文字/边框/强调色==bp 色板变量；对比度可读；
//       dark 回归 4B 蓝本 1:1（数字/布局不变）；性能模式不受影响；主题真实切换（settings.json 落盘+重启）
import { spawn, spawnSync, execFileSync } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync, copyFileSync } from 'node:fs'
import { join } from 'node:path'
import { chromium } from 'playwright-core'

const ROOT = process.cwd()
const EXE = join(ROOT, 'release/win-unpacked/EC AI.exe')
const USER_DATA = 'C:/Users/Administrator/Desktop/EC-AI-全新实测'
const PORT = 9445
const DEBUG_URL = `http://127.0.0.1:${PORT}`
const SETTINGS = join(USER_DATA, 'settings.json')

const THEMES = ['dark', 'light', 'high-contrast', 'midnight', 'forest', 'warm-sun', 'sakura']

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const results = []
function ok(name, cond, extra = '') {
  results.push({ name, cond })
  console.log('ASSERT ' + (cond ? 'PASS' : 'FAIL') + ' ' + name + (extra ? ' ' + extra : ''))
}
function readJson(f) { return JSON.parse(readFileSync(f, 'utf8')) }
function writeJson(f, obj) { writeFileSync(f, JSON.stringify(obj, null, 2), 'utf8') }

let appPid = null
function killApp() {
  try { if (appPid) spawnSync('taskkill', ['/F', '/T', '/PID', String(appPid)], { windowsHide: true }) } catch { /* ignore */ }
  appPid = null
}
function launchApp() {
  const child = spawn(EXE, [
    `--remote-debugging-port=${PORT}`,
    '--remote-allow-origins=*',
    `--user-data-dir=${USER_DATA}`
  ], { windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] })
  appPid = child.pid
}

async function waitHttp(url, timeoutMs) {
  const t0 = Date.now()
  while (Date.now() - t0 < timeoutMs) {
    try { const r = await fetch(url); if (r.ok) return true } catch { /* retry */ }
    await sleep(500)
  }
  return false
}
async function connectAndSetup() {
  if (!(await waitHttp(DEBUG_URL + '/json/version', 30000))) throw new Error('CDP 端口未就绪')
  const browser = await chromium.connectOverCDP(DEBUG_URL)
  const ctx = browser.contexts()[0]
  const page = ctx.pages().find((p) => p.url().includes('index.html')) || ctx.pages()[0]
  return { browser, page }
}
async function waitFor(page, locator, timeoutMs = 30000) {
  const t0 = Date.now()
  while (Date.now() - t0 < timeoutMs) {
    try { if (await page.locator(locator).count() > 0) return true } catch { /* retry */ }
    await sleep(250)
  }
  return false
}
async function enterMain(page, timeoutMs = 30000) {
  const t0 = Date.now()
  while (Date.now() - t0 < timeoutMs) {
    if (await page.locator('.app-body').count() > 0) return true
    if (await page.locator('.splash').count() > 0) {
      await page.click('.splash-btn').catch(() => {})
      await sleep(500)
    } else {
      await sleep(250)
    }
  }
  return (await page.locator('.app-body').count()) > 0
}

// 归一化颜色：rgb(r, g, b) 或 #rrggbb → [r,g,b]
function normColor(s) {
  s = String(s || '').trim()
  const m = s.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/)
  if (m) return [Number(m[1]), Number(m[2]), Number(m[3])]
  const h = s.replace('#', '')
  if (!/^[0-9a-fA-F]{6}$/.test(h)) return null
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)]
}
function lum(rgb) {
  const [r, g, b] = rgb.map((v) => {
    const s = v / 255
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4)
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}
function contrast(a, b) {
  const la = lum(a)
  const lb = lum(b)
  const hi = Math.max(la, lb)
  const lo = Math.min(la, lb)
  return (hi + 0.05) / (lo + 0.05)
}
const rgbStr = (c) => c.join(',')

async function collectTheme(page) {
  return page.evaluate(() => {
    const cs = (el) => getComputedStyle(el)
    const root = document.documentElement
    const bp = document.querySelector('.bp-replica')
    const kpi = document.querySelector('.bp-replica .kpi')
    const label = document.querySelector('.bp-replica .kpi .label')
    const h2 = document.querySelector('.bp-replica h2')
    const h2bar = h2 ? getComputedStyle(h2, '::before') : null
    const rootCs = cs(root)
    return {
      theme: root.dataset.theme ?? '',
      bodyBg: cs(document.body).backgroundColor,
      bpBg: cs(bp).backgroundColor,
      bpText: cs(bp).color,
      cardBg: cs(kpi).backgroundColor,
      cardBorder: cs(kpi).borderTopColor,
      labelColor: cs(label).color,
      accentBar: h2bar ? h2bar.backgroundColor : '',
      varBpBg: rootCs.getPropertyValue('--bp-bg').trim(),
      varBpCard: rootCs.getPropertyValue('--bp-card').trim(),
      varBpText: rootCs.getPropertyValue('--bp-text').trim(),
      varBpBorder: rootCs.getPropertyValue('--bp-border').trim(),
      varBpAccent: rootCs.getPropertyValue('--bp-accent').trim(),
      kpiCount: document.querySelectorAll('.bp-replica .kpi').length,
      h2Count: document.querySelectorAll('.bp-replica h2').length,
      firstKpiValue: document.querySelector('.bp-replica .kpi .value')?.textContent?.trim() ?? '',
      width: bp.offsetWidth,
      height: bp.offsetHeight
    }
  })
}

async function main() {
  // 前置：杀掉本项目残留实例，避免单实例锁连旧代码
  try {
    execFileSync('powershell.exe', ['-NoProfile', '-Command', "Get-CimInstance Win32_Process -Filter \"Name='EC AI.exe'\" | Where-Object { $_.ExecutablePath -like '*ai-shop-workbench*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }"], { windowsHide: true })
  } catch { /* ignore */ }
  await sleep(1500)

  // 备份 settings
  const backup = join(USER_DATA, 'settings.backup-4k.json')
  if (!existsSync(backup)) copyFileSync(SETTINGS, backup)

  const baseSettings = () => ({
    profile: { username: '验收', avatar: 'brand' },
    onboardingDone: true,
    lastSplashDate: '2099-01-01',
    splashEnabled: true,
    splashDuration: 4,
    theme: 'dark',
    navCollapsed: false,
    performanceMode: false,
    trayOnClose: true
  })

  const snapshots = {}
  let dark = null

  // ---------- P1 七个主题真实切换 + 颜色联动断言 ----------
  for (const theme of THEMES) {
    const s = baseSettings()
    s.theme = theme
    writeJson(SETTINGS, s)
    launchApp()
    const env = await connectAndSetup()
    if (!(await enterMain(env.page, 30000))) throw new Error('进入主界面失败: ' + theme)
    await env.page.evaluate(() => { location.hash = '#/dashboard' })
    if (!(await waitFor(env.page, '.bp-replica', 30000))) throw new Error('看板未渲染: ' + theme)
    await sleep(600)
    const snap = await collectTheme(env.page)
    snapshots[theme] = snap
    const saved = readJson(SETTINGS).theme
    ok('p1-' + theme + '-settings-persisted', saved === theme, 'saved=' + saved)
    ok('p1-' + theme + '-data-theme', snap.theme === theme, 'data-theme=' + snap.theme)
    ok('p1-' + theme + '-9blocks-rendered', snap.h2Count === 9 && snap.kpiCount >= 6, 'h2=' + snap.h2Count + ' kpi=' + snap.kpiCount)
    ok('p1-' + theme + '-bp-bg==body-bg', normColor(snap.bpBg) && normColor(snap.bodyBg) && rgbStr(normColor(snap.bpBg)) === rgbStr(normColor(snap.bodyBg)), 'bpBg=' + snap.bpBg + ' bodyBg=' + snap.bodyBg)
    ok('p1-' + theme + '-bp-bg==var', normColor(snap.bpBg) && normColor(snap.varBpBg) && rgbStr(normColor(snap.bpBg)) === rgbStr(normColor(snap.varBpBg)), 'varBpBg=' + snap.varBpBg)
    ok('p1-' + theme + '-card==var', normColor(snap.cardBg) && normColor(snap.varBpCard) && rgbStr(normColor(snap.cardBg)) === rgbStr(normColor(snap.varBpCard)), 'cardBg=' + snap.cardBg + ' var=' + snap.varBpCard)
    ok('p1-' + theme + '-text==var', normColor(snap.bpText) && normColor(snap.varBpText) && rgbStr(normColor(snap.bpText)) === rgbStr(normColor(snap.varBpText)), 'bpText=' + snap.bpText)
    ok('p1-' + theme + '-border==var', normColor(snap.cardBorder) && normColor(snap.varBpBorder) && rgbStr(normColor(snap.cardBorder)) === rgbStr(normColor(snap.varBpBorder)), 'border=' + snap.cardBorder + ' var=' + snap.varBpBorder)
    ok('p1-' + theme + '-accent==var', normColor(snap.accentBar) && normColor(snap.varBpAccent) && rgbStr(normColor(snap.accentBar)) === rgbStr(normColor(snap.varBpAccent)), 'accent=' + snap.accentBar + ' var=' + snap.varBpAccent)
    // 可读性：正文 vs 背景 ≥4.5；次要文字 vs 卡片 ≥3
    const c1 = contrast(normColor(snap.bpText), normColor(snap.bpBg))
    const c2 = contrast(normColor(snap.labelColor), normColor(snap.cardBg))
    ok('p1-' + theme + '-readable-text-bg', c1 >= 4.5, 'contrast=' + c1.toFixed(2))
    ok('p1-' + theme + '-readable-label-card', c2 >= 3, 'contrast=' + c2.toFixed(2))
    if (theme === 'dark') dark = snap
    await env.browser.close()
    killApp()
    await sleep(1200)
  }

  // ---------- P2 真实换色：非暗色主题 bp 背景/文字必须与 dark 不同 ----------
  for (const theme of THEMES.filter((t) => t !== 'dark')) {
    const s = snapshots[theme]
    ok('p2-' + theme + '-bg-changed', normColor(s.bpBg) && normColor(dark.bpBg) && rgbStr(normColor(s.bpBg)) !== rgbStr(normColor(dark.bpBg)), 'dark=' + dark.bpBg + ' now=' + s.bpBg)
    ok('p2-' + theme + '-text-changed', normColor(s.bpText) && normColor(dark.bpText) && rgbStr(normColor(s.bpText)) !== rgbStr(normColor(dark.bpText)), 'darkText=' + dark.bpText + ' now=' + s.bpText)
  }

  // ---------- P3 dark 回归 4B 蓝本 1:1（数字/布局不变，只动颜色） ----------
  ok('p3-dark-bg-blueprint', rgbStr(normColor(dark.bpBg)) === '18,18,18', 'bpBg=' + dark.bpBg)
  ok('p3-dark-card-blueprint', rgbStr(normColor(dark.cardBg)) === '24,24,24', 'cardBg=' + dark.cardBg)
  ok('p3-dark-text-blueprint', rgbStr(normColor(dark.bpText)) === '245,245,245', 'bpText=' + dark.bpText)
  ok('p3-dark-accent-blueprint', rgbStr(normColor(dark.accentBar)) === '29,185,84', 'accent=' + dark.accentBar)
  // 数字/布局跨主题一致
  for (const theme of THEMES.filter((t) => t !== 'dark')) {
    const s = snapshots[theme]
    ok('p3-' + theme + '-numbers-unchanged', s.firstKpiValue === dark.firstKpiValue && s.kpiCount === dark.kpiCount && s.h2Count === dark.h2Count, 'v=' + s.firstKpiValue)
    ok('p3-' + theme + '-layout-unchanged', s.width === dark.width && s.height === dark.height, 'w=' + s.width + ' h=' + s.height)
  }

  // ---------- P4 性能模式不受影响 ----------
  const sp = baseSettings()
  sp.performanceMode = true
  writeJson(SETTINGS, sp)
  launchApp()
  let env = await connectAndSetup()
  await enterMain(env.page, 30000)
  await env.page.evaluate(() => { location.hash = '#/dashboard' })
  await waitFor(env.page, '.bp-replica', 30000)
  await sleep(500)
  const perfClass = await env.page.evaluate(() => document.documentElement.classList.contains('perf-mode'))
  ok('p4-perf-mode-class', perfClass, 'perf-mode on')
  const perfSnap = await collectTheme(env.page)
  ok('p4-perf-bp-bg-correct', rgbStr(normColor(perfSnap.bpBg)) === '18,18,18', 'bpBg=' + perfSnap.bpBg)
  const trans = await env.page.evaluate(() => getComputedStyle(document.querySelector('.bp-replica .kpi')).transitionDuration)
  ok('p4-perf-no-transition', trans === '0s', 'transition=' + trans)
  await env.browser.close()
  killApp()
  await sleep(1200)

  // ---------- 收尾：恢复原 settings ----------
  const orig = readJson(backup)
  writeJson(SETTINGS, orig)

  const failed = results.filter((r) => !r.cond)
  console.log('TASK4K-ACCEPTANCE-OK total=' + results.length + ' fail=' + failed.length)
  if (failed.length) throw new Error('任务 4K 验收断言未满足: ' + failed.map((f) => f.name).join(', '))
}

main().catch((e) => {
  console.error('FAIL:', e.message)
  if (appPid) { try { spawnSync('taskkill', ['/F', '/T', '/PID', String(appPid)], { windowsHide: true }) } catch { /* ignore */ } }
  process.exit(1)
})
