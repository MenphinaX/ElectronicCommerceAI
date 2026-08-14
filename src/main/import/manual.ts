// 人工处理中心：兜底也失败的文件在此三级修复（列映射修复/单元格修正/手动录入），全程软件界面内完成
import type { AppDatabase } from '../db/database'
import {
  getImport, insertImport, updateImportStatus, type ImportHistoryRow
} from '../db/repo'
import { nowTimestamp } from '../db/units'
import { insertParsed } from './import-service'
import { parseSourceFile } from './parsers'
import { readSourceFile } from './reader'
import { formatIssues } from './validate'
import { SOURCE_LABEL, specOf, type SourceType } from './specs'
import { rowsFromRecords, validateRecords } from './fallback'

export interface ManualFixLog {
  method: 'column-mapping' | 'cell-fix' | 'manual-entry'
  headerRow?: number
  mapping?: Record<string, string>
  changedCells?: number
  rows?: number
  reason?: string
  type?: SourceType
  at: string
}

export interface ManualResult {
  ok: boolean
  rows: number
  message: string
  fixLog: ManualFixLog
}

export function listFailedImports(db: AppDatabase): ImportHistoryRow[] {
  const rows = db.raw
    .prepare(
      `SELECT i.id, i.shop_id AS shopId, COALESCE(s.name, '') AS shopName, i.source_type AS sourceType,
              i.source_file AS sourceFile, i.row_count AS rowCount, i.date_start AS dateStart, i.date_end AS dateEnd,
              i.file_hash AS fileHash, i.status, i.note, i.fix_log AS fixLog, i.elapsed_ms AS elapsedMs,
              i.archive_path AS archivePath, i.imported_at AS importedAt
       FROM imports i LEFT JOIN shops s ON s.id = i.shop_id
       WHERE i.status IN ('failed','manual') ORDER BY i.id DESC`
    )
    .all() as ImportHistoryRow[]
  return rows
}

function requireArchive(db: AppDatabase, importId: number): { rec: ImportHistoryRow; archivePath: string; raw: ReturnType<typeof readSourceFile> } {
  const rec = getImport(db, importId)
  if (!rec) throw new Error(`导入记录不存在（id=${importId}）`)
  if (!rec.archivePath) throw new Error('该记录没有归档文件，无法在人工处理中心修复')
  const raw = readSourceFile(rec.archivePath)
  if (raw.decodeError) throw new Error(`归档文件读取失败：${raw.decodeError}`)
  return { rec, archivePath: rec.archivePath, raw }
}

/** ① 列映射修复：用户指定表头行 + 源列→标准字段映射，本地重解析再过严苛校验 */
export function manualColumnRepair(
  db: AppDatabase,
  importId: number,
  opts: { headerRow: number; mapping: Record<string, string>; type?: SourceType }
): ManualResult {
  const { rec, archivePath, raw } = requireArchive(db, importId)
  const type = (opts.type ?? rec.sourceType) as SourceType
  const spec = specOf(type)
  const byField: Record<string, string> = {}
  for (const [src, field] of Object.entries(opts.mapping)) byField[field] = src
  const parsed = parseSourceFile(archivePath, raw, type, { headerRowOverride: opts.headerRow, columnMapping: byField })
  if (!parsed.ok) {
    return {
      ok: false, rows: 0, message: `列映射后校验未过：${formatIssues(parsed.issues)}`,
      fixLog: { method: 'column-mapping', headerRow: opts.headerRow, mapping: opts.mapping, type, at: nowTimestamp() }
    }
  }
  insertParsed(db, rec.shopId, parsed)
  const fixLog: ManualFixLog = {
    method: 'column-mapping', headerRow: opts.headerRow, mapping: opts.mapping,
    rows: parsed.dataRows, reason: '本地解析/LLM 兜底失败后人工列映射修复', type, at: nowTimestamp()
  }
  updateImportStatus(db, importId, {
    status: 'manual', fixLog: JSON.stringify(fixLog), rowCount: parsed.dataRows,
    note: `人工列映射修复：${formatIssues(parsed.issues) || '校验通过'}`
  })
  return { ok: true, rows: parsed.dataRows, message: `列映射修复成功，导入 ${parsed.dataRows} 行`, fixLog }
}

/** ② 单元格修正 / ③ 手动录入：提交标准字段记录（UI 编辑后的结果），统一校验后落库 */
export function manualSubmitRecords(
  db: AppDatabase,
  importId: number,
  records: Array<Record<string, unknown>>,
  method: 'cell-fix' | 'manual-entry',
  reason: string,
  typeOverride?: SourceType
): ManualResult {
  const rec = getImport(db, importId)
  if (!rec) throw new Error(`导入记录不存在（id=${importId}）`)
  const type = (typeOverride ?? rec.sourceType) as SourceType
  const spec = specOf(type)
  const issues = validateRecords(spec, records, records.length)
  if (issues.length > 0) {
    return { ok: false, rows: 0, message: `记录校验未过：${formatIssues(issues)}`, fixLog: { method, reason, at: nowTimestamp() } }
  }
  const rows = rowsFromRecords(spec, type, rec.sourceFile, records)
  const parsed = {
    type, label: SOURCE_LABEL[type], spec, headerRow: 1, dataRows: records.length,
    dateStart: null, dateEnd: null, rows, issues: [] as never[], ok: true
  }
  insertParsed(db, rec.shopId, parsed)
  const fixLog: ManualFixLog = { method, rows: records.length, reason, at: nowTimestamp() }
  updateImportStatus(db, importId, {
    status: 'manual', fixLog: JSON.stringify(fixLog), rowCount: records.length,
    note: `${method === 'cell-fix' ? '单元格修正' : '手动录入'}：${reason}`
  })
  return { ok: true, rows: records.length, message: `${method === 'cell-fix' ? '单元格修正' : '手动录入'}成功，共 ${records.length} 行`, fixLog }
}

/** ③ 手动录入（无原文件场景）：以标准模板新建一条人工导入记录 */
export function manualEntry(
  db: AppDatabase,
  shopId: number,
  type: SourceType,
  sourceName: string,
  records: Array<Record<string, unknown>>,
  reason: string
): ManualResult {
  const spec = specOf(type)
  const issues = validateRecords(spec, records, records.length)
  if (issues.length > 0) {
    return { ok: false, rows: 0, message: `记录校验未过：${formatIssues(issues)}`, fixLog: { method: 'manual-entry', reason, at: nowTimestamp() } }
  }
  const rows = rowsFromRecords(spec, type, sourceName, records)
  const parsed = {
    type, label: SOURCE_LABEL[type], spec, headerRow: 1, dataRows: records.length,
    dateStart: null, dateEnd: null, rows, issues: [] as never[], ok: true
  }
  insertParsed(db, shopId, parsed)
  const fixLog: ManualFixLog = { method: 'manual-entry', rows: records.length, reason, at: nowTimestamp() }
  insertImport(db, {
    shopId, sourceType: type, sourceFile: sourceName || `人工录入-${SOURCE_LABEL[type]}`,
    rowCount: records.length, status: 'manual', note: `手动录入：${reason}`,
    fixLog: JSON.stringify(fixLog), elapsedMs: 0
  })
  return { ok: true, rows: records.length, message: `手动录入成功，共 ${records.length} 行`, fixLog }
}