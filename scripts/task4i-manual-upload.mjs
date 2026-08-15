// 任务 4I 验收（人工配合环节）：应用已开到设置页，用户手动真实上传头像（原生对话框）
// 本脚本监听：新头像落盘 → 设置保存 → 设置页预览真实渲染 → 重启后开屏仍显示新头像；全程命令+日志+数字断言（禁止读图）
import { spawn, spawnSync } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { chromium } from 'playwright-core'

const ROOT = process.cwd()
const EXE = join(ROOT, 'release/win-unpacked/EC AI.exe')
const USER_DATA = 'C:/Users/Administrator/Desktop/EC-AI-全新实测'
const PORT = 9347
const SETTINGS = join(USER_DATA, 'settings.json')
const AVATAR_DIR = join(USER_DATA, 'avatars')
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const results = []
function ok(name, cond, extra = '') {
  results.push({ name, cond })
  console.log('ASSERT ' + (cond ? 'PASS' : 'FAIL') + ' ' + name + (extra ? ' ' + extra : ''))
}

let appPid = null
function killApp() {
  try { spawnSync('taskkill', ['/F', '/T', '/PID', String(appPid)], { windowsHide: true }) } catch { /* ignore */ }
  appPid = null
}
function launchApp() {
  const child = spawn(EXE, [`--remote-debugging-port=${PORT}`, '--remote-allow-origins=*', `--user-data-dir=${USER_DATA}`, '--no-sandbox', '--no-zygote'], { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] })
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
async function connect() {
  if (!(await waitHttp(`http://127.0.0.1:${PORT}/json/version`, 30000))) throw new Error('CDP 未就绪')
  const browser = await chromium.connectOverCDP(`http://127.0.0.1:${PORT}`)
  const ctx = browser.contexts()[0]
  const page = ctx.pages().find((p) => p.url().includes('index.html')) || ctx.pages()[0]
  const cdp = await ctx.newCDPSession(page)
  const statuses = []
  cdp.on('Network.responseReceived', (e) => {
    const u = e.response?.url ?? ''
    if (u.includes('ecai-avatar')) statuses.push({ url: u, status: e.response.status })
  })
  await cdp.send('Network.enable')
  return { browser, page, statuses }
}
async function waitFor(page, locator, timeoutMs) {
  const t0 = Date.now()
  while (Date.now() - t0 < timeoutMs) {
    try { if (await page.locator(locator).count() > 0) return true } catch { /* retry */ }
    await sleep(250)
  }
  return false
}
async function waitImgLoaded(page, locator, timeoutMs = 15000) {
  const t0 = Date.now()
  while (Date.now() - t0 < timeoutMs) {
    try {
      const r = await page.locator(locator).evaluate((el) => ({ src: el.getAttribute('src'), complete: el.complete, nw: el.naturalWidth, nh: el.naturalHeight }))
      if (r && r.complete && r.nw > 0) return r
    } catch { /* retry */ }
    await sleep(250)
  }
  return null
}

async function main() {
  // 清理残留 + 前置 settings（不弹开屏，直接进设置页）
  try {
    spawnSync('powershell.exe', ['-NoProfile', '-Command', "Get-CimInstance Win32_Process -Filter \"Name='EC AI.exe'\" | Where-Object { $_.ExecutablePath -like '*ai-shop-workbench*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }"], { windowsHide: true })
  } catch { /* ignore */ }
  await sleep(1500)
  const st = JSON.parse(readFileSync(SETTINGS, 'utf8'))
  st.onboardingDone = true
  st.splashEnabled = false
  st.lastSplashDate = '2099-01-01'
  st.profile = { username: st.profile?.username || 'z', avatar: 'a2' }
  writeFileSync(SETTINGS, JSON.stringify(st, null, 2), 'utf8')

  launchApp()
  const env = await connect()
  await waitFor(env.page, 'a[href="/settings"]', 30000)
  await env.page.evaluate(() => { location.hash = '#/settings' })
  await waitFor(env.page, '.setting-block', 15000)
  const before = readdirSync(AVATAR_DIR).filter((f) => f.startsWith('avatar-'))
  console.log('======== 请手动操作（应用窗口已打开到「设置」页） ========')
  console.log('1) 点击「上传本地图片」按钮，在弹出的对话框选择：E:\\图片\\【哲风壁纸】兔子警官朱迪-撕裂缝隙.png')
  console.log('2) 点「保存资料」保存头像')
  console.log('等待新头像落盘（最长 5 分钟）...')

  // 轮询等待新头像文件出现
  let newFile = null
  const t0 = Date.now()
  while (Date.now() - t0 < 300000) {
    const files = readdirSync(AVATAR_DIR).filter((f) => f.startsWith('avatar-') && !before.includes(f))
    if (files.length > 0) { newFile = files[files.length - 1]; break }
    await sleep(1000)
  }
  ok('upload-new-file-created', !!newFile && statSync(join(AVATAR_DIR, newFile)).size > 0, 'file=' + (newFile ?? 'none'))
  if (newFile) {
    console.log('检测到新头像文件：' + newFile + '（' + statSync(join(AVATAR_DIR, newFile)).size + ' 字节）')
  }
  // 等待保存（settings.json 更新）
  const t1 = Date.now()
  let saved = null
  while (Date.now() - t1 < 60000) {
    const cur = JSON.parse(readFileSync(SETTINGS, 'utf8'))
    const a = cur.profile?.avatar ?? ''
    if (a === 'file:' + newFile) { saved = a; break }
    await sleep(1000)
  }
  ok('upload-saved-to-settings', saved === 'file:' + newFile, 'saved=' + saved)
  // 设置页预览 img 渲染 + 请求码
  const upImg = await waitImgLoaded(env.page, '.avatar-file-preview img')
  ok('upload-preview-img-src', !!upImg && upImg.src === 'ecai-avatar://local/' + newFile, JSON.stringify(upImg?.src ?? null))
  ok('upload-preview-rendered', !!upImg && upImg.nw > 0, 'naturalWidth=' + (upImg?.nw ?? 0))
  ok('upload-http-not-403', env.statuses.filter((s) => s.status === 403).length === 0 && env.statuses.some((s) => s.status === 200), 'codes=' + JSON.stringify(env.statuses.map((s) => s.status)))
  await env.browser.close()

  // 重启持久：开屏显示新头像
  st.splashEnabled = true
  st.lastSplashDate = ''
  writeFileSync(SETTINGS, JSON.stringify(st, null, 2), 'utf8')
  killApp()
  await sleep(1500)
  launchApp()
  const env2 = await connect()
  await env2.page.reload().catch(() => {})
  const splashShown = await waitFor(env2.page, '.splash-card', 30000)
  ok('relaunch-splash', splashShown, '重启后开屏出现')
  const restartImg = await waitImgLoaded(env2.page, '.splash-avatar img')
  ok('restart-persist-img-src', !!restartImg && restartImg.src === 'ecai-avatar://local/' + newFile, JSON.stringify(restartImg?.src ?? null))
  ok('restart-persist-rendered', !!restartImg && restartImg.nw > 0, 'naturalWidth=' + (restartImg?.nw ?? 0))
  ok('restart-http-not-403', env2.statuses.filter((s) => s.status === 403).length === 0 && env2.statuses.some((s) => s.status === 200), 'codes=' + JSON.stringify(env2.statuses.map((s) => s.status)))
  await env2.browser.close()
  killApp()

  const failed = results.filter((r) => !r.cond)
  console.log('TASK4I-MANUAL-UPLOAD total=' + results.length + ' fail=' + failed.length)
  if (failed.length) throw new Error('人工上传验收断言未满足: ' + failed.map((f) => f.name).join(', '))
}

main().catch((e) => {
  console.error('FAIL:', e.message)
  if (appPid) { try { spawnSync('taskkill', ['/F', '/T', '/PID', String(appPid)], { windowsHide: true }) } catch { /* ignore */ } }
  process.exit(1)
})