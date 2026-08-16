// 任务 3 IPC：店铺 CRUD + 导入/人工处理/模板下载/LLM 兜底配置（渲染层一律走这里，不直接碰文件/库）
import { app, dialog, ipcMain, safeStorage, shell } from 'electron'
import { join } from 'node:path'
import type { AppDatabase } from '../db/database'
import {
  deleteImportRecord, deleteShop, getDefaultShopId, getImportCoverage, getSetting, listImportsWithShop,
  listShops, setDefaultShopId, setSetting, updateShop, upsertShop
} from '../db/repo'
import { importFiles } from './import-service'
import { rowsToRecords } from './fallback'
import { parseSourceFile } from './parsers'
import { manualColumnRepair, manualEntry, manualSubmitRecords, listFailedImports } from './manual'
import { readSourceFile } from './reader'
import { detectType } from './validate'
import { SOURCE_LABEL, type SourceType } from './specs'
import { resolveModelConfig } from './model-client'
import { copyTemplatesTo, ensureTemplates, listTemplates } from './templates'

function archivesDir(): string {
  return join(app.getPath('userData'), 'archives')
}

function templatesDir(): string {
  return join(app.getPath('userData'), 'import-templates')
}

export function registerImportIpc(getDb: () => AppDatabase): void {
  // ---------- 店铺 CRUD ----------
  ipcMain.handle('shops:list', () => {
    const db = getDb()
    const shops = listShops(db)
    const def = getDefaultShopId(db)
    return { shops, defaultId: def }
  })
  ipcMain.handle('shops:create', (_e, row: { name: string; platform?: string; shopCode?: string | null }) => {
    return upsertShop(getDb(), row)
  })
  ipcMain.handle('shops:update', (_e, id: number, patch: { name?: string; platform?: string; shopCode?: string | null }) => {
    updateShop(getDb(), id, patch)
    return true
  })
  ipcMain.handle('shops:delete', (_e, id: number) => {
    deleteShop(getDb(), id)
    return true
  })
  ipcMain.handle('shops:set-default', (_e, id: number | null) => {
    setDefaultShopId(getDb(), id)
    return true
  })

  // ---------- 文件选择/分析（先识别再确认，不改数据） ----------
  ipcMain.handle('import:pick', async () => {
    const res = await dialog.showOpenDialog({
      title: '选择数据源文件（可多选）',
      properties: ['openFile', 'multiSelections'],
      filters: [
        { name: '数据源文件', extensions: ['csv', 'xls', 'xlsx'] },
        { name: '所有文件', extensions: ['*'] }
      ]
    })
    if (res.canceled) return []
    return analyzePaths(res.filePaths)
  })
  ipcMain.handle('import:analyze', (_e, paths: string[]) => analyzePaths(paths))

  // ---------- 导入 ----------
  ipcMain.handle('import:run', async (_e, opts: { paths: string[]; shopId: number; allowFallback?: boolean }) => {
    const db = getDb()
    db.backup('import')
    const modelConfig = opts.allowFallback ? resolveModelConfig(db, null, decryptKey) : null
    return importFiles(db, opts.paths, {
      shopId: opts.shopId,
      allowFallback: !!opts.allowFallback,
      modelConfig,
      archiveDir: archivesDir()
    })
  })

  // ---------- 人工处理：预览（读取归档原文件供界面修复） ----------
  ipcMain.handle('import:manual-preview', (_e, importId: number) => {
    const db = getDb()
    const rec = db.raw
      .prepare(`SELECT i.id, i.source_type AS sourceType, i.source_file AS sourceFile, i.note, i.archive_path AS archivePath, i.status
                FROM imports i WHERE i.id = ?`)
      .get(importId) as { id: number; sourceType: string; sourceFile: string; note: string | null; archivePath: string | null; status: string } | undefined
    if (!rec) throw new Error('导入记录不存在')
    if (!rec.archivePath) return { id: rec.id, sourceType: rec.sourceType, sourceFile: rec.sourceFile, issues: [], rows: [], typeKnown: rec.sourceType !== 'unknown' }
    const raw = readSourceFile(rec.archivePath)
    const rows = raw.rows.slice(0, 60).map((r) => r.map((c) => String(c ?? '')))
    return {
      id: rec.id,
      sourceType: rec.sourceType,
      sourceFile: rec.sourceFile,
      status: rec.status,
      issues: parseNoteIssues(rec.note),
      rows,
      typeKnown: rec.sourceType !== 'unknown'
    }
  })
  ipcMain.handle('import:manual-parse-preview', (_e, opts: { importId: number; type?: SourceType; headerRow: number; mapping?: Record<string, string> }) => {
    const db = getDb()
    const rec = db.raw.prepare('SELECT source_type AS sourceType, source_file AS sourceFile, archive_path AS archivePath FROM imports WHERE id = ?').get(opts.importId) as { sourceType: string; sourceFile: string; archivePath: string | null } | undefined
    if (!rec?.archivePath) throw new Error('无归档文件')
    const type = (opts.type ?? rec.sourceType) as SourceType
    const raw = readSourceFile(rec.archivePath)
    const byField: Record<string, string> = {}
    if (opts.mapping) for (const [src, field] of Object.entries(opts.mapping)) byField[field] = src
    const parsed = parseSourceFile(rec.archivePath, raw, type, { headerRowOverride: opts.headerRow, columnMapping: byField })
    if (!parsed.ok) {
      return { ok: false, records: [], issues: parsed.issues.map((i) => i.message) }
    }
    return { ok: true, records: rowsToRecords(parsed), issues: [], rows: parsed.dataRows }
  })

  // ---------- 数据覆盖（4S）：9 源+图片聚合，供导入中心「数据覆盖」tab ----------
  ipcMain.handle('imports:coverage', (_e, shopId: number) => getImportCoverage(getDb(), Number(shopId) || 0))

  // ---------- 导入历史 ----------
  ipcMain.handle('import:history', () => listImportsWithShop(getDb()))
  ipcMain.handle('import:delete-history', (_e, id: number) => {
    deleteImportRecord(getDb(), id)
    return true
  })

  // ---------- 人工处理中心 ----------
  ipcMain.handle('import:failed-list', () => listFailedImports(getDb()))
  ipcMain.handle('import:manual-map', (_e, opts: { importId: number; type?: SourceType; headerRow: number; mapping: Record<string, string> }) => {
    return manualColumnRepair(getDb(), opts.importId, opts)
  })
  ipcMain.handle('import:manual-submit', (_e, opts: { importId: number; records: Array<Record<string, unknown>>; method: 'cell-fix' | 'manual-entry'; reason: string; type?: SourceType }) => {
    return manualSubmitRecords(getDb(), opts.importId, opts.records, opts.method, opts.reason, opts.type)
  })
  ipcMain.handle('import:manual-entry', (_e, opts: { shopId: number; type: SourceType; sourceName: string; records: Array<Record<string, unknown>>; reason: string }) => {
    return manualEntry(getDb(), opts.shopId, opts.type, opts.sourceName, opts.records, opts.reason)
  })

  // ---------- LLM 兜底配置（safeStorage 加密，界面只显示已设置/未设置） ----------
  ipcMain.handle('import:llm-status', () => {
    const db = getDb()
    const cfg = resolveModelConfig(db, null, decryptKey)
    return { configured: !!cfg, baseUrl: cfg?.baseUrl ?? null, model: cfg?.model ?? null }
  })
  ipcMain.handle('import:llm-config-get', () => {
    const db = getDb()
    return {
      baseUrl: getSetting(db, 'llm_base_url'),
      model: getSetting(db, 'llm_model'),
      keySet: !!getSetting(db, 'llm_api_key_enc')
    }
  })
  ipcMain.handle('import:llm-config-set', (_e, cfg: { baseUrl: string; model: string; apiKey: string }) => {
    if (!safeStorage.isEncryptionAvailable()) {
      throw new Error('系统加密不可用（safeStorage），无法安全保存 API key')
    }
    const db = getDb()
    setSetting(db, 'llm_base_url', cfg.baseUrl.trim())
    setSetting(db, 'llm_model', cfg.model.trim())
    if (cfg.apiKey.trim()) {
      setSetting(db, 'llm_api_key_enc', safeStorage.encryptString(cfg.apiKey.trim()).toString('base64'))
    }
    return { ok: true }
  })

  // ---------- 标准模板下载 ----------
  ipcMain.handle('import:templates', () => {
    const dir = templatesDir()
    ensureTemplates(dir)
    return { dir, items: listTemplates(dir) }
  })
  ipcMain.handle('import:templates-save', async () => {
    const res = await dialog.showOpenDialog({
      title: '选择模板保存目录',
      properties: ['openDirectory', 'createDirectory']
    })
    if (res.canceled || res.filePaths.length === 0) return { canceled: true }
    const dir = templatesDir()
    ensureTemplates(dir)
    return copyTemplatesTo(dir, res.filePaths[0])
  })
  ipcMain.handle('import:templates-open', () => {
    const dir = templatesDir()
    ensureTemplates(dir)
    shell.openPath(dir)
    return { dir }
  })
}

function analyzePaths(paths: string[]): Array<Record<string, unknown>> {
  const out: Array<Record<string, unknown>> = []
  for (const p of paths) {
    const raw = readSourceFile(p)
    const detected = raw.decodeError ? null : detectType(p, raw)
    out.push({
      path: p,
      name: p.split(/[\\/]/).pop() ?? p,
      detectedType: detected?.type ?? null,
      detectedLabel: detected ? SOURCE_LABEL[detected.type] : '未识别',
      headerRow: detected?.headerRow ?? 0,
      reason: detected?.reason ?? null,
      decodeError: raw.decodeError ?? null
    })
  }
  return out
}

function decryptKey(enc: string): string | null {
  try {
    return safeStorage.decryptString(Buffer.from(enc, 'base64'))
  } catch {
    return null
  }
}
function parseNoteIssues(note: string | null): string[] {
  if (!note) return []
  const parts = note.split(' | ')
  const issues = parts.filter((p) => p.startsWith('问题清单：')).map((p) => p.slice('问题清单：'.length))
  return issues.flatMap((s) => s.split('；')).filter(Boolean)
}
