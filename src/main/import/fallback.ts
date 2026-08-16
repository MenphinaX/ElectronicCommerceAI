// LLM 兜底（任务书步骤 9）：一级列映射 → 二级全量解析；输出过同一套严苛校验，失败自动重试 1 次
import type { AppDatabase } from '../db/database'
import type {
  CsDailyRow, DailyMetricRow, Dsr180dRow, DsrDailyRow, ProductDailyRow,
  PromoDailyRow, RefundOrderRow, SearchKeywordRow
} from '../db/repo'
import { fenFromYuan, intValue, leadingNumber, normalizeDate, percentToDecimal } from '../db/units'
import { chatComplete, extractJson, resolveModelConfig, type ModelConfig } from './model-client'
import { parseSourceFile, type ParsedFile, type ParsedRows } from './parsers'
import type { RawCell, RawSheet } from './reader'
import { cellText } from './reader'
import { specOf, SOURCE_LABEL, type SourceSpec, type SourceType } from './specs'
import type { ValidationIssue } from './validate'

/** 类型化行 → 标准字段记录（人工处理中心 ② 单元格修正预览用；数值已转分，编辑按分填写） */
export function rowsToRecords(parsed: ParsedFile): Array<Record<string, unknown>> {
  const rows = parsed.rows
  switch (rows.target) {
    case 'daily_metrics':
      return rows.rows.map((r) => ({ date: r.date, payAmountFen: r.payAmountFen, netSalesFen: r.netSalesFen, profitFen: r.profitFen, visitors: r.visitors, salesCount: r.salesCount ?? 0, refundAmountFen: r.refundAmountFen, promoCostFen: r.promoCostFen, payRate: r.payRate ?? null }))
    case 'product_daily':
      return rows.rows.map((r) => ({ productId: r.productId, date: r.date, productName: r.productName ?? null, visitors: r.visitors ?? 0, pageViews: r.pageViews ?? 0, payAmountFen: r.payAmountFen ?? 0, refundAmountFen: r.refundAmountFen ?? 0, promoCostFen: r.promoCostFen ?? 0, profitFen: r.profitFen ?? 0, netSalesFen: r.netSalesFen ?? 0, salesCount: r.salesCount ?? 0, consultCount: r.consultCount ?? 0, payRate: r.payRate ?? null }))
    case 'promo_daily':
      return rows.rows.map((r) => ({ date: r.date, adEntityId: r.adEntityId, adEntityName: r.adEntityName ?? null, impressions: r.impressions ?? 0, clicks: r.clicks ?? 0, costFen: r.costFen ?? 0, ctr: r.ctr ?? null, roas: r.roas ?? null, payAmountFen: r.payAmountFen ?? 0, salesCount: r.salesCount ?? 0, payRate: r.payRate ?? null }))
    case 'refund_orders':
      return rows.rows.map((r) => ({ orderNo: r.orderNo, refundNo: r.refundNo, productId: r.productId ?? null, productTitle: r.productTitle ?? null, refundAmountFen: r.refundAmountFen ?? 0, buyerPayAmountFen: r.buyerPayAmountFen ?? 0, refundStatus: r.refundStatus ?? null, goodsStatus: r.goodsStatus ?? null, afterSaleType: r.afterSaleType ?? null, paymentTime: r.paymentTime ?? null, refundFinishTime: r.refundFinishTime ?? null, refundApplyTime: r.refundApplyTime ?? null, refundReason: r.refundReason ?? null }))
    case 'cs_daily':
      return rows.rows.map((r) => ({ date: r.date, staffName: r.staffName, inquiryFinalPayCount: r.inquiryFinalPayCount ?? 0, inquiryCount: r.inquiryCount ?? 0, inquiryFinalPayRate: r.inquiryFinalPayRate ?? null, firstResponseSeconds: r.firstResponseSeconds ?? null, avgResponseSeconds: r.avgResponseSeconds ?? null, satisfactionRate: r.satisfactionRate ?? null, replyRate: r.replyRate ?? null, inquiryFinalPayAmountFen: r.inquiryFinalPayAmountFen ?? 0, refundAmountFen: r.refundAmountFen ?? 0 }))
    case 'search_keywords':
      return rows.rows.map((r) => ({ date: r.date, keyword: r.keyword, visitors: r.visitors ?? 0, cartAddCount: r.cartAddCount ?? 0, favoriteCount: r.favoriteCount ?? 0, payBuyerCount: r.payBuyerCount ?? 0, payRate: r.payRate ?? null, payAmountFen: r.payAmountFen ?? 0, unitPriceFen: r.unitPriceFen ?? null, uvValueFen: r.uvValueFen ?? null }))
    case 'dsr':
      return [
        ...rows.rows.d180.map((r) => ({ indicator: r.indicator, snapshotDate: r.snapshotDate, score: r.score ?? null, trend: r.trend ?? null, industryAvg: r.industryAvg ?? null, compareText: r.compareText ?? null, target: r.target ?? null, gapText: r.gapText ?? null })),
        ...rows.rows.daily.map((r) => ({ date: r.date, descriptionScore: r.descriptionScore ?? null, logisticsScore: r.logisticsScore ?? null, serviceScore: r.serviceScore ?? null }))
      ]
  }
}

export interface FallbackResult {
  ok: boolean
  method?: 'column-mapping' | 'full-parse'
  parsed?: ParsedFile
  reason?: string
}

const FIELD_DESC: Record<string, string> = {
  date: '统计日期 YYYY-MM-DD', keyword: '搜索词', visitors: '访客数', searchGuideVisitors: '搜索引导访客数', pageViews: '浏览量',
  cartAddCount: '加购人数', favoriteCount: '收藏人数', payBuyerCount: '支付买家数',
  payRate: '支付转化率（0~1 或百分比）', payAmountFen: '支付金额（元）', unitPriceFen: '客单价（元）',
  uvValueFen: 'UV价值（元）', productId: '商品id（纯数字）', productName: '商品名称', salesCount: '销售件数',
  consultCount: '总咨询人数', refundAmountFen: '退款金额（元）', promoCostFen: '推广花费（元）',
  profitFen: '利润（元）', netSalesFen: '净销售额（元）', adEntityId: '推广主体ID', adEntityName: '推广主体名称',
  impressions: '展现量', clicks: '点击量', costFen: '花费（元）', ctr: '点击率', roas: '投入产出比',
  orderNo: '订单编号', refundNo: '退款编号', productTitle: '宝贝标题', buyerPayAmountFen: '买家实际支付金额（元）',
  refundStatus: '退款状态', goodsStatus: '货物状态', afterSaleType: '售后类型', paymentTime: '订单付款时间',
  refundFinishTime: '退款完结时间', refundApplyTime: '退款申请时间', refundReason: '买家退款原因',
  staffName: '旺旺昵称', inquiryFinalPayCount: '询单最终付款人数', inquiryCount: '询单人数',
  inquiryFinalPayRate: '询单最终付款转化率', firstResponseSeconds: '首次响应时长（秒）',
  avgResponseSeconds: '平均响应时长（秒）', satisfactionRate: '客户满意率', replyRate: '旺旺回复率',
  inquiryFinalPayAmountFen: '询单最终付款金额（元）', indicator: 'DSR 指标（描述相符/服务态度/物流质量）', score: '得分',
  trend: '趋势', industryAvg: '行业均值', compareText: '与行业对比', target: '目标值', gapText: '距目标值差距',
  descriptionScore: '描述得分（可选）', logisticsScore: '物流得分（可选）', serviceScore: '服务得分（可选）', snapshotDate: '快照日期 YYYY-MM-DD'
}

/** 每文件必填标准字段（对应速查表必填关键列） */
const REQUIRED_FIELDS: Record<SourceType, string[]> = {
  consult: ['productId', 'productName', 'consultCount'],
  keyword: ['date', 'keyword', 'visitors', 'payRate', 'payAmountFen'],
  product_report: ['date', 'productId', 'productName', 'payAmountFen', 'refundAmountFen'],
  product_detail: ['productId', 'payAmountFen', 'netSalesFen', 'refundAmountFen', 'promoCostFen', 'profitFen'],
  promo: ['date', 'adEntityId', 'costFen', 'roas'],
  daily: ['date', 'payAmountFen', 'netSalesFen', 'profitFen', 'visitors', 'refundAmountFen', 'promoCostFen'],
  dsr: ['indicator', 'score', 'industryAvg', 'compareText', 'target', 'gapText'],
  cs: ['staffName', 'inquiryCount', 'inquiryFinalPayRate', 'avgResponseSeconds'],
  refund: ['orderNo', 'refundNo', 'refundAmountFen', 'goodsStatus', 'afterSaleType', 'productId']
}

function fieldsFor(spec: SourceSpec): string {
  const keys = Object.keys(spec.requiredCols)
  return keys.map((k) => `- ${k}：${FIELD_DESC[k] ?? k}`).join('\n')
}

function previewRows(raw: RawSheet, maxRows = 14): string {
  return JSON.stringify(raw.rows.slice(0, maxRows))
}

function buildMappingPrompt(spec: SourceSpec, raw: RawSheet, localErrors: ValidationIssue[]): Array<{ role: 'system' | 'user'; content: string }> {
  return [
    {
      role: 'system',
      content:
        '你是电商经营数据文件导入助手。你的任务是把平台导出的报表文件列映射到系统标准字段。' +
        '你只能输出一个严格 JSON 对象，禁止输出任何解释文字、代码围栏或 markdown。'
    },
    {
      role: 'user',
      content: [
        `文件类型：${spec.label}`,
        `系统标准字段（JSON 键）及含义：\n${fieldsFor(spec)}`,
        `必填字段（mapping 里必须全部覆盖）：${REQUIRED_FIELDS[spec.type].join('、')}`,
        `本地解析失败原因（供参考）：${localErrors.map((e) => e.message).join('；') || '无'}`,
        `文件实际内容（前 ${Math.min(raw.rows.length, 14)} 行，表头可能不在第 1 行，可能有说明行/空行）：\n${previewRows(raw)}`,
        '任务：',
        '1) 找出真正的表头行（1-based 行号）。',
        '2) 输出列映射：把文件里的源列名原文映射到标准字段。',
        '只输出 JSON：{"header_row": 1-based整数, "mapping": {"源列名原文": "标准字段", ...}, "confidence": {"标准字段": 0到1}, "doubts": ["疑点"]}',
        '要求：mapping 的键必须是文件里实际存在的列名原文；mapping 的值必须是上面列出的标准字段键；无法映射的列省略；必填字段缺映射会导入失败。'
      ].join('\n')
    }
  ]
}

function buildFullParsePrompt(spec: SourceSpec, raw: RawSheet, mappingErrors: string[]): Array<{ role: 'system' | 'user'; content: string }> {
  return [
    {
      role: 'system',
      content:
        '你是电商经营数据文件导入助手。你的任务是把报表文件解析成系统标准字段的 JSON 行数据。' +
        '你只能输出一个严格 JSON 对象，禁止输出任何解释文字、代码围栏或 markdown；缺失值必须用 null，禁止编造文件里不存在的值。'
    },
    {
      role: 'user',
      content: [
        `文件类型：${spec.label}`,
        `标准字段：\n${fieldsFor(spec)}`,
        `必填字段（每行必须非空）：${REQUIRED_FIELDS[spec.type].join('、')}`,
        `列映射失败原因（供参考）：${mappingErrors.join('；') || '无'}`,
        `文件内容（前 30 行截断）：\n${previewRows(raw, 30)}`,
        '任务：把文件中的数据行解析为标准 JSON 行。日期统一 YYYY-MM-DD；金额/数量输出数字；比率输出 0~1 小数或百分比字符串；时间字段原样保留。',
        '只输出 JSON：{"rows": [{"标准字段": 值, ...}], "confidence": {"标准字段": 0到1}, "doubts": ["疑点"]}'
      ].join('\n')
    }
  ]
}

export interface MappingResult {
  headerRow: number
  mapping: Record<string, string>
  doubts: string[]
}

export async function llmColumnMapping(cfg: ModelConfig, spec: SourceSpec, raw: RawSheet, localErrors: ValidationIssue[]): Promise<MappingResult> {
  const text = await chatComplete(cfg, buildMappingPrompt(spec, raw, localErrors), { maxTokens: 3000 })
  const json = extractJson<{ header_row?: unknown; mapping?: Record<string, unknown>; doubts?: unknown }>(text)
  if (typeof json.header_row !== 'number' || !Number.isInteger(json.header_row) || json.header_row < 1) {
    throw new Error('模型未返回合法 header_row')
  }
  if (!json.mapping || typeof json.mapping !== 'object') {
    throw new Error('模型未返回 mapping')
  }
  const mapping: Record<string, string> = {}
  for (const [k, v] of Object.entries(json.mapping)) {
    if (typeof v === 'string' && v in spec.requiredCols) mapping[k] = v
  }
  const missing = REQUIRED_FIELDS[spec.type].filter((f) => !Object.values(mapping).includes(f))
  if (missing.length > 0) {
    throw new Error(`列映射缺少必填字段：${missing.join('、')}`)
  }
  return { headerRow: json.header_row, mapping, doubts: Array.isArray(json.doubts) ? json.doubts.map(String) : [] }
}

export interface RecordsResult {
  rows: Array<Record<string, unknown>>
  doubts: string[]
}

export async function llmFullParse(cfg: ModelConfig, spec: SourceSpec, raw: RawSheet, mappingErrors: string[]): Promise<RecordsResult> {
  const text = await chatComplete(cfg, buildFullParsePrompt(spec, raw, mappingErrors), { maxTokens: 6000 })
  const json = extractJson<{ rows?: unknown; doubts?: unknown }>(text)
  if (!Array.isArray(json.rows)) throw new Error('模型未返回 rows 数组')
  const rows = json.rows as Array<Record<string, unknown>>
  if (rows.some((r) => r === null || typeof r !== 'object')) throw new Error('rows 存在非法行')
  return { rows, doubts: Array.isArray(json.doubts) ? json.doubts.map(String) : [] }
}

/** 兜底输出校验（任务书步骤 9 代码侧强制） */
export function validateRecords(spec: SourceSpec, records: Array<Record<string, unknown>>, inputDataRows: number): ValidationIssue[] {
  const issues: ValidationIssue[] = []
  const required = REQUIRED_FIELDS[spec.type]
  // 行数一致（±15%，容忍平台少量增删）
  const tolerance = Math.max(3, Math.round(inputDataRows * 0.15))
  if (Math.abs(records.length - inputDataRows) > tolerance) {
    issues.push({ code: 'row_count', message: `兜底行数 ${records.length} 与输入数据行 ${inputDataRows} 偏差超过 ${tolerance}` })
  }
  const dateFields = new Set(['date', 'snapshotDate'])
  for (let i = 0; i < records.length; i++) {
    const r = records[i]
    for (const f of required) {
      const v = r[f]
      if (v === null || v === undefined || String(v).trim() === '') {
        issues.push({ code: 'missing_col', message: `第 ${i + 1} 行必填字段 ${f} 缺失`, row: i + 1, col: f })
        continue
      }
      if (dateFields.has(f)) {
        if (!normalizeDate(v as RawCell)) {
          issues.push({ code: 'date', message: `第 ${i + 1} 行日期 ${f} 无法解析`, row: i + 1, col: f, value: String(v) })
        }
      } else if (!isNumericField(f)) {
        continue
      } else {
        const t = numericCheck(v)
        if (t === 'invalid') {
          issues.push({ code: 'number', message: `第 ${i + 1} 行 ${f} 不是数字`, row: i + 1, col: f, value: String(v) })
        }
      }
    }
  }
  return issues
}

function isNumericField(f: string): boolean {
  return !['keyword', 'productName', 'adEntityName', 'productTitle', 'staffName', 'orderNo', 'refundNo',
    'goodsStatus', 'afterSaleType', 'refundStatus', 'refundReason', 'paymentTime', 'refundFinishTime',
    'refundApplyTime', 'indicator', 'trend', 'compareText', 'gapText'].includes(f)
}

function numericCheck(v: unknown): 'ok' | 'invalid' {
  if (v === null || v === undefined) return 'ok'
  const s = String(v).replace(/,/g, '').replace(/%/g, '').trim()
  if (s === '') return 'ok'
  return Number.isFinite(Number(s)) ? 'ok' : 'invalid'
}

/** 标准字段记录 → 类型化行（与 parsers 同一套口径） */
export function rowsFromRecords(spec: SourceSpec, type: SourceType, filePath: string, records: Array<Record<string, unknown>>): ParsedRows {
  switch (type) {
    case 'consult': {
      const rows: ProductDailyRow[] = records.map((r) => ({
        shopId: 0, productId: String(r.productId).trim(), date: '2026-08-11',
        productName: cell(r.productName), consultCount: intValue(r.consultCount as RawCell)
      }))
      return { target: 'product_daily', rows }
    }
    case 'keyword': {
      const rows: SearchKeywordRow[] = records.map((r) => ({
        shopId: 0, date: norm(r.date), keyword: String(r.keyword).trim(), visitors: intValue(r.visitors as RawCell),
        cartAddCount: intValue(r.cartAddCount as RawCell), favoriteCount: intValue(r.favoriteCount as RawCell),
        payBuyerCount: intValue(r.payBuyerCount as RawCell), payRate: percentToDecimal(r.payRate as RawCell),
        payAmountFen: fenFromYuan(r.payAmountFen as RawCell), unitPriceFen: fenFromYuan(r.unitPriceFen as RawCell) || null,
        uvValueFen: fenFromYuan(r.uvValueFen as RawCell) || null
      }))
      return { target: 'search_keywords', rows }
    }
    case 'product_report': {
      const rows: ProductDailyRow[] = records.map((r) => ({
        shopId: 0, productId: String(r.productId).trim(), date: norm(r.date), productName: cell(r.productName),
        visitors: intValue(r.visitors as RawCell), pageViews: intValue(r.pageViews as RawCell),
        searchGuideVisitors: r.searchGuideVisitors == null ? null : intValue(r.searchGuideVisitors as RawCell),
        payAmountFen: fenFromYuan(r.payAmountFen as RawCell), refundAmountFen: fenFromYuan(r.refundAmountFen as RawCell),
        payRate: percentToDecimal(r.payRate as RawCell)
      }))
      return { target: 'product_daily', rows }
    }
    case 'product_detail': {
      const rows: ProductDailyRow[] = records.map((r) => ({
        shopId: 0, productId: String(r.productId).trim(), date: '2026-08-11', productName: cell(r.productName),
        payAmountFen: fenFromYuan(r.payAmountFen as RawCell), netSalesFen: fenFromYuan(r.netSalesFen as RawCell),
        refundAmountFen: fenFromYuan(r.refundAmountFen as RawCell), promoCostFen: fenFromYuan(r.promoCostFen as RawCell),
        profitFen: fenFromYuan(r.profitFen as RawCell), salesCount: intValue(r.salesCount as RawCell)
      }))
      return { target: 'product_daily', rows }
    }
    case 'promo': {
      const rows: PromoDailyRow[] = records.map((r) => ({
        shopId: 0, date: norm(r.date), adEntityId: String(r.adEntityId).trim(), adEntityName: cell(r.adEntityName),
        impressions: intValue(r.impressions as RawCell), clicks: intValue(r.clicks as RawCell),
        costFen: fenFromYuan(r.costFen as RawCell), ctr: percentToDecimal(r.ctr as RawCell),
        roas: typeof r.roas === 'number' ? r.roas : percentToDecimal(r.roas as RawCell)
      }))
      return { target: 'promo_daily', rows }
    }
    case 'daily': {
      const rows: DailyMetricRow[] = records.map((r) => ({
        shopId: 0, date: norm(r.date), payAmountFen: fenFromYuan(r.payAmountFen as RawCell),
        netSalesFen: fenFromYuan(r.netSalesFen as RawCell), profitFen: fenFromYuan(r.profitFen as RawCell),
        visitors: intValue(r.visitors as RawCell), refundAmountFen: fenFromYuan(r.refundAmountFen as RawCell),
        promoCostFen: fenFromYuan(r.promoCostFen as RawCell), payRate: percentToDecimal(r.payRate as RawCell)
      }))
      return { target: 'daily_metrics', rows }
    }
    case 'cs': {
      const rows: CsDailyRow[] = records.map((r) => ({
        shopId: 0, date: '2026-08-09', staffName: String(r.staffName).trim(),
        inquiryFinalPayCount: intValue(r.inquiryFinalPayCount as RawCell), inquiryCount: intValue(r.inquiryCount as RawCell),
        inquiryFinalPayRate: percentToDecimal(r.inquiryFinalPayRate as RawCell),
        firstResponseSeconds: numOrNull(r.firstResponseSeconds), avgResponseSeconds: numOrNull(r.avgResponseSeconds),
        satisfactionRate: percentToDecimal(r.satisfactionRate as RawCell), replyRate: percentToDecimal(r.replyRate as RawCell),
        inquiryFinalPayAmountFen: fenFromYuan(r.inquiryFinalPayAmountFen as RawCell),
        refundAmountFen: fenFromYuan(r.refundAmountFen as RawCell)
      }))
      return { target: 'cs_daily', rows }
    }
    case 'dsr': {
      // 180 天行与日维度行按字段分流：只有 indicator 无 date → 仅入 180 天（任务 4O 只 180 天兜底）
      const daily: DsrDailyRow[] = []
      const d180: Dsr180dRow[] = []
      for (const r of records) {
        const d = normalizeDate(r.date as RawCell)
        if (d) {
          daily.push({
            shopId: 0, date: d, descriptionScore: leadingNumber(r.descriptionScore as RawCell),
            logisticsScore: leadingNumber(r.logisticsScore as RawCell), serviceScore: leadingNumber(r.serviceScore as RawCell)
          })
        }
        if (r.indicator !== undefined && r.indicator !== null && String(r.indicator).trim() !== '') {
          d180.push({
            shopId: 0, snapshotDate: norm(r.snapshotDate), indicator: String(r.indicator).trim(),
            score: leadingNumber(r.score as RawCell), trend: cell(r.trend), industryAvg: leadingNumber(r.industryAvg as RawCell),
            compareText: cell(r.compareText), target: leadingNumber(r.target as RawCell), gapText: cell(r.gapText)
          })
        }
      }
      return { target: 'dsr', rows: { daily, d180 } }
    }
    case 'refund': {
      const rows: RefundOrderRow[] = records.map((r) => ({
        shopId: 0, orderNo: String(r.orderNo).trim(), refundNo: String(r.refundNo).trim(),
        productId: cell(r.productId), productTitle: cell(r.productTitle),
        refundAmountFen: fenFromYuan(r.refundAmountFen as RawCell), buyerPayAmountFen: fenFromYuan(r.buyerPayAmountFen as RawCell),
        refundStatus: cell(r.refundStatus), goodsStatus: cell(r.goodsStatus), afterSaleType: cell(r.afterSaleType),
        paymentTime: cell(r.paymentTime), refundFinishTime: cell(r.refundFinishTime),
        refundApplyTime: cell(r.refundApplyTime), refundReason: cell(r.refundReason)
      }))
      return { target: 'refund_orders', rows }
    }
  }
}

function cell(v: unknown): string | null {
  if (v === null || v === undefined) return null
  const s = String(v).trim()
  return s === '' ? null : s
}

function norm(v: unknown): string {
  return normalizeDate(v as RawCell) ?? ''
}

function numOrNull(v: unknown): number | null {
  if (v === null || v === undefined) return null
  const s = String(v).trim()
  if (s === '') return null
  const n = Number(s)
  return Number.isFinite(n) ? n : null
}

function inputDataRowCount(raw: RawSheet): number {
  let n = 0
  for (const r of raw.rows) if (r.some((c) => cellText(c) !== '')) n++
  return n
}

/** 兜底主流程：一级列映射 → 二级全量解析，各带 1 次带错误重试 */
export async function runFallback(
  db: AppDatabase | null,
  filePath: string,
  raw: RawSheet,
  type: SourceType,
  modelConfig: ModelConfig | null,
  localErrors: ValidationIssue[]
): Promise<FallbackResult> {
  const cfg = modelConfig ?? resolveModelConfig(db, null)
  if (!cfg) {
    return { ok: false, reason: '未配置 AI 模型：未发送任何数据，请配置模型或转人工处理' }
  }
  const spec = specOf(type)

  // 一级：列映射
  const mappingErrors: string[] = []
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const m = await llmColumnMapping(cfg, spec, raw, localErrors)
      const mapping: Record<string, string> = {}
      for (const [src, field] of Object.entries(m.mapping)) mapping[field] = src
      const parsed = parseSourceFile(filePath, raw, type, { headerRowOverride: m.headerRow, columnMapping: mapping })
      if (parsed.ok) {
        return { ok: true, method: 'column-mapping', parsed }
      }
      mappingErrors.push(...parsed.issues.map((i) => i.message))
      if (attempt === 0) mappingErrors.push('（重试一次）')
    } catch (e) {
      mappingErrors.push((e as Error).message)
      if (attempt === 0) mappingErrors.push('（重试一次）')
    }
  }

  // 二级：全量解析
  const parseErrors: string[] = [...mappingErrors]
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const rec = await llmFullParse(cfg, spec, raw, parseErrors)
      const issues = validateRecords(spec, rec.rows, inputDataRowCount(raw))
      if (issues.length > 0) {
        parseErrors.push(...issues.map((i) => i.message))
        if (attempt === 0) parseErrors.push('（重试一次）')
        continue
      }
      const rows = rowsFromRecords(spec, type, filePath, rec.rows)
      const dateState = { start: null as string | null, end: null as string | null }
      const dataRows = rec.rows.length
      const parsed: ParsedFile = {
        type, label: SOURCE_LABEL[type], spec, headerRow: 1, dataRows,
        dateStart: dateState.start, dateEnd: dateState.end, rows, issues: [], warnings: [], ok: true
      }
      return { ok: true, method: 'full-parse', parsed }
    } catch (e) {
      parseErrors.push((e as Error).message)
      if (attempt === 0) parseErrors.push('（重试一次）')
    }
  }

  return { ok: false, reason: `LLM 兜底失败：${parseErrors.slice(0, 3).join('；')}` }
}
