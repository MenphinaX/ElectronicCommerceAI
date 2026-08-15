// 标准模板示例下载：9 类 CSV（UTF-8 BOM）+ 说明文档，格式对不上时供对照/人工录入
import fs from 'node:fs'
import { join } from 'node:path'
import { SPECS, SOURCE_LABEL, type SourceSpec, type SourceType } from './specs'

export interface TemplateInfo {
  type: SourceType
  label: string
  fileName: string
  path: string
}

function templateCols(spec: SourceSpec): string[] {
  return Object.values(spec.requiredCols).map((v) => (Array.isArray(v) ? v[0] : v))
}

function sampleRow(spec: SourceSpec): string[] {
  const cols = templateCols(spec)
  return cols.map((name, i) => {
    switch (name) {
      case '日期': case '统计日期': return '2026-08-11'
      case '商品id': case '商品ID': return i === 0 ? '974661273911' : '905925308759'
      case '商品名称': case '商品': return '示例商品名称'
      case '搜索词': return '汽车座套'
      case '订单编号': return '3301638816771004279'
      case '退款编号': return '265650278280597766'
      case '退款总额': return '68.00'
      case '旺旺昵称': return '示例客服'
      case '指标': return '描述相符'
      case '得分': return '4.78'
      case '行业均值': return '4.79'
      case '日期（日维度）': return '2026-08-11'
      default: return ''
    }
  })
}

function csvEscape(v: string): string {
  return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v
}

function buildCsv(spec: SourceSpec): string {
  const cols = templateCols(spec)
  const lines: string[] = [cols.map(csvEscape).join(',')]
  lines.push(sampleRow(spec).map(csvEscape).join(','))
  return '\uFEFF' + lines.join('\r\n') + '\r\n'
}

function buildReadme(): string {
  const lines: string[] = [
    'EC AI 数据源标准模板说明（人工录入/格式对照用）',
    '================================================',
    '',
    '每个 CSV 只包含必填标准列，UTF-8 BOM 编码，可在 Excel 直接打开。',
    '真实平台导出格式可能几个月一变：本地解析失败时按顺序走「LLM 兜底 → 人工处理中心」，',
    '人工处理中心支持：①列映射修复 ②单元格修正 ③手动录入（对照本模板）。',
    '',
    '各类型规格（表头行/列数/必填列，实测 2026-08-13）：',
    ''
  ]
  for (const s of SPECS) {
    lines.push(`【${s.label}】`)
    lines.push(`  文件名关键词：${s.filePatterns.map((p) => p.source).join(' / ')}`)
    lines.push(`  表头行：第 ${s.expectedHeaderRow} 行（${s.headerDuplicated ? '第 2 行为重复表头' : ''}${s.stripTailSummary ? `末 ${s.stripTailSummary} 行为汇总/对比行需剔除` : ''}）`)
    lines.push(`  列数：${s.expectedCols}（非空表头单元格）`)
    lines.push(`  必填列：${s.requiredHeader.join('、')}`)
    lines.push(`  编码：${s.encoding === 'gbk' ? 'GBK（推广 csv）' : s.encoding === 'utf8' ? 'UTF-8（带 BOM）' : 'xls/xlsx（SheetJS 解析）'}`)
    lines.push('')
  }
  lines.push('日期统一口径：YYYY-MM-DD（平台导出 2026/08/11 等格式导入时自动转换）。')
  lines.push('金额入库口径：分（元 × 100 取整）；比率入库口径：0~1 小数。')
  return lines.join('\r\n')
}

/** 「DSR-AI生成提示词.txt」：供外部 AI 生成标准 DSR excel（任务 4O；若 4P 已生成则跳过不覆盖） */
function buildDsrAiPrompt(): string {
  return [
    'EC AI 店铺 DSR 数据标准格式（供外部 AI 生成）',
    '================================================',
    '',
    '用途：让外部 AI 按本格式生成「店铺DSR数据_YYYY-MM-DD.xlsx」，可直接导入 EC AI。',
    '要求：xlsx 文件、单个工作表，按下面三个区块自上而下排列，不加多余说明行，不合并单元格。',
    '',
    '【区块一：店铺 180 天 DSR】（必填，共 5 行）',
    '第 1 行：标题「店铺180天 DSR（数据日期：YYYY-MM-DD）」',
    '第 2 行：表头 = 指标 | 得分 | 趋势 | 行业均值 | 与行业对比 | 目标值 | 距目标值差距',
    '第 3-5 行：三行数据，指标固定为：',
    '  近180天宝贝与描述相符DSR',
    '  近180天服务态度DSR',
    '  近180天物流质量DSR',
    '',
    '【区块二：店铺新增 DSR（日维度）】（建议提供）',
    '标题行「店铺新增 DSR（日维度，YYYY-MM-DD 至 YYYY-MM-DD）」',
    '表头 = 日期 | 描述得分（较上日） | 物流得分（较上日） | 服务得分（较上日）',
    '数据行：每天一行，日期格式 YYYY-MM-DD，得分形如 5.00 (0.00%)',
    '',
    '【区块三：商品新增 DSR（日维度）】（可选）',
    '标题行「商品新增 DSR（日维度，YYYY-MM-DD）」',
    '表头 = 商品名称 | 商品ID | 描述（得分/次数） | 服务（得分/次数） | 物流（得分/次数）',
    '数据行：每个商品一行，得分形如 5.00 (3)',
    '',
    '【输出要求】',
    '1. 文件名「店铺DSR数据_YYYY-MM-DD.xlsx」，区块一必须完整（区块二/三缺失可接受，但最好给出）。',
    '2. 表头文案必须与上面完全一致。',
    '3. 得分/行业均值/目标值为小数（4~5 分制）；距目标值差距为「N 笔 5 分评价订单」文案。',
    '4. 日期统一 YYYY-MM-DD；趋势为「↑ 表现良好，继续保持 / ↓ 表现下降，需关注」等简短中文文案。',
    '',
    '【真实示例（2026-08-11 实测）】',
    '店铺180天 DSR（数据日期：2026-08-11）',
    '指标\t得分\t趋势\t行业均值\t与行业对比\t目标值\t距目标值差距',
    '近180天宝贝与描述相符DSR\t4.78\t↑ 表现良好，继续保持\t4.79\t低于行业 0.14%\t4.79\t32 笔 5 分评价订单',
    '近180天服务态度DSR\t4.81\t↑ 表现良好，继续保持\t4.83\t低于行业 0.41%\t4.83\t115 笔 5 分评价订单',
    '近180天物流质量DSR\t4.85\t↑ 表现良好，继续保持\t4.85\t高于行业 1.79%\t4.92\t737 笔 5 分评价订单',
    '',
    '店铺新增 DSR（日维度，2026-08-11 至 2026-08-11）',
    '日期\t描述得分（较上日）\t物流得分（较上日）\t服务得分（较上日）',
    '2026-08-11\t5.00 (0.00%)\t5.00 (0.00%)\t5.00 (0.00%)',
    '',
    '商品新增 DSR（日维度，2026-08-11）',
    '商品名称\t商品ID\t描述（得分/次数）\t服务（得分/次数）\t物流（得分/次数）',
    '汽车座套全包真皮座椅套订做专用全包围2026座垫四季通用汽...\t1067854327120\t5.00 (3)\t5.00 (3)\t5.00 (3)',
    '汽车座套全包真皮专车专用定制车座套纳帕皮坐垫套四季通用...\t1069702173954\t5.00 (2)\t5.00 (2)\t5.00 (2)'
  ].join('\r\n') + '\r\n'
}

export function ensureTemplates(dir: string): TemplateInfo[] {
  fs.mkdirSync(dir, { recursive: true })
  const out: TemplateInfo[] = []
  for (const spec of SPECS) {
    const fileName = `模板-${spec.label}.csv`
    const p = join(dir, fileName)
    if (!fs.existsSync(p)) fs.writeFileSync(p, buildCsv(spec))
    out.push({ type: spec.type, label: spec.label, fileName, path: p })
  }
  const readme = join(dir, '数据源模板说明.txt')
  if (!fs.existsSync(readme)) fs.writeFileSync(readme, buildReadme())
  const dsrPrompt = join(dir, 'DSR-AI生成提示词.txt')
  if (!fs.existsSync(dsrPrompt)) fs.writeFileSync(dsrPrompt, buildDsrAiPrompt())
  return out
}

export function listTemplates(dir: string): TemplateInfo[] {
  ensureTemplates(dir)
  const out: TemplateInfo[] = []
  for (const spec of SPECS) {
    const fileName = `模板-${spec.label}.csv`
    out.push({ type: spec.type, label: spec.label, fileName, path: join(dir, fileName) })
  }
  return out
}

export function copyTemplatesTo(dir: string, destDir: string): { count: number; dest: string } {
  const items = ensureTemplates(dir)
  fs.mkdirSync(destDir, { recursive: true })
  for (const it of items) fs.copyFileSync(it.path, join(destDir, it.fileName))
  const readme = join(dir, '数据源模板说明.txt')
  if (fs.existsSync(readme)) fs.copyFileSync(readme, join(destDir, '数据源模板说明.txt'))
  const dsrPrompt = join(dir, 'DSR-AI生成提示词.txt')
  if (fs.existsSync(dsrPrompt)) fs.copyFileSync(dsrPrompt, join(destDir, 'DSR-AI生成提示词.txt'))
  return { count: items.length + 2, dest: destDir }
}

export { SOURCE_LABEL }
