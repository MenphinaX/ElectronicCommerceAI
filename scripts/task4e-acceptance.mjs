// 任务 4E 验收编排：真实 DB（%APPDATA%\EC AI）启动应用 → 触发内置技能 v1→v2 迁移 → 真实评语（deepseek-chat）
// 产出 TASK4E-* 日志、3 张板块评语卡截图 + 斜杠菜单截图，并断言 DB/目录/emoji/绑定
import { spawn, spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { createWriteStream } from 'node:fs'
import Database from 'better-sqlite3'

const root = process.cwd()
const debugLogPath = join(root, 'autoshot-debug.log')
const shotsDir = join(root, 'shots')
mkdirSync(shotsDir, { recursive: true })
const appData = process.env.APPDATA + '\\EC AI'
const dbPath = join(appData, 'ecai.db')
const skillsDir = join(appData, 'skills')

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
    await sleep(2000)
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

function dbSkills(dbPath2) {
  const db = new Database(dbPath2, { readonly: true })
  try {
    const skills = db.prepare('SELECT id, name, description, path FROM skills ORDER BY id').all()
    const binds = db.prepare('SELECT module, skill_id AS skillId FROM module_skills ORDER BY module').all()
    const version = db.prepare("SELECT value FROM settings WHERE key = 'builtin_skills_version'").get()
    return { skills, binds, version: version ? version.value : null }
  } finally {
    db.close()
  }
}

async function main() {
  const tag = 'task4e'
  if (existsSync(debugLogPath)) rmSync(debugLogPath)
  const outLog = join(root, 'dev-' + tag + '.log')
  const errLog = join(root, 'dev-' + tag + '.err.log')
  for (const f of [outLog, errLog]) if (existsSync(f)) rmSync(f)
  const env = {
    ...process.env,
    EC_AI_AUTOSHOT: '1',
    EC_AI_AUTOSHOT_MODE: 'task4e-live'
  }
  const child = spawn('npm.cmd', ['run', 'dev'], { cwd: root, env, windowsHide: true, shell: true, stdio: ['ignore', 'pipe', 'pipe'] })
  const so = createWriteStream(outLog)
  const se = createWriteStream(errLog)
  child.stdout.pipe(so)
  child.stderr.pipe(se)
  const content = await waitForMarker(debugLogPath, 'TASK4E-DONE', 900000)
  writeFileSync(join(root, 'autoshot-' + tag + '.log'), content)
  so.end(); se.end()
  killTree(child.pid)
  await sleep(3000)

  const lines = content.split('\n').filter((l) => l.startsWith('TASK4E-'))
  console.log('=== TASK4E 关键日志 ===')
  for (const l of lines) console.log(l.slice(0, 1400))

  // DB 断言（%APPDATA%\EC AI）
  const st = dbSkills(dbPath)
  const names = st.skills.map((s) => String(s.name))
  const expectNames = ['电商运营专家', '商品定价策略师', '付费推广优化师', '客服服务专家', '运营效能顾问', '搜索词分析师', '电商经营战略顾问', '电商运营策略师', '经营摘要专家', '电商数据分析师', '选品趋势研究员', '客服话术教练', '通用分析顾问']
  const namesOk = st.skills.length === 13 && expectNames.every((n) => names.includes(n)) && names.length === new Set(names).size
  const bindsOk = st.binds.length === 7
  const bindMap = Object.fromEntries(st.binds.map((b) => [b.module, st.skills.find((s) => s.id === b.skillId)?.name]))
  const expectBinds = { 全店: '电商运营专家', 单品: '商品定价策略师', 推广: '付费推广优化师', 客服: '客服服务专家', DSR: '运营效能顾问', 搜索词: '搜索词分析师', 指南: '电商经营战略顾问' }
  const bindsMapOk = Object.keys(bindMap).length === Object.keys(expectBinds).length && Object.entries(expectBinds).every(([m, n]) => bindMap[m] === n)
  const oldGone = !names.some((n) => ['全店', '单品', '指南', 'algorithmic-art'].includes(n)) && names.length === 13
  const versionOk = st.version === '2'
  // 目录断言
  const dirs = existsSync(skillsDir) ? readdirSync(skillsDir).filter((d) => !d.startsWith('.')) : []
  const dirsOk = dirs.length === 13 && expectNames.every((n) => dirs.includes(n))
  // emoji 扫描（%APPDATA%\EC AI\skills 全 SKILL.md）
  const emojiRe = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{2190}-\u{21FF}\u{23E9}-\u{23FA}\u{25AA}-\u{25FE}\u{2934}\u{2935}\u{3030}\u{303D}\u{3297}\u{3299}\u{231A}\u{231B}\u{FE0F}\u{200D}]/gu
  let emojiHits = 0
  let mdCount = 0
  for (const d of dirs) {
    const f = join(skillsDir, d, 'SKILL.md')
    if (existsSync(f)) {
      mdCount += 1
      emojiHits += (readFileSync(f, 'utf8').match(emojiRe) || []).length
    }
  }
  const emojiOk = emojiHits === 0 && mdCount === 13
  // 截图断言
  const shots = ['71-4e-comment-summary.png', '72-4e-comment-product.png', '73-4e-comment-promo.png', '74-4e-dashboard-comments-panel.png', '75-4e-chat-slash-menu.png', '76-4e-chat-slash-reply.png']
  const shotOk = shots.every((s) => existsSync(join(shotsDir, s)))

  const report = {
    skillsCount: st.skills.length,
    namesOk,
    bindsCount: st.binds.length,
    bindsMapOk,
    oldGone,
    versionOk,
    dirsCount: dirs.length,
    dirsOk,
    emojiHits,
    emojiMdCount: mdCount,
    emojiOk,
    shotsOk: shotOk,
    slashItems: (lines.find((l) => l.startsWith('TASK4E-SLASH-ITEMS')) || '').slice(0, 1200),
    commentsOk: lines.some((l) => l.startsWith('TASK4E-COMMENTS') && l.includes('电商运营专家') && l.includes('商品定价策略师') && l.includes('付费推广优化师')),
    chatReply: lines.find((l) => l.startsWith('TASK4E-CHAT-SLASH-REPLY')) || ''
  }
  const ok = namesOk && bindsOk && bindsMapOk && oldGone && versionOk && dirsOk && emojiOk && shotOk && report.commentsOk
  report.pass = ok
  console.log('=== 断言结果 ===')
  console.log(JSON.stringify(report, null, 2))
  writeFileSync(join(root, 'accept-4e-full.log'), JSON.stringify(report, null, 2) + '\n' + content)
  console.log('TASK4E-ACCEPTANCE-OK pass=' + ok)
  if (!ok) throw new Error('验收断言未满足，详见 accept-4e-full.log')
}

main().catch((e) => {
  console.error('FAIL:', e.message)
  process.exit(1)
})
