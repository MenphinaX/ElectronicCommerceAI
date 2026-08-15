import { describe, expect, it } from 'vitest'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { AppDatabase } from '../src/main/db/database'
import { upsertShop, upsertSkill, setModuleSkill, getAnalysis, listAnalysesForWindow } from '../src/main/db/repo'
import {
  buildPrompt, buildWindowSummary, COMMENT_BLOCKS, generateComments, resolveSkillForBlock, runRules, windowKey
} from '../src/main/ai/comments'
import type { WindowRange } from '../src/main/db/dashboard'
import { loadFixtures } from './helpers/load-fixtures'

const W30: WindowRange = { mode: '30', label: '近30天', days: 30, start: '2026-07-12', end: '2026-08-11', prevStart: '2026-06-12', prevEnd: '2026-07-11' }

function freshDb(): AppDatabase {
  const dir = mkdtempSync(join(tmpdir(), 'ecai-cmt-'))
  const db = new AppDatabase(join(dir, 'cmt.db'))
  db.init()
  return db
}

function loadReal(db: AppDatabase, shopId: number): void {
  const fx = loadFixtures(shopId)
  for (const r of fx.dailyMetrics) db.raw.prepare('INSERT INTO daily_metrics (shop_id, date, pay_amount_fen, net_sales_fen, profit_fen, visitors, refund_amount_fen, promo_cost_fen, pay_rate, sales_count) VALUES (@shopId,@date,@payAmountFen,@netSalesFen,@profitFen,@visitors,@refundAmountFen,@promoCostFen,@payRate,@salesCount)').run({ ...r })
  for (const r of fx.productDaily) db.raw.prepare('INSERT INTO product_daily (shop_id, product_id, date, product_name, visitors, page_views, pay_amount_fen, refund_amount_fen, promo_cost_fen, profit_fen, net_sales_fen, sales_count, consult_count, pay_rate) VALUES (@shopId,@productId,@date,@productName,@visitors,@pageViews,@payAmountFen,@refundAmountFen,@promoCostFen,@profitFen,@netSalesFen,@salesCount,@consultCount,@payRate)').run({ ...r })
  for (const r of fx.promoDaily) db.raw.prepare('INSERT INTO promo_daily (shop_id, date, ad_entity_id, ad_entity_name, impressions, clicks, cost_fen, ctr, roas) VALUES (@shopId,@date,@adEntityId,@adEntityName,@impressions,@clicks,@costFen,@ctr,@roas)').run({ ...r })
  for (const r of fx.refundOrders) db.raw.prepare('INSERT INTO refund_orders (shop_id, order_no, refund_no, product_id, product_title, refund_amount_fen, buyer_pay_amount_fen, refund_status, goods_status, after_sale_type, payment_time, refund_finish_time, refund_apply_time, refund_reason) VALUES (@shopId,@orderNo,@refundNo,@productId,@productTitle,@refundAmountFen,@buyerPayAmountFen,@refundStatus,@goodsStatus,@afterSaleType,@paymentTime,@refundFinishTime,@refundApplyTime,@refundReason)').run({ ...r, refundNo: 'T' + r.refundNo })
  for (const r of fx.csDaily) db.raw.prepare('INSERT INTO cs_daily VALUES (@shopId,@date,@staffName,@inquiryFinalPayCount,@inquiryCount,@inquiryFinalPayRate,@firstResponseSeconds,@avgResponseSeconds,@satisfactionRate,@replyRate,@inquiryFinalPayAmountFen,@refundAmountFen)').run({ ...r })
  for (const r of fx.searchKeywords) db.raw.prepare('INSERT INTO search_keywords VALUES (@shopId,@date,@keyword,@visitors,@cartAddCount,@favoriteCount,@payBuyerCount,@payRate,@payAmountFen,@unitPriceFen,@uvValueFen)').run({ ...r })
  for (const r of fx.dsrDaily) db.raw.prepare('INSERT INTO dsr_daily VALUES (@shopId,@date,@descriptionScore,@logisticsScore,@serviceScore)').run({ ...r })
}

function seedSkills(db: AppDatabase): Map<number, { name: string; body: string }> {
  const map = new Map<number, { name: string; body: string }>()
  const ids: Record<string, number> = {}
  for (const name of ['全店', '单品', '指南', '算法艺术', '通用分析顾问']) {
    const id = upsertSkill(db, { name, description: name + ' desc', path: 'skills/' + name + '/SKILL.md' })
    ids[name] = id
    map.set(id, { name, body: 'SKILL-' + name + '：请按该技能风格输出评语，关注' + name + '维度。' })
  }
  setModuleSkill(db, '全店', ids['全店'])
  setModuleSkill(db, '单品', ids['单品'])
  setModuleSkill(db, '指南', ids['指南'])
  return map
}

describe('任务6 评语：规则引擎（确定性异常）', () => {
  it('全窗口运行规则：每条命中的证据都含真实数字，且至少命中 1 条', () => {
    const db = freshDb()
    const shopId = upsertShop(db, { name: '佰泰康车品旗舰店' })
    loadReal(db, shopId)
    const hits = runRules(db, shopId, W30)
    writeFileSync(join(tmpdir(), 'cmt-hits.json'), JSON.stringify({ hits, kpi: db.raw.prepare('SELECT * FROM daily_metrics ORDER BY date LIMIT 3').all() }, null, 2))
    expect(hits.length).toBeGreaterThan(0)
    for (const h of hits) {
      expect(h.rule.length).toBeGreaterThan(0)
      expect(h.evidence).toMatch(/[0-9]/)
    }
  })
})

describe('任务6 评语：窗口摘要与提示词组装', () => {
  it('摘要包含真实金额（30天支付 412208.36 元）与窗口日期', () => {
    const db = freshDb()
    const shopId = upsertShop(db, { name: '佰泰康车品旗舰店' })
    loadReal(db, shopId)
    const s = buildWindowSummary(db, shopId, W30)
    expect(s).toContain('2026-07-12')
    expect(s).toContain('412208.36元')
    expect(s).toContain('近30天')
  })

  it('提示词 = 模块 + 分析框架 + 摘要 + 异常清单 + 技能补充，system 四段式 300~1000 字（4P 去模板化，4Q 字数对齐）', () => {
    const db = freshDb()
    const shopId = upsertShop(db, { name: '佰泰康车品旗舰店' })
    loadReal(db, shopId)
    const rules = runRules(db, shopId, W30)
    const block = COMMENT_BLOCKS[0]
    const p = buildPrompt('SKILL-BODY-正文', block, 'SUMMARY', rules)
    expect(p.system).toContain('300~1000') // 4R 规格翻转：字数 300~800→300~1000（非放宽非删减）
    expect(p.system).not.toContain('结论先行')
    expect(p.system).not.toContain('50~100')
    expect(p.user).toContain('SKILL-BODY-正文')
    expect(p.user).toContain('模块分析框架')
    expect(p.user).toContain(block.module)
    expect(p.user).toContain('SUMMARY')
    if (rules.length) expect(p.user).toContain('异常清单')
  })
})

describe('任务6 评语：skill 绑定解析', () => {
  it('有绑定用绑定 skill，无绑定回退内置默认', () => {
    const db = freshDb()
    const shopId = upsertShop(db, { name: '佰泰康车品旗舰店' })
    loadReal(db, shopId)
    const skills = seedSkills(db)
    const readSkill = (id: number) => { const s = skills.get(id); return s ? { name: s.name, body: s.body } : null }
    const promoBlock = COMMENT_BLOCKS.find((b) => b.module === '推广')!
    // 未绑定：回退 通用分析顾问 内置兜底
    setModuleSkill(db, '推广', null)
    let ref = resolveSkillForBlock(db, promoBlock, readSkill)
    expect(ref?.skillName).toBe('通用分析顾问')
    // 绑定 算法艺术
    const art = (listSkillsLike(db, '算法艺术')) as number
    setModuleSkill(db, '推广', art)
    ref = resolveSkillForBlock(db, promoBlock, readSkill)
    expect(ref?.skillName).toBe('算法艺术')
  })
})

function listSkillsLike(db: AppDatabase, name: string): number {
  const rows = db.raw.prepare('SELECT id FROM skills WHERE name = ?').get(name) as { id: number } | undefined
  if (!rows) throw new Error('skill not found: ' + name)
  return rows.id
}

describe('任务6 评语：生成流程（stub 模型）', () => {
  function setup() {
    const db = freshDb()
    const shopId = upsertShop(db, { name: '佰泰康车品旗舰店' })
    loadReal(db, shopId)
    const skills = seedSkills(db)
    const readSkill = (id: number) => { const s = skills.get(id); return s ? { name: s.name, body: s.body } : null }
    const calls: Array<{ system: string; user: string }> = []
    let inFlight = 0
    let maxInFlight = 0
    const caller = async (req: { system: string; user: string }): Promise<{ text: string; model: string }> => {
      inFlight += 1
      maxInFlight = Math.max(maxInFlight, inFlight)
      calls.push(req)
      await new Promise((r) => setTimeout(r, 10))
      inFlight -= 1
      const module = (req.user.match(/【本模块】(\S+)/) ?? [])[1] ?? '模块'
      return { text: `结论：${module} 近30天支付 412208.36 元，建议关注。`, model: 'test-model' }
    }
    return { db, shopId, readSkill, caller, calls, maxInFlight: () => maxInFlight }
  }

  it('自动生成：全部 generated 并落库（含 skill 与 model），并发 <=3', async () => {
    const { db, shopId, readSkill, caller, calls, maxInFlight } = setup()
    const res = await generateComments(db, { shopId, w: W30, configured: true, caller, readSkill })
    expect(res.length).toBe(COMMENT_BLOCKS.length)
    for (const r of res) {
      expect(r.status).toBe('generated')
      expect(r.content).toContain('412208.36')
      expect(r.skillId).toBeGreaterThan(0)
      expect(r.model).toBe('test-model')
    }
    expect(maxInFlight()).toBeLessThanOrEqual(3)
    const rows = listAnalysesForWindow(db, shopId, windowKey(W30))
    expect(rows.length).toBe(COMMENT_BLOCKS.length)
    expect(rows[0].model).toBe('test-model')
    // 换 skill 前后同一模块评语明显不同（提示词含不同 skill 正文）
    const promo = res.find((r) => r.module === '推广')!
    expect(promo.skillName).toBe('通用分析顾问') // seedSkills 未绑定推广 → 回退内置兜底
  })

  it('同窗口同日自动去重复用旧结果；手动 force 强制重调', async () => {
    const { db, shopId, readSkill, caller, calls } = setup()
    await generateComments(db, { shopId, w: W30, configured: true, caller, readSkill })
    const firstCalls = calls.length
    const res2 = await generateComments(db, { shopId, w: W30, configured: true, caller, readSkill })
    expect(res2.every((r) => r.status === 'reuse')).toBe(true)
    expect(calls.length).toBe(firstCalls) // 未再调模型
    const res3 = await generateComments(db, { shopId, w: W30, configured: true, force: true, caller, readSkill })
    expect(res3.every((r) => r.status === 'generated')).toBe(true)
    expect(calls.length).toBeGreaterThan(firstCalls)
  })

  it('未配 key：全部 no-key 不崩，界面可显示未配置模型', async () => {
    const { db, shopId } = setup()
    const res = await generateComments(db, { shopId, w: W30, configured: false })
    expect(res.length).toBe(COMMENT_BLOCKS.length)
    for (const r of res) {
      expect(r.status).toBe('no-key')
      expect(r.error).toBe('未配置模型')
    }
  })

  it('换 skill 前后同一模块评语不同（绑定生效：提示词分别含两个 skill 正文）', async () => {
    const { db, shopId, readSkill, caller, calls } = setup()
    const promoBlock = COMMENT_BLOCKS.find((b) => b.module === '推广')!
    const art = (db.raw.prepare('SELECT id FROM skills WHERE name = ?').get('算法艺术') as { id: number }).id
    const full = (db.raw.prepare('SELECT id FROM skills WHERE name = ?').get('全店') as { id: number }).id
    // 第一次：绑 算法艺术
    setModuleSkill(db, '推广', art)
    await generateComments(db, { shopId, w: W30, modules: ['推广'], configured: true, caller, readSkill })
    const userA = calls[0].user
    expect(userA).toContain('SKILL-算法艺术')
    // 第二次：换绑 全店，force 重调
    setModuleSkill(db, '推广', full)
    await generateComments(db, { shopId, w: W30, modules: ['推广'], configured: true, force: true, caller, readSkill })
    const userB = calls[1].user
    expect(userB).toContain('SKILL-全店')
    expect(userA).not.toBe(userB)
    // 两次内容不同
    const a1 = getAnalysis(db, shopId, '推广', windowKey(W30))
    expect(a1?.content).toBe('结论：推广（推广分析） 近30天支付 412208.36 元，建议关注。')
  })
})
