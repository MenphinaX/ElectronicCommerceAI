// 任务 4L 真机验收（CDP 驱动打包态 + 本地模拟源 + 反向验证 + 加速源真实连通）
// P1 本地模拟源（EC_AI_UPDATE_FEED）→ 启动 5s 自动发现新版 → 弹窗断言 → 稍后 → 后台下载 → 标记落盘
// P2 重启 → 待安装标记 → installing 事件（日志）+ 标记清除（EC_AI_UPDATE_FAKE_INSTALL=1 测试模式，跳过真实 quitAndInstall）
// P3 反向：源全挂 → 设置页「检查失败」提示且应用不崩
// P4 加速源真实连通（真实网络；官方仓库暂无 Release 时以 404 透传 + Motrix 有效 yml 证明代理转发）
// 铁律：AI 禁止读图；验收只用命令输出/日志/数字断言；quitAndInstall 真实安装留给用户手动实测
import { spawn, spawnSync } from 'node:child_process'
import { createServer } from 'node:http'
import { createHash, randomBytes } from 'node:crypto'
import { existsSync, readFileSync, writeFileSync, mkdirSync, rmSync, copyFileSync } from 'node:fs'
import { join } from 'node:path'
import { chromium } from 'playwright-core'

const ROOT = process.cwd()
const EXE = join(ROOT, 'release/win-unpacked/EC AI.exe')
const TEST_DIR = 'C:/Users/Administrator/Desktop/EC-AI-4L-test'
const SEED_DIR = 'C:/Users/Administrator/Desktop/EC-AI-全新实测'
const SETTINGS = join(TEST_DIR, 'settings.json')
const LOG = join(TEST_DIR, 'logs/ecai.log')
const FEED_PORT = 9560
const DEBUG_PORT = 9561
const DEBUG_URL = 'http://127.0.0.1:' + DEBUG_PORT
const FEED_URL = 'http://127.0.0.1:' + FEED_PORT
const NEW_VERSION = '0.1.2'
const LOG_OUT = join(ROOT, 'accept-4l.log')

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const results = []
function ok(name, cond, extra) {
  results.push({ name, cond })
  const line = 'ASSERT ' + (cond ? 'PASS' : 'FAIL') + ' ' + name + (extra ? ' ' + extra : '')
  console.log(line)
  writeFileSync(LOG_OUT, line + '\n', { flag: 'a', encoding: 'utf8' })
}
function note(msg) {
  console.log('NOTE ' + msg)
  writeFileSync(LOG_OUT, 'NOTE ' + msg + '\n', { flag: 'a', encoding: 'utf8' })
}
function readJson(f) { return JSON.parse(readFileSync(f, 'utf8')) }

let appPid = null
function killApp() {
  try { if (appPid) spawnSync('taskkill', ['/F', '/T', '/PID', String(appPid)], { windowsHide: true }) } catch (e) { /* ignore */ }
  appPid = null
}
function launchApp(env) {
  const child = spawn(EXE, [
    '--remote-debugging-port=' + DEBUG_PORT,
    '--remote-allow-origins=*'
  ].concat(['--user-data-dir=' + TEST_DIR]),
  { windowsHide: true, env: Object.assign({}, process.env, env), stdio: ['ignore', 'ignore', 'pipe'] })
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
async function connectAndSetup() {
  if (!(await waitHttp(DEBUG_URL + '/json/version', 40000))) throw new Error('CDP 端口未就绪')
  const browser = await chromium.connectOverCDP(DEBUG_URL)
  const ctx = browser.contexts()[0]
  const page = ctx.pages().find((p) => p.url().includes('index.html')) || ctx.pages()[0]
  return { browser, page }
}
async function waitFor(page, locator, timeoutMs) {
  const t0 = Date.now()
  while (Date.now() - t0 < timeoutMs) {
    try { if (await page.locator(locator).count() > 0) return true } catch (e) { /* retry */ }
    await sleep(250)
  }
  return false
}
async function waitText(page, locator, text, timeoutMs) {
  const t0 = Date.now()
  while (Date.now() - t0 < timeoutMs) {
    try {
      const el = page.locator(locator)
      if (await el.count() > 0) {
        const t = await el.innerText()
        if (t.includes(text)) return true
      }
    } catch (e) { /* retry */ }
    await sleep(250)
  }
  return false
}
async function waitFileCondition(path, cond, timeoutMs) {
  const t0 = Date.now()
  while (Date.now() - t0 < timeoutMs) {
    try {
      if (existsSync(path) && cond(readFileSync(path, 'utf8'))) return true
    } catch (e) { /* retry */ }
    await sleep(300)
  }
  return false
}
async function enterMain(page, timeoutMs) {
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

// ---------- 本地模拟源：latest.yml(0.1.2) + 小假安装包 + 正确 sha512 ----------
let feedServer = null
function startFeedServer() {
  const installer = randomBytes(256 * 1024)
  const sha512 = createHash('sha512').update(installer).digest('base64')
  const yml = [
    'version: ' + NEW_VERSION,
    'files:',
    '  - url: EC-AI-Setup-' + NEW_VERSION + '.exe',
    '    sha512: ' + sha512,
    '    size: ' + installer.length,
    'path: EC-AI-Setup-' + NEW_VERSION + '.exe',
    'sha512: ' + sha512
  ].join('\n')
  const ymlWithDate = yml + '\n' + "releaseDate: '2026-08-15T00:00:00.000Z'" + '\n'
  feedServer = createServer((req, res) => {
    if (req.url && req.url.includes('latest.yml')) {
      res.writeHead(200, { 'content-type': 'text/plain', 'content-length': Buffer.byteLength(ymlWithDate) })
      res.end(ymlWithDate)
    } else if (req.url && req.url.includes('EC-AI-Setup-0.1.2.exe')) {
      // 分块限速传输：给验收脚本留出「发现新版本 → 点稍后再说」的时间窗（约 4s）
      res.writeHead(200, { 'content-type': 'application/octet-stream', 'content-length': installer.length })
      let offset = 0
      const CHUNK = 4096
      const send = () => {
        if (offset >= installer.length) { res.end(); return }
        const end = Math.min(offset + CHUNK, installer.length)
        res.write(installer.subarray(offset, end))
        offset = end
        setTimeout(send, 60)
      }
      send()
    } else {
      res.writeHead(404)
      res.end('nope')
    }
  })
  return new Promise((resolve) => {
    feedServer.listen(FEED_PORT, '127.0.0.1', () => resolve())
  })
}

// ---------- 测试目录准备（隔离实例：复制授权与设置） ----------
function prepareTestDir() {
  rmSync(TEST_DIR, { recursive: true, force: true })
  mkdirSync(TEST_DIR, { recursive: true })
  copyFileSync(join(SEED_DIR, 'license.json'), join(TEST_DIR, 'license.json'))
  copyFileSync(join(SEED_DIR, 'settings.json'), SETTINGS)
  note('测试目录已准备: ' + TEST_DIR)
}

async function main() {
  writeFileSync(LOG_OUT, 'TASK4L-ACCEPTANCE start ' + new Date().toISOString() + '\n', 'utf8')
  if (!existsSync(EXE)) throw new Error('打包态不存在: ' + EXE)
  prepareTestDir()
  await startFeedServer()

  // ========== P1 本地模拟源：启动 5s 自动检查 → 弹窗 → 稍后 → 后台下载 → 标记落盘 ==========
  note('P1 启动打包态（EC_AI_UPDATE_FEED=本地模拟源）')
  launchApp({ EC_AI_UPDATE_FEED: FEED_URL })
  let env = await connectAndSetup()
  const p1Prompt = await waitFor(env.page, '[data-test="update-prompt"]', 45000)
  ok('p1-auto-check-popup-shown', p1Prompt, '启动 5s 后自动发现新版弹窗')
  if (p1Prompt) {
    const txt = await env.page.locator('[data-test="update-prompt"]').innerText()
    ok('p1-popup-title-new-version', txt.includes('发现新版本') && txt.includes('v0.1.2'), 'text=' + txt.replace(/\n/g, '|'))
    const hasNow = (await env.page.locator('[data-test="update-now"]').count()) > 0
    const hasLater = (await env.page.locator('[data-test="update-later"]').count()) > 0
    ok('p1-popup-buttons', hasNow && hasLater, '立即更新/稍后再说 双按钮')
    await env.page.click('[data-test="update-later"]')
    let closed = false
    const t0c = Date.now()
    while (Date.now() - t0c < 3000) {
      const vis = await env.page.locator('[data-test="update-prompt"]').isVisible().catch(() => false)
      if (!vis) { closed = true; break }
      const t = await env.page.locator('[data-test="update-prompt"]').innerText().catch(() => '')
      if (t.includes('已下载')) { closed = true; break }
      await sleep(200)
    }
    ok('p1-later-closes-popup', closed, '稍后再说关闭弹窗（后台继续下载，或已进入已下载态）')
  }
  const p1Marker = await waitFileCondition(SETTINGS, (s) => {
    try { return JSON.parse(s).updaterPendingInstall === NEW_VERSION } catch (e) { return false }
  }, 90000)
  ok('p1-download-writes-pending-marker', p1Marker, 'settings.json updaterPendingInstall=0.1.2')
  const p1Downloaded = await waitText(env.page, '[data-test="update-prompt"]', '已下载', 30000)
  ok('p1-downloaded-dialog', p1Downloaded, '下载完成弹「已下载，下次启动自动安装」')
  await env.browser.close()
  killApp()
  await sleep(1500)

  // ========== P2 重启：待安装标记 → installing 事件 + 标记清除（测试模式，不假装装过） ==========
  note('P2 重启（EC_AI_UPDATE_FAKE_INSTALL=1，无 feed 环境变量）')
  const markerBefore = readJson(SETTINGS).updaterPendingInstall
  ok('p2-marker-exists-before-restart', markerBefore === NEW_VERSION, 'marker=' + markerBefore)
  launchApp({ EC_AI_UPDATE_FAKE_INSTALL: '1' })
  const p2InstallLog = await waitFileCondition(LOG, (s) => s.includes('启动强制安装') && s.includes(NEW_VERSION), 30000)
  ok('p2-installing-event-logged', p2InstallLog, '日志含 installing 事件（启动强制安装 0.1.2）')
  const p2FakeLog = await waitFileCondition(LOG, (s) => s.includes('测试模式 EC_AI_UPDATE_FAKE_INSTALL=1'), 10000)
  ok('p2-fake-install-hook-logged', p2FakeLog, '日志含 测试模式：跳过真实 quitAndInstall')
  const p2Cleared = await waitFileCondition(SETTINGS, (s) => {
    try { const j = JSON.parse(s); return !('updaterPendingInstall' in j) || j.updaterPendingInstall === undefined } catch (e) { return false }
  }, 15000)
  ok('p2-marker-cleared', p2Cleared, 'settings.json 标记已清除')
  killApp()
  await sleep(1500)

  // ========== P3 反向：源全挂 → 明确「检查失败」提示且不崩 ==========
  note('P3 反向验证（EC_AI_UPDATE_FEED=死端口）')
  launchApp({ EC_AI_UPDATE_FEED: 'http://127.0.0.1:1' })
  env = await connectAndSetup()
  const p3Main = await enterMain(env.page, 40000)
  ok('p3-app-alive-after-check-fail', p3Main, '源全挂应用不崩，主界面可用')
  await env.page.evaluate(() => { location.hash = '#/settings' })
  await waitFor(env.page, '.setting-block', 15000)
  const btn = env.page.getByRole('button', { name: '检查更新' }).first()
  await btn.click().catch(async () => {
    await env.page.locator('button:has-text("检查更新")').first().click()
  })
  const p3Fail = await waitText(env.page, '.update-status', '检查失败', 40000)
  ok('p3-check-fail-hint', p3Fail, '设置页显示「检查失败（不影响正常使用）」')
  const p3Alive = await env.page.evaluate(() => 1 + 1)
  ok('p3-cdp-alive', p3Alive === 2, 'CDP 仍响应，未崩溃')
  await env.browser.close()
  killApp()
  await sleep(1500)

  // ========== P4 加速源真实连通（真实网络） ==========
  note('P4 加速源真实连通（真实网络）')
  const ecaiUrl = 'https://github.com/MenphinaX/ElectronicCommerceAI/releases/latest/download/latest.yml'
  const motrixUrl = 'https://github.com/agalwood/Motrix/releases/latest/download/latest.yml'
  const proxies = {
    'gh-proxy.com': 'https://gh-proxy.com/',
    'ghproxy.net': 'https://ghproxy.net/',
    'ghfast.top': 'https://ghfast.top/'
  }
  const probe = async (url) => {
    const t0 = Date.now()
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(8000) })
      const text = await r.text()
      const validYml = text.trimStart().startsWith('version:')
      return { ok: true, status: r.status, ms: Date.now() - t0, validYml, len: text.length }
    } catch (e) {
      return { ok: false, ms: Date.now() - t0, err: String(e).slice(0, 60) }
    }
  }
  let anyProxyReached = false
  let anyProxyValidYml = false
  for (const name of Object.keys(proxies)) {
    const prefix = proxies[name]
    const r1 = await probe(prefix + ecaiUrl)
    const r2 = await probe(prefix + motrixUrl)
    note(name + ' ecai=' + JSON.stringify(r1) + ' motrix=' + JSON.stringify(r2))
    if (r1.ok) anyProxyReached = true
    if (r2.ok && r2.validYml) anyProxyValidYml = true
  }
  const official = await probe(ecaiUrl)
  const motrixDirect = await probe(motrixUrl)
  note('官方GitHub ecai=' + JSON.stringify(official))
  note('GitHub直连(motrix) motrix=' + JSON.stringify(motrixDirect))
  ok('p4-proxy-reachable-ecai', anyProxyReached, '内置加速源 ≥1 个可转发 EC AI 仓库 URL（含 404 透传）')
  ok('p4-proxy-forwards-valid-yml', anyProxyValidYml, '内置加速源 ≥1 个真实转发有效 latest.yml（Motrix 示例）')
  if (!anyProxyReached && !motrixDirect.ok && !official.ok) {
    note('ENV-LIMIT: 网络不可用，加速源连通性无法在本环境实测（已贴日志）')
  }

  // 收尾：恢复测试目录 settings（去掉标记）并关闭模拟源
  try {
    const s = readJson(SETTINGS)
    delete s.updaterPendingInstall
    writeFileSync(SETTINGS, JSON.stringify(s, null, 2), 'utf8')
  } catch (e) { /* ignore */ }
  feedServer.close()

  const failed = results.filter((r) => !r.cond)
  console.log('TASK4L-ACCEPTANCE-OK total=' + results.length + ' fail=' + failed.length)
  writeFileSync(LOG_OUT, 'TASK4L-ACCEPTANCE-OK total=' + results.length + ' fail=' + failed.length + '\n', { flag: 'a', encoding: 'utf8' })
  if (failed.length) throw new Error('任务 4L 验收断言未满足: ' + failed.map((f) => f.name).join(', '))
}

main().catch((e) => {
  console.error('FAIL:', e.message)
  writeFileSync(LOG_OUT, 'FAIL: ' + e.message + '\n', { flag: 'a', encoding: 'utf8' })
  if (appPid) { try { spawnSync('taskkill', ['/F', '/T', '/PID', String(appPid)], { windowsHide: true }) } catch (e2) { /* ignore */ } }
  process.exit(1)
})
