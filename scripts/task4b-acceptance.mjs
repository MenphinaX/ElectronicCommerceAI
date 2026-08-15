// 任务 4B 数据看板 1:1 复刻验收编排：真实 DB 走查 9 区块截图 + 窗口联动 + 数字回溯日志
import { spawn, spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
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
    // ??
  }
}

async function main() {
  const mode = 'task4b'
  const tag = 'task4b'
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
    EC_AI_AUTOSHOT_MODE: mode
  }
  const child = spawn('npm.cmd', ['run', 'dev'], { cwd: root, env, windowsHide: true, shell: true, stdio: ['ignore', 'pipe', 'pipe'] })
  const so = createWriteStream(outLog)
  const se = createWriteStream(errLog)
  child.stdout.pipe(so)
  child.stderr.pipe(se)
  const content = await waitForMarker(debugLogPath, 'TASK4B-DONE', 300000)
  try {
    writeFileSync(join(root, 'autoshot-' + tag + '.log'), content)
  } catch {
    // 文件尚未创建
  }
  so.end()
  se.end()
  killTree(child.pid)
  await sleep(2500)
  const lines = content.split('\n').filter((l) => l.startsWith('TASK4B-'))
  console.log('=== TASK4B 关键数字回溯（autoshot-debug.log） ===')
  for (const l of lines) console.log(l)
  const newShots = ['110','111','112','113','114','115','116','117','118','119','120','121','122','123','124','125']
    .map((n) => join(shotsDir, n + '-4b-*.png'))
  const list = readdir(shotsDir).filter((f) => /^1(1[0-9]|2[0-5])-4b-.*\.png$/.test(f)).sort()
  console.log('=== 新增截图 ===')
  for (const f of list) console.log(join(shotsDir, f))
  if (!list.length) throw new Error('未生成任何 4B 截图')
  console.log('TASK4B-ACCEPTANCE-OK shots=' + list.length)
}

import { readdirSync as readdir } from 'node:fs'
main().catch((e) => {
  console.error('FAIL:', e.message)
  process.exit(1)
})
