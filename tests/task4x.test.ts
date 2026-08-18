// 任务 4X：数据覆盖「今天已交」判定改 imports 驱动（三源共用 product_daily 不再互相带交；DSR 走业务快照例外）
import { describe, expect, it } from 'vitest'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { AppDatabase } from '../src/main/db/database'
import {
  getImportCoverage, insertImport, upsertCsDaily, upsertDailyMetric, upsertDsr180d, upsertProductDaily, upsertShop
} from '../src/main/db/repo'

function freshDb(): AppDatabase {
  const dir = mkdtempSync(join(tmpdir(), 'ecai-4x-'))
  const db = new AppDatabase(join(dir, '4x.db'))
  db.init()
  return db
}

function bySource(cov: Array<{ source: string; todayImported: boolean; lastDate: string | null }>): Record<string, { todayImported: boolean; lastDate: string | null }> {
  return Object.fromEntries(cov.map((r) => [r.source, { todayImported: r.todayImported, lastDate: r.lastDate }]))
}

describe('4X getImportCoverage：todayImported 改 imports 驱动（product_report/product_detail/consult 不再互相带交）', () => {
  it('核心红→绿：共享表插 08-18，仅导 product_report(ok,08-18) → 仅 product_report 已交', () => {
    const db = freshDb()
    const shopId = upsertShop(db, { name: '核心店4x' })
    upsertProductDaily(db, { shopId, productId: 'P1', date: '2026-08-18' })
    insertImport(db, { shopId, sourceType: 'product_report', sourceFile: '商品_全部_2026-08-17.xls', rowCount: 110, dateEnd: '2026-08-18', status: 'ok' })
    const by = bySource(getImportCoverage(db, shopId, '2026-08-19'))
    expect(by.product_report.todayImported).toBe(true)
    expect(by.product_detail.todayImported).toBe(false)
    expect(by.consult.todayImported).toBe(false)
    db.close()
  })

  it('同源两条 ok 取 MAX(date_end)：08-17+08-18 → 已交', () => {
    const db = freshDb()
    const shopId = upsertShop(db, { name: 'MAX店4x' })
    upsertProductDaily(db, { shopId, productId: 'P1', date: '2026-08-18' })
    insertImport(db, { shopId, sourceType: 'product_report', sourceFile: 'a.xls', rowCount: 1, dateEnd: '2026-08-17', status: 'ok' })
    insertImport(db, { shopId, sourceType: 'product_report', sourceFile: 'b.xls', rowCount: 2, dateEnd: '2026-08-18', status: 'ok' })
    const by = bySource(getImportCoverage(db, shopId, '2026-08-19'))
    expect(by.product_report.todayImported).toBe(true)
    db.close()
  })

  it('failed 导入不计入：ok 08-17 + failed 08-18 → 未交（业务表虽有 08-18）', () => {
    const db = freshDb()
    const shopId = upsertShop(db, { name: 'failed店4x' })
    upsertProductDaily(db, { shopId, productId: 'P1', date: '2026-08-18' })
    insertImport(db, { shopId, sourceType: 'product_report', sourceFile: 'a.xls', rowCount: 1, dateEnd: '2026-08-17', status: 'ok' })
    insertImport(db, { shopId, sourceType: 'product_report', sourceFile: 'b.xls', rowCount: 0, dateEnd: '2026-08-18', status: 'failed' })
    const by = bySource(getImportCoverage(db, shopId, '2026-08-19'))
    expect(by.product_report.todayImported).toBe(false)
    db.close()
  })

  it('date_end 为 null 的 ok 导入不计入 → 未交', () => {
    const db = freshDb()
    const shopId = upsertShop(db, { name: 'nullend店4x' })
    upsertProductDaily(db, { shopId, productId: 'P1', date: '2026-08-18' })
    insertImport(db, { shopId, sourceType: 'product_report', sourceFile: '无日期.xls', rowCount: 1, dateEnd: null, status: 'ok' })
    const by = bySource(getImportCoverage(db, shopId, '2026-08-19'))
    expect(by.product_report.todayImported).toBe(false)
    db.close()
  })

  it('非共享表源同样 imports 驱动：daily 业务 08-18 无 ok 导入 → 未交；补 ok 08-18 → 已交', () => {
    const db = freshDb()
    const shopId = upsertShop(db, { name: 'daily店4x' })
    upsertDailyMetric(db, { shopId, date: '2026-08-18', payAmountFen: 1, netSalesFen: 1, profitFen: 1, visitors: 1, refundAmountFen: 0, promoCostFen: 0 })
    const cov1 = getImportCoverage(db, shopId, '2026-08-19')
    expect(bySource(cov1).daily.todayImported).toBe(false)
    insertImport(db, { shopId, sourceType: 'daily', sourceFile: '经营.xlsx', rowCount: 31, dateEnd: '2026-08-18', status: 'ok' })
    const cov2 = getImportCoverage(db, shopId, '2026-08-19')
    expect(bySource(cov2).daily.todayImported).toBe(true)
    db.close()
  })

  it('cs（T-3）imports 驱动：业务 08-18 + ok 08-15（阈值 08-16）→ 未交', () => {
    const db = freshDb()
    const shopId = upsertShop(db, { name: 'cs店4x' })
    upsertCsDaily(db, { shopId, date: '2026-08-18', staffName: '张三', inquiryCount: 1 })
    insertImport(db, { shopId, sourceType: 'cs', sourceFile: '客服.csv', rowCount: 8, dateEnd: '2026-08-15', status: 'ok' })
    const by = bySource(getImportCoverage(db, shopId, '2026-08-19'))
    expect(by.cs.todayImported).toBe(false)
    db.close()
  })

  it('DSR 例外 a：业务快照 08-16 + imports dsr 08-18 → 未交（不按 imports 带交）', () => {
    const db = freshDb()
    const shopId = upsertShop(db, { name: 'dsrA店4x' })
    upsertDsr180d(db, { shopId, snapshotDate: '2026-08-16', indicator: '描述', score: 4.9 })
    insertImport(db, { shopId, sourceType: 'dsr', sourceFile: 'DSR_08-18.xlsx', rowCount: 3, dateEnd: '2026-08-18', status: 'ok' })
    const by = bySource(getImportCoverage(db, shopId, '2026-08-19'))
    expect(by.dsr.todayImported).toBe(false)
    db.close()
  })

  it('DSR 例外 b：业务快照 08-18 + imports dsr 08-16 → 已交（按业务快照判定）', () => {
    const db = freshDb()
    const shopId = upsertShop(db, { name: 'dsrB店4x' })
    upsertDsr180d(db, { shopId, snapshotDate: '2026-08-18', indicator: '描述', score: 4.9 })
    insertImport(db, { shopId, sourceType: 'dsr', sourceFile: 'DSR_08-16.xlsx', rowCount: 3, dateEnd: '2026-08-16', status: 'ok' })
    const by = bySource(getImportCoverage(db, shopId, '2026-08-19'))
    expect(by.dsr.todayImported).toBe(true)
    db.close()
  })

  it('lastDate 仍业务真值：共享表 08-18 → 三源 lastDate 均 08-18（不受 imports 影响）', () => {
    const db = freshDb()
    const shopId = upsertShop(db, { name: 'lastDate店4x' })
    upsertProductDaily(db, { shopId, productId: 'P1', date: '2026-08-18' })
    insertImport(db, { shopId, sourceType: 'product_report', sourceFile: '商品_全部.xls', rowCount: 110, dateEnd: '2026-08-18', status: 'ok' })
    const cov = getImportCoverage(db, shopId, '2026-08-19')
    const by = bySource(cov)
    expect(by.product_report.lastDate).toBe('2026-08-18')
    expect(by.product_detail.lastDate).toBe('2026-08-18')
    expect(by.consult.lastDate).toBe('2026-08-18')
    db.close()
  })

  it('跨店隔离：B 店共享表 08-18 但无 ok 导入 → 未交（A 店的导入不串）', () => {
    const db = freshDb()
    const shopA = upsertShop(db, { name: 'A店4x' })
    const shopB = upsertShop(db, { name: 'B店4x' })
    upsertProductDaily(db, { shopId: shopA, productId: 'P1', date: '2026-08-18' })
    upsertProductDaily(db, { shopId: shopB, productId: 'P1', date: '2026-08-18' })
    insertImport(db, { shopId: shopA, sourceType: 'product_report', sourceFile: 'a.xls', rowCount: 1, dateEnd: '2026-08-18', status: 'ok' })
    const byB = bySource(getImportCoverage(db, shopB, '2026-08-19'))
    expect(byB.product_report.todayImported).toBe(false)
    const byA = bySource(getImportCoverage(db, shopA, '2026-08-19'))
    expect(byA.product_report.todayImported).toBe(true)
    db.close()
  })
})