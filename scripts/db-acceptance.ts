// 任务 2 数据库层验收脚本：建库两次 / 18 表清单 / 真实数据导入 / 备份-清库-恢复 / 完整性
import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { AppDatabase } from '../src/main/db/database'
import { ALL_TABLES } from '../src/main/db/schema'
import {
  dailyKpi, insertRefundOrder, upsertCsDaily, upsertDailyMetric, upsertDsr180d,
  upsertDsrDaily, upsertProductDaily, upsertPromoDaily, upsertSearchKeyword, upsertShop
} from '../src/main/db/repo'
import { loadFixtures } from '../tests/helpers/load-fixtures'

const dir = mkdtempSync(join(tmpdir(), 'ecai-acceptance-'))
const dbPath = join(dir, 'ecai.db')

function initOnce(): void {
  const db = new AppDatabase(dbPath)
  db.init()
  db.close()
}

console.log('=== 任务 2 数据库层验收 ===')
console.log('')

// 1) 建库脚本连续跑两次
initOnce()
console.log('[1] 建库第 1 次: OK')
initOnce()
console.log('[1] 建库第 2 次: OK（幂等，不报错）')

const db = new AppDatabase(dbPath)
db.init()

// 2) 表清单
const tables = (
  db.raw
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name")
    .all() as Array<{ name: string }>
).map((r) => r.name)
console.log(`[2] 表清单(${tables.length})：${tables.join(', ')}`)
const missing = ALL_TABLES.filter((t) => !tables.includes(t))
console.log(`    必备 16 表 + DSR 2 表全部存在: ${missing.length === 0 ? 'PASS' : 'FAIL ' + missing.join(',')}`)

// 3) 导入真实数据
const fx = loadFixtures(1)
const shopId = upsertShop(db, { name: fx.shopName, platform: fx.platform })
for (const r of fx.dailyMetrics) upsertDailyMetric(db, r)
for (const r of fx.refundOrders) insertRefundOrder(db, r)
for (const r of fx.promoDaily) upsertPromoDaily(db, r)
for (const r of fx.productDaily) upsertProductDaily(db, r)
for (const r of fx.csDaily) upsertCsDaily(db, r)
for (const r of fx.searchKeywords) upsertSearchKeyword(db, r)
for (const r of fx.dsrDaily) upsertDsrDaily(db, r)
for (const r of fx.dsr180d) upsertDsr180d(db, r)

const countsBefore = db.rowCounts()
console.log('[3] 导入后各表行数:')
for (const t of ALL_TABLES) console.log(`    ${t.padEnd(18)} ${String(countsBefore[t]).padStart(6)}`)
const kpiBefore = dailyKpi(db, shopId)
console.log(`    KPI 前: 支付金额合计=${kpiBefore.payAmountFen}分（412,208.36 元） 天数=${kpiBefore.days}`)

// 4) 手动备份 → 清库 → 恢复
const backupPath = db.backup('manual')
console.log(`[4] 手动备份: ${backupPath} (存在=${existsSync(backupPath)})`)
db.raw.pragma('foreign_keys = OFF')
const clear = db.raw.transaction(() => {
  for (const t of ALL_TABLES) db.raw.prepare(`DELETE FROM "${t}"`).run()
})
clear()
db.raw.pragma('foreign_keys = ON')
const cleared = db.rowCounts()
const allZero = Object.values(cleared).every((n) => n === 0)
console.log(`    清库后行数: 全部为 0 = ${allZero ? 'PASS' : 'FAIL'}`)
db.restore(backupPath)
const countsAfter = db.rowCounts()
console.log('    恢复后各表行数:')
for (const t of ALL_TABLES) console.log(`    ${t.padEnd(18)} ${String(countsAfter[t]).padStart(6)}`)
const kpiAfter = dailyKpi(db, shopId)
console.log(`    KPI 后: 支付金额合计=${kpiAfter.payAmountFen}分 天数=${kpiAfter.days}`)

const rowsSame = JSON.stringify(countsBefore) === JSON.stringify(countsAfter)
const kpiSame = kpiBefore.payAmountFen === kpiAfter.payAmountFen && kpiBefore.days === kpiAfter.days
console.log(`    行数一致=${rowsSame ? 'PASS' : 'FAIL'}  KPI 一致=${kpiSame ? 'PASS' : 'FAIL'}`)

// 5) 完整性
const integrity = db.integrityCheck()
console.log(`[5] PRAGMA integrity_check: ${integrity} = ${integrity === 'ok' ? 'PASS' : 'FAIL'}`)

db.close()
rmSync(dir, { recursive: true, force: true })
const ok = missing.length === 0 && allZero && rowsSame && kpiSame && integrity === 'ok'
console.log('')
console.log(ok ? '=== 全部验收项 PASS ===' : '=== 有失败项 FAIL ===')
process.exit(ok ? 0 : 1)
