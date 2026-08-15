import { describe, expect, it } from 'vitest'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { AppDatabase } from '../src/main/db/database'
import {
  appendMessage, bindModuleSkill, createConversation, createModel, dailyKpi, getSetting,
  insertImport, insertRefundOrder, insertReport, listAnalyses, listImports, listMessages,
  listModels, listSettings, listShops, listSkills, moduleSkills, refundDailySummary,
  setSetting, upsertAnalysis, upsertCsDaily, upsertDailyMetric, upsertDsr180d, upsertDsrDaily,
  upsertProductDaily, upsertPromoDaily, upsertSearchKeyword, upsertShop, upsertSkill
} from '../src/main/db/repo'

function freshDb(): AppDatabase {
  const dir = mkdtempSync(join(tmpdir(), 'ecai-repo-'))
  const db = new AppDatabase(join(dir, 'repo.db'))
  db.init()
  return db
}

describe('仓库层：settings / shops / imports', () => {
  it('settings 增改查', () => {
    const db = freshDb()
    setSetting(db, 'username', '店主')
    setSetting(db, 'splash_enabled', '1')
    expect(getSetting(db, 'username')).toBe('店主')
    setSetting(db, 'username', '店长')
    expect(getSetting(db, 'username')).toBe('店长')
    expect(listSettings(db)).toEqual({ splash_enabled: '1', username: '店长' })
    db.close()
  })

  it('shops 按名称幂等 upsert', () => {
    const db = freshDb()
    const id1 = upsertShop(db, { name: '佰泰康车品旗舰店', platform: '天猫' })
    const id2 = upsertShop(db, { name: '佰泰康车品旗舰店' })
    expect(id1).toBe(id2)
    const shops = listShops(db)
    expect(shops).toHaveLength(1)
    expect(shops[0].platform).toBe('天猫')
    db.close()
  })

  it('imports 记录导入历史', () => {
    const db = freshDb()
    const shopId = upsertShop(db, { name: 'S' })
    const id = insertImport(db, { shopId, sourceType: '经营', sourceFile: '经营.xlsx', rowCount: 31, dateStart: '2026-07-12', dateEnd: '2026-08-11' })
    expect(id).toBeGreaterThan(0)
    expect(listImports(db)).toHaveLength(1)
    db.close()
  })
})

describe('仓库层：业务表 upsert + 聚合', () => {
  it('daily_metrics 按 (shop_id,date) 覆盖更新，KPI 聚合正确', () => {
    const db = freshDb()
    const shopId = upsertShop(db, { name: 'S' })
    upsertDailyMetric(db, { shopId, date: '2026-08-11', payAmountFen: 1534550, netSalesFen: 1160109, profitFen: 53022, visitors: 2213, refundAmountFen: 300841, promoCostFen: 121946, payRate: 0.0235 })
    upsertDailyMetric(db, { shopId, date: '2026-08-10', payAmountFen: 200000, netSalesFen: 0, profitFen: 0, visitors: 100, refundAmountFen: 0, promoCostFen: 0 })
    upsertDailyMetric(db, { shopId, date: '2026-08-11', payAmountFen: 999999, netSalesFen: 0, profitFen: 0, visitors: 0, refundAmountFen: 0, promoCostFen: 0 })
    const kpi = dailyKpi(db, shopId)
    expect(kpi.days).toBe(2)
    expect(kpi.payAmountFen).toBe(999999 + 200000)
    const ranged = dailyKpi(db, shopId, '2026-08-11', '2026-08-11')
    expect(ranged.days).toBe(1)
    db.close()
  })

  it('product_daily 三源合一：重复插入合并咨询数', () => {
    const db = freshDb()
    const shopId = upsertShop(db, { name: 'S' })
    upsertProductDaily(db, { shopId, productId: '974661273911', date: '2026-08-11', productName: '座套', visitors: 734, pageViews: 2059, payAmountFen: 903600, refundAmountFen: 95400, payRate: 0.0354 })
    upsertProductDaily(db, { shopId, productId: '974661273911', date: '2026-08-11', consultCount: 76 })
    const row = db.raw.prepare('SELECT * FROM product_daily WHERE product_id = ?').get('974661273911') as Record<string, unknown>
    expect(row.visitors).toBe(734)
    expect(row.consult_count).toBe(76)
    db.close()
  })

  it('promo_daily / cs_daily / search_keywords / dsr upsert', () => {
    const db = freshDb()
    const shopId = upsertShop(db, { name: 'S' })
    upsertPromoDaily(db, { shopId, date: '2026-08-11', adEntityId: '1070515959959', adEntityName: '坐垫', impressions: 15, clicks: 1, costFen: 38, ctr: 0.06667, roas: 0 })
    upsertCsDaily(db, { shopId, date: '2026-08-09', staffName: '魏文艳', inquiryFinalPayCount: 0, inquiryCount: 0, inquiryFinalPayRate: 0, firstResponseSeconds: 10, avgResponseSeconds: 32.67, satisfactionRate: 1, replyRate: 1, inquiryFinalPayAmountFen: 0, refundAmountFen: 0 })
    upsertSearchKeyword(db, { shopId, date: '2026-08-11', keyword: '汽车座套', visitors: 12, cartAddCount: 1, favoriteCount: 1, payBuyerCount: 1, payRate: 0.0833, payAmountFen: 36800, unitPriceFen: 36800, uvValueFen: 3067 })
    upsertDsrDaily(db, { shopId, date: '2026-08-11', descriptionScore: 5, logisticsScore: 5, serviceScore: 5 })
    upsertDsr180d(db, { shopId, snapshotDate: '2026-08-11', indicator: '描述相符', score: 4.78, trend: '保持', industryAvg: 4.79, target: 4.79 })
    expect(db.raw.prepare('SELECT COUNT(*) n FROM promo_daily').get() as { n: number }).toEqual({ n: 1 })
    expect(db.raw.prepare('SELECT COUNT(*) n FROM cs_daily').get() as { n: number }).toEqual({ n: 1 })
    expect(db.raw.prepare('SELECT COUNT(*) n FROM search_keywords').get() as { n: number }).toEqual({ n: 1 })
    expect(db.raw.prepare('SELECT COUNT(*) n FROM dsr_daily').get() as { n: number }).toEqual({ n: 1 })
    expect(db.raw.prepare('SELECT COUNT(*) n FROM dsr_180d').get() as { n: number }).toEqual({ n: 1 })
    db.close()
  })

  it('refund_orders：refund_no 唯一去重，日聚合可用', () => {
    const db = freshDb()
    const shopId = upsertShop(db, { name: 'S' })
    const ok1 = insertRefundOrder(db, { shopId, orderNo: 'O1', refundNo: 'R1', refundAmountFen: 6800, paymentTime: '2026-05-12 00:06:36', goodsStatus: '未发货' })
    const ok2 = insertRefundOrder(db, { shopId, orderNo: 'O1', refundNo: 'R1', refundAmountFen: 6800, paymentTime: '2026-05-12 00:06:36' })
    insertRefundOrder(db, { shopId, orderNo: 'O2', refundNo: 'R2', refundAmountFen: 100, paymentTime: '2026-05-13 09:00:00' })
    expect(ok1).toBe(true)
    expect(ok2).toBe(false)
    expect(db.raw.prepare('SELECT COUNT(*) n FROM refund_orders').get() as { n: number }).toEqual({ n: 2 })
    const sum = refundDailySummary(db, shopId)
    expect(sum).toHaveLength(2)
    expect(sum.reduce((a, r) => a + Number(r.refundAmountFen), 0)).toBe(6900)
    db.close()
  })

  it('ai_analyses：同店同模块同日去重覆盖', () => {
    const db = freshDb()
    const shopId = upsertShop(db, { name: 'S' })
    upsertAnalysis(db, { shopId, module: '经营', date: '2026-08-11', content: '第一版' })
    upsertAnalysis(db, { shopId, module: '经营', date: '2026-08-11', content: '第二版' })
    const list = listAnalyses(db, shopId, '经营')
    expect(list).toHaveLength(1)
    expect(list[0].content).toBe('第二版')
    db.close()
  })

  it('models / conversations / messages / reports / skills / module_skills', () => {
    const db = freshDb()
    const shopId = upsertShop(db, { name: 'S' })
    createModel(db, { name: 'gpt-5.5', provider: 'openai-compatible', baseUrl: 'https://example.com', apiKeyEnc: 'enc:xxx', enabled: true })
    expect(listModels(db)).toHaveLength(1)
    const convId = createConversation(db, shopId, '经营顾问')
    const msgId = appendMessage(db, convId, 'user', '今天生意如何')
    expect(msgId).toBeGreaterThan(0)
    expect(listMessages(db, convId)).toHaveLength(1)
    insertReport(db, { shopId, type: 'daily', reportDate: '2026-08-11', content: '日报正文', filePath: 'reports/2026-08-11.md' })
    const skillId = upsertSkill(db, { name: 'khazix-writer', path: 'C:/skills/khazix-writer', description: '公众号写作' })
    expect(upsertSkill(db, { name: 'khazix-writer', path: 'C:/skills/khazix-writer' })).toBe(skillId)
    bindModuleSkill(db, '经营评语', skillId, 10)
    const binds = moduleSkills(db, '经营评语')
    expect(binds).toHaveLength(1)
    expect(binds[0].skillName).toBe('khazix-writer')
    expect(listSkills(db)).toHaveLength(1)
    db.close()
  })
})
