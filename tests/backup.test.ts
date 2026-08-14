import { describe, expect, it } from 'vitest'
import { existsSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { AppDatabase } from '../src/main/db/database'
import { dailyKpi, upsertDailyMetric, upsertShop } from '../src/main/db/repo'
import { loadFixtures } from './helpers/load-fixtures'

function seed(db: AppDatabase): { shopId: number } {
  const fx = loadFixtures(1)
  const shopId = upsertShop(db, { name: fx.shopName, platform: fx.platform })
  for (const r of fx.dailyMetrics) upsertDailyMetric(db, r)
  return { shopId }
}

describe('备份/恢复/完整性', () => {
  it('导入 → 备份 → 清库 → 恢复：行数与 KPI 完全一致，integrity ok', () => {
    const dir = mkdtempSync(join(tmpdir(), 'ecai-bak-'))
    const p = join(dir, 'bak.db')
    const db = new AppDatabase(p)
    db.init()
    const { shopId } = seed(db)
    const before = {
      rows: db.rowCounts(),
      kpi: dailyKpi(db, shopId)
    }
    expect(before.rows.daily_metrics).toBe(31)
    expect(before.kpi.payAmountFen).toBe(41220836)

    const backupPath = db.backup('manual')
    expect(existsSync(backupPath)).toBe(true)

    db.raw.pragma('foreign_keys = OFF')
    const clear = db.raw.transaction(() => {
      for (const t of Object.keys(before.rows)) db.raw.prepare(`DELETE FROM "${t}"`).run()
    })
    clear()
    db.raw.pragma('foreign_keys = ON')
    expect(db.rowCounts().daily_metrics).toBe(0)
    expect(dailyKpi(db, shopId).payAmountFen).toBe(0)

    db.restore(backupPath)
    const after = {
      rows: db.rowCounts(),
      kpi: dailyKpi(db, shopId)
    }
    expect(after.rows).toEqual(before.rows)
    expect(after.kpi).toEqual(before.kpi)
    expect(db.integrityCheck()).toBe('ok')
    db.close()
  })

  it('备份目录只保留最近 5 份', () => {
    const dir = mkdtempSync(join(tmpdir(), 'ecai-prune-'))
    const db = new AppDatabase(join(dir, 'p.db'))
    db.init()
    for (let i = 0; i < 7; i++) db.backup(`run-${i}`)
    const backups = db.listBackups()
    expect(backups).toHaveLength(5)
    for (const b of backups) expect(existsSync(b)).toBe(true)
    db.close()
  })

  it('withAutoBackup：导入/生成前自动备份', () => {
    const dir = mkdtempSync(join(tmpdir(), 'ecai-auto-'))
    const db = new AppDatabase(join(dir, 'a.db'))
    db.init()
    const shopId = upsertShop(db, { name: '\u81ea\u52a8\u5907\u4efd\u5e97' })
    db.withAutoBackup('import', () => {
      upsertDailyMetric(db, { shopId, date: '2026-08-11', payAmountFen: 100, netSalesFen: 0, profitFen: 0, visitors: 0, refundAmountFen: 0, promoCostFen: 0 })
    })
    expect(db.listBackups().length).toBeGreaterThanOrEqual(1)
    expect(db.raw.prepare('SELECT COUNT(*) n FROM daily_metrics').get()).toEqual({ n: 1 })
    db.close()
  })
})
