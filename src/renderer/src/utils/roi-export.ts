// 投产比历史导出 CSV（任务 4G）：纯函数生成，UTF-8 BOM 由渲染层下载时加（Excel 直接打开不乱码）
export const ROI_HISTORY_CSV_HEADER = '时间,名称,推广花费(元),成交金额(元),退款率,毛利率,目标营销占比,实际投产比,营销占比,是否达标,最低投产比,可承受花费(元),保本投产比'

export interface RoiHistoryRow {
  id: number
  createdAt: string
  name: string
  passed: number
  params: Record<string, unknown>
  result: Record<string, unknown>
}

function csvCell(v: string | number | null | undefined): string {
  const s = v === null || v === undefined ? '' : String(v)
  if (/[",\r\n]/.test(s)) return '"' + s.replace(/"/g, '""') + '"'
  return s
}

function num(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

function pct2(v: unknown): string {
  const n = num(v)
  return n == null ? '--' : `${(n * 100).toFixed(2)}%`
}

function num2(v: unknown): string {
  const n = num(v)
  return n == null ? '--' : n.toFixed(2)
}

export function buildRoiHistoryCsv(rows: RoiHistoryRow[]): string {
  const lines = [ROI_HISTORY_CSV_HEADER]
  for (const r of rows) {
    const p = r.params ?? {}
    const res = r.result ?? {}
    lines.push([
      csvCell(r.createdAt),
      csvCell(r.name),
      csvCell(num2(num(p.spend))),
      csvCell(num2(num(p.sales))),
      csvCell(pct2(num(p.refundRate))),
      csvCell(pct2(num(p.grossMargin))),
      csvCell(pct2(num(p.targetMarketingRatio))),
      csvCell(num2(num(res.roi))),
      csvCell(pct2(num(res.marketingRatio))),
      csvCell(Number(r.passed) ? '达标' : '未达标'),
      csvCell(num2(num(res.minRoi))),
      csvCell(num2(num(res.maxSpend))),
      csvCell(num2(num(res.breakEvenRoi)))
    ].join(','))
  }
  return lines.join('\r\n') + '\r\n'
}
