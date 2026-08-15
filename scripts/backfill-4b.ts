// 任务 4B 数据回填：真实库 daily_metrics.sales_count 与 promo_daily 成交三字段（迁移只加列不回填）
import Database from 'better-sqlite3'
import fs from 'node:fs'
import path from 'node:path'
import { loadFixtures } from '../tests/helpers/load-fixtures'

const dbPath = path.join(process.env.APPDATA || '', 'EC AI', 'ecai.db')
const backupDir = path.join(process.env.APPDATA || '', 'EC AI', 'backups', 'pre-4b-backfill')
fs.mkdirSync(backupDir, { recursive: true })
for (const suffix of ['', '-wal', '-shm']) {
  const f = dbPath + suffix
  if (fs.existsSync(f)) fs.copyFileSync(f, path.join(backupDir, 'ecai.db' + suffix))
}
console.log('backup ->', backupDir)

const db = new Database(dbPath)
db.pragma('journal_mode = WAL')
const fx = loadFixtures(1)
console.log('fixtures daily:', fx.dailyMetrics.length, 'promo:', fx.promoDaily.length)

const updDaily = db.prepare('UPDATE daily_metrics SET sales_count=@sc WHERE shop_id=@sid AND date=@d')
let dOk = 0, dMiss = 0
for (const r of fx.dailyMetrics) {
  const res = updDaily.run({ sid: r.shopId, d: r.date, sc: r.salesCount })
  if (res.changes > 0) dOk++; else dMiss++
}

const updPromo = db.prepare('UPDATE promo_daily SET pay_amount_fen=@pay, sales_count=@sc, pay_rate=@rate WHERE shop_id=@sid AND date=@d AND ad_entity_id=@id')
let pOk = 0, pMiss = 0
const missRows: Array<{ d: string; id: string }> = []
for (const r of fx.promoDaily) {
  const res = updPromo.run({ sid: r.shopId, d: r.date, id: r.adEntityId, pay: r.payAmountFen, sc: r.salesCount, rate: r.payRate })
  if (res.changes > 0) pOk++; else { pMiss++; missRows.push({ d: r.date, id: r.adEntityId }) }
}
console.log('daily updated:', dOk, 'miss:', dMiss)
console.log('promo updated:', pOk, 'miss:', pMiss)
if (missRows.length) console.log('promo miss sample:', JSON.stringify(missRows.slice(0, 10)))

const v1 = db.prepare("SELECT COALESCE(SUM(sales_count),0) orders, COALESCE(SUM(pay_amount_fen),0) pay FROM daily_metrics WHERE shop_id=1 AND date>='2026-08-08' AND date<='2026-08-14'").get()
const v2 = db.prepare("SELECT COALESCE(SUM(sales_count),0) orders, COALESCE(SUM(pay_amount_fen),0) pay FROM daily_metrics WHERE shop_id=1 AND date>='2026-08-07' AND date<='2026-08-11'").get()
const p1 = db.prepare("SELECT ad_entity_id, cost_fen, pay_amount_fen, sales_count, pay_rate FROM promo_daily WHERE shop_id=1 AND cost_fen>0 ORDER BY cost_fen DESC LIMIT 1").get()
const pSum = db.prepare("SELECT COALESCE(SUM(cost_fen),0) spend, COALESCE(SUM(pay_amount_fen),0) pay, COALESCE(SUM(sales_count),0) orders FROM promo_daily WHERE shop_id=1 AND cost_fen>0").get()
console.log('verify 7d(app window 08-08~14):', JSON.stringify(v1))
console.log('verify 蓝本窗口(08-07~11):', JSON.stringify(v2))
console.log('verify promo top1:', JSON.stringify(p1))
console.log('verify promo top12 sum:', JSON.stringify(pSum))
db.close()
