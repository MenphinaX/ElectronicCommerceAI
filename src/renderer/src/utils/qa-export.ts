// 质检历史导出（任务 4F ③）：单条报告导出 md/txt 由渲染层下载，批量汇总 CSV 在此纯函数生成（可单测）
export const QA_HISTORY_CSV_HEADER = '时间,文件数,会话数,客服数,模型,耗时(秒),状态,报告摘要'

export interface QaHistoryRow {
  id: number
  createdAt: string
  fileCount: number
  sessionCount: number
  agentCount: number
  model?: string | null
  elapsedMs: number
  status: string
  report?: string | null
}

function csvCell(v: string | number | null | undefined): string {
  const s = v === null || v === undefined ? '' : String(v)
  if (/[",\r\n]/.test(s)) return '"' + s.replace(/"/g, '""') + '"'
  return s
}

/** 报告摘要：压缩空白后取前 120 字符，超长加省略号 */
export function reportSummary(report: string | null | undefined, max = 120): string {
  const s = String(report ?? '').replace(/\s+/g, ' ').trim()
  return s.length > max ? s.slice(0, max) + '…' : s
}

export function buildQaHistoryCsv(rows: QaHistoryRow[]): string {
  const lines = [QA_HISTORY_CSV_HEADER]
  for (const r of rows) {
    const status = r.status === 'ok' ? '成功' : '失败'
    const secs = Math.round((r.elapsedMs ?? 0) / 1000)
    lines.push([
      csvCell(r.createdAt),
      csvCell(r.fileCount),
      csvCell(r.sessionCount),
      csvCell(r.agentCount),
      csvCell(r.model),
      csvCell(secs),
      csvCell(status),
      csvCell(reportSummary(r.report))
    ].join(','))
  }
  return lines.join('\r\n') + '\r\n'
}
