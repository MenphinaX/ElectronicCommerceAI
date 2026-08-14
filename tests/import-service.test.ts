// 任务 3 导入服务测试：9 文件导入→库内行数；重复导入去重不翻倍；1000 行性能；归档；导入历史留痕
import { describe, expect, it } from 'vitest'
import { existsSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import * as XLSX from 'xlsx'
import { AppDatabase } from '../src/main/db/database'
import { importFiles } from '../src/main/import/import-service'
import { dailyKpi, deleteShop, getSetting, listImportsWithShop, setDefaultShopId, upsertShop } from '../src/main/db/repo'
import { readSourceFile } from '../src/main/import/reader'
import { CONSULT_FILE, CS_FILE, DAILY_FILE, DSR_FILE, KEYWORD_FILE, PRODUCT_DETAIL_FILE, PRODUCT_REPORT_FILE, PROMO_FILE, REFUND_FILE, SHOP_NAME, TEMPLATE_DIR } from './helpers/load-fixtures'

XLSX.set_fs(await import('node:fs'))

const F = (name: string): string => join(TEMPLATE_DIR, name)
const NINE = [CONSULT_FILE, KEYWORD_FILE, PRODUCT_REPORT_FILE, PRODUCT_DETAIL_FILE, PROMO_FILE, DAILY_FILE, DSR_FILE, CS_FILE, REFUND_FILE]

function freshEnv(): { db: AppDatabase; shopId: number; archiveDir: string } {
  const dir = mkdtempSync(join(tmpdir(), 'ecai-import-'))
  const db = new AppDatabase(join(dir, 'import.db'))
  db.init()
  const shopId = upsertShop(db, { name: SHOP_NAME, platform: '天猫' })
  return { db, shopId, archiveDir: join(dir, 'archives') }
}

/** 真实退款单 2 列改名后写成 xlsx（表头：订单编号→订单号、退款总额→退款金额） */
function makeRenamedRefund(): string {
  const base = readSourceFile(F(REFUND_FILE)).rows
  const header = (base[0] ?? []).map((cell) => {
    const s = String(cell)
    if (s === '订单编号') return '订单号'
    if (s === '退款总额') return '退款金额'
    return cell
  })
  const ws = XLSX.utils.aoa_to_sheet([header, ...base.slice(1)])
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Sheet1')
  const dir = mkdtempSync(join(tmpdir(), 'ecai-renamed-'))
  const p = join(dir, '退款单-改名.xlsx')
  XLSX.writeFile(wb, p)
  return p
}

describe('导入服务：9 个真实文件全量导入', () => {
  it('逐文件导入 0 报错，识别类型与行数正确，关键 KPI 对得上源文件', async () => {
    const { db, shopId, archiveDir } = freshEnv()
    const results = await importFiles(db, NINE.map(F), { shopId, archiveDir })
    expect(results).toHaveLength(9)
    for (const r of results) {
      expect(r.status).toBe('ok')
      expect(r.issues).toHaveLength(0)
    }
    const byType = Object.fromEntries(results.map((r) => [r.detectedLabel, r.rows]))
    expect(byType).toMatchObject({
      咨询: 30, 搜索词: 133, 商品报表: 110, 商品明细: 111, 推广: 113, 经营: 31, 客服: 8
    })
    expect(byType['退款']).toBe(2096)
    expect(byType['DSR']).toBe(4)
    const counts = db.rowCounts()
    expect(counts.daily_metrics).toBe(31)
    expect(counts.refund_orders).toBe(2096)
    expect(counts.promo_daily).toBe(113)
    expect(counts.cs_daily).toBe(8)
    expect(counts.search_keywords).toBe(133)
    expect(counts.dsr_180d).toBe(3)
    expect(counts.dsr_daily).toBe(1)
    const kpi = dailyKpi(db, shopId)
    expect(kpi.payAmountFen).toBe(41220836)
    const history = listImportsWithShop(db)
    expect(history).toHaveLength(9)
    expect(history.every((h) => h.status === 'ok')).toBe(true)
    const archived = results.filter((r) => r.status === 'ok').every((r) => existsSync(join(archiveDir, r.file)))
    expect(archived).toBe(true)
    db.close()
  })

  it('同一文件导入两次：第二次按文件哈希跳过，表行数不变', async () => {
    const { db, shopId, archiveDir } = freshEnv()
    const first = await importFiles(db, [F(DAILY_FILE), F(REFUND_FILE)], { shopId, archiveDir })
    expect(first.every((r) => r.status === 'ok')).toBe(true)
    const counts1 = { daily: db.rowCounts().daily_metrics, refund: db.rowCounts().refund_orders }
    const second = await importFiles(db, [F(DAILY_FILE), F(REFUND_FILE)], { shopId, archiveDir })
    expect(second.every((r) => r.status === 'skipped')).toBe(true)
    const counts2 = { daily: db.rowCounts().daily_metrics, refund: db.rowCounts().refund_orders }
    expect(counts2).toEqual(counts1)
    expect(listImportsWithShop(db).filter((h) => h.status === 'ok')).toHaveLength(2)
    db.close()
  })

  it('导入 2096 行退款单 < 3 秒（任务书验收：1000 行 < 3s）', async () => {
    const { db, shopId, archiveDir } = freshEnv()
    const started = Date.now()
    const [r] = await importFiles(db, [F(REFUND_FILE)], { shopId, archiveDir })
    const elapsed = Date.now() - started
    expect(r.status).toBe('ok')
    expect(r.rows).toBeGreaterThanOrEqual(2000)
    expect(elapsed).toBeLessThan(3000)
    expect(r.elapsedMs).toBeLessThan(3000)
    db.close()
  })

  it('改版文件（2 列改名）未启用兜底：标记失败+问题清单留痕+归档，不落库', async () => {
    const { db, shopId, archiveDir } = freshEnv()
    const renamed = makeRenamedRefund()
    const [r] = await importFiles(db, [renamed], { shopId, archiveDir })
    expect(r.status).toBe('failed')
    expect(r.issues.length).toBeGreaterThan(0)
    expect(db.rowCounts().refund_orders).toBe(0)
    const failed = listImportsWithShop(db).filter((h) => h.status === 'failed')
    expect(failed).toHaveLength(1)
    expect(failed[0].note).toBeTruthy()
    expect(failed[0].archivePath).toBeTruthy()
    db.close()
  })

  it('默认店铺设置读写', async () => {
    const { db, shopId } = freshEnv()
    setDefaultShopId(db, shopId)
    expect(Number(getSetting(db, 'default_shop_id'))).toBe(shopId)
    setDefaultShopId(db, null)
    expect(getSetting(db, 'default_shop_id')).toBe('')
    db.close()
  })

  it('店铺删除保护：已有数据不可删，空店铺可删', async () => {
    const { db, shopId, archiveDir } = freshEnv()
    importFiles(db, [F(DAILY_FILE)], { shopId, archiveDir })
    expect(() => deleteShop(db, shopId)).toThrow(/禁止删除/)
    const empty = upsertShop(db, { name: '空店铺' })
    expect(() => deleteShop(db, empty)).not.toThrow()
    expect(db.raw.prepare('SELECT COUNT(*) n FROM shops WHERE id = ?').get(empty)).toEqual({ n: 0 })
    db.close()
  })

  it('csv 编码探测：utf-8-sig 与 gbk 均零错误', async () => {
    expect(readSourceFile(F(CONSULT_FILE)).decodeError).toBeUndefined()
    expect(readSourceFile(F(PROMO_FILE)).decodeError).toBeUndefined()
  })
})