// 看板展示格式化（金额=分 → 元；比率 0~1 → %）；入参 unknown（来自 IPC Record<string, unknown>），内部转数字
function toNum(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null
  const n = typeof v === 'number' ? v : Number(String(v))
  return Number.isFinite(n) ? n : null
}

export function yuan(v: unknown, digits = 2): string {
  const n = toNum(v)
  if (n == null) return '--'
  return (n / 100).toLocaleString('zh-CN', { minimumFractionDigits: digits, maximumFractionDigits: digits })
}

export function yuanShort(v: unknown): string {
  const n = toNum(v)
  if (n == null) return '--'
  const y = n / 100
  if (Math.abs(y) >= 10000) return `${(y / 10000).toFixed(2)}万`
  if (Math.abs(y) >= 1000) return `${(y / 1000).toFixed(1)}k`
  return y.toLocaleString('zh-CN', { maximumFractionDigits: 2 })
}

export function num(v: unknown): string {
  const n = toNum(v)
  if (n == null) return '--'
  return n.toLocaleString('zh-CN')
}

export function pct(v: unknown, digits = 2): string {
  const n = toNum(v)
  if (n == null) return '--'
  return `${(n * 100).toFixed(digits)}%`
}

/** 环比：带正负号（渲染层再着色） */
export function pctSigned(v: unknown, digits = 1): string {
  const n = toNum(v)
  if (n == null) return '--'
  const val = n * 100
  const sign = val > 0 ? '+' : val < 0 ? '-' : ''
  return `${sign}${Math.abs(val).toFixed(digits)}%`
}

export function roi(v: unknown): string {
  const n = toNum(v)
  if (n == null) return '--'
  return n.toFixed(2)
}

export function seconds(v: unknown): string {
  const n = toNum(v)
  if (n == null) return '--'
  return n.toFixed(0) + 's'
}

/** 日期 MM-DD */
export function md(date: string): string {
  return date.slice(5)
}
