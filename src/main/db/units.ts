// 字段规范统一口径（任务 2 定死，全项目只认这里）
// 金额=分(INTEGER)、数量=INTEGER、比率=0~1(REAL)、日期=YYYY-MM-DD、时间戳=YYYY-MM-DD HH:MM:SS

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const TS_RE = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/

/** 元 → 分（四舍五入取整，杜绝浮点误差；空值/非法 → 0） */
export function fenFromYuan(value: number | string | null | undefined): number {
  if (value === null || value === undefined || value === '') return 0
  const n = typeof value === 'number' ? value : Number(String(value).replace(/,/g, '').trim())
  if (!Number.isFinite(n)) return 0
  return Math.round(n * 100)
}

/** 分 → 元（展示用） */
export function yuanFromFen(fen: number): number {
  return fen / 100
}

/** 数量/整数字段：字符串去千分位转整数，非法 → 0 */
export function intValue(value: number | string | null | undefined): number {
  if (value === null || value === undefined || value === '') return 0
  const n = typeof value === 'number' ? value : Number(String(value).replace(/,/g, '').trim())
  if (!Number.isFinite(n)) return 0
  return Math.round(n)
}

/**
 * 比率 → 0~1 小数：'2.35%'→0.0235；0.06667→0.06667；'-'/空 → null
 * 约定：库内比率一律 0~1，百分比展示由渲染层换算
 */
export function percentToDecimal(value: number | string | null | undefined): number | null {
  if (value === null || value === undefined || value === '') return null
  const s = String(value).trim()
  if (s === '' || s === '-') return null
  const isPct = s.endsWith('%')
  const n = Number(s.replace(/%/g, '').replace(/,/g, ''))
  if (!Number.isFinite(n)) return null
  return isPct ? n / 100 : n
}

/** DSR 得分 '5.00 (0.00%)' / 4.78 → 前导数值 */
export function leadingNumber(value: number | string | null | undefined): number | null {
  if (value === null || value === undefined || value === '') return null
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  const m = /^-?\d+(\.\d+)?/.exec(String(value).trim())
  if (!m) return null
  const n = Number(m[0])
  return Number.isFinite(n) ? n : null
}

/**
 * 任意日期 → YYYY-MM-DD：'2026/08/11'→'2026-08-11'；Excel 序列号 46245→'2026-08-11'
 * （序列号按 xlsx 库的 1899-12-30 偏移，与任务 0 实测一致）
 */
export function normalizeDate(value: number | string | null | undefined): string | null {
  if (value === null || value === undefined || value === '') return null
  if (typeof value === 'number') {
    const d = new Date(Date.UTC(1899, 11, 30) + value * 86400000)
    if (Number.isNaN(d.getTime())) return null
    return d.toISOString().slice(0, 10)
  }
  const s = String(value).trim().replace(/\//g, '-')
  const m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(s)
  if (!m) return null
  return m[1] + '-' + m[2].padStart(2, '0') + '-' + m[3].padStart(2, '0')
}

/** 校验日期已是 YYYY-MM-DD */
export function isDate(s: string): boolean {
  return DATE_RE.test(s)
}

/** 校验时间戳已是 YYYY-MM-DD HH:MM:SS */
export function isTimestamp(s: string): boolean {
  return TS_RE.test(s)
}

/** 当前本地时间戳（YYYY-MM-DD HH:MM:SS） */
export function nowTimestamp(): string {
  const d = new Date()
  const p = (n: number, w = 2): string => String(n).padStart(w, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`
}

/** 备份文件名用时间戳（YYYYMMDD-HHMMSS-fff） */
export function fileTimestamp(): string {
  const d = new Date()
  const p = (n: number, w = 2): string => String(n).padStart(w, '0')
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}-${p(d.getMilliseconds(), 3)}`
}

/** 退款订单付款时间 → 日期（YYYY-MM-DD HH:MM:SS 取前 10 位） */
export function dateFromTimestamp(ts: string | null | undefined): string | null {
  if (!ts) return null
  const m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(String(ts))
  if (!m) return null
  return m[1] + '-' + m[2].padStart(2, '0') + '-' + m[3].padStart(2, '0')
}
