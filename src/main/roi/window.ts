// 投产比「一键带入」窗口聚合（任务 4G）：复用看板 dailyKpi 聚合口径，金额=分
import type { AppDatabase } from '../db/database'
import { dailyKpi } from '../db/repo'
import { windowRange, type WindowMode } from '../db/dashboard'

export interface RoiWindowData {
  window: { mode: WindowMode; label: string; days: number; start: string; end: string }
  salesFen: number
  promoFen: number
  refundFen: number
}

/** 与看板 KPI 同源：近 N 天窗口 成交金额/推广花费/退款金额（分）。无数据返回 null */
export function roiWindowData(db: AppDatabase, shopId: number, mode: WindowMode, today?: string): RoiWindowData | null {
  const w = windowRange(mode, today)
  const k = dailyKpi(db, shopId, w.start, w.end)
  if (!k.days) return null
  return {
    window: { mode, label: w.label, days: w.days, start: w.start, end: w.end },
    salesFen: k.payAmountFen,
    promoFen: k.promoCostFen,
    refundFen: k.refundAmountFen
  }
}
