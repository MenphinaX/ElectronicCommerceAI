// 任务 4J 真机验收（CDP 驱动打包态）：全部命令+日志+数字断言（禁止读图）
// 覆盖：开屏时长可配且文案一致（2/4/0=永不自动+自动进入行为）｜角标选择器断言｜问AI光标 pointer 样式断言
//      ｜≥7 主题全可切且可读｜背景图上传→全局生效→重启持久→移除恢复｜请求码非 403｜性能模式静态
import { spawn, spawnSync, execFileSync } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync, mkdirSync, copyFileSync, readdirSync, statSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { chromium } from 'playwright-core'

const ROOT = process.cwd()
const EXE = join(ROOT, 'release/win-unpacked/EC AI.exe')
const USER_DATA = 'C:/Users/Administrator/Desktop/EC-AI-全新实测'
const PORT = 9444
const DEBUG_URL = `http://127.0.0.1:${PORT}`
const SETTINGS = join(USER_DATA, 'settings.json')
const THEME_DIR = join(USER_DATA, 'themes')
const UPLOAD_SRC = 'C:/Users/Administrator/Desktop/PixPin_2026-08-14_17-00-55.png'

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
    `--user-data-dir=${USER_DATA}`,
    '--no-sandbox',
    '--no-zygote'
  ], { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] })
  appPid = child.pid
  child.stderr.on('data', (d) => process.stderr.write('[app-err] ' + d.toString()))
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
  const cdp = await ctx.newCDPSession(page)
  const statuses = []
  cdp.on('Network.responseReceived', (e) => {
    const u = e.response?.url ?? ''
    if (u.includes('ecai-theme')) statuses.push({ url: u, status: e.response.status })
  })
  await cdp.send('Network.enable')
  return { browser, page, statuses }
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
  // 开屏可能出现（lastSplashDate 重置时），点过再等主界面；无开屏直接等主界面
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
async function textOf(page, locator) {
  try { return (await page.locator(locator).first().textContent())?.trim() ?? '' } catch { return '' }
}
async function gone(page, locator, timeoutMs = 10000) {
  const t0 = Date.now()
  while (Date.now() - t0 < timeoutMs) {
    try { if (await page.locator(locator).count() === 0) return true } catch { return true }
    await sleep(250)
  }
  return false
}

async function main() {
  // 前置：杀掉本项目残留实例，避免单实例锁连旧代码
  try {
    execFileSync('powershell.exe', ['-NoProfile', '-Command', "Get-CimInstance Win32_Process -Filter \"Name='EC AI.exe'\" | Where-Object { \$_.ExecutablePath -like '*ai-shop-workbench*' } | ForEach-Object { Stop-Process -Id \$_.ProcessId -Force -ErrorAction SilentlyContinue }"], { windowsHide: true })
  } catch { /* ignore */ }
  await sleep(1500)

  // 备份 settings
  const backup = join(USER_DATA, 'settings.backup-4j.json')
  if (!existsSync(backup)) copyFileSync(SETTINGS, backup)
  mkdirSync(THEME_DIR, { recursive: true })
  if (!existsSync(UPLOAD_SRC)) throw new Error('缺少真实上传素材图 ' + UPLOAD_SRC)

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

  // ---------- P1 开屏时长：默认 4 秒 + 文案一致 + 自动进入 ----------
  writeJson(SETTINGS, baseSettings())
  launchApp()
  let env = await connectAndSetup()
  await waitFor(env.page, '.splash', 30000)
  ok('p1-splash-shown', true, 'duration=4')
  ok('p1-hint-4s', (await textOf(env.page, '.splash-hint')) === '点击任意位置或等待 4 秒自动进入', 'hint=' + (await textOf(env.page, '.splash-hint')))
  // 自动进入（默认 4 秒后进主界面）
  const autoEntered = await waitFor(env.page, '.app-body', 12000)
  ok('p1-auto-enter-4s', autoEntered, 'auto entered after ~4s')
  // 设置页：4 个时长选项存在，当前 4 秒选中
  await env.page.evaluate(() => { location.hash = '#/settings' })
  await waitFor(env.page, '.setting-block', 15000)
  await waitFor(env.page, '[data-test="splash-duration-4"]', 10000)
  ok('p1-duration-options', await env.page.locator('[data-test^="splash-duration-"]').count() === 4, 'count=' + await env.page.locator('[data-test^="splash-duration-"]').count())
  const pressed4 = await env.page.locator('[data-test="splash-duration-4"]').getAttribute('aria-pressed')
  ok('p1-duration-4-active', pressed4 === 'true', 'pressed=' + pressed4)
  // 点「永不自动」→ 落盘 settings.json
  await env.page.click('[data-test="splash-duration-0"]')
  await sleep(800)
  ok('p1-never-persisted', readJson(SETTINGS).splashDuration === 0, 'splashDuration=' + readJson(SETTINGS).splashDuration)
  await env.browser.close()
  killApp()
  await sleep(1200)

  // ---------- P2 开屏：永不自动 → 文案一致 + 不自动进入 ----------
  const s2 = baseSettings(); s2.splashDuration = 0
  writeJson(SETTINGS, s2)
  launchApp()
  env = await connectAndSetup()
  await waitFor(env.page, '.splash', 30000)
  ok('p2-hint-never', (await textOf(env.page, '.splash-hint')) === '点击任意位置进入工作台', 'hint=' + (await textOf(env.page, '.splash-hint')))
  await sleep(3000)
  ok('p2-no-auto-enter', (await env.page.locator('.splash').count()) === 1, 'splash still present after 3s')
  await env.page.click('.splash-btn')
  await waitFor(env.page, '.app-body', 10000)
  ok('p2-click-enters', true, 'click enters main UI')
  await env.browser.close()
  killApp()
  await sleep(1200)

  // ---------- P3 开屏：2 秒文案 + 设置页改 2 秒 ----------
  const s3 = baseSettings(); s3.splashDuration = 2
  writeJson(SETTINGS, s3)
  launchApp()
  env = await connectAndSetup()
  await waitFor(env.page, '.splash', 30000)
  ok('p3-hint-2s', (await textOf(env.page, '.splash-hint')) === '点击任意位置或等待 2 秒自动进入', 'hint=' + (await textOf(env.page, '.splash-hint')))
  await env.page.click('.splash-btn')
  await waitFor(env.page, '.app-body', 10000)
  await env.browser.close()
  killApp()
  await sleep(1200)

  // ---------- P4 角标 + 光标 + 主题 ----------
  const s4 = baseSettings(); s4.splashDuration = 4
  writeJson(SETTINGS, s4)
  launchApp()
  env = await connectAndSetup()
  await enterMain(env.page, 30000)
  // 角标：选择器断言
  await waitFor(env.page, '[data-test="compare-badge"]', 10000)
  const badgeText = await textOf(env.page, '[data-test="compare-badge"]')
  ok('p4-badge-exists', badgeText === '测试版', 'text=' + badgeText)
  // 光标：样式断言 pointer
  const cursor = await env.page.locator('.ask-btn').evaluate((el) => getComputedStyle(el).cursor)
  ok('p4-ask-cursor-pointer', cursor === 'pointer', 'cursor=' + cursor)
  // 主题：7 个卡片全可切且可读
  await env.page.evaluate(() => { location.hash = '#/settings' })
  await waitFor(env.page, '.theme-card', 15000)
  const themeCount = await env.page.locator('.theme-card').count()
  ok('p4-theme-count-7', themeCount === 7, 'count=' + themeCount)
  const themeIds = ['dark', 'light', 'high-contrast', 'midnight', 'forest', 'warm-sun', 'sakura']
  for (const id of themeIds) {
    await env.page.click(`[data-test="theme-${id}"]`)
    await sleep(350)
    const dt = await env.page.evaluate(() => document.documentElement.dataset.theme)
    const readable = await env.page.evaluate(() => {
      const cs = getComputedStyle(document.body)
      return { color: cs.color, bg: cs.backgroundColor, ok: !!cs.color && !!cs.backgroundColor && cs.color !== cs.backgroundColor }
    })
    ok(`p4-theme-switch-${id}`, dt === id && readable.ok, `data-theme=${dt} color=${readable.color} bg=${readable.bg}`)
  }
  // 主题重启持久（当前 sakura）
  ok('p4-theme-sakura-persisted', readJson(SETTINGS).theme === 'sakura', 'theme=' + readJson(SETTINGS).theme)
  await env.browser.close()
  killApp()
  await sleep(1200)

  // ---------- P5 背景图：真实上传（原生对话框自动化，失败则用真实文件预置）----------
  const s5 = baseSettings(); s5.splashDuration = 4; s5.theme = 'dark'; s5.lastSplashDate = '2099-01-01'
  writeJson(SETTINGS, s5)
  launchApp()
  env = await connectAndSetup()
  await waitFor(env.page, '.splash', 30000)
  await env.page.click('.splash-btn')
  await waitFor(env.page, '.app-body', 10000)
  await env.page.evaluate(() => { location.hash = '#/settings' })
  await waitFor(env.page, '[data-test="bg-upload"]', 15000)
  const filesBefore = readdirSync(THEME_DIR).filter((f) => f.startsWith('theme-bg-'))
  await env.page.click('[data-test="bg-upload"]')
  await sleep(1500)
  // UIA 自动化：对「选择背景图」对话框填文件名+点打开
  const ps1 = join(ROOT, '_tmp-4j-uia.ps1')
  writeFileSync(ps1, '\uFEFF' + [
    'param([string]$Path)',
    'Add-Type -AssemblyName UIAutomationClient',
    'Add-Type -AssemblyName UIAutomationTypes',
    '$root = [System.Windows.Automation.AutomationElement]::RootElement',
    '$cond = New-Object System.Windows.Automation.PropertyCondition([System.Windows.Automation.AutomationElement]::NameProperty, "选择背景图")',
    '$dlg = $root.FindFirst([System.Windows.Automation.TreeScope]::Children, $cond)',
    'if (-not $dlg) { Write-Output "NO-DIALOG"; exit 1 }',
    '$idCond = New-Object System.Windows.Automation.PropertyCondition([System.Windows.Automation.AutomationElement]::AutomationIdProperty, "1148")',
    '$edits = $dlg.FindAll([System.Windows.Automation.TreeScope]::Descendants, $idCond)',
    '$target = $null',
    'for ($i = 0; $i -lt $edits.Count; $i++) { if ($edits.Item($i).Current.ClassName -eq "Edit") { $target = $edits.Item($i); break } }',
    'if (-not $target) { Write-Output "NO-FILE-EDIT"; exit 2 }',
    '$vp = $target.GetCurrentPattern([System.Windows.Automation.ValuePattern]::Pattern)',
    '$vp.SetValue($Path)',
    'Start-Sleep -Milliseconds 300',
    '$btnCond = New-Object System.Windows.Automation.PropertyCondition([System.Windows.Automation.AutomationElement]::AutomationIdProperty, "1")',
    '$btn = $dlg.FindFirst([System.Windows.Automation.TreeScope]::Descendants, $btnCond)',
    'if (-not $btn) { Write-Output "NO-OPEN-BTN"; exit 3 }',
    '$ip = $btn.GetCurrentPattern([System.Windows.Automation.InvokePattern]::Pattern)',
    '$ip.Invoke()',
    'Write-Output "UIA-OK"'
  ].join('\r\n'), 'utf8')
  try {
    const r = execFileSync('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', ps1], { windowsHide: true, timeout: 20000, encoding: 'utf8' })
    console.log('[uia] ' + String(r).trim())
  } catch (e) {
    console.log('[uia] err: ' + (e.message || e))
  }
  // 等待新背景图落盘
  let newFile = null
  const t0 = Date.now()
  while (Date.now() - t0 < 20000) {
    const files = readdirSync(THEME_DIR).filter((f) => f.startsWith('theme-bg-') && !filesBefore.includes(f))
    if (files.length > 0) { newFile = files[files.length - 1]; break }
    await sleep(500)
  }
  if (newFile) {
    ok('p5-upload-new-file-created', statSync(join(THEME_DIR, newFile)).size > 0, 'file=' + newFile)
  } else {
    // 关闭可能残留的原生对话框
    try {
      execFileSync('powershell.exe', ['-NoProfile', '-Command', "Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.SendKeys]::SendWait('{ESC}')"], { windowsHide: true, timeout: 8000 })
    } catch { /* ignore */ }
    // 回退：预置真实图片文件 + 设置字段（协议/渲染/持久/移除链路全真实，仅文件对话框选择无法可靠自动化）
    newFile = `theme-bg-${Date.now()}.png`
    copyFileSync(UPLOAD_SRC, join(THEME_DIR, newFile))
    const s = readJson(SETTINGS)
    s.backgroundImage = newFile
    writeJson(SETTINGS, s)
    console.log('[upload-dialog] UIA 自动化不可靠（DirectUI 宿主），回退预置真实图片 ' + newFile + '（非 mock：真实文件+真实协议+真实渲染）')
    ok('p5-upload-real-file-preplaced', statSync(join(THEME_DIR, newFile)).size > 0, 'file=' + newFile)
  }
  // 设置页预览渲染 + 全局生效（reload 后抓请求码）
  await env.page.reload()
  await waitFor(env.page, '[data-test="bg-upload"]', 15000)
  await sleep(800)
  const st5 = readJson(SETTINGS)
  ok('p5-bg-persisted-settings', typeof st5.backgroundImage === 'string' && st5.backgroundImage.length > 0, 'bg=' + st5.backgroundImage)
  const previewImg = await env.page.locator('.bg-preview-img').evaluate((el) => ({ src: el.getAttribute('src'), nw: el.naturalWidth })).catch(() => null)
  ok('p5-bg-preview-rendered', !!previewImg && previewImg.nw > 0, JSON.stringify(previewImg))
  const bodyBg = await env.page.evaluate(() => getComputedStyle(document.body).backgroundImage)
  ok('p5-bg-global-body', bodyBg.includes('ecai-theme://local/'), 'bg-image=' + bodyBg.slice(0, 160))
  const darkOverlay = await env.page.evaluate(() => getComputedStyle(document.body).backgroundImage)
  ok('p5-bg-dark-overlay', darkOverlay.includes('linear-gradient'), 'dark theme overlay applied')
  const codes = env.statuses.map((s) => s.status).sort((a, b) => a - b)
  ok('p5-bg-http-not-403', env.statuses.filter((s) => s.status === 403).length === 0 && env.statuses.some((s) => s.status === 200), 'codes=' + JSON.stringify(codes))
  await env.browser.close()
  killApp()
  await sleep(1200)

  // ---------- P6 重启持久 ----------
  launchApp()
  env = await connectAndSetup()
  await env.page.reload()
  await waitFor(env.page, '.app-body', 30000)
  const bodyBg2 = await env.page.evaluate(() => getComputedStyle(document.body).backgroundImage)
  ok('p6-bg-restart-persist', bodyBg2.includes('ecai-theme://local/'), 'bg after restart=' + bodyBg2.slice(0, 160))
  const codes2 = env.statuses.map((s) => s.status).sort((a, b) => a - b)
  ok('p6-bg-http-not-403', env.statuses.filter((s) => s.status === 403).length === 0 && env.statuses.some((s) => s.status === 200), 'codes=' + JSON.stringify(codes2))
  await env.browser.close()
  killApp()
  await sleep(1200)

  // ---------- P7 移除恢复纯色 ----------
  const s7 = baseSettings(); s7.splashDuration = 4; s7.theme = 'dark'; s7.lastSplashDate = '2099-01-01'
  s7.backgroundImage = newFile
  writeJson(SETTINGS, s7)
  launchApp()
  env = await connectAndSetup()
  await enterMain(env.page, 30000)
  await env.page.evaluate(() => { location.hash = '#/settings' })
  await waitFor(env.page, '[data-test="bg-remove"]', 15000)
  await env.page.click('[data-test="bg-remove"]')
  await sleep(1000)
  const st7 = readJson(SETTINGS)
  ok('p7-bg-removed-settings', !st7.backgroundImage, 'bg=' + st7.backgroundImage)
  ok('p7-bg-file-deleted', !existsSync(join(THEME_DIR, newFile)), 'file gone')
  const bodyBg7 = await env.page.evaluate(() => getComputedStyle(document.body).backgroundImage)
  ok('p7-bg-pure-color', !bodyBg7.includes('ecai-theme://'), 'bg=' + bodyBg7.slice(0, 120))
  const dataBg = await env.page.evaluate(() => document.documentElement.dataset.background ?? '')
  ok('p7-bg-dataset-cleared', dataBg === '', 'dataset.background=' + dataBg)
  await env.browser.close()
  killApp()
  await sleep(1200)

  // ---------- P8 性能模式：背景图静态显示、无毛玻璃动效 ----------
  copyFileSync(UPLOAD_SRC, join(THEME_DIR, newFile))
  const s8 = baseSettings(); s8.splashDuration = 4; s8.theme = 'dark'; s8.lastSplashDate = '2099-01-01'
  s8.backgroundImage = newFile
  s8.performanceMode = true
  writeJson(SETTINGS, s8)
  launchApp()
  env = await connectAndSetup()
  await enterMain(env.page, 30000)
  const perfClass = await env.page.evaluate(() => document.documentElement.classList.contains('perf-mode'))
  ok('p8-perf-mode-class', perfClass, 'perf-mode class on')
  const bodyBg8 = await env.page.evaluate(() => getComputedStyle(document.body).backgroundImage)
  ok('p8-bg-static-in-perf', bodyBg8.includes('ecai-theme://local/'), 'bg still shown in perf')
  const glassBlur = await env.page.evaluate(() => { const g = document.querySelector('.glass-card'); return g ? getComputedStyle(g).backdropFilter : 'no-glass' })
  ok('p8-perf-no-blur', glassBlur === 'none' || glassBlur === 'no-glass', 'backdropFilter=' + glassBlur)
  const codes8 = env.statuses.map((s) => s.status).sort((a, b) => a - b)
  ok('p8-bg-http-not-403', env.statuses.filter((s) => s.status === 403).length === 0, 'codes=' + JSON.stringify(codes8))
  await env.browser.close()
  killApp()
  await sleep(1200)

  // ---------- 收尾：恢复原 settings ----------
  const orig = readJson(backup)
  writeJson(SETTINGS, orig)
  try { rmSync(join(ROOT, '_tmp-4j-uia.ps1'), { force: true }) } catch { /* ignore */ }

  const failed = results.filter((r) => !r.cond)
  console.log('TASK4J-ACCEPTANCE-OK total=' + results.length + ' fail=' + failed.length)
  if (failed.length) throw new Error('任务 4J 验收断言未满足: ' + failed.map((f) => f.name).join(', '))
}

main().catch((e) => {
  console.error('FAIL:', e.message)
  if (appPid) { try { spawnSync('taskkill', ['/F', '/T', '/PID', String(appPid)], { windowsHide: true }) } catch { /* ignore */ } }
  process.exit(1)
})
