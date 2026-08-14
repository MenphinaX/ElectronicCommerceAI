// 任务7 日报导出 IPC：导出日报/周报 HTML、PDF、明细 Excel/CSV；reports 表留痕
import { BrowserWindow, dialog, ipcMain, shell } from 'electron'
import { join } from 'node:path'
import { mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import type { AppDatabase } from '../db/database'
import { todayStr, type WindowMode } from '../db/dashboard'
import { getSetting, insertReport } from '../db/repo'
import { chatComplete, resolveModelConfig } from '../import/model-client'
import { decryptApiKey } from '../ai/models-ipc'
import { readSkillBody } from '../ai/comments-ipc'
import { generateComments, type CommentCallerRequest } from '../ai/comments'
import {
  buildReportData, detailRows, exportReportHtml, renderReportHtml, writeDetailFile,
  type DetailFormat, type DetailKind, type ReportData, type ReportType
} from './report-service'

interface ExportOpts {
  shopId: number
  mode: WindowMode
  type?: ReportType
  today?: string
  targetDir?: string
}

interface DetailOpts {
  shopId: number
  mode: WindowMode
  kind: DetailKind
  format?: DetailFormat
  today?: string
  targetDir?: string
}

const KIND_LABEL: Record<DetailKind, string> = { refund: '退款单', product: '商品明细', daily: '每日数据' }

function typeLabel(type: ReportType): string {
  return type === 'weekly' ? '周报' : '日报'
}

/** 输出路径：targetDir/默认目录优先（不弹窗，供一键入口与自动化）；否则走保存对话框 */
function resolveOutPath(
  db: AppDatabase,
  fileName: string,
  targetDir?: string
): Promise<{ path: string; canceled: boolean }> {
  const settingDir = getSetting(db, 'default_report_dir')
  const dir = targetDir || settingDir
  if (dir) {
    // 已配置默认目录：自动创建（含不存在的情况）并直写，不弹窗
    mkdirSync(dir, { recursive: true })
    return Promise.resolve({ path: join(dir, fileName), canceled: false })
  }
  return dialog.showSaveDialog({ title: '导出报表', defaultPath: fileName, filters: [] }).then((r) =>
    r.canceled || !r.filePath ? { path: '', canceled: true } : { path: r.filePath, canceled: false }
  )
}

function recordReport(db: AppDatabase, opts: ExportOpts, type: ReportType, data: ReportData, filePath: string): void {
  try {
    insertReport(db, {
      shopId: Number(opts.shopId) || 0,
      type,
      reportDate: data.window.end,
      content: JSON.stringify({
        mode: opts.mode,
        window: data.window,
        rowCounts: data.rowCounts ?? {},
        exportedAt: data.exportedAt ?? null
      }),
      filePath
    })
  } catch {
    // 导出日志失败不阻塞导出（数据库只读等极端场景）
  }
}

export function registerReportIpc(getDb: () => AppDatabase, rootDir: () => string): void {
  /**
   * 报表数据 + 评语窗口对齐（任务 7 修复）：
   * 页面 KPI 与 AI 评语必须同窗口；窗口无评语记录时先调模型按导出窗口生成，
   * 未配置模型/生成失败/自动生成关闭时在报告内明确标注未生成原因。
   */
  const prepare = async (db: AppDatabase, opts: ExportOpts, type: ReportType): Promise<ReportData> => {
    let data = buildReportData(db, { shopId: opts.shopId, mode: opts.mode, type, today: opts.today })
    const shopId = Number(opts.shopId) || 0
    if (shopId <= 0) return data
    const missing = data.comments.some((c) => !c.content)
    if (!missing) return data
    const cfg = resolveModelConfig(db, null, decryptApiKey)
    if (!cfg) {
      data.commentNote = `当前窗口（${data.window.end}）无评语记录：未配置 AI 模型，请在应用内配置模型并在看板生成评语后重新导出`
      return data
    }
    if (getSetting(db, 'aiCommentsEnabled') === '0') {
      data.commentNote = `当前窗口（${data.window.end}）无评语记录：评语自动生成已在设置中关闭`
      return data
    }
    const readSkill = readSkillBody(rootDir(), db)
    const caller = async (req: CommentCallerRequest) => {
      const text = await chatComplete(cfg, [
        { role: 'system', content: req.system },
        { role: 'user', content: req.user }
      ], { temperature: 0.4, maxTokens: 300, timeoutMs: 60000 })
      return { text, model: cfg.model }
    }
    try {
      await generateComments(db, { shopId, w: data.window, configured: true, caller, readSkill })
    } catch (e) {
      data.commentNote = `当前窗口（${data.window.end}）评语生成失败：${(e as Error).message}`
      return data
    }
    const rebuilt = buildReportData(db, { shopId: opts.shopId, mode: opts.mode, type, today: opts.today })
    const stillMissing = rebuilt.comments.filter((c) => !c.content)
    rebuilt.commentNote = stillMissing.length
      ? `当前窗口（${rebuilt.window.end}）部分模块评语未生成：${stillMissing.map((c) => c.label).join('、')}（请回应用内看板重试生成后重新导出）`
      : `评语已按导出窗口（${rebuilt.window.end}）自动生成，页面数字与评语口径一致`
    return rebuilt
  }

  // 一键日报/周报：聚合 → 渲染自包含 HTML → 落盘 → reports 留痕 → 自动打开
  ipcMain.handle('report:export', async (_e, opts: ExportOpts) => {
    const db = getDb()
    const type: ReportType = opts.type === 'weekly' ? 'weekly' : 'daily'
    const data = await prepare(db, opts, type)
    const fileName = `${data.window.end}_${typeLabel(type)}.html`
    const out = await resolveOutPath(db, fileName, opts.targetDir)
    if (out.canceled) return { ok: false, canceled: true }
    exportReportHtml(data, out.path)
    recordReport(db, opts, type, data, out.path)
    void shell.openPath(out.path)
    return { ok: true, filePath: out.path, rowCounts: data.rowCounts }
  })

  // 一键导出 PDF：同一份日报另存 PDF（离线渲染，排版与 HTML 一致）
  ipcMain.handle('report:export-pdf', async (_e, opts: ExportOpts) => {
    const db = getDb()
    const type: ReportType = opts.type === 'weekly' ? 'weekly' : 'daily'
    const data = await prepare(db, opts, type)
    const html = renderReportHtml(data)
    const tmpHtml = join(tmpdir(), `ecai-report-${Date.now()}.html`)
    const fileName = `${data.window.end}_${typeLabel(type)}.pdf`
    const out = await resolveOutPath(db, fileName, opts.targetDir)
    if (out.canceled) {
      try { writeFileSync(tmpHtml, '', 'utf8') } catch { /* 忽略 */ }
      return { ok: false, canceled: true }
    }
    writeFileSync(tmpHtml, html, 'utf8')
    const win = new BrowserWindow({ show: false, webPreferences: { sandbox: false } })
    try {
      await win.loadFile(tmpHtml)
      const pdf = await win.webContents.printToPDF({ printBackground: true, pageSize: 'A4' })
      mkdirSync(join(out.path, '..'), { recursive: true })
      writeFileSync(out.path, pdf)
      recordReport(db, opts, type, data, out.path)
      void shell.openPath(out.path)
      return { ok: true, filePath: out.path, pageCount: pdf.length > 0 ? 1 : 0 }
    } finally {
      win.destroy()
    }
  })

  // 明细导出：当前窗口下的退款单/商品/每日数据 → Excel/CSV（数字与库中一致）
  ipcMain.handle('report:export-detail', async (_e, opts: DetailOpts) => {
    const db = getDb()
    const kind: DetailKind = opts.kind || 'refund'
    const format: DetailFormat = opts.format === 'csv' ? 'csv' : 'xlsx'
    const rows = detailRows(db, { shopId: opts.shopId, mode: opts.mode, kind, today: opts.today })
    const endDate = rows.length && rows[0] ? String((rows[0] as Record<string, unknown>).日期 ?? '') : ''
    const dateTag = endDate || todayStr()
    const fileName = `${dateTag}_${KIND_LABEL[kind]}.${format}`
    const out = await resolveOutPath(db, fileName, opts.targetDir)
    if (out.canceled) return { ok: false, canceled: true }
    writeDetailFile(out.path, rows, format)
    if (process.env.EC_AI_AUTOSHOT !== '1') void shell.openPath(out.path)
    try {
      insertReport(db, {
        shopId: Number(opts.shopId) || 0,
        type: `detail-${kind}`,
        reportDate: endDate,
        content: JSON.stringify({ format, kind, rowCount: rows.length }),
        filePath: out.path
      })
    } catch {
      // 忽略留痕失败
    }
    return { ok: true, filePath: out.path, rowCount: rows.length, kind, format }
  })

  // 设置页：选择默认导出目录
  ipcMain.handle('report:pick-dir', async () => {
    const r = await dialog.showOpenDialog({ title: '选择默认导出目录', properties: ['openDirectory', 'createDirectory'] })
    return r.canceled || !r.filePaths.length ? { ok: false } : { ok: true, dir: r.filePaths[0] }
  })

  // 导出历史（设置/看板后续可扩展展示）
  ipcMain.handle('report:list', () => {
    const db = getDb()
    return db.raw.prepare('SELECT id, shop_id AS shopId, type, report_date AS reportDate, file_path AS filePath, content, created_at AS createdAt FROM reports ORDER BY created_at DESC LIMIT 100').all() as Array<Record<string, unknown>>
  })
}
