// 任务 4I 真机验收：CDP 驱动打包态应用（复用现有全新实例 EC-AI-全新实测 作为 userData）
// 断言全部为命令+日志+数字（禁止读图）：头像 <img> 真实渲染（complete && naturalWidth>0）+
// 协议请求返回码非 403（CDP Network.responseReceived）+ 重启持久 + 真实上传（原生文件对话框→落盘→渲染）
import { spawn, spawnSync, execFileSync } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync, mkdirSync, copyFileSync, readdirSync, statSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { chromium } from 'playwright-core'

const ROOT = process.cwd()
const EXE = join(ROOT, 'release/win-unpacked/EC AI.exe')
const USER_DATA = 'C:/Users/Administrator/Desktop/EC-AI-全新实测'
const PORT = 9333
const DEBUG_URL = `http://127.0.0.1:${PORT}`
const SETTINGS = join(USER_DATA, 'settings.json')
const AVATAR_DIR = join(USER_DATA, 'avatars')
const OLD_AVATAR = 'avatar-1786718461300.jpg'
const SRC_IMG = null
const UPLOAD_SRC = 'E:/图片/【哲风壁纸】兔子警官朱迪-撕裂缝隙.png'

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const results = []
function ok(name, cond, extra = '') {
  results.push({ name, cond })
  console.log('ASSERT ' + (cond ? 'PASS' : 'FAIL') + ' ' + name + (extra ? ' ' + extra : ''))
}

function readJson(f) {
  return JSON.parse(readFileSync(f, 'utf8'))
}
function writeJson(f, obj) {
  writeFileSync(f, JSON.stringify(obj, null, 2), 'utf8')
}

function killApp() {
  try {
    spawnSync('taskkill', ['/F', '/T', '/PID', String(appPid)], { windowsHide: true })
  } catch {
    // ignore
  }
  appPid = null
}
let appPid = null
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
  child.stdout.on('data', (d) => process.stderr.write('[app-out] ' + d.toString()))
}

async function waitHttp(url, timeoutMs) {
  const t0 = Date.now()
  while (Date.now() - t0 < timeoutMs) {
    try {
      const r = await fetch(url)
      if (r.ok) return true
    } catch {
      // retry
    }
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
    if (u.includes('ecai-avatar')) statuses.push({ url: u, status: e.response.status })
  })
  await cdp.send('Network.enable')
  return { browser, page, statuses }
}

async function waitFor(page, locator, timeoutMs = 30000) {
  const t0 = Date.now()
  while (Date.now() - t0 < timeoutMs) {
    try {
      if (await page.locator(locator).count() > 0) return true
    } catch {
      // retry
    }
    await sleep(250)
  }
  return false
}

async function waitImgLoaded(page, locator, timeoutMs = 15000) {
  const t0 = Date.now()
  while (Date.now() - t0 < timeoutMs) {
    try {
      const r = await page.locator(locator).evaluate((el) => ({
        src: el.getAttribute('src'),
        complete: el.complete,
        nw: el.naturalWidth,
        nh: el.naturalHeight
      }))
      if (r && r.complete && r.nw > 0) return r
    } catch {
      // retry
    }
    await sleep(250)
  }
  // 最后再取一次（可能自然宽度仍为 0）
  try {
    return await page.locator(locator).evaluate((el) => ({
      src: el.getAttribute('src'),
      complete: el.complete,
      nw: el.naturalWidth,
      nh: el.naturalHeight
    }))
  } catch {
    return null
  }
}

function avatarStatuses(statuses) {
  return statuses.map((s) => s.status).sort((a, b) => a - b)
}

async function main() {
  // 前置：清理本项目 win-unpacked 残留实例（避免单实例锁连到旧代码）
  try {
    execFileSync('powershell.exe', ['-NoProfile', '-Command', "Get-CimInstance Win32_Process -Filter \"Name='EC AI.exe'\" | Where-Object { \$_.ExecutablePath -like '*ai-shop-workbench*' } | ForEach-Object { Stop-Process -Id \$_.ProcessId -Force -ErrorAction SilentlyContinue }"], { windowsHide: true })
  } catch { /* ignore */ }
  await sleep(1500)
  // ---------- 前置：备份 settings ----------
  const backup = join(USER_DATA, 'settings.backup-4i.json')
  if (!existsSync(backup)) copyFileSync(SETTINGS, backup)
  const st = readJson(SETTINGS)
  mkdirSync(AVATAR_DIR, { recursive: true })
  if (!existsSync(join(AVATAR_DIR, OLD_AVATAR))) throw new Error('缺少既有真实头像文件 ' + OLD_AVATAR)

  // ---------- P1 开屏问候：自定义头像真实渲染 + 协议 200 ----------
  st.onboardingDone = true
  st.splashEnabled = true
  st.lastSplashDate = ''
  st.profile = { username: 'z', avatar: 'file:' + OLD_AVATAR }
  writeJson(SETTINGS, st)
  launchApp()
  let env = await connectAndSetup()
  await env.page.reload().catch(() => {})
  ok('p1-app-launch', await waitFor(env.page, '.splash-card'), '开屏出现')
  const splashImg = await waitImgLoaded(env.page, '.splash-avatar img')
  ok('p1-splash-img-src', !!splashImg && splashImg.src === 'ecai-avatar://local/' + OLD_AVATAR, JSON.stringify(splashImg?.src ?? null))
  ok('p1-splash-img-rendered', !!splashImg && splashImg.nw > 0, 'naturalWidth=' + (splashImg?.nw ?? 0))
  await sleep(600)
  ok('p1-avatar-http-not-403', env.statuses.filter((s) => s.status === 403).length === 0 && env.statuses.some((s) => s.status === 200), 'codes=' + JSON.stringify(avatarStatuses(env.statuses)))
  // 进入主界面（点按钮或等自动进入）
  try { await env.page.click('.splash-btn', { timeout: 3000 }) } catch { /* 可能已自动进入 */ }
  await waitFor(env.page, 'a[href="/settings"]', 20000)
  await env.browser.close()

  // ---------- P2 设置页：头像预览 + 选择器预览 双处渲染 ----------
  st.splashEnabled = false // 每次启动语义：跳过开屏直达工作台
  writeJson(SETTINGS, st)
  killApp()
  launchApp()
  env = await connectAndSetup()
  await waitFor(env.page, 'a[href="/settings"]', 30000)
  await env.page.evaluate(() => { location.hash = '#/settings' })
  await waitFor(env.page, '.setting-block', 15000)
  const profImg = await waitImgLoaded(env.page, '.profile-avatar img')
  ok('p2-settings-profile-img-src', !!profImg && profImg.src === 'ecai-avatar://local/' + OLD_AVATAR, JSON.stringify(profImg?.src ?? null))
  ok('p2-settings-profile-img-rendered', !!profImg && profImg.nw > 0, 'naturalWidth=' + (profImg?.nw ?? 0))
  const pickImg = await waitImgLoaded(env.page, '.avatar-file-preview img')
  ok('p2-settings-picker-img-rendered', !!pickImg && pickImg.nw > 0, 'naturalWidth=' + (pickImg?.nw ?? 0))
  const cellCount = await env.page.locator('.avatar-cell').count()
  ok('p2-builtin-avatars-ok', cellCount === 8, 'cells=' + cellCount)
  ok('p2-avatar-http-not-403', env.statuses.filter((s) => s.status === 403).length === 0 && env.statuses.some((s) => s.status === 200), 'codes=' + JSON.stringify(avatarStatuses(env.statuses)))
  await env.browser.close()

  // ---------- P3 引导页（首次向导）：认识你步骤 AvatarPicker 预览渲染 ----------
  st.onboardingDone = false
  st.splashEnabled = false // 每次启动语义：跳过开屏
  writeJson(SETTINGS, st)
  killApp()
  launchApp()
  env = await connectAndSetup()
  await waitFor(env.page, '.welcome-btn', 30000)
  await env.page.click('.welcome-btn') // 欢迎 → 认识你
  await waitFor(env.page, '.avatar-file-preview img', 15000)
  const obImg = await waitImgLoaded(env.page, '.avatar-file-preview img')
  ok('p3-onboarding-picker-img-src', !!obImg && obImg.src === 'ecai-avatar://local/' + OLD_AVATAR, JSON.stringify(obImg?.src ?? null))
  ok('p3-onboarding-picker-img-rendered', !!obImg && obImg.nw > 0, 'naturalWidth=' + (obImg?.nw ?? 0))
  ok('p3-avatar-http-not-403', env.statuses.filter((s) => s.status === 403).length === 0 && env.statuses.some((s) => s.status === 200), 'codes=' + JSON.stringify(avatarStatuses(env.statuses)))
  await env.browser.close()

  // ---------- P4 重启持久：重启后再启动，开屏仍显示自定义头像 ----------
  st.onboardingDone = true
  st.splashEnabled = true
  st.lastSplashDate = ''
  writeJson(SETTINGS, st)
  killApp()
  launchApp()
  env = await connectAndSetup()
  await env.page.reload().catch(() => {})
  ok('p4-relaunch-splash', await waitFor(env.page, '.splash-card', 30000), '重启后开屏出现')
  const restartImg = await waitImgLoaded(env.page, '.splash-avatar img')
  ok('p4-persist-avatar-rendered', !!restartImg && restartImg.nw > 0 && restartImg.src === 'ecai-avatar://local/' + OLD_AVATAR, JSON.stringify(restartImg?.src ?? null))
  ok('p4-avatar-http-not-403', env.statuses.filter((s) => s.status === 403).length === 0 && env.statuses.some((s) => s.status === 200), 'codes=' + JSON.stringify(avatarStatuses(env.statuses)))
  await env.browser.close()

  // ---------- P5 真实上传：原生对话框选图 → 新头像落盘 → 设置页预览渲染 ----------
  st.splashEnabled = false // 每次启动语义：跳过开屏
  writeJson(SETTINGS, st)
  killApp()
  launchApp()
  env = await connectAndSetup()
  await waitFor(env.page, 'a[href="/settings"]', 30000)
  await env.page.evaluate(() => { location.hash = '#/settings' })
  await waitFor(env.page, '.setting-block', 15000)
  const avatarCountBefore = readdirSync(AVATAR_DIR).filter((f) => f.startsWith('avatar-')).length
  await env.page.click('.upload-btn') // 打开原生文件对话框
  await sleep(1500)
  // 原生对话框由系统接管：UI Automation 直接对「文件名」框(id=1148)赋值 + 点「打开(O)」按钮(id=1)（ps1 带 UTF-8 BOM）
  const ps1 = join(ROOT, '_tmp-4i-uia.ps1')
  writeFileSync(ps1, '\uFEFF' + [
    'param([string]$Path)',
    'Add-Type -AssemblyName UIAutomationClient',
    'Add-Type -AssemblyName UIAutomationTypes',
    '$root = [System.Windows.Automation.AutomationElement]::RootElement',
    '$cond = New-Object System.Windows.Automation.PropertyCondition([System.Windows.Automation.AutomationElement]::NameProperty, "选择头像图片")',
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
    execFileSync('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', ps1], { windowsHide: true, timeout: 20000 })
  } catch (e) {
    console.log('sendkeys err: ' + (e.message || e))
  }
  // 等待新头像落盘
  let newFile = null
  const t0 = Date.now()
  while (Date.now() - t0 < 20000) {
    const files = readdirSync(AVATAR_DIR).filter((f) => f.startsWith('avatar-') && f !== OLD_AVATAR)
    if (files.length > avatarCountBefore) { newFile = files[files.length - 1]; break }
    await sleep(500)
  }
  ok('p5-upload-new-file-created', !!newFile && statSync(join(AVATAR_DIR, newFile)).size > 0, 'file=' + (newFile ?? 'none'))
  // 保存资料
  await sleep(800)
  try { await env.page.click('.profile-actions .btn-primary', { timeout: 5000 }) } catch { /* 已保存过 */ }
  await sleep(1200)
  const stAfter = readJson(SETTINGS)
  const savedAvatar = stAfter.profile?.avatar ?? ''
  ok('p5-upload-saved-to-settings', savedAvatar === 'file:' + newFile, 'saved=' + savedAvatar)
  // 预览 img 应指向新文件且渲染成功
  const upImg = await waitImgLoaded(env.page, '.avatar-file-preview img')
  ok('p5-upload-preview-img-src', !!upImg && upImg.src === 'ecai-avatar://local/' + newFile, JSON.stringify(upImg?.src ?? null))
  ok('p5-upload-preview-rendered', !!upImg && upImg.nw > 0, 'naturalWidth=' + (upImg?.nw ?? 0))
  ok('p5-avatar-http-not-403', env.statuses.filter((s) => s.status === 403).length === 0 && env.statuses.some((s) => s.status === 200), 'codes=' + JSON.stringify(avatarStatuses(env.statuses)))
  await env.browser.close()

  // ---------- 收尾：恢复原 settings（保留上传产物），清理 ----------
  const orig = readJson(backup)
  writeJson(SETTINGS, orig)
  killApp()
  try { rmSync(join(ROOT, '_tmp-4i-uia.ps1'), { force: true }) } catch { /* ignore */ }

  const failed = results.filter((r) => !r.cond)
  console.log('TASK4I-ACCEPTANCE-OK total=' + results.length + ' fail=' + failed.length)
  if (failed.length) throw new Error('任务 4I 验收断言未满足: ' + failed.map((f) => f.name).join(', '))
}

main().catch((e) => {
  console.error('FAIL:', e.message)
  if (appPid) { try { spawnSync('taskkill', ['/F', '/T', '/PID', String(appPid)], { windowsHide: true }) } catch { /* ignore */ } }
  process.exit(1)
})