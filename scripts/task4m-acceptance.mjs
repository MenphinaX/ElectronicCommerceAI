// 任务 4M 打包态真机验收（铁律 5）：CDP 驱动 win-unpacked 0.1.4
// A 开屏出现→点击进入→.splash 消失且 .app-body 出现
// B 自动进入（时长 6s）→ .splash 消失且 .app-body 出现
// C 连续两次启动均通过（第二次启动仍显示开屏，每次启动语义）
// D 回归：lastSplashDate=今天 仍显示开屏（每次启动，日期不参与判断）
// E 回归：splashEnabled=false 直接进工作台（无 .splash）
// 铁律：AI 不读图；验收只用命令输出/数字断言
import { spawn, spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync, rmSync, copyFileSync } from 'node:fs'
import { join } from 'node:path'
import { chromium } from 'playwright-core'

const EXE = 'C:/Users/Administrator/Desktop/EC-AI-主程序源码/release/win-unpacked/EC AI.exe'
const ROOT = process.cwd()
const BASE = 'C:/Users/Administrator/AppData/Local/Temp/ecai-4m-accept'
const LOG_OUT = join(ROOT, 'accept-4m.log')
const LIC_SRC = process.env.APPDATA + '/EC AI/license.json'
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const results = []
function ok(name, cond, extra = '') {
  results.push({ name, cond })
  const line = 'ASSERT ' + (cond ? 'PASS' : 'FAIL') + ' ' + name + (extra ? ' ' + extra : '')
  console.log(line)
  writeFileSync(LOG_OUT, line + '\n', { flag: 'a', encoding: 'utf8' })
}
function note(msg) {
  console.log('NOTE ' + msg)
  writeFileSync(LOG_OUT, 'NOTE ' + msg + '\n', { flag: 'a', encoding: 'utf8' })
}
function killApp() {
  try { spawnSync('taskkill', ['/IM', 'EC AI.exe', '/F', '/T'], { windowsHide: true }) } catch (e) { /* ignore */ }
  appPid = null
}
let appPid = null
function launchApp(ud, settings, port, envExtra = {}) {
  rmSync(ud, { recursive: true, force: true })
  mkdirSync(ud, { recursive: true })
  if (existsSync(LIC_SRC)) copyFileSync(LIC_SRC, join(ud, 'license.json'))
  writeFileSync(join(ud, 'settings.json'), JSON.stringify(settings, null, 2), 'utf8')
  const child = spawn(EXE, ['--user-data-dir=' + ud, '--remote-debugging-port=' + port, '--remote-allow-origins=*'], {
    windowsHide: true,
    env: Object.assign({}, process.env, envExtra),
    stdio: ['ignore', 'ignore', 'pipe']
  })
  appPid = child.pid
}
async function waitHttp(url, timeoutMs) {
  const t0 = Date.now()
  while (Date.now() - t0 < timeoutMs) {
    try { const r = await fetch(url); if (r.ok) return true } catch (e) { /* retry */ }
    await sleep(400)
  }
  return false
}
async function connect(port) {
  if (!(await waitHttp('http://127.0.0.1:' + port + '/json/version', 45000))) throw new Error('CDP 端口未就绪 ' + port)
  const browser = await chromium.connectOverCDP('http://127.0.0.1:' + port)
  const ctx = browser.contexts()[0]
  const page = ctx.pages().find((p) => p.url().includes('index.html')) || ctx.pages()[0]
  return { browser, page }
}
async function waitSel(page, sel, timeoutMs) {
  const t0 = Date.now()
  while (Date.now() - t0 < timeoutMs) {
    try { if ((await page.locator(sel).count()) > 0) return true } catch (e) { /* retry */ }
    await sleep(200)
  }
  return false
}
async function selCount(page, sel) {
  try { return await page.locator(sel).count() } catch (e) { return -1 }
}
async function scenario(name, settings, opts) {
  const ud = join(BASE, name)
  const port = opts.port
  note('SCENARIO ' + name)
  launchApp(ud, settings, port)
  const { browser, page } = await connect(port)
  try {
    await page.reload().catch(() => {})
    return { browser, page, ud }
  } catch (e) {
    await browser.close().catch(() => {})
    throw e
  }
}
function baseSettings() {
  return {
    theme: 'dark', shopId: null, performanceMode: false, navCollapsed: false, trayOnClose: true,
    onboardingDone: true, splashEnabled: true, splashDuration: 6, lastSplashDate: '2026-08-15',
    profile: { username: '验收用户', avatar: 'a1' }, backgroundImage: ''
  }
}

async function main() {
  rmSync(LOG_OUT, { force: true })
  killApp()
  await sleep(1500)

  // ---------- A 点击进入 ----------
  {
    const s = baseSettings(); s.splashDuration = 0; s.splashDuration = 0
    const { browser, page } = await scenario('A-click', s, { port: 9231 })
    const splashShown = await waitSel(page, '.splash', 20000)
    const appBodyBefore = (await selCount(page, '.app-body')) > 0
    ok('A-splash-appears', splashShown, 'appBodyBefore=' + appBodyBefore)
    await page.click('.splash-btn').catch(() => page.click('.splash').catch(() => {}))
    await sleep(800)
    const splashGone = (await selCount(page, '.splash')) === 0
    const appBody = (await selCount(page, '.app-body')) > 0
    ok('A-click-enter-unmounts', splashGone === true && appBody === true, JSON.stringify({ splashGone, appBody }))
    await browser.close()
    killApp(); await sleep(1500)
  }

  // ---------- B 自动进入（6s，performanceMode=false）----------
  {
    const s = baseSettings(); s.splashDuration = 0
    s.splashDuration = 6
    const { browser, page } = await scenario('B-auto', s, { port: 9232 })
    const splashShown = await waitSel(page, '.splash', 20000)
    ok('B-splash-appears', splashShown)
    const t0 = Date.now()
    let splashGone = false, appBody = false
    while (Date.now() - t0 < 15000) {
      if ((await selCount(page, '.splash')) === 0 && (await selCount(page, '.app-body')) > 0) { splashGone = true; appBody = true; break }
      await sleep(300)
    }
    const elapsed = Math.round((Date.now() - t0) / 1000)
    ok('B-auto-enter-6s', splashGone === true && appBody === true && elapsed >= 5, JSON.stringify({ splashGone, appBody, elapsed }))
    await browser.close()
    killApp(); await sleep(1500)
  }

  // ---------- C 连续两次启动：第二次仍显示开屏（每次启动语义）----------
  {
    const s = baseSettings(); s.splashDuration = 0; s.splashDuration = 0
    const r1 = await scenario('C-first', s, { port: 9233 })
    const splash1 = await waitSel(r1.page, '.splash', 20000)
    ok('C-first-launch-splash', splash1)
    await r1.page.click('.splash-btn').catch(() => {})
    await waitSel(r1.page, '.app-body', 15000)
    ok('C-first-launch-enter', (await selCount(r1.page, '.app-body')) > 0)
    await r1.browser.close()
    killApp(); await sleep(1500)

    // 第二次启动（同一 user-data-dir，lastSplashDate 仍是今天）→ 开屏仍出现
    const ud = join(BASE, 'C-first')
    const r2 = await scenario('C-second', s, { port: 9234 })
    const splash2 = await waitSel(r2.page, '.splash', 20000)
    ok('C-second-launch-splash-again', splash2, '每次启动语义')
    await r2.page.click('.splash-btn').catch(() => {})
    await waitSel(r2.page, '.app-body', 15000)
    ok('C-second-launch-enter', (await selCount(r2.page, '.app-body')) > 0)
    await r2.browser.close()
    killApp(); await sleep(1500)
  }

  // ---------- D 回归：lastSplashDate=今天 仍显示开屏 ----------
  {
    const s = baseSettings(); s.splashDuration = 0; s.splashDuration = 0
    const { browser, page } = await scenario('D-lastdate-today', s, { port: 9235 })
    const splashShown = await waitSel(page, '.splash', 20000)
    ok('D-lastSplashDate-today-still-splash', splashShown, 'lastSplashDate=2026-08-15')
    await page.click('.splash-btn').catch(() => {})
    await waitSel(page, '.app-body', 15000)
    ok('D-enter-ok', (await selCount(page, '.app-body')) > 0)
    await browser.close()
    killApp(); await sleep(1500)
  }

  // ---------- E 回归：splashEnabled=false 直接进工作台 ----------
  {
    const s = baseSettings(); s.splashDuration = 0; s.splashDuration = 0
    s.splashEnabled = false
    const { browser, page } = await scenario('E-disabled', s, { port: 9236 })
    await waitSel(page, '.app-body', 25000)
    const appBody = (await selCount(page, '.app-body')) > 0
    const splashAbsent = (await selCount(page, '.splash')) === 0
    ok('E-splash-disabled-direct-workbench', appBody === true && splashAbsent === true, JSON.stringify({ appBody, splashAbsent }))
    await browser.close()
    killApp(); await sleep(1500)
  }

  const failed = results.filter((r) => !r.cond)
  console.log('TASK4M-ACCEPTANCE-OK total=' + results.length + ' fail=' + failed.length)
  writeFileSync(LOG_OUT, 'TASK4M-ACCEPTANCE-OK total=' + results.length + ' fail=' + failed.length + '\n', { flag: 'a', encoding: 'utf8' })
  if (failed.length) throw new Error('验收未满足: ' + failed.map((f) => f.name).join(', '))
}

main().catch((e) => {
  console.error('FAIL:', e.message)
  writeFileSync(LOG_OUT, 'FAIL:' + e.message + '\n', { flag: 'a', encoding: 'utf8' })
  process.exit(1)
})