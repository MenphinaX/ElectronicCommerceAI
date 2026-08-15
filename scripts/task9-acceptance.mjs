// 任务 9 真实验收编排：工具 exe 截图 → 门禁取证 → 签发授权 → 全流程导入 → 重启授权态
import { spawn, spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { createWriteStream } from 'node:fs'

const root = process.cwd()
const appdataEc = join(process.env.APPDATA || '', 'EC AI')
const licensePath = join(appdataEc, 'license.json')
const authLogPath = join(appdataEc, 'auth-events.log')
const debugLogPath = join(root, 'autoshot-debug.log')
const shotsDir = join(root, 'shots')
const toolExe = join(root, 'out', 'license-tool', 'EC-AI-授权工具.exe')
const outDir = join(root, 'out', 'task9')
mkdirSync(outDir, { recursive: true })
mkdirSync(shotsDir, { recursive: true })

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

function enc(p) {
  return encodeURIComponent(p.replace(/\\/g, '/'))
}

async function waitForMarker(file, marker, timeoutMs) {
  const t0 = Date.now()
  while (Date.now() - t0 < timeoutMs) {
    try {
      const c = readFileSync(file, 'utf8')
      if (c.includes(marker)) return c
    } catch {
      // 文件尚未创建
    }
    await sleep(1500)
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

async function runApp(mode, query, tag) {
  if (existsSync(debugLogPath)) rmSync(debugLogPath)
  const outLog = join(root, `dev-task9-${tag}.log`)
  const errLog = join(root, `dev-task9-${tag}.err.log`)
  if (existsSync(outLog)) rmSync(outLog)
  if (existsSync(errLog)) rmSync(errLog)
  const env = {
    ...process.env,
    EC_AI_AUTOSHOT: '1',
    EC_AI_AUTOSHOT_MODE: mode,
    EC_AI_AUTOSHOT_QUERY: query || ''
  }
  const child = spawn('npm.cmd', ['run', 'dev'], { cwd: root, env, windowsHide: true, shell: true, stdio: ['ignore', 'pipe', 'pipe'] })
  const so = createWriteStream(outLog)
  const se = createWriteStream(errLog)
  child.stdout.pipe(so)
  child.stderr.pipe(se)
  const content = await waitForMarker(debugLogPath, 'TASK9-UI-LIVE-DONE', 180000)
  try {
    writeFileSync(join(root, 'autoshot-task9-' + tag + '.log'), content)
  } catch {
    // 归档失败不影响验收
  }
  so.end()
  se.end()
  killTree(child.pid)
  await sleep(2500)
  return content
}

function runToolAutoshot(args) {
  const env = {
    ...process.env,
    EC_AI_TOOL_AUTOSHOT: '1',
    EC_AI_TOOL_SHOTS_DIR: shotsDir,
    EC_AI_TOOL_LOG: join(root, 'tool-autoshot.log')
  }
  const r = spawnSync(toolExe, args, { cwd: root, env, windowsHide: true, timeout: 150000 })
  if (r.error) throw new Error('工具截图运行失败: ' + r.error.message)
}

// ---------- 0. 清场：确保未授权初始态 ----------
for (const p of [licensePath, authLogPath]) {
  if (existsSync(p)) rmSync(p)
}

// ---------- 1. 授权工具 exe 截图（独立启动 + 真实签发 UI） ----------
runToolAutoshot(['--autoshot=sign', `--machine=${process.argv[2]}`, '--expires=2026-12-31', '--issuer=管理员', `--out=${join(outDir, 'tool-ui-valid.lic')}`])
console.log('TOOL-SIGN-SHOT-DONE')
runToolAutoshot(['--autoshot=unlock', '--expires=2026-09-30', '--issuer=管理员', '--purpose=上门重置密码锁', `--out=${join(outDir, 'tool-ui-unlock.lic')}`])
console.log('TOOL-UNLOCK-SHOT-DONE')

// ---------- 2. 门禁取证（无授权） ----------
const gateLog = await runApp('task9-gate', '', 'gate')
const mm = /TASK9-GATE-MACHINE:(\{.*?\})\n/.exec(gateLog)
if (!mm) throw new Error('未取到机器码日志')
const gateState = JSON.parse(mm[1])
console.log('GATE-MACHINE-CODE=' + gateState.machine)
console.log('GATE-REASON=' + gateState.reason)

// ---------- 3. 用应用确认的机器码签发授权文件 ----------
const machine = gateState.machine
const gen = spawnSync(process.execPath, [join(root, 'scripts', 'task9-gen-licenses.cjs'), machine], { cwd: root, encoding: 'utf8', windowsHide: true })
console.log(gen.stdout.trim())
if (gen.status !== 0) throw new Error('签发失败: ' + gen.stderr)

// ---------- 4. 全流程导入验收 ----------
const q = '&licValid=' + enc(join(outDir, 'valid.lic')) +
  '&licExpired=' + enc(join(outDir, 'expired.lic')) +
  '&licExpiring=' + enc(join(outDir, 'expiring.lic')) +
  '&licUnlock=' + enc(join(outDir, 'unlock.lic')) +
  '&licTampered=' + enc(join(outDir, 'tampered.lic'))
const liveLog = await runApp('task9-live', q, 'live')
console.log('LIVE-FLOW-DONE')

// ---------- 5. 重启授权态（授权机器直接启动进主界面） ----------
writeFileSync(licensePath, readFileSync(join(outDir, 'valid.lic'), 'utf8'))
const startLog = await runApp('task9-start', '', 'start')
const sm = /TASK9-START-AUTHORIZED:(\{.*?\})\n/.exec(startLog)
if (sm) console.log('START-STATE=' + sm[1])
console.log('ALL-ACCEPTANCE-DONE')