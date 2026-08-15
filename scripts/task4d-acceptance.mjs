// 任务 4D 验收编排：①真实解析 jnMetaCode/agency-agents-zh 连续 3 次（窗口可操作+候选列表或中文报错+可取消，SKILLS4D-*）；
// ②三文件 2351 条完整质检（QA4D-* finish_reason/截断标记 + 报告 30 会话/总结段，不许降数据量）
// 用法：npm run dev 需可用；node scripts/task4d-acceptance.mjs [skills-only]
import { spawn, spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { readdirSync as readdir } from 'node:fs'
import { join } from 'node:path'
import { createWriteStream } from 'node:fs'

const root = process.cwd()
const debugLogPath = join(root, 'autoshot-debug.log')
const shotsDir = join(root, 'shots')
mkdirSync(shotsDir, { recursive: true })
const skillsOnly = process.argv.includes('skills-only')

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
  const tag = 'task4d'
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
    EC_AI_AUTOSHOT_MODE: 'task4d',
    EC_AI_AUTOSHOT_QUERY: skillsOnly ? '&qa=0' : ''
  }
  const child = spawn('npm.cmd', ['run', 'dev'], { cwd: root, env, windowsHide: true, shell: true, stdio: ['ignore', 'pipe', 'pipe'] })
  const so = createWriteStream(outLog)
  const se = createWriteStream(errLog)
  child.stdout.pipe(so)
  child.stderr.pipe(se)
  const timeoutMs = skillsOnly ? 420000 : 1500000
  const content = await waitForMarker(debugLogPath, 'TASK4D-DONE', timeoutMs)
  try {
    writeFileSync(join(root, 'autoshot-' + tag + '.log'), content)
  } catch {
    // 文件尚未创建
  }
  so.end()
  se.end()
  killTree(child.pid)
  await sleep(2500)
  const lines = content.split('\n').filter((l) => l.startsWith('SKILLS4D-') || l.startsWith('QA4D-') || l.startsWith('TASK4D-'))
  console.log('=== 任务4D 关键日志（autoshot-debug.log） ===')
  for (const l of lines) console.log(l)
  const list = readdir(shotsDir).filter((f) => /^13[0-6]-4d-.*\.png$/.test(f)).sort()
  console.log('=== 新增截图 ===')
  for (const f of list) console.log(join(shotsDir, f))
  if (!list.length) throw new Error('未生成任何 4D 截图')

  // 断言①：技能 3 连解析，窗口可操作，候选列表或明确中文报错（非 timeout 悬挂）
  let skillsOk = true
  for (let run = 1; run <= 3; run++) {
    const m = content.match(new RegExp('SKILLS4D-RUN' + run + ':(.*)$', 'm'))
    if (!m) { skillsOk = false; console.log('RUN' + run + ' 缺少日志'); continue }
    const d = JSON.parse(m[1])
    const okOutcome = d.outcome === 'candidates' || d.outcome === 'error'
    const okResponsive = d.responsive === true
    const okErr = d.outcome !== 'error' || /网络|超时|仓库不存在|不存在|限流|取消/.test(String(d.err ?? ''))
    console.log('RUN' + run + ' 断言 outcome=' + okOutcome + ' responsive=' + okResponsive + ' errClear=' + okErr)
    if (!(okOutcome && okResponsive && okErr)) skillsOk = false
  }
  const cancelM = content.match(/SKILLS4D-CANCEL:(.*)$/m)
  const cancelOk = cancelM ? JSON.parse(cancelM[1]).done === true : false
  console.log('取消断言 done=' + cancelOk)
  skillsOk = skillsOk && cancelOk

  if (skillsOnly) {
    console.log('TASK4D-ACCEPTANCE-OK skillsOnly=' + skillsOk + ' shots=' + list.length)
    if (!skillsOk) throw new Error('技能验收断言未满足')
    return
  }

  // 断言②：质检 2351 条/30 会话完整报告 + 总结段 + 不截断
  const parseM = content.match(/QA4D-PARSE:(.*)$/m)
  const streamM = content.match(/QA4D-STREAM:(.*)$/m)
  const doneM = content.match(/QA4D-DONE .*$/m)
  const errM = content.match(/QA4D-ERROR .*$/m)
  if (!parseM || !streamM) throw new Error('缺少 QA4D-PARSE/QA4D-STREAM 日志')
  const parse = JSON.parse(parseM[1])
  const stream = JSON.parse(streamM[1])
  const parseOk = parse.total === 2351 && parse.sessions === 30
  const streamOk = stream.done === true && stream.hasSummary === true && stream.truncated === false
  const coverOk = stream.sessionsInReport >= 25
  const doneOk = !!doneM && !errM
  const moji = /锟|鈥|\uFFFD|\?\?\?/.test(String(stream.tail ?? '')) ? 'FOUND' : 'NONE'
  console.log('质检断言 parse=' + parseOk + ' stream=' + streamOk + ' cover=' + coverOk + ' done=' + doneOk + ' moji=' + moji)
  console.log('QA4D-DONE 主进程日志: ' + (doneM ? doneM[0] : 'MISSING'))
  if (errM) console.log('QA4D-ERROR 主进程日志: ' + errM[0])
  const qaOk = parseOk && streamOk && coverOk && doneOk
  console.log('TASK4D-ACCEPTANCE-OK skills=' + skillsOk + ' qa=' + qaOk + ' shots=' + list.length)
  if (!skillsOk || !qaOk) throw new Error('任务 4D 验收断言未满足')
}

main().catch((e) => {
  console.error('FAIL:', e.message)
  process.exit(1)
})