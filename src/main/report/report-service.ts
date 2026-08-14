// 任务7 日报导出核心（tdd）：聚合窗口数据 + AI 评语 → 自包含 HTML；明细导出 Excel/CSV
// 铁律：数字全部来自真实聚合与 ai_analyses；导出文件零外网依赖；金额=分、比率=0~1、日期=YYYY-MM-DD
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { createRequire } from 'node:module'
import * as XLSX from 'xlsx'
import type { AppDatabase } from '../db/database'
import {
  coverage, csBlock, csDates, dsrBlock, keywordBlock, kpiBlock, productTop, promoBlock,
  refundBlock, shiftDate, todayStr, windowRange, type SourceCoverage, type WindowMode, type WindowRange
} from '../db/dashboard'
import { getShop, listAnalysesForWindow } from '../db/repo'
import { COMMENT_BLOCKS, runRules, windowKey } from '../ai/comments'
import template from './report-template.html?raw'

XLSX.set_fs({ readFileSync, writeFileSync, mkdirSync } as never)

const require = createRequire(import.meta.url)
const ECHARTS_JS = readFileSync(require.resolve('echarts/dist/echarts.min.js'), 'utf8')

export type ReportType = 'daily' | 'weekly'
export type DetailKind = 'refund' | 'product' | 'daily'
export type DetailFormat = 'xlsx' | 'csv'

export interface ReportExportOpts {
  shopId: number
  mode: WindowMode
  type?: ReportType
  today?: string
}

export interface ReportComment {
  module: string
  label: string
  content: string | null
  model: string | null
  skillName: string | null
}

export interface ReportData {
  appName: string
  shopName: string
  type: ReportType
  typeLabel: string
  window: WindowRange
  today: string
  exportedAt: string
  kpi: Record<string, unknown> | null
  product: Array<Record<string, unknown>>
  promo: { totals: Record<string, unknown> | null; entities: Array<Record<string, unknown>> }
  refund: Record<string, unknown> | null
  cs: { dates: string[]; staff: Array<Record<string, unknown>> }
  dsr: Record<string, unknown>
  keywords: Record<string, unknown>
  rules: Array<{ rule: string; severity: string; evidence: string }>
  comments: ReportComment[]
  rowCounts: Record<string, number>
  // 覆盖与窗口口径：与看板 coverage() 一致；日报滞后时窗口回退并给出显著提示
  coverage: SourceCoverage[]
  dataCutoff: string | null
  lagNote: string | null
  commentNote: string | null
  requestedEnd: string
  charts: {
    trend: { dates: string[]; pay: number[]; net: number[]; profit: number[] }
    product: { names: string[]; pay: number[] }
    promo: { names: string[]; cost: number[]; roas: Array<number | null> }
    refund: { names: string[]; fen: number[] }
    keyword: { names: string[]; visitors: number[] }
  }
}

// ---------- 工具 ----------
function nowStr(): string {
  const d = new Date()
  const p = (n: number): string => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`
}

export function yuan(fen: unknown, digits = 2): string {
  const n = Number(fen)
  if (!Number.isFinite(n)) return '--'
  return (n / 100).toLocaleString('zh-CN', { minimumFractionDigits: digits, maximumFractionDigits: digits })
}

export function pct(x: unknown, digits = 1): string {
  const n = Number(x)
  if (!Number.isFinite(n)) return '--'
  return `${(n * 100).toFixed(digits)}%`
}

function num(v: unknown): string {
  const n = Number(v)
  return Number.isFinite(n) ? n.toLocaleString('zh-CN') : '--'
}

function signedPct(x: unknown): string {
  const n = Number(x)
  if (!Number.isFinite(n)) return '--'
  const v = n * 100
  const sign = v > 0 ? '+' : v < 0 ? '-' : ''
  return `${sign}${Math.abs(v).toFixed(1)}%`
}

export function escapeHtml(s: unknown): string {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')
}

function deltaClass(p: unknown): string {
  const n = Number(p)
  if (!Number.isFinite(n) || n === 0) return 'flat'
  return n > 0 ? 'up' : 'down'
}

function truncate(s: unknown, n: number): string {
  const t = String(s ?? '')
  return t.length > n ? t.slice(0, n) + '…' : t
}

// ---------- 窗口解析 ----------
export interface ResolvedWindow {
  window: WindowRange
  lag: boolean
  requestedEnd: string
  dataCutoff: string | null
}

/**
 * 报表窗口解析（任务 7 修复）：
 * - 周报/多日窗口：按名义窗口（近N天）计算，数据截止=经营数据最大日期；
 * - 日报（昨日窗口）：昨日必须有经营数据；无则自动回退到「最近有数据的一天」，
 *   文件名/窗口/KPI/评语全部改用该日口径，并返回滞后提示。
 */
export function resolveReportWindow(
  db: AppDatabase,
  shopId: number,
  mode: WindowMode,
  type: ReportType,
  today: string
): ResolvedWindow {
  const nominal = windowRange(mode, today)
  if (type !== 'daily' || shopId <= 0) {
    const cutoff = shopId > 0
      ? (db.raw.prepare('SELECT MAX(date) d FROM daily_metrics WHERE shop_id=? AND date<=?').get(shopId, nominal.end) as { d: string | null }).d
      : null
    return { window: nominal, lag: false, requestedEnd: nominal.end, dataCutoff: cutoff }
  }
  const hasEndData = shopId > 0 &&
    ((db.raw.prepare('SELECT COUNT(*) n FROM daily_metrics WHERE shop_id=? AND date=?').get(shopId, nominal.end) as { n: number }).n > 0)
  if (hasEndData) {
    return { window: nominal, lag: false, requestedEnd: nominal.end, dataCutoff: nominal.end }
  }
  const last = shopId > 0
    ? (db.raw.prepare('SELECT MAX(date) d FROM daily_metrics WHERE shop_id=? AND date<=?').get(shopId, nominal.end) as { d: string | null }).d
    : null
  if (!last) {
    return { window: nominal, lag: true, requestedEnd: nominal.end, dataCutoff: null }
  }
  const w: WindowRange = {
    mode: 'yesterday',
    label: `最近有数据日 ${last}`,
    days: 1,
    start: last,
    end: last,
    prevStart: shiftDate(last, -1),
    prevEnd: shiftDate(last, -1)
  }
  return { window: w, lag: true, requestedEnd: nominal.end, dataCutoff: last }
}

// ---------- 聚合 ----------
export function buildReportData(db: AppDatabase, opts: ReportExportOpts): ReportData {
  const shopId = Number(opts.shopId) || 0
  const type: ReportType = opts.type === 'weekly' ? 'weekly' : 'daily'
  const today = opts.today || todayStr()
  const resolved = resolveReportWindow(db, shopId, opts.mode, type, today)
  const w = resolved.window
  const shop = getShop(db, shopId)
  const shopName = shop ? shop.name : '未选店铺'
  const cov = shopId > 0 ? coverage(db, shopId, w.start, w.end, w.days) : []
  const lagNote = resolved.lag
    ? `数据截止 ${resolved.dataCutoff}，昨日无新数据（昨日窗口 ${resolved.requestedEnd} 无经营数据，已自动回退到最近有数据的一天）`
    : null

  const kpi = shopId > 0 ? kpiBlock(db, shopId, w) : null
  const product = shopId > 0 ? productTop(db, shopId, w.start, w.end, 10) : []
  const promo = shopId > 0 ? promoBlock(db, shopId, w.start, w.end) : { totals: null, entities: [] }
  const refund = shopId > 0 ? refundBlock(db, shopId, w.start, w.end) : null
  const csDatesList = shopId > 0 ? csDates(db, shopId, w.start, w.end) : []
  const cs = { dates: csDatesList, staff: csDatesList.length ? csBlock(db, shopId, w.start, w.end) : [] }
  const dsr = shopId > 0 ? dsrBlock(db, shopId, w.start, w.end) : { daily: null, snapshot: [], snapshotDate: null }
  const keywords = shopId > 0 ? keywordBlock(db, shopId, w.start, w.end) : { totals: null, top: [], dates: [] }
  const rules = shopId > 0 ? runRules(db, shopId, w) : []

  const analyses = shopId > 0 ? listAnalysesForWindow(db, shopId, windowKey(w)) : []
  const byModule = new Map(analyses.map((a) => [String(a.module), a]))
  const comments: ReportComment[] = COMMENT_BLOCKS.map((b) => {
    const a = byModule.get(b.module)
    return {
      module: b.module,
      label: b.label,
      content: a && a.content ? String(a.content) : null,
      model: a && a.model ? String(a.model) : null,
      skillName: a && a.skillName ? String(a.skillName) : null
    }
  })

  // 数据行数（reports 表留痕；口径与看板一致）
  const rowCounts: Record<string, number> = {}
  if (shopId > 0) {
    rowCounts.daily = (db.raw.prepare('SELECT COUNT(*) n FROM daily_metrics WHERE shop_id=? AND date>=? AND date<=?').get(shopId, w.start, w.end) as { n: number }).n
    rowCounts.product = (db.raw.prepare('SELECT COUNT(*) n FROM product_daily WHERE shop_id=? AND date>=? AND date<=?').get(shopId, w.start, w.end) as { n: number }).n
    rowCounts.promo = (db.raw.prepare('SELECT COUNT(*) n FROM promo_daily WHERE shop_id=? AND date>=? AND date<=?').get(shopId, w.start, w.end) as { n: number }).n
    rowCounts.refund = (db.raw.prepare('SELECT COUNT(*) n FROM refund_orders WHERE shop_id=? AND substr(refund_finish_time,1,10)>=? AND substr(refund_finish_time,1,10)<=?').get(shopId, w.start, w.end) as { n: number }).n
    rowCounts.cs = (db.raw.prepare('SELECT COUNT(*) n FROM cs_daily WHERE shop_id=? AND date>=? AND date<=?').get(shopId, w.start, w.end) as { n: number }).n
    rowCounts.keyword = (db.raw.prepare('SELECT COUNT(*) n FROM search_keywords WHERE shop_id=? AND date>=? AND date<=?').get(shopId, w.start, w.end) as { n: number }).n
    rowCounts.comment = comments.filter((c) => c.content).length
  }

  const kpiTrend = (kpi?.trend as Array<Record<string, unknown>> | undefined) ?? []
  const charts: ReportData['charts'] = {
    trend: {
      dates: kpiTrend.map((p) => String(p.date).slice(5)),
      pay: kpiTrend.map((p) => Number(p.payAmountFen) / 100),
      net: kpiTrend.map((p) => Number(p.netSalesFen) / 100),
      profit: kpiTrend.map((p) => Number(p.profitFen) / 100)
    },
    product: {
      names: product.map((p) => truncate(p.productName || p.productId, 16)),
      pay: product.map((p) => Number(p.payAmountFen) / 100)
    },
    promo: {
      names: (promo.entities as Array<Record<string, unknown>>).map((e) => truncate(e.adEntityName || e.adEntityId, 16)),
      cost: (promo.entities as Array<Record<string, unknown>>).map((e) => Number(e.costFen) / 100),
      roas: (promo.entities as Array<Record<string, unknown>>).map((e) => {
        const r = Number(e.roas)
        return Number.isFinite(r) ? r : null
      })
    },
    refund: {
      names: ((refund?.byProduct as Array<Record<string, unknown>> | undefined) ?? []).map((r) => truncate(r.productTitle || r.productId, 16)),
      fen: ((refund?.byProduct as Array<Record<string, unknown>> | undefined) ?? []).map((r) => Number(r.fen) / 100)
    },
    keyword: {
      names: ((keywords.top as Array<Record<string, unknown>> | undefined) ?? []).map((k) => truncate(k.keyword, 16)),
      visitors: ((keywords.top as Array<Record<string, unknown>> | undefined) ?? []).map((k) => Number(k.visitors) || 0)
    }
  }

  return {
    appName: 'EC AI',
    shopName,
    type,
    typeLabel: type === 'weekly' ? '周报' : '日报',
    window: w,
    today,
    exportedAt: nowStr(),
    kpi: kpi as unknown as Record<string, unknown>,
    product: product as unknown as Array<Record<string, unknown>>,
    promo: promo as unknown as { totals: Record<string, unknown> | null; entities: Array<Record<string, unknown>> },
    refund: refund as unknown as Record<string, unknown>,
    cs,
    dsr,
    keywords,
    rules,
    comments,
    rowCounts,
    coverage: cov,
    dataCutoff: resolved.dataCutoff,
    lagNote,
    commentNote: null,
    requestedEnd: resolved.requestedEnd,
    charts
  }
}

// ---------- HTML 渲染 ----------
function kpiSection(kpi: Record<string, unknown> | null): string {
  if (!kpi) return ''
  const change = (kpi.change as Record<string, unknown>) ?? {}
  const card = (label: string, value: string, delta: unknown, unit = ''): string => {
    const cls = deltaClass(delta)
    const deltaText = signedPct(delta)
    return `<div class="kpi"><div class="kpi-label">${label}</div><div class="kpi-value">${value}${unit}</div><div class="kpi-delta ${cls}">环比 ${deltaText}</div></div>`
  }
  return `<section class="card"><h2 class="sec-title">核心指标</h2><p class="sec-desc">窗口 ${yuan(kpi.payAmountFen)} 支付，环比上一周期；所有数字来自本机数据库，可回溯源文件</p>
  <div class="kpi-grid">
    ${card('支付金额', yuan(kpi.payAmountFen), change.payAmountPct)}
    ${card('净销售额', yuan(kpi.netSalesFen), change.netSalesPct)}
    ${card('利润', yuan(kpi.profitFen), change.profitPct)}
    ${card('访客数', num(kpi.visitors), change.visitorsPct)}
    ${card('退款率', pct(kpi.refundRate), null)}
    ${card('ROI', kpi.roi == null ? '--' : Number(kpi.roi).toFixed(2), null)}
    ${card('支付转化率', pct(kpi.payRate), null)}
  </div></section>`
}

function rulesSection(rules: Array<{ rule: string; severity: string; evidence: string }>): string {
  if (!rules.length) return ''
  const items = rules.map((r) => `<div class="rule"><span class="rule-name">${escapeHtml(r.rule)}</span><span class="rule-evidence">${escapeHtml(r.evidence)}</span></div>`).join('')
  return `<section class="card"><h2 class="sec-title">异常清单</h2><p class="sec-desc">规则引擎（确定性判定，不依赖模型）自动触发</p>${items}</section>`
}

function trendSection(data: ReportData): string {
  const trend = ((data.kpi?.trend as Array<Record<string, unknown>> | undefined) ?? [])
  const rows = trend.map((p) => {
    const profitRate = Number(p.payAmountFen) > 0 ? Number(p.profitFen) / Number(p.payAmountFen) : null
    const profitCls = Number(p.profitFen) < 0 ? ' class="neg"' : ''
    return `<tr><td>${escapeHtml(p.date)}</td><td class="num">${yuan(p.payAmountFen)}</td><td class="num">${yuan(p.netSalesFen)}</td>
      <td class="num">${pct(p.refundRate)}</td><td class="num"${profitCls}>${yuan(p.profitFen)}</td>
      <td class="num">${profitRate == null ? '--' : pct(profitRate)}</td><td class="num">${num(p.visitors)}</td><td class="num">${pct(p.payRate)}</td></tr>`
  }).join('')
  const table = trend.length
    ? `<div class="table-wrap"><table><thead><tr><th>日期</th><th class="num">支付金额</th><th class="num">净销售额</th><th class="num">退款率</th><th class="num">利润</th><th class="num">利润率</th><th class="num">访客</th><th class="num">转化率</th></tr></thead><tbody>${rows}</tbody></table></div>`
    : '<div class="empty">窗口内无每日经营数据</div>'
  return `<section class="card"><h2 class="sec-title">经营趋势</h2><p class="sec-desc">按日展示支付金额、净销售额与利润</p><div class="chart" id="chart-trend"></div>${table}</section>`
}

function productSection(data: ReportData): string {
  const list = data.product
  const rows = list.map((p) => `<tr><td>${escapeHtml(p.productName || p.productId)}</td><td class="mono">${escapeHtml(p.productId)}</td><td class="num">${yuan(p.payAmountFen)}</td>
    <td class="num"${Number(p.profitFen) < 0 ? ' class="neg"' : ''}>${yuan(p.profitFen)}</td><td class="num">${num(p.salesCount)}</td>
    <td class="num">${num(p.visitors)}</td><td class="num">${num(p.consultCount)}</td></tr>`).join('')
  const table = list.length
    ? `<div class="table-wrap"><table><thead><tr><th>商品</th><th>商品ID</th><th class="num">支付金额</th><th class="num">利润</th><th class="num">销量</th><th class="num">访客</th><th class="num">咨询</th></tr></thead><tbody>${rows}</tbody></table></div>`
    : '<div class="empty">窗口内无商品数据</div>'
  return `<section class="card"><h2 class="sec-title">商品 TOP</h2><p class="sec-desc">按支付金额降序 TOP${list.length || 10}</p><div class="chart" id="chart-product"></div>${table}</section>`
}

function promoSection(data: ReportData): string {
  const entities = data.promo.entities
  const rows = entities.map((e) => `<tr><td>${escapeHtml(e.adEntityName || e.adEntityId)}</td><td class="mono">${escapeHtml(e.adEntityId)}</td>
    <td class="num">${yuan(e.costFen)}</td><td class="num">${num(e.impressions)}</td><td class="num">${num(e.clicks)}</td>
    <td class="num">${pct(e.ctr)}</td><td class="num">${e.roas == null ? '--' : Number(e.roas).toFixed(2)}</td></tr>`).join('')
  const table = entities.length
    ? `<div class="table-wrap"><table><thead><tr><th>推广主体</th><th>主体ID</th><th class="num">花费</th><th class="num">展现</th><th class="num">点击</th><th class="num">CTR</th><th class="num">ROI</th></tr></thead><tbody>${rows}</tbody></table></div>`
    : '<div class="empty">窗口内无推广数据</div>'
  return `<section class="card"><h2 class="sec-title">推广分析</h2><p class="sec-desc">按推广主体汇总花费与投入产出</p><div class="chart" id="chart-promo"></div>${table}</section>`
}

function refundSection(data: ReportData): string {
  const refund = data.refund as Record<string, unknown> | null
  const mkTier = (label: string, t: Record<string, unknown> | undefined): Record<string, unknown> => ({ label, count: t?.count ?? 0, fen: t?.fen ?? 0 })
  const tiers = [
    mkTier('总计', refund?.total as Record<string, unknown> | undefined),
    mkTier('仅退款·未发货', refund?.wf as Record<string, unknown> | undefined),
    mkTier('仅退款·已发货', refund?.jr as Record<string, unknown> | undefined),
    mkTier('退货退款', refund?.rt as Record<string, unknown> | undefined),
    mkTier('其他', refund?.other as Record<string, unknown> | undefined)
  ]
  const tierTable = tiers.length
    ? `<div class="table-wrap"><table><thead><tr><th>口径</th><th class="num">笔数</th><th class="num">金额</th></tr></thead><tbody>${tiers.map((t) => `<tr><td>${escapeHtml(t.label)}</td><td class="num">${num(t.count)}</td><td class="num">${yuan(t.fen)}</td></tr>`).join('')}</tbody></table></div>`
    : ''
  const byProduct = ((refund?.byProduct as Array<Record<string, unknown>> | undefined) ?? [])
  const rows = byProduct.map((r) => `<tr><td>${escapeHtml(r.productTitle || r.productId)}</td><td class="num">${num(r.count)}</td><td class="num">${yuan(r.fen)}</td></tr>`).join('')
  const table = byProduct.length
    ? `<div class="table-wrap"><table><thead><tr><th>商品</th><th class="num">退款笔数</th><th class="num">退款金额</th></tr></thead><tbody>${rows}</tbody></table></div>`
    : '<div class="empty">窗口内无退款数据</div>'
  return `<section class="card"><h2 class="sec-title">退款分析</h2><p class="sec-desc">退款口径按退款完结时间落在窗口内</p>${tierTable}<div class="chart" id="chart-refund"></div>${table}</section>`
}

function csDsrSection(data: ReportData): string {
  const dsr = data.dsr as Record<string, unknown>
  const snapshot = (dsr.snapshot as Array<Record<string, unknown>> | undefined) ?? []
  const dsrTable = snapshot.length
    ? `<div class="table-wrap"><table><thead><tr><th>指标</th><th class="num">得分</th><th>趋势</th><th class="num">行业均值</th><th>与行业对比</th><th class="num">目标</th><th>距目标</th></tr></thead><tbody>${snapshot.map((s) => `<tr><td>${escapeHtml(s.indicator)}</td><td class="num">${s.score == null ? '--' : Number(s.score).toFixed(2)}</td><td>${escapeHtml(s.trend)}</td><td class="num">${s.industryAvg == null ? '--' : Number(s.industryAvg).toFixed(2)}</td><td>${escapeHtml(s.compareText)}</td><td class="num">${s.target == null ? '--' : Number(s.target).toFixed(2)}</td><td>${escapeHtml(s.gapText)}</td></tr>`).join('')}</tbody></table></div>`
    : '<div class="empty">无 DSR 快照数据</div>'
  const staff = data.cs.staff
  const csTable = staff.length
    ? `<div class="table-wrap"><table><thead><tr><th>客服</th><th class="num">询单人数</th><th class="num">最终付款人数</th><th class="num">转化率</th><th class="num">首响(s)</th><th class="num">均响(s)</th><th class="num">满意率</th><th class="num">回复率</th></tr></thead><tbody>${staff.map((s) => `<tr><td>${escapeHtml(s.staffName)}</td><td class="num">${num(s.inquiryCount)}</td><td class="num">${num(s.inquiryFinalPayCount)}</td><td class="num">${pct(s.inquiryFinalPayRate)}</td><td class="num">${s.firstResponseSeconds == null ? '--' : Number(s.firstResponseSeconds).toFixed(0)}</td><td class="num">${s.avgResponseSeconds == null ? '--' : Number(s.avgResponseSeconds).toFixed(0)}</td><td class="num">${pct(s.satisfactionRate)}</td><td class="num">${pct(s.replyRate)}</td></tr>`).join('')}</tbody></table></div>`
    : '<div class="empty">窗口内无客服绩效数据</div>'
  return `<section class="card"><h2 class="sec-title">DSR 评分与客服绩效</h2><p class="sec-desc">DSR 取最近快照；客服按窗口内日期汇总</p>${dsrTable}${csTable}</section>`
}

function keywordSection(data: ReportData): string {
  const top = ((data.keywords.top as Array<Record<string, unknown>> | undefined) ?? [])
  const rows = top.map((k) => `<tr><td>${escapeHtml(k.keyword)}</td><td class="num">${num(k.visitors)}</td><td class="num">${num(k.payBuyerCount)}</td>
    <td class="num">${yuan(k.payAmountFen)}</td><td class="num">${yuan(k.uvValueFen)}</td><td class="num">${pct(k.payRate)}</td></tr>`).join('')
  const table = top.length
    ? `<div class="table-wrap"><table><thead><tr><th>搜索词</th><th class="num">访客</th><th class="num">支付买家</th><th class="num">支付金额</th><th class="num">UV价值</th><th class="num">转化率</th></tr></thead><tbody>${rows}</tbody></table></div>`
    : '<div class="empty">窗口内无搜索词数据</div>'
  return `<section class="card"><h2 class="sec-title">搜索词</h2><p class="sec-desc">按访客数降序 TOP${top.length || 10}</p><div class="chart" id="chart-keyword"></div>${table}</section>`
}

function commentsSection(data: ReportData): string {
  const summary = data.comments.find((c) => c.module === '摘要')
  const rest = data.comments.filter((c) => c.module !== '摘要')
  const card = (c: ReportComment, summaryCls = ''): string => {
    const tag = c.skillName ? `<span class="cmt-tag">技能：${escapeHtml(c.skillName)}</span>` : ''
    const model = c.model ? `<span class="cmt-tag">模型：${escapeHtml(c.model)}</span>` : ''
    const body = c.content
      ? `<p class="cmt-text">${escapeHtml(c.content)}</p>`
      : `<div class="empty">该模块评语未生成（窗口 ${escapeHtml(data.window.end)} 无评语记录）</div>`
    return `<div class="cmt-card ${summaryCls}"><div class="cmt-head"><span class="cmt-label">${escapeHtml(c.label)}</span>${tag}${model}</div>${body}</div>`
  }
  const summaryHtml = summary ? '<h3 class=\'cmt-summary-title\'>全店汇总</h3>' + card(summary, 'cmt-summary') : ''
  const gridHtml = rest.map((c) => card(c)).join('')
  const notes = data.commentNote
    ? `<p class="sec-desc cmt-note">${escapeHtml(data.commentNote)}</p>`
    : data.comments.some((c) => c.content)
      ? '<p class="sec-desc">评语由 AI 基于窗口真实数据生成（deepseek-chat 等模型），已落库 ai_analyses，可回溯源记录</p>'
      : `<p class="sec-desc">当前窗口（${escapeHtml(data.window.end)}）暂无 AI 评语：请在应用内看板生成评语后重新导出</p>`
  return `<section class="card"><h2 class="sec-title">AI 评语</h2>${notes}${summaryHtml}<div class="cmt-grid">${gridHtml}</div></section>`
}

function buildBody(data: ReportData): string {
  return [
    kpiSection(data.kpi),
    rulesSection(data.rules),
    trendSection(data),
    productSection(data),
    promoSection(data),
    refundSection(data),
    csDsrSection(data),
    keywordSection(data),
    commentsSection(data)
  ].join('')
}

function buildLagHtml(data: ReportData): string {
  return data.lagNote ? `<div class="lag-alert">${escapeHtml(data.lagNote)}</div>` : ''
}

function buildCoverageHtml(data: ReportData): string {
  const cov = data.coverage ?? []
  if (!cov.length) return ''
  const items = cov.map((c) => {
    const n = Number(c.coveredDays) || 0
    const total = Number(c.expectedDays) || 0
    const cls = n >= total ? 'ok' : n > 0 ? 'partial' : ''
    return `<span class="cov-item"><span class="dot ${cls}"></span>${escapeHtml(c.label)} ${n}/${total} 天</span>`
  }).join('')
  const cutoff = data.dataCutoff ? `<span class="cov-cutoff">数据截止 ${escapeHtml(data.dataCutoff)}</span>` : ''
  return `<div class="cov-line"><span class="cov-label">数据覆盖</span>${items}${cutoff}</div>`
}

export function renderReportHtml(data: ReportData): string {
  const json = JSON.stringify(data).replace(/</g, '\u003c')
  const title = data.type === 'weekly' ? '经营周报' : '经营日报'
  return template
    .replace('__TITLE__', title)
    .replace('__SHOP__', escapeHtml(data.shopName))
    .replace('__WINDOW_LABEL__', escapeHtml(data.window.label))
    .replace('__WINDOW_RANGE__', `${data.window.start} ~ ${data.window.end}`)
    .replace('__EXPORTED_AT__', escapeHtml(data.exportedAt))
    .replace('__LAG_HTML__', buildLagHtml(data))
    .replace('__COVERAGE_HTML__', buildCoverageHtml(data))
    .replace('__BODY_HTML__', buildBody(data))
    .replace('/*__ECHARTS_JS__*/', ECHARTS_JS)
    .replace('window.__REPORT_DATA__ = null;', `window.__REPORT_DATA__ = ${json};`)
}

export function exportReportHtml(data: ReportData, outPath: string): string {
  mkdirSync(dirname(outPath), { recursive: true })
  writeFileSync(outPath, renderReportHtml(data), 'utf8')
  return outPath
}

// ---------- 明细导出（Excel/CSV，数字与库中一致） ----------
export function detailRows(db: AppDatabase, opts: { shopId: number; mode: WindowMode; kind: DetailKind; today?: string }): Array<Record<string, unknown>> {
  const shopId = Number(opts.shopId) || 0
  const w = windowRange(opts.mode, opts.today || todayStr())
  const { start, end } = w
  if (opts.kind === 'refund') {
    const rows = db.raw.prepare(`SELECT order_no AS orderNo, refund_no AS refundNo, product_title AS productTitle, product_id AS productId,
      refund_amount_fen AS refundFen, buyer_pay_amount_fen AS buyerPayFen, refund_status AS refundStatus, goods_status AS goodsStatus,
      after_sale_type AS afterSaleType, refund_apply_time AS refundApplyTime, refund_finish_time AS refundFinishTime, refund_reason AS refundReason
      FROM refund_orders WHERE shop_id=? AND substr(refund_finish_time,1,10)>=? AND substr(refund_finish_time,1,10)<=?
      ORDER BY refund_finish_time`).all(shopId, start, end) as Array<Record<string, unknown>>
    return rows.map((r) => ({
      订单编号: r.orderNo,
      退款编号: r.refundNo,
      宝贝标题: r.productTitle ?? '',
      商品ID: r.productId ?? '',
      退款总额元: Number(r.refundFen) / 100,
      买家实付元: Number(r.buyerPayFen) / 100,
      退款状态: r.refundStatus ?? '',
      货物状态: r.goodsStatus ?? '',
      售后类型: r.afterSaleType ?? '',
      退款申请时间: r.refundApplyTime ?? '',
      退款完结时间: r.refundFinishTime ?? '',
      买家退款原因: r.refundReason ?? ''
    }))
  }
  if (opts.kind === 'product') {
    const rows = db.raw.prepare(`SELECT product_id AS productId, MAX(product_name) AS productName,
      COALESCE(SUM(pay_amount_fen),0) AS payAmountFen, COALESCE(SUM(refund_amount_fen),0) AS refundAmountFen,
      COALESCE(SUM(profit_fen),0) AS profitFen, COALESCE(SUM(net_sales_fen),0) AS netSalesFen,
      COALESCE(SUM(sales_count),0) AS salesCount, COALESCE(SUM(visitors),0) AS visitors,
      COALESCE(SUM(consult_count),0) AS consultCount, COALESCE(SUM(promo_cost_fen),0) AS promoCostFen,
      COUNT(*) AS days FROM product_daily WHERE shop_id=? AND date>=? AND date<=?
      GROUP BY product_id ORDER BY payAmountFen DESC`).all(shopId, start, end) as Array<Record<string, unknown>>
    return rows.map((r) => ({
      商品ID: r.productId,
      商品名称: r.productName ?? '',
      支付金额元: Number(r.payAmountFen) / 100,
      退款金额元: Number(r.refundAmountFen) / 100,
      利润元: Number(r.profitFen) / 100,
      净销售额元: Number(r.netSalesFen) / 100,
      销量: Number(r.salesCount),
      访客数: Number(r.visitors),
      咨询数: Number(r.consultCount),
      推广花费元: Number(r.promoCostFen) / 100,
      覆盖天数: Number(r.days)
    }))
  }
  const rows = db.raw.prepare(`SELECT date, pay_amount_fen AS payAmountFen, net_sales_fen AS netSalesFen, profit_fen AS profitFen,
    visitors, refund_amount_fen AS refundAmountFen, promo_cost_fen AS promoCostFen, pay_rate AS payRate
    FROM daily_metrics WHERE shop_id=? AND date>=? AND date<=? ORDER BY date`).all(shopId, start, end) as Array<Record<string, unknown>>
  return rows.map((r) => ({
    日期: r.date,
    支付金额元: Number(r.payAmountFen) / 100,
    净销售额元: Number(r.netSalesFen) / 100,
    利润元: Number(r.profitFen) / 100,
    访客数: Number(r.visitors),
    退款金额元: Number(r.refundAmountFen) / 100,
    推广花费元: Number(r.promoCostFen) / 100,
    支付转化率: r.payRate == null ? '' : Number(r.payRate)
  }))
}

export function writeDetailFile(outPath: string, rows: Array<Record<string, unknown>>, format: DetailFormat): void {
  mkdirSync(dirname(outPath), { recursive: true })
  const ws = XLSX.utils.json_to_sheet(rows.length ? rows : [{ 提示: '窗口内无数据' }])
  if (format === 'xlsx') {
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, '明细')
    XLSX.writeFile(wb, outPath)
  } else {
    const csv = XLSX.utils.sheet_to_csv(ws)
    writeFileSync(outPath, '\uFEFF' + csv, 'utf8')
  }
}
