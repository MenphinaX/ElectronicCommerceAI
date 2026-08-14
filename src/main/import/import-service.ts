// 导入编排：识别→解析→严苛校验→（失败可 LLM 兜底）→事务入库→去重（文件哈希）→归档→imports 留痕
import fs from 'node:fs'
import { basename, join } from 'node:path'
import type { AppDatabase } from '../db/database'
import {
  insertImport, insertRefundOrder, upsertCsDaily, upsertDailyMetric, upsertDsr180d,
  upsertDsrDaily, upsertProductDaily, upsertPromoDaily, upsertSearchKeyword,
  type ImportRow
} from '../db/repo'
import { nowTimestamp } from '../db/units'
import type { ParsedFile } from './parsers'
import { parseSourceFile } from './parsers'
import { readSourceFile, sha256File } from './reader'
import { detectType, formatIssues, type ValidationIssue } from './validate'
import { SOURCE_LABEL, type SourceType } from './specs'
import { runFallback } from './fallback'
import type { ModelConfig } from './model-client'

export interface ImportFileResult {
  file: string
  detectedType: SourceType | null
  detectedLabel: string
  status: 'ok' | 'failed' | 'skipped'
  rows: number
  elapsedMs: number
  message: string
  importId?: number
  issues: string[]
  fallbackUsed?: boolean
}

export interface ImportOptions {
  shopId: number
  allowFallback?: boolean
  modelConfig?: ModelConfig | null
  archiveDir?: string
}

export function noteFor(issues: ValidationIssue[] | string[], fallbackUsed?: boolean, fallbackDetail?: string): string {
  const parts: string[] = []
  if (fallbackUsed) parts.push(`LLM 兜底：${fallbackDetail ?? '列映射'}`)
  if (issues.length > 0) parts.push(`问题清单：${issues.map((i) => (typeof i === 'string' ? i : i.message)).join('；')}`)
  return parts.join(' | ')
}

/** 已存在同哈希的 ok 记录 → 跳过（防重复导入翻倍） */
export function findExistingOkImport(db: AppDatabase, hash: string): (ImportRow & { id: number }) | null {
  const row = db.raw
    .prepare(`SELECT * FROM imports WHERE file_hash = ? AND status = 'ok' ORDER BY id DESC LIMIT 1`)
    .get(hash) as (ImportRow & { id: number }) | undefined
  return row ?? null
}

export function archiveFile(archiveDir: string, src: string): string | null {
  try {
    fs.mkdirSync(archiveDir, { recursive: true })
    const dest = join(archiveDir, basename(src))
    fs.copyFileSync(src, dest)
    return dest
  } catch {
    return null
  }
}

export function insertParsed(db: AppDatabase, shopId: number, parsed: ParsedFile): number {
  const tx = db.raw.transaction(() => {
    switch (parsed.rows.target) {
      case 'daily_metrics':
        for (const r of parsed.rows.rows) upsertDailyMetric(db, { ...r, shopId })
        break
      case 'product_daily':
        for (const r of parsed.rows.rows) upsertProductDaily(db, { ...r, shopId })
        break
      case 'promo_daily':
        for (const r of parsed.rows.rows) upsertPromoDaily(db, { ...r, shopId })
        break
      case 'refund_orders':
        for (const r of parsed.rows.rows) insertRefundOrder(db, { ...r, shopId })
        break
      case 'cs_daily':
        for (const r of parsed.rows.rows) upsertCsDaily(db, { ...r, shopId })
        break
      case 'search_keywords':
        for (const r of parsed.rows.rows) upsertSearchKeyword(db, { ...r, shopId })
        break
      case 'dsr':
        for (const r of parsed.rows.rows.daily) upsertDsrDaily(db, { ...r, shopId })
        for (const r of parsed.rows.rows.d180) upsertDsr180d(db, { ...r, shopId })
        break
    }
  })
  tx()
  return parsed.dataRows
}

export async function importOneFile(db: AppDatabase, filePath: string, opts: ImportOptions): Promise<ImportFileResult> {
  const started = Date.now()
  const fileName = basename(filePath)
  const issues: string[] = []
  let status: ImportFileResult['status'] = 'failed'
  let detectedType: SourceType | null = null
  let rows = 0
  let importId: number | undefined
  let fallbackUsed = false
  let message = ''
  let archivePath: string | null = null

  try {
    const hash = sha256File(filePath)
    const existing = findExistingOkImport(db, hash)
    if (existing) {
      return {
        file: fileName, detectedType: existing.sourceType as SourceType, detectedLabel: SOURCE_LABEL[existing.sourceType as SourceType] ?? existing.sourceType,
        status: 'skipped', rows: existing.rowCount ?? 0, elapsedMs: Date.now() - started,
        message: '文件已导入过（SHA-256 一致），跳过防重复', importId: existing.id, issues: []
      }
    }

    const raw = readSourceFile(filePath)
    if (raw.decodeError) {
      issues.push(raw.decodeError)
      message = '解码失败'
    } else {
      const detected = detectType(filePath, raw)
      if (!detected) {
        issues.push('无法识别为 9 类数据源之一（文件名关键词与表头双重判断均未命中）')
        message = '识别失败'
      } else {
        detectedType = detected.type
        let parsed = parseSourceFile(filePath, raw, detected.type)
        if (!parsed.ok && opts.allowFallback) {
          const fallback = await runFallback(db, filePath, raw, detected.type, opts.modelConfig ?? null, parsed.issues)
          if (fallback.ok && fallback.parsed) {
            parsed = fallback.parsed
            fallbackUsed = true
            message = `本地解析失败，LLM 兜底（${fallback.method}）后导入成功`
          } else {
            issues.push(...parsed.issues.map((i) => i.message))
            if (fallback.reason) issues.push(fallback.reason)
            message = '本地解析与 LLM 兜底均失败，转人工处理'
          }
        } else if (!parsed.ok) {
          issues.push(...parsed.issues.map((i) => i.message))
          message = opts.allowFallback ? '本地解析失败（未配置模型，跳过 LLM 兜底）' : '本地解析失败'
          if (!opts.allowFallback) issues.push('未启用 LLM 兜底')
          else issues.push('未配置 AI 模型，跳过兜底（不会发送数据）')
        }

        if (parsed.ok) {
          insertParsed(db, opts.shopId, parsed)
          rows = parsed.dataRows
          status = 'ok'
          archivePath = opts.archiveDir ? archiveFile(opts.archiveDir, filePath) : null
          if (!message) message = fallbackUsed ? `LLM 兜底导入成功` : '导入成功'
        }
      }
    }

    const note = noteFor(issues, fallbackUsed, fallbackUsed ? message : undefined)
    const rec: Omit<ImportRow, 'shopId' | 'sourceType' | 'sourceFile'> & { shopId: number; sourceType: string; sourceFile: string } = {
      shopId: opts.shopId,
      sourceType: detectedType ?? 'unknown',
      sourceFile: fileName,
      rowCount: status === 'ok' ? rows : 0,
      dateStart: null,
      dateEnd: null,
      fileHash: status === 'ok' ? sha256File(filePath) : null,
      status: status === 'ok' ? 'ok' : 'failed',
      note: note || null
    }
    if (status === 'ok') {
      // 日期范围从解析结果补
      const parsedDate = dateRangeOf(filePath, raw, detectedType)
      if (parsedDate) { rec.dateStart = parsedDate.start; rec.dateEnd = parsedDate.end }
    }
    importId = insertImport(db, { ...rec, elapsedMs: Date.now() - started, archivePath })
    if (status === 'failed') {
      // 失败的也归档，供人工处理中心重读
      if (opts.archiveDir && !archivePath) archivePath = archiveFile(opts.archiveDir, filePath)
      if (archivePath) db.raw.prepare('UPDATE imports SET archive_path = ? WHERE id = ?').run(archivePath, importId)
    }
  } catch (e) {
    status = 'failed'
    issues.push(`导入异常：${(e as Error).message}`)
    message = '导入异常'
    const note = noteFor(issues, false)
    try {
      importId = insertImport(db, {
        shopId: opts.shopId, sourceType: detectedType ?? 'unknown', sourceFile: fileName,
        rowCount: 0, fileHash: null, status: 'failed', note
      })
    } catch {
      // 留痕失败不阻塞
    }
  }

  return {
    file: fileName, detectedType, detectedLabel: detectedType ? SOURCE_LABEL[detectedType] : '未知',
    status, rows, elapsedMs: Date.now() - started, message, importId, issues, fallbackUsed
  }
}

function dateRangeOf(filePath: string, raw: ReturnType<typeof readSourceFile>, type: SourceType | null): { start: string; end: string } | null {
  if (!type) return null
  const parsed = parseSourceFile(filePath, raw, type)
  if (!parsed.ok || !parsed.dateStart || !parsed.dateEnd) return null
  return { start: parsed.dateStart, end: parsed.dateEnd }
}

export async function importFiles(db: AppDatabase, filePaths: string[], opts: ImportOptions): Promise<ImportFileResult[]> {
  const out: ImportFileResult[] = []
  for (const p of filePaths) out.push(await importOneFile(db, p, opts))
  return out
}

export { nowTimestamp }