// 任务6 评语生成核心：规则引擎 + 窗口摘要 + skill 提示词组装 + 并发生成
// 铁律：评语数字全部来自真实聚合；AI 只组织语言；未配 key 不崩并明确提示
import type { AppDatabase } from '../db/database'
import type { WindowRange } from '../db/dashboard'
import { kpiBlock, productTop, promoBlock, refundBlock, keywordBlock, csBlock, dsrBlock } from '../db/dashboard'
import { getAnalysis, listModuleBindings, listSkills, upsertAnalysis } from '../db/repo'

export interface CommentBlock {
  module: string
  label: string
  skillModules: string[]
  builtinFallback: string
}

// 动态模块：评语内嵌各区块卡片；skillModules = module_skills 用于查找绑定的模块（取第一个有绑定的）
export const COMMENT_BLOCKS: CommentBlock[] = [
  { module: '摘要', label: '摘要', skillModules: ['全店'], builtinFallback: '通用分析顾问' },
  { module: '指标', label: '核心指标', skillModules: ['全店'], builtinFallback: '通用分析顾问' },
  { module: '趋势', label: '经营趋势', skillModules: ['全店'], builtinFallback: '通用分析顾问' },
  { module: '商品', label: '单品分析', skillModules: ['单品'], builtinFallback: '通用分析顾问' },
  { module: '推广', label: '推广分析', skillModules: ['推广'], builtinFallback: '通用分析顾问' },
  { module: '退款', label: '退款分析', skillModules: ['全店'], builtinFallback: '通用分析顾问' },
  { module: '客服DSR', label: 'DSR 与客服', skillModules: ['客服', 'DSR'], builtinFallback: '通用分析顾问' },
  { module: '搜索词', label: '搜索词', skillModules: ['搜索词'], builtinFallback: '通用分析顾问' },
  { module: '建议', label: '建议动作', skillModules: ['指南'], builtinFallback: '通用分析顾问' }
]

/** “同窗口同日”去重键：用窗口结束日期（window.end） */
export function windowKey(w: WindowRange): string {
  return w.end
}

export function fmtYuan(fen: number): string {
  return `${(fen / 100).toFixed(2)}元`
}

export function pctText(x: number | null): string {
  if (x == null || !Number.isFinite(x)) return '无数据'
  return `${(x * 100).toFixed(1)}%`
}

// ---------- 内置规则引擎（确定性异常，不依赖模型）：每条返回可验证的依据 ----------
export interface RuleHit {
  rule: string
  severity: 'high' | 'medium'
  evidence: string
}

function consecutiveLossDays(db: AppDatabase, shopId: number, from: string, to: string): string | null {
  const rows = db.raw
    .prepare(`SELECT date, profit_fen AS profitFen FROM daily_metrics WHERE shop_id=? AND date>=? AND date<=? ORDER BY date`)
    .all(shopId, from, to) as Array<{ date: string; profitFen: number }>
  let best: string[] = []
  let cur: string[] = []
  for (const r of rows) {
    if (Number(r.profitFen) < 0) {
      cur.push(`${r.date}(${fmtYuan(Number(r.profitFen))})`)
      if (cur.length > best.length) best = [...cur]
    } else {
      cur = []
    }
  }
  return best.length >= 3 ? best.slice(0, 5).join('、') : null
}

export function runRules(db: AppDatabase, shopId: number, w: WindowRange): RuleHit[] {
  const hits: RuleHit[] = []
  const kpi = kpiBlock(db, shopId, w)
  // 规则1：退款率高于店铺均值（同口径 daily_metrics）
  const shopAgg = db.raw
    .prepare('SELECT COALESCE(SUM(pay_amount_fen),0) AS pay, COALESCE(SUM(refund_amount_fen),0) AS refund FROM daily_metrics WHERE shop_id=?')
    .get(shopId) as { pay: number; refund: number }
  const windowRefundRate = kpi.payAmountFen > 0 ? kpi.refundAmountFen / kpi.payAmountFen : null
  const shopRefundRate = shopAgg.pay > 0 ? shopAgg.refund / shopAgg.pay : null
  if (windowRefundRate != null && shopRefundRate != null && windowRefundRate > shopRefundRate * 1.2 && windowRefundRate - shopRefundRate > 0.03) {
    hits.push({ rule: '退款率高于店铺均值', severity: 'high', evidence: `窗口退款率 ${pctText(windowRefundRate)} vs 店铺均值 ${pctText(shopRefundRate)}（${fmtYuan(kpi.refundAmountFen)}/${fmtYuan(kpi.payAmountFen)}）` })
  }
  // 规则2：ROI 环比骤降 >=40%
  if (kpi.roi != null && kpi.prev.roi != null && kpi.prev.roi > 0 && (kpi.roi - kpi.prev.roi) / kpi.prev.roi <= -0.4) {
    hits.push({ rule: 'ROI 环比骤降', severity: 'high', evidence: `窗口 ROI ${kpi.roi.toFixed(2)} vs 上周期 ${kpi.prev.roi.toFixed(2)}，下降 ${(((kpi.prev.roi - kpi.roi) / kpi.prev.roi) * 100).toFixed(0)}%` })
  }
  // 规则3：连续 >=3 天亏损
  const loss = consecutiveLossDays(db, shopId, w.start, w.end)
  if (loss) hits.push({ rule: '连续多天亏损', severity: 'high', evidence: `连续亏损日：${loss}` })
  // 规则4：访客环比骤降 >=30%
  if (kpi.prev.visitors > 0 && (kpi.visitors - kpi.prev.visitors) / kpi.prev.visitors <= -0.3) {
    hits.push({ rule: '访客骤降', severity: 'high', evidence: `窗口访客 ${kpi.visitors} vs 上周期 ${kpi.prev.visitors}，下降 ${(((kpi.prev.visitors - kpi.visitors) / kpi.prev.visitors) * 100).toFixed(0)}%` })
  }
  // 规则5：支付转化率异常（<1% 或环比下降 >=30%）
  if (kpi.payRate != null && kpi.payRate < 0.01) {
    hits.push({ rule: '支付转化率异常偏低', severity: 'medium', evidence: `窗口支付转化率 ${pctText(kpi.payRate)}` })
  } else if (kpi.payRate != null && kpi.prev.payRate != null && kpi.prev.payRate > 0 && (kpi.payRate - kpi.prev.payRate) / kpi.prev.payRate <= -0.3) {
    hits.push({ rule: '支付转化率环比下降', severity: 'medium', evidence: `窗口 ${pctText(kpi.payRate)} vs 上周期 ${pctText(kpi.prev.payRate)}` })
  }
  // 规则6：推广费占净销售额 >15%
  if (kpi.netSalesFen > 0 && kpi.promoCostFen / kpi.netSalesFen > 0.15) {
    hits.push({ rule: '推广费占比过高', severity: 'medium', evidence: `推广费 ${fmtYuan(kpi.promoCostFen)} / 净销售额 ${fmtYuan(kpi.netSalesFen)} = ${((kpi.promoCostFen / kpi.netSalesFen) * 100).toFixed(1)}%` })
  }
  return hits
}

// ---------- 窗口数据摘要（只有真实数字，交给 AI 做依据） ----------
export function buildWindowSummary(db: AppDatabase, shopId: number, w: WindowRange): string {
  const kpi = kpiBlock(db, shopId, w)
  const products = productTop(db, shopId, w.start, w.end, 3)
  const promo = promoBlock(db, shopId, w.start, w.end, 3)
  const refund = refundBlock(db, shopId, w.start, w.end, 3)
  const kw = keywordBlock(db, shopId, w.start, w.end, 3)
  const cs = csBlock(db, shopId, w.start, w.end)
  const dsr = dsrBlock(db, shopId, w.start, w.end)
  const rules = runRules(db, shopId, w)
  const lines: string[] = []
  lines.push(`数据窗口：${w.label}（${w.start} ~ ${w.end}），环比上周期（${w.prevStart} ~ ${w.prevEnd}）`)
  lines.push(`核心指标：支付金额 ${fmtYuan(kpi.payAmountFen)}（环比 ${pctText(kpi.change.payAmountPct)}）、净销售额 ${fmtYuan(kpi.netSalesFen)}、利润 ${fmtYuan(kpi.profitFen)}、访客 ${kpi.visitors}、退款金额 ${fmtYuan(kpi.refundAmountFen)}、推广费 ${fmtYuan(kpi.promoCostFen)}、ROI ${kpi.roi == null ? '无数据' : kpi.roi.toFixed(2)}、支付转化率 ${pctText(kpi.payRate)}、退款率 ${pctText(kpi.refundRate)}`)
  if (products.length) lines.push(`商品 TOP：${products.map((p) => `${p.productName ?? p.productId} 支付 ${fmtYuan(p.payAmountFen)}`).join('；')}`)
  if (promo.entities.length) lines.push(`推广 TOP：${promo.entities.slice(0, 3).map((e) => `${e.adEntityName ?? e.adEntityId} 花费 ${fmtYuan(e.costFen)} ROI ${e.roas == null ? '无' : e.roas.toFixed(2)}`).join('；')}`)
  if (refund.total.count) lines.push(`退款：${refund.total.count} 单 ${fmtYuan(refund.total.fen)}，TOP 商品 ${refund.byProduct[0]?.productTitle ?? refund.byProduct[0]?.productId ?? '无'}`)
  const kwTop = (kw.top as Array<Record<string, unknown>>) ?? []
  if (kwTop.length) lines.push(`搜索词 TOP：${kwTop.slice(0, 3).map((k) => `${k.keyword} 访客 ${k.visitors} 支付 ${fmtYuan(Number(k.payAmountFen) || 0)}`).join('；')}`)
  if (cs.length) {
    const r0 = cs[0]
    lines.push(`客服：${r0.staffName} 回复率 ${pctText(Number(r0.replyRate) || null)} 满意率 ${pctText(Number(r0.satisfactionRate) || null)}`)
  }
  const dsrDaily = (dsr.daily as Record<string, unknown> | null) ?? null
  if (dsrDaily) lines.push(`DSR：描述 ${dsrDaily.descriptionScore ?? '无'} / 物流 ${dsrDaily.logisticsScore ?? '无'} / 服务 ${dsrDaily.serviceScore ?? '无'}`)
  if (rules.length) lines.push(`异常清单：${rules.map((r) => `${r.rule}（${r.evidence}）`).join('；')}`)
  return lines.join('\n')
}

// ---------- 提示词组装固定结构：skill 正文 + 本模块 + 摘要 + 异常清单 ----------
export function buildPrompt(skillBody: string, block: CommentBlock, summary: string, rules: RuleHit[]): { system: string; user: string } {
  const system = '你是电商店铺经营分析助手。规则：1) 只使用给定数据，禁止编造数字/日期/商品名；2) 中文输出，50~100 字；3) 结论先行，先给判断再给依据；4) 每条评语必须引用具体数字/日期/商品名；5) 禁止空话套话与泛泛而谈。'
  const parts = [
    `【skill 提示词正文】\n${skillBody}`,
    `【本模块】${block.module}（${block.label}）`,
    `【窗口数据摘要】\n${summary}`
  ]
  if (rules.length) parts.push(`【异常清单（评语可引用，不必全部列举）】\n${rules.map((r) => `- ${r.rule}：${r.evidence}`).join('\n')}`)
  return { system, user: parts.join('\n\n') }
}

// ---------- 模块 -> skill 解决（绑定优先，无绑定用内置默认） ----------
export interface SkillRef {
  skillId: number
  skillName: string
  body: string
}

export type ReadSkill = (skillId: number) => { name: string; body: string } | null

export function resolveSkillForBlock(db: AppDatabase, block: CommentBlock, readSkill: ReadSkill): SkillRef | null {
  const bindings = listModuleBindings(db)
  for (const m of block.skillModules) {
    const b = bindings.find((x) => x.module === m)
    if (b) {
      const s = readSkill(Number(b.skillId))
      if (s) return { skillId: Number(b.skillId), skillName: s.name, body: s.body }
    }
  }
  const fallback = (listSkills(db) as Array<Record<string, unknown>>).find((x) => x.name === block.builtinFallback)
  if (fallback) {
    const s = readSkill(Number(fallback.id))
    if (s) return { skillId: Number(fallback.id), skillName: s.name, body: s.body }
  }
  return null
}

// ---------- 并发生成（并发最大 3；auto 去重 / 手动 force 强制重调） ----------
export interface CommentCallerRequest {
  system: string
  user: string
}
export interface CommentCallerResult {
  text: string
  model: string
}
export type CommentCaller = (req: CommentCallerRequest) => Promise<CommentCallerResult>

export interface CommentGenerateResult {
  module: string
  label: string
  status: 'generated' | 'reuse' | 'no-key' | 'error'
  content: string | null
  skillId: number | null
  skillName: string | null
  model: string | null
  error: string | null
}

function skillNameOf(db: AppDatabase, skillId: number | null): string | null {
  if (!skillId) return null
  const s = (listSkills(db) as Array<Record<string, unknown>>).find((x) => Number(x.id) === skillId)
  return s ? String(s.name) : null
}

export interface GenerateCommentsOptions {
  shopId: number
  w: WindowRange
  force?: boolean
  configured: boolean
  modules?: string[]
  caller?: CommentCaller
  readSkill?: ReadSkill
}

export async function generateComments(db: AppDatabase, opts: GenerateCommentsOptions): Promise<CommentGenerateResult[]> {
  const { shopId, w, force = false, configured, modules, caller, readSkill } = opts
  const key = windowKey(w)
  const blocks = COMMENT_BLOCKS.filter((b) => !modules || modules.includes(b.module))
  const summary = buildWindowSummary(db, shopId, w)
  const rules = runRules(db, shopId, w)
  const results: CommentGenerateResult[] = []
  let cursor = 0
  const worker = async (): Promise<void> => {
    while (cursor < blocks.length) {
      const block = blocks[cursor++]
      const existing = getAnalysis(db, shopId, block.module, key)
      const existingContent = existing ? String(existing.content) : null
      const existingSkillId = existing && existing.sourceSkillId != null ? Number(existing.sourceSkillId) : null
      if (!force && existing) {
        results.push({ module: block.module, label: block.label, status: 'reuse', content: existingContent, skillId: existingSkillId, skillName: existing ? (String(existing.skillName ?? '') || skillNameOf(db, existingSkillId)) : null, model: existing && existing.model != null ? String(existing.model) : null, error: null })
        continue
      }
      if (!configured || !caller || !readSkill) {
        results.push({ module: block.module, label: block.label, status: 'no-key', content: existingContent, skillId: existingSkillId, skillName: existing ? skillNameOf(db, existingSkillId) : null, model: existing && existing.model != null ? String(existing.model) : null, error: '未配置模型' })
        continue
      }
      const skill = resolveSkillForBlock(db, block, readSkill)
      if (!skill) {
        results.push({ module: block.module, label: block.label, status: 'error', content: existingContent, skillId: null, skillName: null, model: null, error: '未找到可用 skill' })
        continue
      }
      try {
        const { system, user } = buildPrompt(skill.body, block, summary, rules)
        const out = await caller({ system, user })
        const text = out.text.trim()
        upsertAnalysis(db, { shopId, module: block.module, date: key, content: text, sourceSkillId: skill.skillId, model: out.model })
        results.push({ module: block.module, label: block.label, status: 'generated', content: text, skillId: skill.skillId, skillName: skill.skillName, model: out.model, error: null })
      } catch (e) {
        results.push({ module: block.module, label: block.label, status: 'error', content: existingContent, skillId: null, skillName: null, model: null, error: (e as Error).message })
      }
    }
  }
  const pool = Array.from({ length: Math.min(3, blocks.length) }, () => worker())
  await Promise.all(pool)
  return results.sort((a, b) => COMMENT_BLOCKS.findIndex((x) => x.module === a.module) - COMMENT_BLOCKS.findIndex((x) => x.module === b.module))
}
