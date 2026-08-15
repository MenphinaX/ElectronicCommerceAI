// 9 类数据源解析：表头偏移容错、列名按名称匹配、清洗（ID 前缀/重复表头/汇总行/日期统一）
import { basename } from 'node:path'
import type {
  CsDailyRow, DailyMetricRow, Dsr180dRow, DsrDailyRow, ProductDailyRow,
  PromoDailyRow, RefundOrderRow, SearchKeywordRow
} from '../db/repo'
import { fenFromYuan, intValue, leadingNumber, normalizeDate, percentToDecimal } from '../db/units'
import type { RawRow, RawSheet } from './reader'
import { cellText, nonEmptyHeaderCols } from './reader'
import { checkSummaryTail, formatIssues, locateData, type ValidationIssue } from './validate'
import { specOf, SOURCE_LABEL, type SourceSpec, type SourceType } from './specs'

export type ParsedRows =
  | { target: 'daily_metrics'; rows: DailyMetricRow[] }
  | { target: 'product_daily'; rows: ProductDailyRow[] }
  | { target: 'promo_daily'; rows: PromoDailyRow[] }
  | { target: 'refund_orders'; rows: RefundOrderRow[] }
  | { target: 'cs_daily'; rows: CsDailyRow[] }
  | { target: 'search_keywords'; rows: SearchKeywordRow[] }
  | { target: 'dsr'; rows: { daily: DsrDailyRow[]; d180: Dsr180dRow[] } }

export interface ParsedFile {
  type: SourceType
  label: string
  spec: SourceSpec
  headerRow: number
  dataRows: number
  dateStart: string | null
  dateEnd: string | null
  rows: ParsedRows
  issues: ValidationIssue[]
  /** 不阻断导入的提示（列数波动/区块缺失等，任务 4O） */
  warnings?: ValidationIssue[]
  ok: boolean
}

export interface ParseOptions {
  headerRowOverride?: number
  /** 标准字段 → 源列名（LLM 列映射/人工列映射修复） */
  columnMapping?: Record<string, string>
}

function toNum(v: RawRow[number]): number | 'empty' | 'invalid' {
  if (v === null || v === undefined) return 'empty'
  const s = String(v).replace(/,/g, '').trim()
  if (s === '') return 'empty'
  const n = Number(s)
  return Number.isFinite(n) ? n : 'invalid'
}

function trackDate(state: { start: string | null; end: string | null }, date: string | null): void {
  if (!date) return
  if (!state.start || date < state.start) state.start = date
  if (!state.end || date > state.end) state.end = date
}

function filenameDate(filePath: string, spec: SourceSpec): string | null {
  const m = spec.filenameDate?.exec(basename(filePath))
  if (!m) return null
  const [y, mo, d] = m.slice(1)
  const s = `${y}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}`
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null
}

interface ColIndexes {
  idx: Map<string, number>
  issues: ValidationIssue[]
}

function colNames(spec: SourceSpec, field: string): string[] {
  const v = spec.requiredCols[field]
  return (Array.isArray(v) ? v : [v]).filter((n): n is string => typeof n === 'string')
}

function findCol(header: RawRow, spec: SourceSpec, field: string, mapping?: Record<string, string>): number {
  const mapped = mapping?.[field]
  if (mapped !== undefined) return header.findIndex((c) => cellText(c) === mapped)
  const names = colNames(spec, field)
  return header.findIndex((c) => names.includes(cellText(c)))
}

function resolveCols(spec: SourceSpec, rows: RawRow[], headerRow: number, mapping?: Record<string, string>): ColIndexes {
  const idx = new Map<string, number>()
  const issues: ValidationIssue[] = []
  const header = rows[headerRow - 1] ?? []
  for (const field of Object.keys(spec.requiredCols)) {
    const i = findCol(header, spec, field, mapping)
    if (i < 0) {
      const sourceName = mapping?.[field] ?? colNames(spec, field)[0]
      issues.push({
        code: 'missing_col',
        message: `缺必填列「${sourceName}」（标准字段 ${field}）`,
        row: headerRow,
        col: sourceName
      })
    } else {
      idx.set(field, i)
    }
  }
  return { idx, issues }
}

function issuesToText(issues: ValidationIssue[]): string {
  return issues.map((i) => `${i.code}(${i.message})`).join('；')
}

export function parseSourceFile(filePath: string, raw: RawSheet, type: SourceType, opts: ParseOptions = {}): ParsedFile {
  const spec = specOf(type)
  const issues: ValidationIssue[] = []
  const warnings: ValidationIssue[] = []
  const rows = raw.rows

  if (raw.decodeError) {
    issues.push({ code: 'encoding', message: raw.decodeError })
    return { type, label: spec.label, spec, headerRow: 0, dataRows: 0, dateStart: null, dateEnd: null, rows: emptyRows(spec), issues, warnings: [], ok: false }
  }

  const located = type === 'dsr'
    ? { info: { headerRow: 1, dataStart: 1, dataEnd: rows.length }, issues: [] as ValidationIssue[], warnings: [] as ValidationIssue[] }
    : locateData(rows, spec, opts.headerRowOverride, opts.columnMapping)
  issues.push(...located.issues)
  if (located.warnings) warnings.push(...located.warnings)
  if (!located.info) {
    return { type, label: spec.label, spec, headerRow: 0, dataRows: 0, dateStart: null, dateEnd: null, rows: emptyRows(spec), issues, warnings, ok: false }
  }
  const { headerRow, dataStart, dataEnd } = located.info

  // DSR 双区块各自定位列，不走通用 resolveCols
  const cols = type === 'dsr' ? { idx: new Map<string, number>(), issues: [] as ValidationIssue[] } : resolveCols(spec, rows, headerRow, opts.columnMapping)
  issues.push(...cols.issues)

  const summaryIssue = checkSummaryTail(spec, rows)
  if (summaryIssue) issues.push(summaryIssue)

  const dateState = { start: null as string | null, end: null as string | null }
  const parsed = parseType(spec, type, filePath, rows, headerRow, dataStart, dataEnd, cols, opts.columnMapping, issues, warnings, dateState)
  const dataRows = countDataRows(rows, dataStart, dataEnd)

  const ok = issues.length === 0
  return {
    type, label: spec.label, spec, headerRow, dataRows: parsed.dataRows ?? dataRows,
    dateStart: dateState.start, dateEnd: dateState.end, rows: parsed.rows, issues, warnings, ok
  }
}

function emptyRows(spec: SourceSpec): ParsedRows {
  switch (spec.targetTable) {
    case 'daily_metrics': return { target: 'daily_metrics', rows: [] }
    case 'product_daily': return { target: 'product_daily', rows: [] }
    case 'promo_daily': return { target: 'promo_daily', rows: [] }
    case 'refund_orders': return { target: 'refund_orders', rows: [] }
    case 'cs_daily': return { target: 'cs_daily', rows: [] }
    case 'search_keywords': return { target: 'search_keywords', rows: [] }
    case 'dsr': return { target: 'dsr', rows: { daily: [], d180: [] } }
  }
}

function countDataRows(rows: RawRow[], dataStart: number, dataEnd: number): number {
  let n = 0
  for (let i = dataStart - 1; i < dataEnd && i < rows.length; i++) {
    const r = rows[i] ?? []
    if (r.some((c) => cellText(c) !== '')) n++
  }
  return n
}

interface ParseOutcome {
  rows: ParsedRows
  dataRows: number
}

function parseType(
  spec: SourceSpec, type: SourceType, filePath: string, rows: RawRow[],
  headerRow: number, dataStart: number, dataEnd: number,
  idx: ColIndexes, mapping: Record<string, string> | undefined,
  issues: ValidationIssue[], warnings: ValidationIssue[], dateState: { start: string | null; end: string | null }
): ParseOutcome {
  switch (type) {
    case 'consult': return parseConsult(spec, filePath, rows, dataStart, dataEnd, idx, issues, dateState)
    case 'keyword': return parseKeyword(spec, filePath, rows, dataStart, dataEnd, idx, issues, dateState)
    case 'product_report': return parseProductReport(spec, filePath, rows, dataStart, dataEnd, idx, issues, dateState)
    case 'product_detail': return parseProductDetail(spec, filePath, rows, dataStart, dataEnd, idx, issues, dateState)
    case 'promo': return parsePromo(spec, filePath, rows, dataStart, dataEnd, idx, issues, dateState)
    case 'daily': return parseDaily(spec, filePath, rows, dataStart, dataEnd, idx, issues, dateState)
    case 'dsr': return parseDsr(spec, filePath, rows, headerRow, idx, issues, warnings, mapping, dateState)
    case 'cs': return parseCs(spec, filePath, rows, dataStart, dataEnd, idx, issues, dateState)
    case 'refund': return parseRefund(spec, filePath, rows, dataStart, dataEnd, idx, issues, dateState)
  }
}

function col(idx: ColIndexes, field: string): number {
  return idx.idx.get(field) ?? -1
}

function parseConsult(
  spec: SourceSpec, filePath: string, rows: RawRow[], dataStart: number, dataEnd: number,
  idx: ColIndexes, issues: ValidationIssue[], dateState: { start: string | null; end: string | null }
): ParseOutcome {
  const out: ProductDailyRow[] = []
  const date = filenameDate(filePath, spec)
  if (date) trackDate(dateState, date)
  const cId = col(idx, 'productId'), cName = col(idx, 'productName'), cConsult = col(idx, 'consultCount')
  let n = 0
  for (let i = dataStart - 1; i < dataEnd && i < rows.length; i++) {
    const r = rows[i] ?? []
    if (!r.some((c) => cellText(c) !== '')) continue
    n++
    const raw = cellText(r[cId])
    const m = /^ID[:：](\d+)$/.exec(raw)
    if (!m) {
      issues.push({ code: 'id', message: `商品id「${raw}」应带「ID：」前缀且为纯数字`, row: i + 1, col: '商品id', value: raw })
      continue
    }
    out.push({
      shopId: 0, productId: m[1], date: date ?? '', productName: cellText(r[cName]) || null,
      consultCount: intValue(r[cConsult])
    })
  }
  return { rows: { target: 'product_daily', rows: out }, dataRows: n }
}

function parseKeyword(
  spec: SourceSpec, filePath: string, rows: RawRow[], dataStart: number, dataEnd: number,
  idx: ColIndexes, issues: ValidationIssue[], dateState: { start: string | null; end: string | null }
): ParseOutcome {
  const out: SearchKeywordRow[] = []
  const cDate = col(idx, 'date'), cKw = col(idx, 'keyword'), cVis = col(idx, 'visitors'),
    cCart = col(idx, 'cartAddCount'), cFav = col(idx, 'favoriteCount'), cBuyer = col(idx, 'payBuyerCount'),
    cRate = col(idx, 'payRate'), cPay = col(idx, 'payAmountFen'), cPrice = col(idx, 'unitPriceFen'), cUv = col(idx, 'uvValueFen')
  let n = 0
  for (let i = dataStart - 1; i < dataEnd && i < rows.length; i++) {
    const r = rows[i] ?? []
    if (!r.some((c) => cellText(c) !== '')) continue
    n++
    const date = normalizeDate(r[cDate])
    if (!date) { issues.push({ code: 'date', message: `日期列无法解析为 YYYY-MM-DD`, row: i + 1, col: '统计日期', value: cellText(r[cDate]) }); continue }
    const kw = cellText(r[cKw])
    if (!kw) { issues.push({ code: 'structure', message: '搜索词为空', row: i + 1 }); continue }
    trackDate(dateState, date)
    out.push({
      shopId: 0, date, keyword: kw, visitors: intValue(r[cVis]), cartAddCount: intValue(r[cCart]),
      favoriteCount: intValue(r[cFav]), payBuyerCount: intValue(r[cBuyer]), payRate: percentToDecimal(r[cRate]),
      payAmountFen: fenFromYuan(r[cPay]), unitPriceFen: fenFromYuan(r[cPrice]) || null, uvValueFen: fenFromYuan(r[cUv]) || null
    })
  }
  return { rows: { target: 'search_keywords', rows: out }, dataRows: n }
}

function parseProductReport(
  spec: SourceSpec, filePath: string, rows: RawRow[], dataStart: number, dataEnd: number,
  idx: ColIndexes, issues: ValidationIssue[], dateState: { start: string | null; end: string | null }
): ParseOutcome {
  const out: ProductDailyRow[] = []
  const cDate = col(idx, 'date'), cId = col(idx, 'productId'), cName = col(idx, 'productName'),
    cVis = col(idx, 'visitors'), cViews = col(idx, 'pageViews'), cPay = col(idx, 'payAmountFen'),
    cRefund = col(idx, 'refundAmountFen'), cRate = col(idx, 'payRate')
  let n = 0
  for (let i = dataStart - 1; i < dataEnd && i < rows.length; i++) {
    const r = rows[i] ?? []
    if (!r.some((c) => cellText(c) !== '')) continue
    n++
    const date = normalizeDate(r[cDate])
    if (!date) { issues.push({ code: 'date', message: `日期列无法解析为 YYYY-MM-DD`, row: i + 1, col: '统计日期', value: cellText(r[cDate]) }); continue }
    const pid = cellText(r[cId])
    if (!/^\d+$/.test(pid)) { issues.push({ code: 'id', message: `商品ID「${pid}」应为纯数字`, row: i + 1, col: '商品ID' }); continue }
    trackDate(dateState, date)
    out.push({
      shopId: 0, productId: pid, date, productName: cellText(r[cName]) || null,
      visitors: intValue(r[cVis]), pageViews: intValue(r[cViews]), payAmountFen: fenFromYuan(r[cPay]),
      refundAmountFen: fenFromYuan(r[cRefund]), payRate: percentToDecimal(r[cRate])
    })
  }
  return { rows: { target: 'product_daily', rows: out }, dataRows: n }
}

function parseProductDetail(
  spec: SourceSpec, filePath: string, rows: RawRow[], dataStart: number, dataEnd: number,
  idx: ColIndexes, issues: ValidationIssue[], dateState: { start: string | null; end: string | null }
): ParseOutcome {
  const out: ProductDailyRow[] = []
  const date = filenameDate(filePath, spec)
  if (date) trackDate(dateState, date)
  const cId = col(idx, 'productId'), cName = col(idx, 'productName'), cPay = col(idx, 'payAmountFen'),
    cNet = col(idx, 'netSalesFen'), cRefund = col(idx, 'refundAmountFen'), cPromo = col(idx, 'promoCostFen'),
    cProfit = col(idx, 'profitFen'), cSales = col(idx, 'salesCount')
  let n = 0
  for (let i = dataStart - 1; i < dataEnd && i < rows.length; i++) {
    const r = rows[i] ?? []
    if (!r.some((c) => cellText(c) !== '')) continue
    n++
    const pid = cellText(r[cId])
    if (!/^\d+$/.test(pid)) { issues.push({ code: 'id', message: `商品id「${pid}」应为纯数字`, row: i + 1, col: '商品id' }); continue }
    out.push({
      shopId: 0, productId: pid, date: date ?? '', productName: cellText(r[cName]) || null,
      payAmountFen: fenFromYuan(r[cPay]), netSalesFen: fenFromYuan(r[cNet]), refundAmountFen: fenFromYuan(r[cRefund]),
      promoCostFen: fenFromYuan(r[cPromo]), profitFen: fenFromYuan(r[cProfit]), salesCount: intValue(r[cSales])
    })
  }
  return { rows: { target: 'product_daily', rows: out }, dataRows: n }
}

function parsePromo(
  spec: SourceSpec, filePath: string, rows: RawRow[], dataStart: number, dataEnd: number,
  idx: ColIndexes, issues: ValidationIssue[], dateState: { start: string | null; end: string | null }
): ParseOutcome {
  const out: PromoDailyRow[] = []
  const cDate = col(idx, 'date'), cId = col(idx, 'adEntityId'), cName = col(idx, 'adEntityName'),
    cImp = col(idx, 'impressions'), cClick = col(idx, 'clicks'), cCost = col(idx, 'costFen'),
    cCtr = col(idx, 'ctr'), cRoas = col(idx, 'roas'), cPay = col(idx, 'payAmountFen'),
    cSales = col(idx, 'salesCount'), cPayRate = col(idx, 'payRate')
  let n = 0
  for (let i = dataStart - 1; i < dataEnd && i < rows.length; i++) {
    const r = rows[i] ?? []
    if (!r.some((c) => cellText(c) !== '')) continue
    n++
    const date = normalizeDate(r[cDate])
    if (!date) { issues.push({ code: 'date', message: `日期列无法解析（Excel 序列号/文本均需转 YYYY-MM-DD）`, row: i + 1, col: '日期', value: cellText(r[cDate]) }); continue }
    const eid = cellText(r[cId])
    if (!eid) { issues.push({ code: 'structure', message: '主体ID 为空', row: i + 1 }); continue }
    trackDate(dateState, date)
    const roasV = r[cRoas]
    out.push({
      shopId: 0, date, adEntityId: eid, adEntityName: cellText(r[cName]) || null,
      impressions: intValue(r[cImp]), clicks: intValue(r[cClick]), costFen: fenFromYuan(r[cCost]),
      ctr: percentToDecimal(r[cCtr]), roas: typeof roasV === 'number' ? roasV : percentToDecimal(roasV),
      payAmountFen: fenFromYuan(r[cPay]), salesCount: intValue(r[cSales]), payRate: percentToDecimal(r[cPayRate])
    })
  }
  return { rows: { target: 'promo_daily', rows: out }, dataRows: n }
}

function parseDaily(
  spec: SourceSpec, filePath: string, rows: RawRow[], dataStart: number, dataEnd: number,
  idx: ColIndexes, issues: ValidationIssue[], dateState: { start: string | null; end: string | null }
): ParseOutcome {
  const out: DailyMetricRow[] = []
  const cDate = col(idx, 'date'), cPay = col(idx, 'payAmountFen'), cNet = col(idx, 'netSalesFen'),
    cProfit = col(idx, 'profitFen'), cVis = col(idx, 'visitors'), cSales = col(idx, 'salesCount'), cRefund = col(idx, 'refundAmountFen'),
    cPromo = col(idx, 'promoCostFen'), cRate = col(idx, 'payRate')
  let n = 0
  for (let i = dataStart - 1; i < dataEnd && i < rows.length; i++) {
    const r = rows[i] ?? []
    if (!r.some((c) => cellText(c) !== '')) continue
    n++
    const date = normalizeDate(r[cDate])
    if (!date) { issues.push({ code: 'date', message: `日期「${cellText(r[cDate])}」无法转 YYYY-MM-DD`, row: i + 1, col: '日期' }); continue }
    trackDate(dateState, date)
    out.push({
      shopId: 0, date, payAmountFen: fenFromYuan(r[cPay]), netSalesFen: fenFromYuan(r[cNet]),
      profitFen: fenFromYuan(r[cProfit]), visitors: intValue(r[cVis]), salesCount: intValue(r[cSales]), refundAmountFen: fenFromYuan(r[cRefund]),
      promoCostFen: fenFromYuan(r[cPromo]), payRate: percentToDecimal(r[cRate])
    })
  }
  return { rows: { target: 'daily_metrics', rows: out }, dataRows: n }
}

function parseCs(
  spec: SourceSpec, filePath: string, rows: RawRow[], dataStart: number, dataEnd: number,
  idx: ColIndexes, issues: ValidationIssue[], dateState: { start: string | null; end: string | null }
): ParseOutcome {
  const out: CsDailyRow[] = []
  const date = filenameDate(filePath, spec)
  if (date) trackDate(dateState, date)
  const cStaff = col(idx, 'staffName'), cFp = col(idx, 'inquiryFinalPayCount'), cIc = col(idx, 'inquiryCount'),
    cIr = col(idx, 'inquiryFinalPayRate'), cFr = col(idx, 'firstResponseSeconds'), cAvg = col(idx, 'avgResponseSeconds'),
    cSat = col(idx, 'satisfactionRate'), cRep = col(idx, 'replyRate'), cFpAmt = col(idx, 'inquiryFinalPayAmountFen'),
    cRef = col(idx, 'refundAmountFen')
  let n = 0
  for (let i = dataStart - 1; i < dataEnd && i < rows.length; i++) {
    const r = rows[i] ?? []
    if (!r.some((c) => cellText(c) !== '')) continue
    n++
    const staff = cellText(r[cStaff])
    if (!staff) { issues.push({ code: 'structure', message: '旺旺昵称为空', row: i + 1 }); continue }
    out.push({
      shopId: 0, date: date ?? '', staffName: staff, inquiryFinalPayCount: intValue(r[cFp]),
      inquiryCount: intValue(r[cIc]), inquiryFinalPayRate: percentToDecimal(r[cIr]),
      firstResponseSeconds: toNumOrNull(r[cFr]), avgResponseSeconds: toNumOrNull(r[cAvg]),
      satisfactionRate: percentToDecimal(r[cSat]), replyRate: percentToDecimal(r[cRep]),
      inquiryFinalPayAmountFen: fenFromYuan(r[cFpAmt]), refundAmountFen: fenFromYuan(r[cRef])
    })
  }
  return { rows: { target: 'cs_daily', rows: out }, dataRows: n }
}

function toNumOrNull(v: RawRow[number]): number | null {
  const t = toNum(v)
  return t === 'invalid' ? null : (t === 'empty' ? null : t)
}

function parseRefund(
  spec: SourceSpec, filePath: string, rows: RawRow[], dataStart: number, dataEnd: number,
  idx: ColIndexes, issues: ValidationIssue[], dateState: { start: string | null; end: string | null }
): ParseOutcome {
  const out: RefundOrderRow[] = []
  const cOrder = col(idx, 'orderNo'), cRefund = col(idx, 'refundNo'), cProd = col(idx, 'productId'),
    cTitle = col(idx, 'productTitle'), cAmt = col(idx, 'refundAmountFen'), cBuyer = col(idx, 'buyerPayAmountFen'),
    cStatus = col(idx, 'refundStatus'), cGoods = col(idx, 'goodsStatus'), cAfter = col(idx, 'afterSaleType'),
    cPay = col(idx, 'paymentTime'), cFinish = col(idx, 'refundFinishTime'), cApply = col(idx, 'refundApplyTime'),
    cReason = col(idx, 'refundReason')
  let n = 0
  for (let i = dataStart - 1; i < dataEnd && i < rows.length; i++) {
    const r = rows[i] ?? []
    if (!r.some((c) => cellText(c) !== '')) continue
    n++
    const orderNo = cellText(r[cOrder]), refundNo = cellText(r[cRefund])
    if (!orderNo || !refundNo) { issues.push({ code: 'structure', message: '订单编号/退款编号为空', row: i + 1 }); continue }
    const payTs = cellText(r[cPay])
    const payDate = payTs ? payTs.slice(0, 10) : null
    if (payDate) trackDate(dateState, payDate)
    out.push({
      shopId: 0, orderNo, refundNo, productId: cellText(r[cProd]) || null, productTitle: cellText(r[cTitle]) || null,
      refundAmountFen: fenFromYuan(r[cAmt]), buyerPayAmountFen: fenFromYuan(r[cBuyer]),
      refundStatus: cellText(r[cStatus]) || null, goodsStatus: cellText(r[cGoods]) || null,
      afterSaleType: cellText(r[cAfter]) || null, paymentTime: payTs || null,
      refundFinishTime: cellText(r[cFinish]) || null, refundApplyTime: cellText(r[cApply]) || null,
      refundReason: cellText(r[cReason]) || null
    })
  }
  return { rows: { target: 'refund_orders', rows: out }, dataRows: n }
}

function parseDsr(
  spec: SourceSpec, filePath: string, rows: RawRow[], headerRow: number,
  idx: ColIndexes, issues: ValidationIssue[], warnings: ValidationIssue[],
  mapping: Record<string, string> | undefined, dateState: { start: string | null; end: string | null }
): ParseOutcome {
  const daily: DsrDailyRow[] = []
  const d180: Dsr180dRow[] = []
  const snapshotDate = filenameDate(filePath, spec)
  if (snapshotDate) trackDate(dateState, snapshotDate)

  // 180 天区块：表头第 2 行，数据第 3-5 行（列名按 requiredCols 别名匹配，任务 4O）
  const h180 = rows[1] ?? []
  const cI = findCol(h180, spec, 'indicator', mapping)
  const cS = findCol(h180, spec, 'score', mapping)
  const cA = findCol(h180, spec, 'industryAvg', mapping)
  if (cI < 0 || cS < 0 || cA < 0) {
    issues.push({ code: 'header_row', message: 'DSR 180 天区块表头（第 2 行：指标/得分/趋势/行业均值）未找到', row: 2 })
  } else {
    const cT = findCol(h180, spec, 'trend', mapping)
    const cC = findCol(h180, spec, 'compareText', mapping)
    const cTg = findCol(h180, spec, 'target', mapping)
    const cG = findCol(h180, spec, 'gapText', mapping)
    for (let i = 2; i <= 4 && i < rows.length; i++) {
      const r = rows[i] ?? []
      if (!cellText(r[cI])) continue
      d180.push({
        shopId: 0, snapshotDate: snapshotDate ?? '', indicator: cellText(r[cI]),
        score: leadingNumber(r[cS]), trend: cT >= 0 ? (cellText(r[cT]) || null) : null, industryAvg: leadingNumber(r[cA]),
        compareText: cC >= 0 ? (cellText(r[cC]) || null) : null, target: cTg >= 0 ? leadingNumber(r[cTg]) : null,
        gapText: cG >= 0 ? (cellText(r[cG]) || null) : null
      })
    }
  }

  // 日维度区块：第 6 行标题，第 7 行表头，第 8 行起数据（商品新增 DSR 不入库）
  // 缺失（AI 生成文件常见）时只导入 180 天，提示不阻断（任务 4O）
  const hD = rows[6] ?? []
  const cDate = findCol(hD, spec, 'date', mapping)
  const cD = findCol(hD, spec, 'descriptionScore', mapping)
  const cL = findCol(hD, spec, 'logisticsScore', mapping)
  const cS2 = findCol(hD, spec, 'serviceScore', mapping)
  if (cDate < 0 || cD < 0 || cL < 0 || cS2 < 0) {
    warnings.push({ code: 'structure', message: '未检测到日维度/商品维度区块，仅导入 180 天数据', row: 7 })
  } else {
    for (let i = 7; i < rows.length; i++) {
      const r = rows[i] ?? []
      const d = normalizeDate(r[cDate])
      if (!d) break // 日期列空说明进入下一个区块
      daily.push({
        shopId: 0, date: d, descriptionScore: leadingNumber(r[cD]),
        logisticsScore: leadingNumber(r[cL]), serviceScore: leadingNumber(r[cS2])
      })
      trackDate(dateState, d)
    }
  }

  const dataRows = daily.length + d180.length
  return { rows: { target: 'dsr', rows: { daily, d180 } }, dataRows }
}

export { SOURCE_LABEL, formatIssues as issuesText }
export type { SourceType }
