// 投产比计算 IPC（任务 4G）：窗口真实数据 / 历史保存/删除/列表 / AI 建议；渲染层不碰 SQL 与文件
import { ipcMain } from 'electron'
import type { AppDatabase } from '../db/database'
import type { WindowMode } from '../db/dashboard'
import { deleteCalculatorRun, listCalculatorRuns, saveCalculatorRun } from '../db/repo'
import { roiWindowData } from './window'
import { roiAdvice, type RoiAdviceInput } from './advice'

export function registerRoiIpc(getDb: () => AppDatabase, rootDir: () => string): void {
  ipcMain.handle('roi:window-data', (_e, opts: { shopId: number; mode: WindowMode; today?: string }) => {
    const shopId = Number(opts.shopId) || 0
    if (shopId <= 0) return null
    return roiWindowData(getDb(), shopId, opts.mode, opts.today)
  })

  ipcMain.handle('roi:save', (_e, row: { name: string; paramsJson: string; resultJson: string; passed: boolean }) => {
    const id = saveCalculatorRun(getDb(), {
      name: String(row?.name ?? '').slice(0, 100) || '未命名计算',
      paramsJson: String(row?.paramsJson ?? '{}'),
      resultJson: String(row?.resultJson ?? '{}'),
      passed: !!row?.passed
    })
    return { id }
  })

  ipcMain.handle('roi:list', () => listCalculatorRuns(getDb()))

  ipcMain.handle('roi:delete', (_e, id: number) => deleteCalculatorRun(getDb(), Number(id) || 0))

  ipcMain.handle('roi:advice', (_e, input: RoiAdviceInput) => roiAdvice(getDb(), rootDir(), input ?? {}))
}
