// 任务 4E 生成脚本：把 .tmp-4e-src 真实仓库源文件转换为 src/main/ai/builtin-skills/<slug>/SKILL.md
// 一次性生成物（生成后入版本库），转换逻辑与 src/main/ai/builtin-convert.ts 一致并被单测覆盖
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import matter from 'gray-matter'
import { buildSkillMd, stripEmoji, EMOJI_RE } from '../src/main/ai/builtin-convert'

interface ManifestEntry { path: string; url: string; charCount: number; bytes: number; ok: boolean; error: string }

const SRC = join(process.cwd(), '.tmp-4e-src')
const OUT = join(process.cwd(), 'src', 'main', 'ai', 'builtin-skills')

const PLAN: Array<{ slug: string; chineseName: string; repoPath: string; bindModule?: string }> = [
  { slug: '01-china-ecommerce-operator', chineseName: '电商运营专家', repoPath: 'marketing/marketing-china-ecommerce-operator.md', bindModule: '全店' },
  { slug: '02-pricing-optimizer', chineseName: '商品定价策略师', repoPath: 'specialized/specialized-pricing-optimizer.md', bindModule: '单品' },
  { slug: '03-ppc-strategist', chineseName: '付费推广优化师', repoPath: 'paid-media/paid-media-ppc-strategist.md', bindModule: '推广' },
  { slug: '04-support-responder', chineseName: '客服服务专家', repoPath: 'support/support-support-responder.md', bindModule: '客服' },
  { slug: '05-operations-manager', chineseName: '运营效能顾问', repoPath: 'specialized/operations-manager.md', bindModule: 'DSR' },
  { slug: '06-search-query-analyst', chineseName: '搜索词分析师', repoPath: 'paid-media/paid-media-search-query-analyst.md', bindModule: '搜索词' },
  { slug: '07-business-strategist', chineseName: '电商经营战略顾问', repoPath: 'specialized/business-strategist.md', bindModule: '指南' },
  { slug: '08-ecommerce-operator', chineseName: '电商运营策略师', repoPath: 'marketing/marketing-ecommerce-operator.md' },
  { slug: '09-executive-summary-generator', chineseName: '经营摘要专家', repoPath: 'support/support-executive-summary-generator.md' },
  { slug: '10-analytics-reporter', chineseName: '电商数据分析师', repoPath: 'support/support-analytics-reporter.md' },
  { slug: '11-trend-researcher', chineseName: '选品趋势研究员', repoPath: 'product/product-trend-researcher.md' },
  { slug: '12-sales-coach', chineseName: '客服话术教练', repoPath: 'sales/sales-coach.md' }
]

const manifest = JSON.parse(readFileSync(join(SRC, 'manifest.json'), 'utf8')) as ManifestEntry[]
rmSync(OUT, { recursive: true, force: true })
mkdirSync(OUT, { recursive: true })

for (const p of PLAN) {
  const entry = manifest.find((m) => m.path === p.repoPath)
  if (!entry || !entry.ok) throw new Error('manifest 缺真实条目: ' + p.repoPath)
  const src = readFileSync(join(SRC, p.repoPath), 'utf8')
  if (Buffer.byteLength(src, 'utf8') !== entry.bytes) throw new Error('源文件字节数与 manifest 不符: ' + p.repoPath)
  const { data, content } = matter(src)
  const desc = String(data.description ?? '').trim()
  if (!desc) throw new Error('缺 description: ' + p.repoPath)
  const md = buildSkillMd(p.chineseName, desc, content)
  if (md.match(EMOJI_RE)) throw new Error('转换后仍含 emoji: ' + p.repoPath)
  if (stripEmoji(md) !== md) throw new Error('stripEmoji 不一致: ' + p.repoPath)
  const dir = join(OUT, p.slug)
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, 'SKILL.md'), md, 'utf8')
  console.log(`${p.slug.padEnd(34)} ${p.chineseName.padEnd(10)} srcChars=${String(entry.charCount).padStart(5)}  mdChars=${md.length}  url=${entry.url}`)
}

const fallbackMd = `---
name: 通用分析顾问
description: 通用经营分析兜底（内置）：当看板某模块未绑定任何技能时使用的最小分析框架
---

# 通用分析顾问

你是电商数据分析顾问。当某个看板模块没有绑定专属技能时，按本指南生成评语。

分析框架：
1. 先看核心指标本期值与环比：支付金额、访客数、转化率、退款、推广投入产出
2. 找异常：哪个指标明显偏离近期均值，哪个来源有缺口
3. 下结论：一句话概括本期经营状况，再给 1~2 条建议

输出要求：中文、结论先行、50~100 字、必须带具体数字与日期、禁止空话套话。
`
mkdirSync(join(OUT, '13-general-consultant'), { recursive: true })
writeFileSync(join(OUT, '13-general-consultant', 'SKILL.md'), fallbackMd, 'utf8')
console.log('13-general-consultant'.padEnd(34) + ' 通用分析顾问  written（自研兜底，非仓库来源）')
console.log('DONE')
