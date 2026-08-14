// 任务 8 数据包 IPC：导出（店铺+日期范围+可选密码）→ 保存对话框/指定路径；导入（选文件+密码）→ 合并入库+图片还原
import { app, dialog, ipcMain } from 'electron'
import { join } from 'node:path'
import type { AppDatabase } from '../db/database'
import { getShop } from '../db/repo'
import { exportDataPackage, importDataPackage, inspectDataPackage } from './service'

function safeDate(v: unknown): string | null {
  if (typeof v !== 'string' || !v) return null
  return /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null
}

function todayStr(): string {
  const d = new Date()
  const p = (n: number): string => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

export function registerPackageIpc(getDb: () => AppDatabase, imagesDir: () => string): void {
  ipcMain.handle('package:export', async (_e, opts: { shopId: number; dateStart?: string | null; dateEnd?: string | null; password?: string | null; targetPath?: string }) => {
    const db = getDb()
    const shopId = Number(opts.shopId)
    const shop = getShop(db, shopId)
    if (!shop) return { ok: false, message: '店铺不存在，请先创建店铺' }
    let targetPath = typeof opts.targetPath === 'string' && opts.targetPath ? opts.targetPath : ''
    // 验收辅助（env 门控）：自动验收时跳过原生保存对话框，直接写到预设路径
    if (!targetPath && process.env.EC_AI_AUTOSHOT === '1') {
      targetPath = process.env.EC_AI_TASK8_PKG || join(process.cwd(), 'out', 'task8', 'ui-export-live.zip')
    }
    if (!targetPath) {
      const r = await dialog.showSaveDialog({
        title: '导出数据包',
        defaultPath: `数据包_${shop.name}_${todayStr()}.zip`,
        filters: [{ name: '数据包', extensions: ['zip'] }]
      })
      if (r.canceled || !r.filePath) return { ok: false, canceled: true }
      targetPath = r.filePath
    }
    try {
      const manifest = await exportDataPackage({
        src: db,
        imagesDir: imagesDir(),
        outZipPath: targetPath,
        options: {
          shopId,
          dateStart: safeDate(opts.dateStart),
          dateEnd: safeDate(opts.dateEnd),
          password: opts.password || null,
          appVersion: app.getVersion()
        }
      })
      return { ok: true, filePath: targetPath, manifest }
    } catch (e) {
      return { ok: false, message: (e as Error).message }
    }
  })

  ipcMain.handle('package:import', async (_e, opts: { filePath: string; password?: string | null }) => {
    const db = getDb()
    db.backup('package-import')
    try {
      const result = importDataPackage({ db, imagesDir: imagesDir(), zipPath: String(opts.filePath), password: opts.password || null })
      return { ...result }
    } catch (e) {
      return { ok: false, message: (e as Error).message }
    }
  })

  ipcMain.handle('package:pick-file', async () => {
    // 验收辅助（env 门控）：自动验收时直接返回预设数据包路径，跳过原生打开对话框
    if (process.env.EC_AI_AUTOSHOT === '1') {
      return { ok: true, filePath: process.env.EC_AI_TASK8_PKG || join(process.cwd(), 'out', 'task8', 'ui-export-live.zip') }
    }
    const r = await dialog.showOpenDialog({ title: '选择数据包文件', filters: [{ name: '数据包', extensions: ['zip'] }], properties: ['openFile'] })
    return r.canceled || !r.filePaths.length ? { ok: false } : { ok: true, filePath: r.filePaths[0] }
  })

  ipcMain.handle('package:inspect', (_e, opts: { filePath: string; password?: string | null }) => {
    try {
      const info = inspectDataPackage({ zipPath: String(opts.filePath), password: opts.password || null })
      return { ok: true, ...info }
    } catch (e) {
      return { ok: false, message: (e as Error).message }
    }
  })
}