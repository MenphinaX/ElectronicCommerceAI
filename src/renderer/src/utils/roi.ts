// 投产比计算纯函数（任务 4G）：口径唯一来源=任务书模板（天猫投产比公式.xls 实测）
// 金额单位=元（与输入一致）；比率=0~1；返回值保留原始精度，展示层自行 toFixed
export interface RoiParams {
  spend: number
  sales: number
  refundAmount: number | null
  refundRate: number | null
  grossMargin: number
  targetMarketingRatio: number
}

export interface RoiResult {
  spend: number
  sales: number
  refundAmount: number | null
  refundRate: number | null
  grossMargin: number
  targetMarketingRatio: number
  roi: number | null
  netSalesRate: number | null
  netSales: number | null
  marketingRatio: number | null
  passed: boolean
  minRoi: number | null
  maxSpend: number | null
  breakEvenRoi: number | null
}

function numOrNull(v: number): number | null {
  return Number.isFinite(v) ? v : null
}

export function computeRoi(p: RoiParams): RoiResult {
  const spend = Number(p.spend) || 0
  const sales = Number(p.sales) || 0
  const grossMargin = Number(p.grossMargin) || 0
  const target = Number(p.targetMarketingRatio) || 0

  // 退款率：显式传退款率优先；否则由 退款金额÷成交金额 推导；成交金额为 0 时无法计算置空
  const refundRate = sales > 0
    ? (p.refundRate != null && Number.isFinite(p.refundRate)
        ? Number(p.refundRate)
        : p.refundAmount != null && Number.isFinite(p.refundAmount)
          ? Number(p.refundAmount) / sales
          : null)
    : null

  const netSalesRate = refundRate == null ? null : 1 - refundRate
  const netSales = netSalesRate == null || netSalesRate <= 0 ? null : sales * netSalesRate
  const roi = spend > 0 && sales > 0 ? sales / spend : null
  const marketingRatio = netSales != null && netSales > 0 && spend > 0 ? spend / netSales : null
  const minRoi = netSalesRate != null && netSalesRate > 0 && target > 0 ? 1 / (target * netSalesRate) : null
  const maxSpend = netSales != null && netSales > 0 && target > 0 ? netSales * target : null
  const breakEvenRoi = grossMargin > 0 ? numOrNull(1 / grossMargin) : null
  const passed = marketingRatio != null && target > 0 ? marketingRatio <= target : false

  return {
    spend, sales,
    refundAmount: p.refundAmount,
    refundRate: refundRate != null ? numOrNull(refundRate) : null,
    grossMargin, targetMarketingRatio: target,
    roi: numOrNull(roi ?? NaN),
    netSalesRate: netSalesRate != null && netSalesRate >= 0 ? numOrNull(netSalesRate) : null,
    netSales: numOrNull(netSales ?? NaN),
    marketingRatio: numOrNull(marketingRatio ?? NaN),
    passed,
    minRoi: numOrNull(minRoi ?? NaN),
    maxSpend: numOrNull(maxSpend ?? NaN),
    breakEvenRoi
  }
}

/** 渲染层输入容错：Vue 3.5 对 type="number" 的 v-model 自动转 number，这里兼容 string/number/空值 */
export function toNumberOrNull(v: string | number | null | undefined): number | null {
  if (v == null) return null
  if (typeof v === 'number') return Number.isFinite(v) ? v : null
  const s = String(v).trim()
  if (s === '') return null
  const n = Number(s)
  return Number.isFinite(n) ? n : null
}

/** 便捷格式化（展示层复用）：比率→百分比字符串；数字→固定小数位 */
export function fmtPct(v: number | null, digits = 2): string {
  return v == null ? '--' : `${(v * 100).toFixed(digits)}%`
}

export function fmtNum(v: number | null, digits = 2): string {
  return v == null ? '--' : v.toFixed(digits)
}

export function fmtYuan(v: number | null, digits = 2): string {
  return v == null ? '--' : v.toLocaleString('zh-CN', { minimumFractionDigits: digits, maximumFractionDigits: digits })
}
