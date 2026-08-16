// 任务 4T：数据覆盖「今日已交」判定接入平台延迟（cs=T-3、其余 8 源=T-1、images 无日期列不参与）
import { describe, expect, it } from 'vitest'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { AppDatabase } from '../src/main/db/database'
import {
  addDays, getImportCoverage, upsertCsDaily, upsertDailyMetric, upsertPromoDaily, upsertProductImage, upsertShop
} from '../src/main/db/repo'

function freshDb(): AppDatabase {
  const dir = mkdtempSync(join(tmpdir(), 'ecai-4t-'))
  const db = new AppDatabase(join(dir, '4t.db'))
  db.init()
  return db
}

// ---------- addDays 纯函数 ----------
describe('4T addDays：YYYY-MM-DD 加减天（本地时区）', () => {
  it('跨月：月末 +1 / 月初 -1', () => {
    expect(addDays('2026-08-31', 1)).toBe('2026-09-01')
    expect(addDays('2026-09-01', -1)).toBe('2026-08-31')
  })

  it('跨年：12-31 +1 / 01-01 -1', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01')
    expect(addDays('2027-01-01', -1)).toBe('2026-12-31')
  })

  it('负偏移：today-3 / today-1', () => {
    expect(addDays('2026-08-16', -3)).toBe('2026-08-13')
    expect(addDays('2026-08-16', -1)).toBe('2026-08-15')
  })

  it('闰年 2-29 +1 → 3-01', () => {
    expect(addDays('2028-02-29', 1)).toBe('2028-03-01')
  })
})

// ---------- getImportCoverage 今日已交延迟判定 ----------
describe('4T getImportCoverage：按源延迟判定 todayImported', () => {
  it('cs（T-3）：lastDate=today-3 → 已交（边界）', () => {
    const db = freshDb()
    const shopId = upsertShop(db, { name: 'cs边界店' })
    upsertCsDaily(db, { shopId, date: '2026-08-13', staffName: '张三', inquiryCount: 1 })
    const cov = getImportCoverage(db, shopId, '2026-08-16')
    const by = Object.fromEntries(cov.map((r) => [r.source, r]))
    expect(by.cs.todayImported).toBe(true)
    db.close()
  })

  it('cs（T-3）：lastDate=today-4 → 未交（边界外）', () => {
    const db = freshDb()
    const shopId = upsertShop(db, { name: 'cs超期店' })
    upsertCsDaily(db, { shopId, date: '2026-08-12', staffName: '张三', inquiryCount: 1 })
    const cov = getImportCoverage(db, shopId, '2026-08-16')
    const by = Object.fromEntries(cov.map((r) => [r.source, r]))
    expect(by.cs.todayImported).toBe(false)
    db.close()
  })

  it('普通源（T-1）：lastDate=today-1 → 已交（边界）', () => {
    const db = freshDb()
    const shopId = upsertShop(db, { name: '普通边界店' })
    upsertDailyMetric(db, { shopId, date: '2026-08-15', payAmountFen: 1, netSalesFen: 1, profitFen: 1, visitors: 1, refundAmountFen: 0, promoCostFen: 0 })
    const cov = getImportCoverage(db, shopId, '2026-08-16')
    const by = Object.fromEntries(cov.map((r) => [r.source, r]))
    expect(by.daily.todayImported).toBe(true)
    db.close()
  })

  it('普通源（T-1）：lastDate=today-2 → 未交', () => {
    const db = freshDb()
    const shopId = upsertShop(db, { name: '普通超期店' })
    upsertPromoDaily(db, { shopId, date: '2026-08-14', adEntityId: 'A1', impressions: 1, clicks: 1, costFen: 1 })
    const cov = getImportCoverage(db, shopId, '2026-08-16')
    const by = Object.fromEntries(cov.map((r) => [r.source, r]))
    expect(by.promo.todayImported).toBe(false)
    db.close()
  })

  it('无数据行 → todayImported=false（空库全源 lastDate null）', () => {
    const db = freshDb()
    const shopId = upsertShop(db, { name: '空店4t' })
    const cov = getImportCoverage(db, shopId, '2026-08-16')
    expect(cov).toHaveLength(10)
    for (const r of cov) {
      expect(r.todayImported).toBe(false)
      expect(r.lastDate).toBeNull()
    }
    db.close()
  })

  it('images 无日期列：恒 false 且 delayDays=null（不参与判定）', () => {
    const db = freshDb()
    const shopId = upsertShop(db, { name: '图店4t' })
    upsertProductImage(db, { shopId, productId: 'P1', relPath: 'x.png', sizeBytes: 1 })
    const cov = getImportCoverage(db, shopId, '2026-08-16')
    const by = Object.fromEntries(cov.map((r) => [r.source, r]))
    expect(by.images.todayImported).toBe(false)
    expect(by.images.delayDays).toBeNull()
    db.close()
  })

  it('输出每行含 delayDays：cs=3、其余 8 源=1、images=null', () => {
    const db = freshDb()
    const shopId = upsertShop(db, { name: '延迟店4t' })
    const cov = getImportCoverage(db, shopId, '2026-08-16')
    const by = Object.fromEntries(cov.map((r) => [r.source, r]))
    expect(by.cs.delayDays).toBe(3)
    for (const src of ['daily', 'product_report', 'product_detail', 'consult', 'promo', 'refund', 'keyword', 'dsr']) {
      expect(by[src].delayDays).toBe(1)
    }
    expect(by.images.delayDays).toBeNull()
    db.close()
  })

  it('lastDate 早于最新可交日期但同月内仍按字典序判定（08-15 与 08-13）', () => {
    const db = freshDb()
    const shopId = upsertShop(db, { name: 'cs区间店' })
    upsertCsDaily(db, { shopId, date: '2026-08-15', staffName: '张三', inquiryCount: 1 })
    const cov = getImportCoverage(db, shopId, '2026-08-16')
    const by = Object.fromEntries(cov.map((r) => [r.source, r]))
    expect(by.cs.todayImported).toBe(true)
    db.close()
  })
})