// 投产比 AI 建议（任务 4G 加分项）：绑定「付费推广优化师」技能（按名→推广模块绑定→内置兜底）
// 无 key 返回 configured=false 由 UI 提示「未配置模型」，不崩
import type { AppDatabase } from '../db/database'
import { listModuleBindings, listSkills } from '../db/repo'
import { readSkillContent } from '../ai/skills-service'
import { decryptApiKey } from '../ai/models-ipc'
import { chatComplete, resolveModelConfig } from '../import/model-client'

export interface RoiAdviceInput {
  spend: number
  sales: number
  refundRate: number | null
  netSales: number | null
  marketingRatio: number | null
  roi: number | null
  grossMargin: number
  targetMarketingRatio: number
  minRoi: number | null
  maxSpend: number | null
  passed: boolean
  windowLabel?: string | null
  shopName?: string | null
}

export interface RoiAdviceResult {
  ok: boolean
  configured: boolean
  skillName: string | null
  content: string | null
  error: string | null
}

function pct2(v: number | null): string {
  return v == null ? '--' : `${(v * 100).toFixed(2)}%`
}

function num2(v: number | null): string {
  return v == null ? '--' : v.toFixed(2)
}

export async function roiAdvice(db: AppDatabase, rootDir: string, input: RoiAdviceInput): Promise<RoiAdviceResult> {
  const cfg = resolveModelConfig(db, null, decryptApiKey)
  if (!cfg) {
    return { ok: false, configured: false, skillName: null, content: null, error: '未配置模型' }
  }
  const skills = listSkills(db) as Array<Record<string, unknown>>
  const bindings = listModuleBindings(db)
  let skillId: number | null = null
  const byName = skills.find((s) => String(s.name) === '付费推广优化师')
  if (byName) skillId = Number(byName.id)
  if (skillId == null) {
    const promoBinding = bindings.find((b) => String(b.module) === '推广')
    if (promoBinding) skillId = Number(promoBinding.skillId)
  }
  if (skillId == null) {
    const fallback = skills.find((s) => String(s.name).includes('推广'))
    if (fallback) skillId = Number(fallback.id)
  }
  if (skillId == null) {
    return { ok: false, configured: true, skillName: null, content: null, error: '未找到「付费推广优化师」技能' }
  }
  const skill = readSkillContent(db, rootDir, skillId)
  const user = [
    '请基于以下投产比计算数据，给出可执行的付费推广优化建议（中文，结论先行，控制在 200 字内）：',
    `- 店铺：${input.shopName || '当前店铺'}${input.windowLabel ? `（窗口：${input.windowLabel}）` : ''}`,
    `- 推广花费：${num2(input.spend)} 元；成交金额：${num2(input.sales)} 元`,
    `- 退款率：${pct2(input.refundRate)}；净成交额：${num2(input.netSales)} 元`,
    `- 实际投产比：${num2(input.roi)}；营销占比：${pct2(input.marketingRatio)}（红线 ${pct2(input.targetMarketingRatio)}）`,
    `- 达标判定：${input.passed ? '达标' : '未达标'}；最低投产比红线：${num2(input.minRoi)}；可承受花费上限：${num2(input.maxSpend)} 元`,
    input.passed
      ? '- 当前已达标：请给出保持/优化的下一步动作'
      : `- 当前未达标：需压低花费至 ${num2(input.maxSpend)} 元以内，或把投产比提升到 ${num2(input.minRoi)} 以上`
  ].join('\n')
  try {
    const text = await chatComplete(cfg, [
      { role: 'system', content: skill.content },
      { role: 'user', content: user }
    ], { temperature: 0.5, maxTokens: 800, timeoutMs: 60000 })
    return { ok: true, configured: true, skillName: skill.name, content: text.trim(), error: null }
  } catch (e) {
    return { ok: false, configured: true, skillName: skill.name, content: null, error: (e as Error).message }
  }
}
