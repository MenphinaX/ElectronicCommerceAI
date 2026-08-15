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

function sampleRow(spec: SourceSpec): string[] {
  const cols = Object.values(spec.requiredCols)
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
  const cols = Object.values(spec.requiredCols)
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
  return { count: items.length + 1, dest: destDir }
}

export { SOURCE_LABEL }
