// 任务 4G 验收编排：模板示例/反推/保本/超红线告警/一键带入与库一致/历史保存-删除-导出/AI 建议无 key 不崩/截图 5 张
// 用法：node scripts/task4g-acceptance.mjs
import { spawn, spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { readdirSync as readdir } from 'node:fs'
import { join } from 'node:path'
import { createWriteStream } from 'node:fs'
import Database from 'better-sqlite3'

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
    } catch {}
    await sleep(1500)
  }
  if (last) writeFileSync(join(root, 'autoshot-task4g-timeout.log'), last)
  throw new Error('等待标记超时: ' + marker)
}

function killTree(pid) {
  try { spawnSync('taskkill', ['/pid', String(pid), '/T', '/F'], { windowsHide: true }) } catch {}
}

function dbPath() { return join(process.env.APPDATA, 'EC AI', 'ecai.db') }

async function main() {
  const results = []
  const ok = (name, cond, extra = '') => {
    results.push({ name, cond })
    console.log('ASSERT ' + (cond ? 'PASS' : 'FAIL') + ' ' + name + (extra ? ' ' + extra : ''))
  }

  // ---------- 前置：settings 跳过引导/开屏；临时停用模型（AI 建议验收无 key 路径） ----------
  const settingsPath = join(process.env.APPDATA, 'EC AI', 'settings.json')
  const st = JSON.parse(readFileSync(settingsPath, 'utf8'))
  st.onboardingDone = true
  st.splashEnabled = false
  st.lastSplashDate = new Date().toISOString().slice(0, 10)
  st.theme = 'dark'
  writeFileSync(settingsPath, JSON.stringify(st, null, 2), 'utf8')

  const db = new Database(dbPath())
  const modelRows = db.prepare('SELECT id, enabled, is_default FROM models').all()
  const prevModels = modelRows.map((m) => ({ id: m.id, enabled: m.enabled, is_default: m.is_default }))
  for (const m of modelRows) db.prepare('UPDATE models SET enabled=0, is_default=0 WHERE id=?').run(m.id)
  // 默认店铺自愈：一键带入按第一个店铺断言，跑前对齐、跑后恢复
  const prevDefaultShop = db.prepare("SELECT value FROM settings WHERE key='default_shop_id'").get()
  const firstShopId = db.prepare('SELECT id FROM shops ORDER BY id LIMIT 1').get()
  if (firstShopId) {
    db.prepare(`INSERT INTO settings (key, value, updated_at) VALUES ('default_shop_id', ?, datetime('now','localtime'))
      ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at`).run(String(firstShopId.id))
  }
  db.close()

  // ---------- 跑 dev 验收流程 ----------
  if (existsSync(debugLogPath)) rmSync(debugLogPath)
  if (existsSync(join(root, 'autoshot-console.log'))) rmSync(join(root, 'autoshot-console.log'))
  const outLog = join(root, 'dev-4g.log')
  const errLog = join(root, 'dev-4g.err.log')
  for (const f of [outLog, errLog]) if (existsSync(f)) rmSync(f)
  const env = { ...process.env, EC_AI_AUTOSHOT: '1', EC_AI_AUTOSHOT_MODE: 'task4g', EC_AI_AUTOSHOT_QUERY: '' }
  const child = spawn('npm.cmd', ['run', 'dev'], { cwd: root, env, windowsHide: true, shell: true, stdio: ['ignore', 'pipe', 'pipe'] })
  const so = createWriteStream(outLog)
  const se = createWriteStream(errLog)
  child.stdout.pipe(so)
  child.stderr.pipe(se)
  let content
  try {
    content = await waitForMarker(debugLogPath, 'TASK4G-DONE', 420000)
  } finally {
    so.end(); se.end(); killTree(child.pid); await sleep(3000)
  }
  try { writeFileSync(join(root, 'accept-4g-full.log'), content) } catch {}

  // ---------- 恢复模型配置 ----------
  const db2 = new Database(dbPath())
  for (const m of prevModels) db2.prepare('UPDATE models SET enabled=?, is_default=? WHERE id=?').run(m.enabled, m.is_default, m.id)
  if (prevDefaultShop) db2.prepare("UPDATE settings SET value=? WHERE key='default_shop_id'").run(String(prevDefaultShop.value))
  else db2.prepare("DELETE FROM settings WHERE key='default_shop_id'").run()
  db2.close()

  // ---------- 解析验收标记 ----------
  const grab = (prefix) => content.split('\n').filter((l) => l.startsWith(prefix)).map((l) => l.slice(prefix.length).trim())
  const jsonOf = (prefix) => {
    const arr = grab(prefix)
    return arr.length ? JSON.parse(arr[arr.length - 1]) : null
  }
  const calc = jsonOf('TASK4G-CALC:')
  const alarm = jsonOf('TASK4G-ALARM:')
  const imp = jsonOf('TASK4G-IMPORT:')
  const hist = jsonOf('TASK4G-HISTORY-SAVE:')
  const csv = jsonOf('TASK4G-CSV:')
  const del = jsonOf('TASK4G-HISTORY-DELETE:')
  const adv = jsonOf('TASK4G-ADVICE:')

  // ---------- ① 模板示例复现 + 反推 + 保本 ----------
  ok('calc-template', !!calc && calc.roi === '13.00' && calc.netRate === '60.00%' && calc.marketing === '12.82%' && calc.status === '达标', JSON.stringify(calc))
  ok('calc-netSales', !!calc && calc.netSales === '78.00 元', calc?.netSales)
  ok('calc-reverse-min-roi', !!calc && calc.minRoi === '10.42', calc?.minRoi)
  ok('calc-breakeven', !!calc && calc.breakEven === '3.33', calc?.breakEven)
  ok('calc-gauge', !!calc && calc.gauge === '12.82%', calc?.gauge)
  ok('calc-refund-mutual', !!calc && calc.refundRateDerived === '0.4000', calc?.refundRateDerived)

  // ---------- ② 超红线告警 ----------
  ok('alarm-status', !!alarm && alarm.status === '未达标' && alarm.roi === '8.67', JSON.stringify(alarm))
  ok('alarm-text', !!alarm && alarm.alarm.includes('12.48') && alarm.alarm.includes('2.52') && alarm.alarm.includes('10.42'), alarm?.alarm)

  // ---------- ③ 一键带入近7天真实数据：与库 SUM 一致（同一 dailyKpi 口径） ----------
  let importDb = null
  try {
    const db3 = new Database(dbPath(), { readonly: true })
    const shopRow = db3.prepare('SELECT id FROM shops ORDER BY id LIMIT 1').get()
    const shopId = shopRow ? shopRow.id : 0
    const today = new Date()
    const end = new Date(today)
    const start = new Date(today)
    start.setDate(start.getDate() - 6)
    const fmt = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    const w = { start: fmt(start), end: fmt(end) }
    const sum = db3.prepare(`SELECT COALESCE(SUM(pay_amount_fen),0) pay, COALESCE(SUM(promo_cost_fen),0) promo, COALESCE(SUM(refund_amount_fen),0) refund
      FROM daily_metrics WHERE shop_id=? AND date>=? AND date<=?`).get(shopId, w.start, w.end)
    importDb = { shopId, window: w, sum, expect: {
      spend: (sum.promo / 100).toFixed(2), sales: (sum.pay / 100).toFixed(2), refundAmount: (sum.refund / 100).toFixed(2)
    } }
    db3.close()
  } catch (e) {
    importDb = { error: String(e.message) }
  }
  ok('import-has-data', !!imp && !!importDb && !importDb.error, JSON.stringify({ imp, expect: importDb }))
  if (imp && importDb && !importDb.error) {
    ok('import-consistency', imp.spend === importDb.expect.spend && imp.sales === importDb.expect.sales && imp.refundAmount === importDb.expect.refundAmount,
      'imp=' + JSON.stringify(imp) + ' db=' + JSON.stringify(importDb.expect))
    ok('import-rate-derived', imp.refundRate !== '' && imp.refundRate !== null, 'rate=' + imp.refundRate)
  }

  // ---------- ④ 历史：保存 / 导出 CSV / 删除 ----------
  ok('history-save', !!hist && hist.count >= 1 && String(hist.first).includes('验收-近7天'), JSON.stringify(hist))
  ok('history-csv', !!csv && csv.bom === true && String(csv.head).includes('时间,名称,推广花费(元)') && csv.len > 0, JSON.stringify(csv))
  ok('history-delete', !!del && del.deleted === true, JSON.stringify(del))

  // ---------- ⑤ AI 建议无 key：明确中文提示不崩 ----------
  ok('advice-no-key', !!adv && String(adv.error).includes('未配置模型'), JSON.stringify(adv))

  // ---------- 截图清点（5 张：149~153） ----------
  const list = readdir(shotsDir).filter((f) => /^1(4[9]|5[0-3])-4g-.*\.png$/.test(f)).sort()
  console.log('=== 4G 截图 ' + list.length + ' 张 ===')
  for (const f of list) console.log(join(shotsDir, f))
  const need = ['149-4g-calc-template', '150-4g-gauge-alarm', '151-4g-import-real-data', '152-4g-history-saved', '153-4g-advice-no-key']
  const missing = need.filter((n) => !list.some((f) => f.startsWith(n)))
  ok('shots-5', missing.length === 0, 'missing=' + missing.join(','))

  // ---------- 无乱码扫描 ----------
  const moji = /锟|鈥|\uFFFD|\?\?\?/.test(content) ? 'FOUND' : 'NONE'
  ok('no-mojibake', moji === 'NONE', 'moji=' + moji)

  const failed = results.filter((r) => !r.cond)
  console.log('TASK4G-ACCEPTANCE-OK total=' + results.length + ' fail=' + failed.length)
  if (failed.length) throw new Error('任务 4G 验收断言未满足: ' + failed.map((f) => f.name).join(', '))
}

main().catch((e) => {
  console.error('FAIL:', e.message)
  process.exit(1)
})
