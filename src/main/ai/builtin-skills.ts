// 任务 4E 内置技能（12 精选电商 agent + 1 兜底）——整体替换任务 5 的 3 个占位
// 内容来自真实仓库 jnMetaCode/agency-agents-zh（sourceUrl + sourceChars 可回溯，禁止占位冒充）
// 转换规则：frontmatter 用表中中文名 + 原 description，删 emoji/color；正文保留 agent 提示词原文（仅剔除 emoji 字符）
// SKILL.md 源文件在 builtin-skills/<slug>/SKILL.md，经 Vite ?raw 打包进主进程
import { parseSkillMarkdown } from './skills-core'
import skill01 from './builtin-skills/01-china-ecommerce-operator/SKILL.md?raw'
import skill02 from './builtin-skills/02-pricing-optimizer/SKILL.md?raw'
import skill03 from './builtin-skills/03-ppc-strategist/SKILL.md?raw'
import skill04 from './builtin-skills/04-support-responder/SKILL.md?raw'
import skill05 from './builtin-skills/05-operations-manager/SKILL.md?raw'
import skill06 from './builtin-skills/06-search-query-analyst/SKILL.md?raw'
import skill07 from './builtin-skills/07-business-strategist/SKILL.md?raw'
import skill08 from './builtin-skills/08-ecommerce-operator/SKILL.md?raw'
import skill09 from './builtin-skills/09-executive-summary-generator/SKILL.md?raw'
import skill10 from './builtin-skills/10-analytics-reporter/SKILL.md?raw'
import skill11 from './builtin-skills/11-trend-researcher/SKILL.md?raw'
import skill12 from './builtin-skills/12-sales-coach/SKILL.md?raw'
import fallbackSkill from './builtin-skills/13-general-consultant/SKILL.md?raw'

/** 内置技能版本：任务 5=v1（3 占位），任务 4E=v2（13 精选）。settings.builtin_skills_version 记录 */
export const BUILTIN_SKILLS_VERSION = '2'

export interface BuiltinSkill {
  name: string
  description: string
  content: string
  /** 真实源文件 URL（防作弊：可回溯）；自研兜底技能为空字符串 */
  sourceUrl: string
  /** 源文件 UTF-8 字符数（防作弊：与 manifest.json 一致） */
  sourceChars: number
}

function builtin(name: string, content: string, sourceUrl: string, sourceChars: number): BuiltinSkill {
  const parsed = parseSkillMarkdown(content)
  return { name, description: parsed?.description ?? '', content, sourceUrl, sourceChars }
}

export const BUILTIN_SKILLS: BuiltinSkill[] = [
  builtin('电商运营专家', skill01, 'https://raw.githubusercontent.com/jnMetaCode/agency-agents-zh/main/marketing/marketing-china-ecommerce-operator.md', 6118),
  builtin('商品定价策略师', skill02, 'https://raw.githubusercontent.com/jnMetaCode/agency-agents-zh/main/specialized/specialized-pricing-optimizer.md', 5492),
  builtin('付费推广优化师', skill03, 'https://raw.githubusercontent.com/jnMetaCode/agency-agents-zh/main/paid-media/paid-media-ppc-strategist.md', 3372),
  builtin('客服服务专家', skill04, 'https://raw.githubusercontent.com/jnMetaCode/agency-agents-zh/main/support/support-support-responder.md', 14797),
  builtin('运营效能顾问', skill05, 'https://raw.githubusercontent.com/jnMetaCode/agency-agents-zh/main/specialized/operations-manager.md', 8945),
  builtin('搜索词分析师', skill06, 'https://raw.githubusercontent.com/jnMetaCode/agency-agents-zh/main/paid-media/paid-media-search-query-analyst.md', 3262),
  builtin('电商经营战略顾问', skill07, 'https://raw.githubusercontent.com/jnMetaCode/agency-agents-zh/main/specialized/business-strategist.md', 10433),
  builtin('电商运营策略师', skill08, 'https://raw.githubusercontent.com/jnMetaCode/agency-agents-zh/main/marketing/marketing-ecommerce-operator.md', 4083),
  builtin('经营摘要专家', skill09, 'https://raw.githubusercontent.com/jnMetaCode/agency-agents-zh/main/support/support-executive-summary-generator.md', 3543),
  builtin('电商数据分析师', skill10, 'https://raw.githubusercontent.com/jnMetaCode/agency-agents-zh/main/support/support-analytics-reporter.md', 8738),
  builtin('选品趋势研究员', skill11, 'https://raw.githubusercontent.com/jnMetaCode/agency-agents-zh/main/product/product-trend-researcher.md', 2492),
  builtin('客服话术教练', skill12, 'https://raw.githubusercontent.com/jnMetaCode/agency-agents-zh/main/sales/sales-coach.md', 8075),
  builtin('通用分析顾问', fallbackSkill, '', 0)
]

/** 7 板块强制绑定（迁移时 setModuleSkill 覆盖旧绑定） */
export const BUILTIN_MODULE_BINDINGS: Array<{ module: string; skillName: string }> = [
  { module: '全店', skillName: '电商运营专家' },
  { module: '单品', skillName: '商品定价策略师' },
  { module: '推广', skillName: '付费推广优化师' },
  { module: '客服', skillName: '客服服务专家' },
  { module: 'DSR', skillName: '运营效能顾问' },
  { module: '搜索词', skillName: '搜索词分析师' },
  { module: '指南', skillName: '电商经营战略顾问' }
]
