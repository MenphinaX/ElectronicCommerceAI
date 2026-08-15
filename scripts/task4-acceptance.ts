// 任务 4 看板 验收脚本：真实九源 → 窗口切换/环比/三 KPI 核对/覆盖缺口/月度目标/双店对比/10 万行性能
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { AppDatabase } from '../src/main/db/database'
import { setSetting, upsertShop } from '../src/main/db/repo'
import {
  coverage, csBlock, dsrBlock, keywordBlock, kpiBlock, monthlyProgress, pctChange,
  productTop, promoBlock, refundBlock, shopCompare, windowRange, yesterdayGaps
} from '../src/main/db/dashboard'
import { loadFixtures } from '../tests/helpers/load-fixtures'

const LOG = join(process.cwd(), 'task4-acceptance.log')
const out: string[] = []
let passCount = 0
let failCount = 0

function line(s = ''): void {
  out.push(s)
  console.log(s)
}
function pass(name: string, detail = ''): void {
  passCount++
  line(`PASS ${name}${detail ? ' — ' + detail : ''}`)
}
function fail(name: string, detail = ''): void {
  failCount++
  line(`FAIL ${name}${detail ? ' — ' + detail : ''}`)
}
function check(name: string, ok: boolean, detail = ''): void {
  if (ok) pass(name, detail)
  else fail(name, detail)
}

function freshDb(): AppDatabase {
  const dir = mkdtempSync(join(tmpdir(), 'ecai-task4-'))
  const db = new AppDatabase(join(dir, 'task4.db'))
  db.init()
  return db
}

function loadReal(db: AppDatabase, shopId: number): void {
  const fx = loadFixtures(shopId)
  const ins = db.raw.prepare('INSERT INTO daily_metrics VALUES (@shopId,@date,@payAmountFen,@netSalesFen,@profitFen,@visitors,@refundAmountFen,@promoCostFen,@payRate)')
  const tx = db.raw.transaction(() => {
    for (const r of fx.dailyMetrics) ins.run({ ...r })
    const pd = db.raw.prepare('INSERT INTO product_daily (shop_id, product_id, date, product_name, visitors, page_views, pay_amount_fen, refund_amount_fen, promo_cost_fen, profit_fen, net_sales_fen, sales_count, consult_count, pay_rate) VALUES (@shopId,@productId,@date,@productName,@visitors,@pageViews,@payAmountFen,@refundAmountFen,@promoCostFen,@profitFen,@netSalesFen,@salesCount,@consultCount,@payRate)')
    for (const r of fx.productDaily) pd.run({ ...r })
    const pr = db.raw.prepare('INSERT INTO promo_daily (shop_id, date, ad_entity_id, ad_entity_name, impressions, clicks, cost_fen, ctr, roas) VALUES (@shopId,@date,@adEntityId,@adEntityName,@impressions,@clicks,@costFen,@ctr,@roas)')
    for (const r of fx.promoDaily) pr.run({ ...r })
    const rf = db.raw.prepare('INSERT INTO refund_orders (shop_id, order_no, refund_no, product_id, product_title, refund_amount_fen, buyer_pay_amount_fen, refund_status, goods_status, after_sale_type, payment_time, refund_finish_time, refund_apply_time, refund_reason) VALUES (@shopId,@orderNo,@refundNo,@productId,@productTitle,@refundAmountFen,@buyerPayAmountFen,@refundStatus,@goodsStatus,@afterSaleType,@paymentTime,@refundFinishTime,@refundApplyTime,@refundReason)')
    for (const r of fx.refundOrders) rf.run({ ...r, refundNo: shopId === 1 ? r.refundNo : 'S' + shopId + '-' + r.refundNo })
    const cs = db.raw.prepare('INSERT INTO cs_daily VALUES (@shopId,@date,@staffName,@inquiryFinalPayCount,@inquiryCount,@inquiryFinalPayRate,@firstResponseSeconds,@avgResponseSeconds,@satisfactionRate,@replyRate,@inquiryFinalPayAmountFen,@refundAmountFen)')
    for (const r of fx.csDaily) cs.run({ ...r })
    const kw = db.raw.prepare('INSERT INTO search_keywords VALUES (@shopId,@date,@keyword,@visitors,@cartAddCount,@favoriteCount,@payBuyerCount,@payRate,@payAmountFen,@unitPriceFen,@uvValueFen)')
    for (const r of fx.searchKeywords) kw.run({ ...r })
    const dr = db.raw.prepare('INSERT INTO dsr_daily VALUES (@shopId,@date,@descriptionScore,@logisticsScore,@serviceScore)')
    for (const r of fx.dsrDaily) dr.run({ ...r })
    const d180 = db.raw.prepare('INSERT INTO dsr_180d (shop_id, snapshot_date, indicator, score, trend, industry_avg, compare_text, target, gap_text) VALUES (@shopId,@snapshotDate,@indicator,@score,@trend,@industryAvg,@compareText,@target,@gapText)')
    for (const r of fx.dsr180d) d180.run({ ...r })
  })
  tx()
}

line('==== 任务 4 看板 验收（' + new Date().toLocaleString('zh-CN') + '）====')

// ---------- 1. 窗口切换：7/15/30 数字随窗口变化且与 SQL 一致 ----------
{
  const db = freshDb()
  const shopId = upsertShop(db, { name: '佰泰康车品旗舰店' })
  loadReal(db, shopId)
  const w7 = kpiBlock(db, shopId, windowRange('7', '2026-08-13'))
  const w15 = kpiBlock(db, shopId, windowRange('15', '2026-08-13'))
  const w30 = kpiBlock(db, shopId, windowRange('30', '2026-08-13'))
  const sql7 = db.raw.prepare(`SELECT COALESCE(SUM(pay_amount_fen),0) s FROM daily_metrics WHERE shop_id=? AND date>='2026-08-07' AND date<='2026-08-13'`).get(shopId) as { s: number }
  const sql15 = db.raw.prepare(`SELECT COALESCE(SUM(pay_amount_fen),0) s FROM daily_metrics WHERE shop_id=? AND date>='2026-07-30' AND date<='2026-08-13'`).get(shopId) as { s: number }
  const sql30 = db.raw.prepare(`SELECT COALESCE(SUM(pay_amount_fen),0) s FROM daily_metrics WHERE shop_id=? AND date>='2026-07-15' AND date<='2026-08-13'`).get(shopId) as { s: number }
  check('窗口切换-近7天支付金额', w7.payAmountFen === 6170947 && w7.payAmountFen === sql7.s, `KPI=${w7.payAmountFen} SQL=${sql7.s}（源文件 61,709.47 元）`)
  check('窗口切换-近15天支付金额', w15.payAmountFen === 18338003 && w15.payAmountFen === sql15.s, `KPI=${w15.payAmountFen} SQL=${sql15.s}`)
  check('窗口切换-近30天支付金额', w30.payAmountFen === 37124246 && w30.payAmountFen === sql30.s, `KPI=${w30.payAmountFen} SQL=${sql30.s}`)
  check('窗口切换-数字确实随窗口变化', w7.payAmountFen !== w15.payAmountFen && w15.payAmountFen !== w30.payAmountFen)
  const y = kpiBlock(db, shopId, windowRange('yesterday', '2026-08-13'))
  check('窗口切换-昨日无经营数据如实为 0', y.payAmountFen === 0 && y.days === 0)
  db.close()
}

// ---------- 2. 环比：与库中计算一致（近7天 -42.79%） ----------
{
  const db = freshDb()
  const shopId = upsertShop(db, { name: 'S' })
  loadReal(db, shopId)
  const w7 = kpiBlock(db, shopId, windowRange('7', '2026-08-13'))
  const manual = pctChange(w7.payAmountFen, w7.prev.payAmountFen)
  check('环比-近7天支付金额', w7.prev.payAmountFen === 10786756 && Math.abs((manual ?? 0) + 0.4279) < 0.001, `KPI 环比=${(manual ?? 0).toFixed(4)} 手工=(6170947-10786756)/10786756=${((6170947 - 10786756) / 10786756).toFixed(4)}`)
  db.close()
}

// ---------- 3. 抽 3 个 KPI 与源文件核对（商品/退款/推广） ----------
{
  const db = freshDb()
  const shopId = upsertShop(db, { name: 'S' })
  loadReal(db, shopId)
  const top = productTop(db, shopId, '2026-08-07', '2026-08-13')
  check('KPI-商品TOP1', top[0]?.productId === '974661273911' && top[0].payAmountFen === 903600, `商品 ${top[0]?.productId} 支付 ${top[0]?.payAmountFen} 分（源=商品明细 9,036.00 元）`)
  const rf = refundBlock(db, shopId, '2026-08-07', '2026-08-13')
  check('KPI-退款三档合计', rf.total.count === 121 && rf.total.fen === 2538548, `121 笔 / ${rf.total.fen} 分（源=退款单 25,385.48 元）`)
  check('KPI-退款三档拆分', rf.wf.count === 35 && rf.jr.count === 34 && rf.rt.count === 50 && rf.other.count === 2, `未发货35/已发货仅退款34/退货退款50/其他2`)
  const p = promoBlock(db, shopId, '2026-08-07', '2026-08-13')
  check('KPI-推广花费', p.totals.costFen === 121946, `${p.totals.costFen} 分（源=推广 csv 1,219.46 元）`)
  db.close()
}

// ---------- 4. 覆盖天数/缺口/月度目标 ----------
{
  const db = freshDb()
  const shopId = upsertShop(db, { name: 'S' })
  loadReal(db, shopId)
  const cov = coverage(db, shopId, '2026-08-07', '2026-08-13', 7)
  const daily = cov.find((c) => c.key === 'daily')!
  check('覆盖-经营如实 5/7 天', daily.coveredDays === 5 && daily.expectedDays === 7)
  const gaps = yesterdayGaps(db, shopId, '2026-08-12')
  const keys = gaps.map((g) => g.key)
  check('缺口-昨日缺经营/商品/推广/客服/搜索词/DSR', ['daily', 'product', 'promo', 'cs', 'keyword', 'dsr'].every((k) => keys.includes(k)), `缺口源=${keys.join(',')}`)
  check('缺口-退款不缺（08-12 有完结）', !keys.includes('refund'))
  setSetting(db, 'monthly_target_fen', '20000000')
  const m = monthlyProgress(db, shopId, '2026-08-13')
  check('月度目标-本月完成 160,082.03 元/目标 20 万 → 80.04%', m.payFen === 16008203 && Math.abs((m.pct ?? 0) - 0.8004) < 0.001, `pay=${m.payFen} pct=${m.pct?.toFixed(4)}`)
  db.close()
}

// ---------- 5. 店铺对比：同份九源 A/B 两店 ----------
{
  const db = freshDb()
  const a = upsertShop(db, { name: 'A店' })
  const b = upsertShop(db, { name: 'B店' })
  loadReal(db, a)
  loadReal(db, b)
  const cmp = shopCompare(db, [a, b], '2026-07-12', '2026-08-11')
  const pay = cmp.rows.find((r) => r.key === 'payAmountFen')!
  check('对比-8 行 KPI', cmp.rows.length === 8 && cmp.shops.length === 2)
  check('对比-同源两店支付金额一致', pay.values[0].value === pay.values[1].value && pay.values[0].value === 41220836, `A=${pay.values[0].value} B=${pay.values[1].value}（412,208.36 元）`)
  db.close()
}

// ---------- 6. 10 万行退款单性能：看板聚合 < 1 秒 ----------
{
  const dir = mkdtempSync(join(tmpdir(), 'ecai-task4-perf-'))
  const db = new AppDatabase(join(dir, 'perf.db'))
  db.init()
  const shopId = upsertShop(db, { name: '性能店' })
  const pad = (n: number): string => String(n).padStart(2, '0')
  const ins = db.raw.prepare(
    `INSERT OR IGNORE INTO refund_orders (shop_id, order_no, refund_no, product_id, product_title, refund_amount_fen, buyer_pay_amount_fen, refund_status, goods_status, after_sale_type, payment_time, refund_finish_time, refund_apply_time, refund_reason)
     VALUES (@shopId, @orderNo, @refundNo, @productId, @productTitle, @refundAmountFen, @buyerPayAmountFen, @refundStatus, @goodsStatus, @afterSaleType, @paymentTime, @refundFinishTime, @refundApplyTime, @refundReason)`
  )
  const tx = db.raw.transaction(() => {
    for (let i = 0; i < 100_000; i++) {
      const month = (i % 12) + 1
      const d = (i % 28) + 1
      const ts = `2026-${pad(month)}-${pad(d)} 10:00:00`
      ins.run({ shopId, orderNo: `O${i}`, refundNo: `R${i}`, productId: String(i % 500), productTitle: '商品', refundAmountFen: (i % 100) * 100, buyerPayAmountFen: 0, refundStatus: '退款成功', goodsStatus: '未发货', afterSaleType: '仅退款', paymentTime: ts, refundFinishTime: ts, refundApplyTime: ts, refundReason: '拍错' })
    }
  })
  tx()
  db.raw.prepare('SELECT COUNT(*) n FROM refund_orders').get() // 预热（模拟页面已打开，排除首开文件/页缓存开销）
  const t0 = performance.now()
  const rf = refundBlock(db, shopId, '2026-01-01', '2026-12-31')
  const ms = performance.now() - t0
  check('性能-10万行退款三档聚合', rf.total.count === 100_000 && ms < 1000, `100,000 笔 / ${ms.toFixed(0)}ms（验收线 <1000ms）`)
  db.close()
}

// ---------- 7. DSR / 客服 / 搜索词 区块数据可用 ----------
{
  const db = freshDb()
  const shopId = upsertShop(db, { name: 'S' })
  loadReal(db, shopId)
  const dsr = dsrBlock(db, shopId, '2026-08-07', '2026-08-13')
  check('DSR-日维度+180天快照', (dsr.daily as { date: string } | null)?.date === '2026-08-11' && (dsr.snapshot as Array<Record<string, unknown>>).length === 3)
  const cs = csBlock(db, shopId, '2026-08-07', '2026-08-13')
  check('客服-8 人', cs.length === 8 && cs[0].staffName === '孙春莲')
  const kw = keywordBlock(db, shopId, '2026-08-07', '2026-08-13')
  check('搜索词-TOP1 汽车座套', (kw.top as Array<Record<string, unknown>>)[0].keyword === '汽车座套' && (kw.top as Array<Record<string, unknown>>)[0].visitors === 12)
  db.close()
}

writeFileSync(LOG, out.join('\n'), 'utf8')
line('')
line(`==== 结果：PASS ${passCount} / FAIL ${failCount} ==== 日志已写 ${LOG}`)
process.exit(failCount > 0 ? 1 : 0)
