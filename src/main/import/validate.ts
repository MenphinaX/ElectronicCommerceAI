// 识别（文件名关键词 + 表头双重判断）与本地解析严苛校验（任务书第 3 部分步骤 8）
import { basename } from 'node:path'
import type { RawRow, RawSheet } from './reader'
import { cellText, nonEmptyHeaderCols } from './reader'
import { SPECS, SOURCE_LABEL, specOf, type SourceSpec, type SourceType } from './specs'

export type IssueCode =
  | 'encoding' | 'header_row' | 'col_count' | 'missing_col'
  | 'row_count' | 'date' | 'number' | 'id' | 'structure' | 'unknown_type'

export interface ValidationIssue {
  code: IssueCode
  message: string
  row?: number
  col?: string
  value?: string
}

export interface DetectResult {
  type: SourceType
  headerRow: number
  /** filename=文件名关键词+表头双中；keyword_only=文件名命中但表头移位（交 LLM 兜底定位）；header=纯表头识别 */
  reason: 'filename' | 'keyword_only' | 'header'
}

/** 表头行是否命中：必填关键列全部出现在该行 */
export function headerContains(spec: SourceSpec, row: RawRow | undefined): boolean {
  return headerContainsMapped(spec, row, undefined)
}

/** 列映射/表头偏移场景的表头校验：必填列按映射后的源列名查找 */
export function headerContainsMapped(spec: SourceSpec, row: RawRow | undefined, mapping?: Record<string, string>): boolean {
  if (!row) return false
  const names = new Set(row.map((c) => cellText(c)))
  const needed = new Set<string>()
  for (const name of spec.requiredHeader) {
    const field = Object.entries(spec.requiredCols).find(([, n]) => n === name)?.[0]
    needed.add(field && mapping?.[field] ? mapping[field] : name)
  }
  // DSR 为双区块表头（180 天表头在第 2 行、日维度在第 7 行），requiredCols 跨两个表头，只校验 requiredHeader
  if (spec.type !== 'dsr') {
    for (const [field, name] of Object.entries(spec.requiredCols)) {
      needed.add(mapping?.[field] ?? name)
    }
  }
  return [...needed].every((n) => names.has(n))
}

/** 在指定 1-based 行找表头（严格位置校验：位置不对即不算命中，走兜底） */
export function findHeaderRow(rows: RawRow[], spec: SourceSpec): number | null {
  const idx = spec.expectedHeaderRow - 1
  if (idx >= 0 && idx < rows.length && headerContains(spec, rows[idx])) return spec.expectedHeaderRow
  return null
}

export function detectType(filePath: string, raw: RawSheet): DetectResult | null {
  const name = basename(filePath)
  // 第一优先：文件名关键词 + 表头双重判断
  for (const spec of SPECS) {
    if (spec.filePatterns.some((p) => p.test(name)) && findHeaderRow(raw.rows, spec) !== null) {
      return { type: spec.type, headerRow: spec.expectedHeaderRow, reason: 'filename' }
    }
  }
  // 第二优先：文件名命中但表头移位（平台改格式）：仍按该类型走 LLM 兜底定位表头
  for (const spec of SPECS) {
    if (spec.filePatterns.some((p) => p.test(name))) {
      return { type: spec.type, headerRow: 0, reason: 'keyword_only' }
    }
  }
  // 第三优先：纯表头识别（文件改名/换名场景）
  for (const spec of SPECS) {
    const hr = findHeaderRow(raw.rows, spec)
    if (hr !== null) return { type: spec.type, headerRow: hr, reason: 'header' }
  }
  return null
}

export interface StructureInfo {
  headerRow: number
  dataStart: number
  dataEnd: number
}

/** 定位表头与数据区（含重复表头跳过、客服末 6 行汇总剔除） */
export function locateData(rows: RawRow[], spec: SourceSpec, headerRowOverride?: number, mapping?: Record<string, string>): { info?: StructureInfo; issues: ValidationIssue[] } {
  const issues: ValidationIssue[] = []
  const headerRow = headerRowOverride ?? spec.expectedHeaderRow
  if (headerRow < 1 || headerRow > rows.length || !headerContainsMapped(spec, rows[headerRow - 1], mapping)) {
    issues.push({
      code: 'header_row',
      message: `表头行应为第 ${spec.expectedHeaderRow} 行（含关键列：${spec.requiredHeader.join('、')}），实际未命中`,
      row: headerRow
    })
    return { issues }
  }
  const actualCols = nonEmptyHeaderCols(rows[headerRow - 1])
  if (actualCols !== spec.expectedCols) {
    issues.push({
      code: 'col_count',
      message: `列数应为 ${spec.expectedCols}，实际表头非空列 ${actualCols}`,
      row: headerRow,
      col: '表头'
    })
  }
  let dataStart = headerRow + 1 // 数据从表头下一行
  if (spec.headerDuplicated) dataStart += 1 // 第 2 行是重复表头
  let dataEnd = rows.length
  if (spec.stripTailSummary) dataEnd = Math.max(dataStart, rows.length - spec.stripTailSummary)
  return {
    info: { headerRow, dataStart, dataEnd },
    issues
  }
}


/** 客服末 6 行必须是汇总/对比行 */
export function checkSummaryTail(spec: SourceSpec, rows: RawRow[]): ValidationIssue | null {
  if (!spec.stripTailSummary || !spec.summaryCheck) return null
  const tail = rows.slice(rows.length - spec.stripTailSummary)
  const staffIdx = Object.entries(spec.requiredCols).find(([, name]) => name === '旺旺昵称')?.[1]
  if (!staffIdx) return null
  // 按列名定位旺旺昵称列
  const header = rows[spec.expectedHeaderRow - 1] ?? []
  const col = header.findIndex((c) => cellText(c) === '旺旺昵称')
  if (col < 0) return null
  const names = tail.map((r) => cellText(r[col]))
  const summarySet = new Set(spec.summaryCheck)
  const ok = tail.length > 0 && names.every((n) => summarySet.has(n))
  if (!ok) {
    return {
      code: 'structure',
      message: `客服表末 ${spec.stripTailSummary} 行应为汇总/对比行（${spec.summaryCheck.join('、')}），实际末行：${names.join('、')}`,
      row: rows.length - spec.stripTailSummary + 1
    }
  }
  return null
}

export function formatIssues(issues: ValidationIssue[]): string {
  return issues.map((i) => `${i.code}:${i.message}`).join(' | ')
}

export { SPECS, SOURCE_LABEL, specOf }
export type { SourceSpec, SourceType }
