// 任务 4C 验收编排：真实 DB（%APPDATA%\EC AI\ecai.db 店铺1）走查商品卡每日数据 + 客服绩效子行，产出 TASK4C-* 日志与截图
import { spawn, spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
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

async function main() {
  const tag = 'task4c'
  if (existsSync(debugLogPath)) rmSync(debugLogPath)
  const consoleLogPath = join(root, 'autoshot-console.log')
  if (existsSync(consoleLogPath)) rmSync(consoleLogPath)
  const outLog = join(root, `dev-${tag}.log`)
  const errLog = join(root, `dev-${tag}.err.log`)
  if (existsSync(outLog)) rmSync(outLog)
  if (existsSync(errLog)) rmSync(errLog)
  const env = {
    ...process.env,
    EC_AI_AUTOSHOT: '1',
    EC_AI_AUTOSHOT_MODE: 'task4c'
  }
  const child = spawn('npm.cmd', ['run', 'dev'], { cwd: root, env, windowsHide: true, shell: true, stdio: ['ignore', 'pipe', 'pipe'] })
  const so = createWriteStream(outLog)
  const se = createWriteStream(errLog)
  child.stdout.pipe(so)
  child.stderr.pipe(se)
  const content = await waitForMarker(debugLogPath, 'TASK4C-DONE', 300000)
  try {
    writeFileSync(join(root, 'autoshot-' + tag + '.log'), content)
  } catch {
    // 文件尚未创建
  }
  so.end()
  se.end()
  killTree(child.pid)
  await sleep(2500)
  const lines = content.split('\n').filter((l) => l.startsWith('TASK4C-'))
  console.log('=== TASK4C 关键日志（autoshot-debug.log） ===')
  for (const l of lines) console.log(l)
  const list = readdir(shotsDir).filter((f) => /^12[89]-4c-.*\.png$/.test(f)).sort()
  console.log('=== 新增截图 ===')
  for (const f of list) console.log(join(shotsDir, f))
  if (!list.length) throw new Error('未生成任何 4C 截图')
  const htmlOk = content.includes('TASK4C-PD-HTML:{"n":0')
  const csOk = content.includes('TASK4C-CS-CHILDREN:{"n":8')
  console.log('TASK4C-ACCEPTANCE-OK html=' + htmlOk + ' csN8=' + csOk + ' shots=' + list.length)
  if (!htmlOk || !csOk) throw new Error('验收断言未满足（html 字面量应 n=0，客服子行应 n=8）')
}

main().catch((e) => {
  console.error('FAIL:', e.message)
  process.exit(1)
})