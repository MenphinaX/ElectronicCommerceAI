// 任务 3 人工处理中心测试：兜底也失败的文件走「列映射修复」落库成功（状态=人工修正 + 修正日志）
import { describe, expect, it } from 'vitest'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import * as XLSX from 'xlsx'
import { AppDatabase } from '../src/main/db/database'
import { importFiles } from '../src/main/import/import-service'
import { listFailedImports, manualColumnRepair, manualEntry, manualSubmitRecords } from '../src/main/import/manual'
import { getImport, upsertShop } from '../src/main/db/repo'
import { readSourceFile } from '../src/main/import/reader'
import { REFUND_FILE, SHOP_NAME, TEMPLATE_DIR } from './helpers/load-fixtures'

XLSX.set_fs(await import('node:fs'))

const F = (name: string): string => join(TEMPLATE_DIR, name)

/** 表头彻底找不到的文件：退款单数据但表头改成无意义字母（本地解析失败 + LLM 也无法识别） */
function makeHeaderless(): string {
  const base = readSourceFile(F(REFUND_FILE)).rows
  const cols = base[0] ?? []
  const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('')
  const header = cols.map((_, i) => (i < letters.length ? letters[i] : `C${i}`))
  const ws = XLSX.utils.aoa_to_sheet([header, ...base.slice(1)])
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Sheet1')
  const dir = mkdtempSync(join(tmpdir(), 'ecai-headerless-'))
  const p = join(dir, 'garbage.xlsx')
  XLSX.writeFile(wb, p)
  return p
}

function freshDb(): { db: AppDatabase; shopId: number; archiveDir: string } {
  const dir = mkdtempSync(join(tmpdir(), 'ecai-manual-'))
  const db = new AppDatabase(join(dir, 'manual.db'))
  db.init()
  const shopId = upsertShop(db, { name: SHOP_NAME })
  return { db, shopId, archiveDir: join(dir, 'archives') }
}

describe('人工处理中心：列映射修复', () => {
  it('表头彻底找不到 → 导入失败 → 列映射修复落库成功（状态=人工修正 + fix_log）', async () => {
    const { db, shopId, archiveDir } = freshDb()
    const file = makeHeaderless()
    const [r] = await importFiles(db, [file], { shopId, archiveDir })
    expect(r.status).toBe('failed')
    expect(r.detectedType).toBeNull()
    expect(db.rowCounts().refund_orders).toBe(0)

    const failed = listFailedImports(db)
    expect(failed).toHaveLength(1)
    const importId = failed[0].id

    // 人工列映射：按真实表头顺序把字母列映射到标准字段（订单编号→A、退款编号→B……）
    const realHeader = readSourceFile(F(REFUND_FILE)).rows[0] ?? []
    const fieldByName: Record<string, string> = {
      订单编号: 'orderNo', 退款编号: 'refundNo', 订单付款时间: 'paymentTime', 退款完结时间: 'refundFinishTime',
      买家实际支付金额: 'buyerPayAmountFen', 退款总额: 'refundAmountFen', 退款状态: 'refundStatus',
      货物状态: 'goodsStatus', 售后类型: 'afterSaleType', 商品id: 'productId', 宝贝标题: 'productTitle',
      退款申请时间: 'refundApplyTime', 买家退款原因: 'refundReason'
    }
    const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('')
    const mapping: Record<string, string> = {}
    realHeader.forEach((name, i) => {
      const field = fieldByName[String(name)]
      if (field) mapping[i < 26 ? letters[i] : `C${i}`] = field
    })
    expect(Object.keys(mapping).length).toBe(13)
    const res = manualColumnRepair(db, importId, { type: 'refund', headerRow: 1, mapping })
    expect(res.ok).toBe(true)
    expect(res.rows).toBe(2096)
    expect(db.rowCounts().refund_orders).toBe(2096)
    const rec = getImport(db, importId)
    expect(rec?.status).toBe('manual')
    const fixLog = JSON.parse(rec?.fixLog ?? '{}') as Record<string, unknown>
    expect(fixLog.method).toBe('column-mapping')
    expect(fixLog.rows).toBe(2096)
    db.close()
  })

  it('人工列映射后校验不过 → 明确报错不落库', async () => {
    const { db, shopId, archiveDir } = freshDb()
    const file = makeHeaderless()
    importFiles(db, [file], { shopId, archiveDir })
    const importId = listFailedImports(db)[0].id
    const res = manualColumnRepair(db, importId, { type: 'refund', headerRow: 99, mapping: { A: 'orderNo' } })
    expect(res.ok).toBe(false)
    expect(db.rowCounts().refund_orders).toBe(0)
    db.close()
  })

  it('单元格修正（manualSubmitRecords）：提交标准记录落库并写 fix_log', async () => {
    const { db, shopId, archiveDir } = freshDb()
    const file = makeHeaderless()
    importFiles(db, [file], { shopId, archiveDir })
    const importId = listFailedImports(db)[0].id
    const records = [
      { date: '2026-08-11', payAmountFen: 100, netSalesFen: 90, profitFen: 10, visitors: 5, refundAmountFen: 0, promoCostFen: 1, payRate: '2.0%' },
      { date: '2026-08-10', payAmountFen: 200, netSalesFen: 180, profitFen: 20, visitors: 8, refundAmountFen: 0, promoCostFen: 2, payRate: '3.0%' }
    ]
    const res = manualSubmitRecords(db, importId, records, 'cell-fix', '测试修正', 'daily')
    expect(res.ok).toBe(true)
    expect(db.rowCounts().daily_metrics).toBe(2)
    const rec = getImport(db, importId)
    expect(rec?.status).toBe('manual')
    expect(JSON.parse(rec?.fixLog ?? '{}').method).toBe('cell-fix')
    db.close()
  })

  it('手动录入（manualEntry）：无原文件场景新建人工导入记录', async () => {
    const { db, shopId } = freshDb()
    const records = [
      { date: '2026-08-11', payAmountFen: 123.45, netSalesFen: 100, profitFen: 23.45, visitors: 10, refundAmountFen: 0, promoCostFen: 5, payRate: '3.5%' }
    ]
    const res = manualEntry(db, shopId, 'daily', '手工补录-2026-08-11', records, '缺失日期补录')
    expect(res.ok).toBe(true)
    expect(db.rowCounts().daily_metrics).toBe(1)
    const rec = getImport(db, res.fixLog.rows ? listAll(db)[0].id : -1)
    expect(rec?.status).toBe('manual')
    db.close()
  })
})

function listAll(db: AppDatabase): Array<{ id: number }> {
  return db.raw.prepare('SELECT id FROM imports ORDER BY id DESC').all() as Array<{ id: number }>
}