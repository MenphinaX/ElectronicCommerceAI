import { describe, expect, it } from 'vitest'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { AppDatabase } from '../src/main/db/database'
import { refundDailySummary, upsertShop } from '../src/main/db/repo'

const N = 100_000

function pad(n: number): string {
  return String(n).padStart(2, '0')
}

describe('性能基线：10 万行退款单下看板聚合 < 1 秒', () => {
  it('插入 10 万行后按日聚合查询耗时 < 1000ms 且结果正确', { timeout: 180000 }, () => {
    const dir = mkdtempSync(join(tmpdir(), 'ecai-perf-'))
    const db = new AppDatabase(join(dir, 'perf.db'))
    db.init()
    const shopId = upsertShop(db, { name: '\u6027\u80fd\u6d4b\u8bd5\u5e97' })

    const insert = db.raw.prepare(
      `INSERT OR IGNORE INTO refund_orders (shop_id, order_no, refund_no, product_id, product_title, refund_amount_fen,
         buyer_pay_amount_fen, refund_status, goods_status, after_sale_type, payment_time, refund_finish_time, refund_apply_time, refund_reason)
       VALUES (@shopId, @orderNo, @refundNo, @productId, @productTitle, @refundAmountFen,
         @buyerPayAmountFen, @refundStatus, @goodsStatus, @afterSaleType, @paymentTime, @refundFinishTime, @refundApplyTime, @refundReason)`
    )
    const tx = db.raw.transaction(() => {
      for (let i = 0; i < N; i++) {
        const month = (i % 12) + 1
        const d = (i % 28) + 1
        const ts = `2026-${pad(month)}-${pad(d)} 10:00:00`
        insert.run({
          shopId, orderNo: `O${i}`, refundNo: `R${i}`, productId: String(i % 500),
          productTitle: '商品', refundAmountFen: (i % 100) * 100, buyerPayAmountFen: 0,
          refundStatus: '退款成功', goodsStatus: '未发货', afterSaleType: '仅退款',
          paymentTime: ts, refundFinishTime: ts, refundApplyTime: ts, refundReason: '拍错'
        })
      }
    })
    tx()
    expect(db.raw.prepare('SELECT COUNT(*) n FROM refund_orders').get() as { n: number }).toEqual({ n: N })

    const t0 = performance.now()
    const summary = refundDailySummary(db, shopId, '2026-01-01', '2026-12-31')
    const ms = performance.now() - t0

    expect(summary.length).toBeGreaterThan(0)
    const total = summary.reduce((a, r) => a + Number(r.refundCount), 0)
    expect(total).toBe(N)
    expect(ms).toBeLessThan(1000)
    db.close()
  })
})
