// 任务 4F 验收编排（第三批交互体验 6 项）：①占位 ②质检切页保活 ③历史导出 md/txt/csv ④头像三态 ⑤开屏+设置开关 ⑥聊天输入区
// 用法：node scripts/task4f-acceptance.mjs
import { spawn, spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync, copyFileSync } from 'node:fs'
import { readdirSync as readdir } from 'node:fs'
import { join } from 'node:path'
import { createWriteStream } from 'node:fs'

const root = process.cwd()
const debugLogPath = join(root, 'autoshot-debug.log')
const shotsDir = join(root, 'shots')
mkdirSync(shotsDir, { recursive: true })

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function waitForMarker(file, marker, timeoutMs) {
  const t0 = Date.now()
  let last = ''
  while (Date.now() - t0 < timeoutMs) {
    try {
      const c = readFileSync(file, 'utf8')
      if (c.includes(marker)) return c
      last = c
    } catch {
      // 文件尚未创建
    }
    await sleep(1500)
  }
  if (last) {
    try { writeFileSync(join(root, 'autoshot-task4f-timeout.log'), last) } catch {}
  }
  throw new Error('等待标记超时: ' + marker)
}

function killTree(pid) {
  try {
    spawnSync('taskkill', ['/pid', String(pid), '/T', '/F'], { windowsHide: true })
  } catch {
    // 忽略
  }
}

async function runFlow(tag, mode, query, marker, timeoutMs) {
  if (existsSync(debugLogPath)) rmSync(debugLogPath)
  const consoleLogPath = join(root, 'autoshot-console.log')
  if (existsSync(consoleLogPath)) rmSync(consoleLogPath)
  const outLog = join(root, 'dev-' + tag + '.log')
  const errLog = join(root, 'dev-' + tag + '.err.log')
  if (existsSync(outLog)) rmSync(outLog)
  if (existsSync(errLog)) rmSync(errLog)
  const env = {
    ...process.env,
    EC_AI_AUTOSHOT: '1',
    EC_AI_AUTOSHOT_MODE: mode,
    EC_AI_AUTOSHOT_QUERY: query
  }
  const child = spawn('npm.cmd', ['run', 'dev'], { cwd: root, env, windowsHide: true, shell: true, stdio: ['ignore', 'pipe', 'pipe'] })
  const so = createWriteStream(outLog)
  const se = createWriteStream(errLog)
  child.stdout.pipe(so)
  child.stderr.pipe(se)
  let content
  try {
    content = await waitForMarker(debugLogPath, marker, timeoutMs)
  } finally {
    so.end()
    se.end()
    killTree(child.pid)
    await sleep(3000)
  }
  try { writeFileSync(join(root, 'autoshot-' + tag + '.log'), content) } catch {}
  return content
}

function grab(content, prefix) {
  return content.split('\n').filter((l) => l.startsWith(prefix)).map((l) => l.slice(prefix.length).trim())
}

function jsonOf(content, prefix) {
  const arr = grab(content, prefix)
  return arr.length ? JSON.parse(arr[arr.length - 1]) : null
}

async function main() {
  const settingsPath = process.env.APPDATA + '/EC AI/settings.json'
  const results = []
  const ok = (name, cond, extra = '') => {
    results.push({ name, cond })
    console.log('ASSERT ' + (cond ? 'PASS' : 'FAIL') + ' ' + name + (extra ? ' ' + extra : ''))
  }

  // ---------- 前置：开屏默认开、每日未消费；引导未完成（让引导页真实出现）；预置真实文件头像 ----------
  const st = JSON.parse(readFileSync(settingsPath, 'utf8'))
  st.onboardingDone = false
  st.splashEnabled = true
  st.lastSplashDate = ''
  const avatarDir = process.env.APPDATA + '/EC AI/avatars'
  mkdirSync(avatarDir, { recursive: true })
  copyFileSync(join(root, 'tmp-4f-avatars', 'avatar-small-300.png'), join(avatarDir, 'avatar-4f-splash.png'))
  st.profile = { username: st.profile?.username || '张先生', avatar: 'file:avatar-4f-splash.png' }
  writeFileSync(settingsPath, JSON.stringify(st, null, 2), 'utf8')

  const enc = encodeURIComponent
  const p = (name) => join(root, 'tmp-4f-avatars', name).replace(/\\/g, '/')
  const q = '&avatarSmall=' + enc(p('avatar-small-300.png')) +
    '&avatarBig=' + enc(p('avatar-big-2000x1000.png')) +
    '&avatarBad=' + enc(p('avatar-bad.png'))

  // ---------- 子流程 1：引导页占位（①） ----------
  const c1 = await runFlow('4f-onboarding', 'task4f-onboarding', '', 'TASK4F-ONBOARDING-DONE', 180000)
  const ph1 = jsonOf(c1, 'QA4F-ONBOARDING-PLACEHOLDER:')
  ok('onboarding-placeholder', !!ph1 && ph1.found === true && String(ph1.placeholder).includes('例如：XX旗舰店'), JSON.stringify(ph1))
  ok('onboarding-no-err', !grab(c1, 'TASK4F-ONBOARDING-ERR').length, grab(c1, 'TASK4F-ONBOARDING-ERR').join('|'))

  // ---------- 子流程 2：开屏欢迎页（⑤） ----------
  const c2 = await runFlow('4f-splash', 'task4f-splash', '', 'TASK4F-SPLASH-DONE', 120000)
  const pending2 = jsonOf(c2, 'QA4F-SPLASH-PENDING:')
  const rendered2 = jsonOf(c2, 'QA4F-SPLASH-RENDERED:')
  const content2 = jsonOf(c2, 'QA4F-SPLASH-CONTENT:')
  const after2 = jsonOf(c2, 'QA4F-SPLASH-AFTER-ENTER:')
  ok('splash-pending', pending2 === true, String(pending2))
  ok('splash-rendered', rendered2 === true, String(rendered2))
  ok('splash-content', !!content2 && !!content2.name && !!content2.greet && !!content2.sub && !!content2.quote && content2.avatarImg === true, JSON.stringify(content2))
  ok('splash-every-launch', !!after2 && after2.splashPending === true, JSON.stringify(after2))
  ok('splash-no-err', !grab(c2, 'TASK4F-SPLASH-ERR').length, grab(c2, 'TASK4F-SPLASH-ERR').join('|'))

  // ---------- 子流程 3：主流程（①②③④⑤⑥，含真实质检流） ----------
  const c3 = await runFlow('4f-main', 'task4f', q, 'TASK4F-DONE', 3600000)

  // ① 店铺管理占位
  const shopPh = jsonOf(c3, 'QA4F-SHOP-PLACEHOLDER:')
  ok('shop-placeholder', !!shopPh && shopPh.found === true && String(shopPh.placeholder).includes('如 XX旗舰店'), JSON.stringify(shopPh))

  // ⑤ 设置-开屏开关（不被测试补丁改坏）
  const sw = jsonOf(c3, 'QA4F-SETTINGS-SPLASH-TOGGLE:')
  ok('settings-splash-toggle', !!sw && sw.found === true && sw.before === true && sw.afterOff === false && sw.afterOn === true, JSON.stringify(sw))

  // ④ 头像三态：正常小图 / 超大图裁切压缩 / 坏文件报错
  const avSmall = jsonOf(c3, 'QA4F-AVATAR-SMALL:')
  const avBig = jsonOf(c3, 'QA4F-AVATAR-BIG:')
  const avBad = jsonOf(c3, 'QA4F-AVATAR-DECODE-ERR:')
  ok('avatar-small-ok', !!avSmall && avSmall.ok === true && avSmall.width === 300 && avSmall.height === 300 && avSmall.processed === false, JSON.stringify(avSmall))
  ok('avatar-big-cropped', !!avBig && avBig.ok === true && avBig.processed === true && avBig.width === avBig.height && avBig.width <= 512 && avBig.height <= 512, JSON.stringify(avBig))
  ok('avatar-bad-err', !!avBad && avBad.ok === false && /无法解析|损坏|格式/.test(avBad.error ?? ''), JSON.stringify(avBad))

  // ⑥ 聊天输入区：附件弹窗不形变 + textarea 自适应
  const attach = jsonOf(c3, 'QA4F-CHAT-ATTACH:')
  ok('chat-attach-menu', !!attach && attach.open === true && attach.items >= 2 && attach.width > 0 && attach.height > 0, JSON.stringify(attach))
  const grow = jsonOf(c3, 'QA4F-CHAT-AUTOGROW:')
  ok('chat-autogrow', !!grow && grow.grown === true && grow.h2 > grow.h1 && grow.h1 > 0, JSON.stringify(grow))

  // ② 质检切页保活：切走前有输出 → 切回保留并继续 → 完成与落库一致
  const away = jsonOf(c3, 'QA4F-KEEPALIVE-NAV-AWAY:')
  const back = jsonOf(c3, 'QA4F-KEEPALIVE-AFTER-RETURN:')
  const fin = jsonOf(c3, 'QA4F-KEEPALIVE-FINAL:')
  ok('keepalive-stream-started', !!away && away.lenBeforeNav > 0, JSON.stringify(away))
  ok('keepalive-continuous', !!back && back.continuous === true && back.lenAfter >= back.lenBefore, JSON.stringify(back))
  ok('keepalive-final-consistent', !!fin && fin.status === 'ok' && fin.matchesStored === true && fin.domLen > 0, JSON.stringify(fin))

  // ③ 质检历史导出：单条 md/txt + 批量汇总 csv
  const exp = jsonOf(c3, 'QA4F-HISTORY-EXPORT:')
  ok('history-export', !!exp && exp.captured >= 3 && exp.mdMatch === true && exp.csvOk === true, JSON.stringify(exp))

  // 无乱码扫描
  const moji = /锟|鈥|\uFFFD|\?\?\?/.test(c3) ? 'FOUND' : 'NONE'
  ok('no-mojibake', moji === 'NONE', 'moji=' + moji)

  // 截图清点（12 张：137~148）
  const list = readdir(shotsDir).filter((f) => /^1(3[7-9]|4[0-8])-4f-.*\.png$/.test(f)).sort()
  console.log('=== 4F 截图 ' + list.length + ' 张 ===')
  for (const f of list) console.log(join(shotsDir, f))
  const need = ['137-4f-shop-placeholder', '138-4f-onboarding-placeholder', '139-4f-qa-stream-during', '140-4f-qa-stream-after-return',
    '141-4f-qa-history-export', '142-4f-avatar-normal', '143-4f-avatar-processed', '144-4f-splash',
    '145-4f-splash-settings-toggle', '146-4f-chat-input', '147-4f-chat-input-attach', '148-4f-chat-input-grown']
  const missing = need.filter((n) => !list.some((f) => f.startsWith(n)))
  ok('shots-12', missing.length === 0, 'missing=' + missing.join(','))

  const failed = results.filter((r) => !r.cond)
  console.log('TASK4F-ACCEPTANCE-OK total=' + results.length + ' fail=' + failed.length)
  if (failed.length) throw new Error('任务 4F 验收断言未满足: ' + failed.map((f) => f.name).join(', '))
}

main().catch((e) => {
  console.error('FAIL:', e.message)
  process.exit(1)
})