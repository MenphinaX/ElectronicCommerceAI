// 蓝本复刻数据工具（口径与 数据看板-原型.html 一致；数字来自真实 store；金额统一 分→元 后再用蓝本格式函数）
import { computed } from 'vue'
import { csGroups, type CsGroup } from '../../../utils/cs-utils'
import { useDashboardStore } from '../../../stores/dashboard'
import { useCommentsStore } from '../../../stores/comments'
import { useProductImagesStore } from '../../../stores/productImages'

// ---------- 格式化（与蓝本一致：整数千分位 + ¥ 前缀） ----------
export function bpNum(n: unknown): string {
  if (n === null || n === undefined || n === '') return '--'
  const v = Number(n)
  return Number.isFinite(v) ? v.toLocaleString('zh-CN', { maximumFractionDigits: 0 }) : '--'
}
export function bpMoney(n: unknown): string { return '¥' + bpNum(n) }
export function bpPct(n: unknown, digits = 1): string {
  return n === null || n === undefined || n === '' ? '--' : Number(n).toFixed(digits) + '%'
}
export function bpEsc(s: unknown): string {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}
export function bpSlice(date: string): string { return String(date ?? '').slice(5) }
export function bpFmt1(n: unknown): string {
  return n === null || n === undefined || n === '' ? '--' : Number(n).toFixed(1)
}

// ---------- 窗口聚合 ----------
export interface BpDay {
  d: string; sales: number; net: number; profit: number; refund: number; promo: number; vis: number; orders: number; rr: number | null
}
export interface BpAgg {
  pay: number; net: number; profit: number; refund: number; promo: number; vis: number; orders: number
  up: number; dn: number; days: number; rr: number; pr: number; cv: number
}
export function aggOf(list: BpDay[]): BpAgg {
  const a: BpAgg = { pay: 0, net: 0, profit: 0, refund: 0, promo: 0, vis: 0, orders: 0, up: 0, dn: 0, days: list.length, rr: 0, pr: 0, cv: 0 }
  for (const d of list) {
    a.pay += d.sales; a.net += d.net; a.profit += d.profit; a.refund += d.refund; a.promo += d.promo; a.vis += d.vis; a.orders += d.orders
    if (d.profit >= 0) a.up++; else a.dn++
  }
  a.rr = a.pay ? (a.refund / a.pay) * 100 : 0
  a.pr = a.pay ? (a.profit / a.pay) * 100 : 0
  a.cv = a.vis ? (a.orders / a.vis) * 100 : 0
  return a
}

// ---------- 退款三档 ----------
export type BpBucket = 'wf' | 'jr' | 'rt'
export interface BpRefundOrder {
  pid: string | null; title: string | null; amount: number; bucket: BpBucket | null
  reason: string | null; ot: string | null; pay: number | null; orderNo: string; refundNo: string; fin: string | null
}
export interface BpProductRefund {
  wf: number; jr: number; rt: number; total: number; wfN: number; jrN: number; rtN: number; list: BpRefundOrder[]
}
// 与后端 SQL 口径严格一致：wf=仅退款+未发货；jr=仅退款+非未发货（goods_status 非空）；rt=退货退款；其余=other
export function bucketOf(afterSaleType: unknown, goodsStatus: unknown): BpBucket | null {
  const t = String(afterSaleType ?? '')
  const g = goodsStatus === null || goodsStatus === undefined || goodsStatus === '' ? null : String(goodsStatus)
  if (t === '仅退款') {
    if (g === '未发货') return 'wf'
    if (g !== null && g !== '未发货') return 'jr'
    return null
  }
  if (t === '退货退款') return 'rt'
  return null
}

// ---------- 主数据派生 ----------
export interface BpPromoRow {
  pid: string; name: string | null; spend: number; pay: number; clicks: number; impressions: number
  cr: number | null; orders: number; roi: number | null; conv: number | null
}
export interface BpProductRow {
  pid: string; name: string | null; sales: number; refund: number; promo: number; profit: number
  search: number | null; consult: number; orders: number; days: number; refundDays: number; status: string | null
}
export interface BpDsrRow { indicator: string; score: number | null; industryAvg: number | null; compareText: string | null; gapText: string | null }
export interface BpDsrMap { date: string | null; desc: BpDsrRow; service: BpDsrRow; logistics: BpDsrRow }
export function useBpData() {
  const store = useDashboardStore()
  const comments = useCommentsStore()
  const images = useProductImagesStore()

  const d = computed(() => store.data)
  const winDays = computed(() => (d.value?.window?.mode === 'yesterday' ? 1 : Number(d.value?.window?.mode ?? '7')))
  const winLbl = computed(() => (winDays.value === 1 ? '昨日' : '近' + winDays.value + '天'))
  const winStart = computed(() => d.value?.window?.start ?? '')
  const winEnd = computed(() => d.value?.window?.end ?? '')
  const lastDay = computed(() => d.value?.lastDay ?? '')

  const days = computed<BpDay[]>(() => {
    const trend = ((d.value?.kpi as Record<string, unknown> | null)?.trend ?? []) as Array<Record<string, unknown>>
    return trend.map((r) => {
      const pay = Number(r.payAmountFen) || 0
      const refund = Number(r.refundAmountFen) || 0
      const rr = pay > 0 ? (refund / pay) * 100 : null
      return {
        d: String(r.date), sales: pay / 100, net: (Number(r.netSalesFen) || 0) / 100, profit: (Number(r.profitFen) || 0) / 100,
        refund: refund / 100, promo: (Number(r.promoCostFen) || 0) / 100, vis: Number(r.visitors) || 0, orders: Number(r.salesCount) || 0, rr
      }
    })
  })
  const prevDays = computed<BpDay[]>(() => {
    const prevTrend = ((d.value?.kpi as Record<string, unknown> | null)?.prevTrend ?? []) as Array<Record<string, unknown>>
    return prevTrend.map((r) => ({
      d: String(r.date), sales: (Number(r.payAmountFen) || 0) / 100, net: (Number(r.netSalesFen) || 0) / 100, profit: (Number(r.profitFen) || 0) / 100,
      refund: (Number(r.refundAmountFen) || 0) / 100, promo: (Number(r.promoCostFen) || 0) / 100, vis: Number(r.visitors) || 0, orders: Number(r.salesCount) || 0, rr: null
    }))
  })
  const agg = computed<BpAgg>(() => aggOf(days.value))
  const prevAgg = computed<BpAgg>(() => aggOf(prevDays.value))

  // 月度（02 KPI 当月汇总 + 最近一天）
  const month = computed(() => {
    const m = (d.value?.monthlyBlock ?? {}) as Record<string, unknown>
    const rawAgg = (m.agg ?? {}) as Record<string, unknown>
    const rawLast = (m.last ?? null) as Record<string, unknown> | null
    const conv = (r: Record<string, unknown>) => ({
      pay: (Number(r.payAmountFen) || 0) / 100, net: (Number(r.netSalesFen) || 0) / 100, profit: (Number(r.profitFen) || 0) / 100,
      refund: (Number(r.refundAmountFen) || 0) / 100, promo: (Number(r.promoCostFen) || 0) / 100, vis: Number(r.visitors) || 0,
      orders: Number(r.salesCount) || 0, up: Number(r.up) || 0, dn: Number(r.dn) || 0, days: Number(r.days) || 0,
      rr: rawAgg.rr == null ? 0 : Number(rawAgg.rr) * 100, pr: rawAgg.pr == null ? 0 : Number(rawAgg.pr) * 100,
      cv: rawAgg.cv == null ? 0 : Number(rawAgg.cv)
    })
    return {
      ym: String(m.ym ?? ''), covered: Number(m.covered) || 0, total: Number(m.total) || 0,
      missing: Math.max(0, (Number(m.total) || 0) - (Number(m.covered) || 0)),
      agg: conv(rawAgg), last: rawLast ? conv(rawLast) : null, lastDate: m.lastDate == null ? null : String(m.lastDate)
    }
  })

  // 退款窗口 + 明细行
  const refundRows = computed<BpRefundOrder[]>(() => {
    const rows = (d.value?.refundRows ?? []) as Array<Record<string, unknown>>
    return rows.map((r) => ({
      pid: r.productId == null ? null : String(r.productId), title: r.productTitle == null ? null : String(r.productTitle),
      amount: (Number(r.fen) || 0) / 100, bucket: bucketOf(r.afterSaleType, r.goodsStatus),
      reason: r.reason == null ? null : String(r.reason), ot: r.paymentTime == null ? null : String(r.paymentTime),
      pay: r.buyerPayFen == null ? null : (Number(r.buyerPayFen) || 0) / 100, orderNo: String(r.orderNo ?? ''), refundNo: String(r.refundNo ?? ''), fin: r.finishDate == null ? null : String(r.finishDate)
    }))
  })
  const refundWin = computed(() => {
    const r = (d.value?.refund ?? {}) as Record<string, unknown>
    const t = (r.total ?? {}) as Record<string, unknown>
    const wf = (r.wf ?? {}) as Record<string, unknown>
    const jr = (r.jr ?? {}) as Record<string, unknown>
    const rt = (r.rt ?? {}) as Record<string, unknown>
    return {
      total: (Number(t.fen) || 0) / 100, wf: (Number(wf.fen) || 0) / 100, jr: (Number(jr.fen) || 0) / 100, rt: (Number(rt.fen) || 0) / 100,
      wfN: Number(wf.count) || 0, jrN: Number(jr.count) || 0, rtN: Number(rt.count) || 0, list: refundRows.value
    }
  })
  function refundOf(pid: string): BpProductRefund {
    const list = refundRows.value.filter((r) => r.pid === pid)
    const by = (b: BpBucket) => list.filter((r) => r.bucket === b)
    const sum = (arr: BpRefundOrder[]) => arr.reduce((s, r) => s + r.amount, 0)
    return {
      wf: sum(by('wf')), jr: sum(by('jr')), rt: sum(by('rt')), total: sum(by('wf')) + sum(by('jr')) + sum(by('rt')),
      wfN: by('wf').length, jrN: by('jr').length, rtN: by('rt').length, list
    }
  }
  const refundTop = computed(() => {
    const by = ((d.value?.refund as Record<string, unknown> | null)?.byProduct ?? []) as Array<Record<string, unknown>>
    return by.map((r) => ({
      pid: r.productId == null ? '' : String(r.productId), title: r.productTitle == null ? null : String(r.productTitle), total: (Number(r.fen) || 0) / 100
    }))
  })

  // 商品 TOP12
  const products = computed<BpProductRow[]>(() => {
    const rows = (d.value?.product ?? []) as Array<Record<string, unknown>>
    return rows.map((r) => {
      const pid = String(r.productId ?? '')
      const rb = refundOf(pid)
      const refundDays = new Set(rb.list.filter((x) => x.fin).map((x) => x.fin)).size
      return {
        pid, name: r.productName == null ? null : String(r.productName),
        sales: (Number(r.payAmountFen) || 0) / 100, refund: rb.total,
        promo: (Number(r.promoCostFen) || 0) / 100, profit: (Number(r.profitFen) || 0) / 100,
        search: r.visitors == null ? null : Number(r.visitors), consult: Number(r.consultCount) || 0,
        orders: Number(r.salesCount) || 0, days: Number(r.days) || 0, refundDays, status: null
      }
    })
  })
  const productCounts = computed(() => d.value?.productCounts ?? { total: 0, sold: 0 })

  // 推广 TOP12（单日快照按计划）
  const promoTop = computed<BpPromoRow[]>(() => {
    const rows = (d.value?.promoDetail ?? []) as Array<Record<string, unknown>>
    return rows.map((r) => ({
      pid: String(r.adEntityId ?? ''), name: r.adEntityName == null ? null : String(r.adEntityName),
      spend: (Number(r.costFen) || 0) / 100, pay: (Number(r.payAmountFen) || 0) / 100,
      clicks: Number(r.clicks) || 0, impressions: Number(r.impressions) || 0,
      cr: r.ctr == null ? null : Number(r.ctr), orders: Number(r.salesCount) || 0,
      roi: r.roas == null ? null : Number(r.roas), conv: r.payRate == null ? null : Number(r.payRate)
    }))
  })

  // 搜索词 / 咨询
  const keywords = computed(() => {
    const top = ((d.value?.keywords as Record<string, unknown> | null)?.top ?? []) as Array<Record<string, unknown>>
    return top.map((r) => ({
      word: String(r.keyword ?? ''), vis: Number(r.visitors) || 0, buy: Number(r.payBuyerCount) || 0,
      amt: (Number(r.payAmountFen) || 0) / 100, conv: r.payRate == null ? null : Number(r.payRate)
    }))
  })
  const consult = computed(() => {
    const c = d.value?.consult ?? { total: 0, sum: 0, rows: [] }
    const rows = (c.rows ?? []) as Array<Record<string, unknown>>
    return { total: Number(c.total) || 0, sum: Number(c.sum) || 0, rows: rows.map((r) => ({ pid: String(r.productId ?? ''), name: String(r.productName ?? ''), consult: Number(r.consultCount) || 0 })) }
  })

  // DSR
  const dsr = computed<BpDsrMap>(() => {
    const snap = (d.value?.dsr?.snapshot ?? []) as Array<Record<string, unknown>>
    const pick = (kw: string): BpDsrRow => {
      const row = snap.find((s) => String(s.indicator ?? '').includes(kw))
      return {
        indicator: row ? String(row.indicator) : kw,
        score: row && row.score != null ? Number(row.score) : null,
        industryAvg: row && row.industryAvg != null ? Number(row.industryAvg) : null,
        compareText: row && row.compareText != null ? String(row.compareText) : null,
        gapText: row && row.gapText != null ? String(row.gapText) : null
      }
    }
    return { date: d.value?.dsr?.snapshotDate == null ? null : String(d.value?.dsr?.snapshotDate), desc: pick('描述'), service: pick('服务'), logistics: pick('物流') }
  })
  const dsrScore = computed(() => {
    const ds = dsr.value
    const vals = [ds.desc.score, ds.service.score, ds.logistics.score].filter((x): x is number => x != null)
    return vals.length === 3 ? ((vals[0] + vals[1] + vals[2]) / 3).toFixed(2) : '--'
  })

  // 客服：按日期分组（csGroups 为纯函数，任务 4C 起抽出供测试；date 列由 csBlock SQL 提供）
  const cs = computed<CsGroup[]>(() => csGroups(
    (d.value?.cs?.dates ?? []) as string[],
    (d.value?.cs?.staff ?? []) as Array<Record<string, unknown>>
  ))

  // 评语（复用 AI 评语 store，未生成显示等待文案）
  function commentText(module: string): string | null {
    return comments.byModule[module]?.content ?? null
  }
  const commentStamp = computed(() => (comments.items.some((x) => x.content) ? '自动生成' : null))

  // 图片绑定
  const shopId = computed(() => store.shopId)
  function imgUrl(pid: string): string {
    if (shopId.value <= 0) return ''
    const map = images.byShop[shopId.value] ?? {}
    return map[pid]?.url ?? ''
  }

  return {
    d, winDays, winLbl, winStart, winEnd, lastDay, days, prevDays, agg, prevAgg, month,
    refundWin, refundRows, refundOf, refundTop, products, productCounts, promoTop, keywords, consult,
    dsr, dsrScore, cs, commentText, commentStamp, shopId, imgUrl, comments
  }
}

// ---------- 蓝本规则评语（确定性，数字可回溯；正式评语体用 AI comments.byModule） ----------
export function productComment(p: BpProductRow, rb: BpProductRefund, winLbl: string, lastDay: string): string[] {
  const lines: string[] = []
  const rate = p.sales > 0 ? (p.profit / p.sales) * 100 : null
  lines.push(
    `${p.name}（${p.pid}）${winLbl}窗口：退款 ${rb.wfN + rb.jrN + rb.rtN} 笔 / ${bpMoney(rb.total)}（退款单真实分日汇总）；商品报表单日（${bpSlice(lastDay)}）销售额 ${bpMoney(p.sales)}，推广费 ${bpMoney(p.promo)}，利润 ${bpMoney(p.profit)}（利润率 ${rate != null ? rate.toFixed(1) : '--'}%），${p.profit >= 0 ? '单品盈利' : '单品亏损'}。`
  )
  lines.push(`搜索/访客 ${bpNum(p.search)} 人 · 咨询 ${p.consult} 人。`)
  if (rb.wfN + rb.jrN + rb.rtN > 0) {
    lines.push(`退款结构：未发货 ${rb.wfN} 笔 / ${bpMoney(rb.wf)} · 已发货仅退款 ${rb.jrN} 笔 / ${bpMoney(rb.jr)} · 退货退款 ${rb.rtN} 笔 / ${bpMoney(rb.rt)}。`)
  } else {
    lines.push(`${winLbl}窗口无退款记录。`)
  }
  if (p.profit < 0) lines.push(`风险提示：推广费占销售额 ${p.sales ? ((p.promo / p.sales) * 100).toFixed(1) : 0}%，利润为负，建议下调该品推广预算或核查成本。`)
  else if (rate != null && rate < 10) lines.push(`建议：利润率 ${rate.toFixed(1)}% 偏低，关注成本与退款对利润的侵蚀。`)
  else lines.push(`建议：保持当前推广节奏，重点维护评价与主图点击率。`)
  return lines
}

export function promoComment(x: BpPromoRow): string[] {
  const lines: string[] = []
  const roi = x.roi != null ? x.roi : x.spend ? x.pay / x.spend : 0
  lines.push(`${x.name}（${x.pid}）花费 ${bpMoney(x.spend)}，展现 ${bpNum(x.impressions)}，点击 ${bpNum(x.clicks)}，点击率 ${x.cr != null ? bpPct(x.cr * 100) : '--'}，成交 ${bpMoney(x.pay)}（${x.orders} 笔），ROI ${roi.toFixed(1)}。`)
  if (x.roi != null && x.roi < 1) lines.push(`风险：ROI ${x.roi.toFixed(1)} 低于 1，投产亏损，建议暂停或下调出价。`)
  else if (x.roi != null && x.roi < 3) lines.push(`建议：ROI ${x.roi.toFixed(1)} 偏低，优化关键词与人群包后再放量。`)
  else lines.push(`建议：ROI ${roi.toFixed(1)} 表现良好，可适度加大预算。`)
  if (x.conv != null) lines.push(`点击转化率 ${bpPct(x.conv * 100)}，需结合落地页与详情页转化一起评估。`)
  return lines
}

export function refundComment(pid: string, title: string | null, rb: BpProductRefund): string[] {
  const lines: string[] = []
  const tot = rb.wfN + rb.jrN + rb.rtN
  lines.push(`${title}（${pid}）窗口内退款 ${tot} 笔 / ${bpMoney(rb.total)}：未发货（仅退款·未发货）${rb.wfN} 笔 / ${bpMoney(rb.wf)}；已发货仅退款 ${rb.jrN} 笔 / ${bpMoney(rb.jr)}；已发货退货退款 ${rb.rtN} 笔 / ${bpMoney(rb.rt)}。`)
  const big = rb.list.slice().sort((a, b) => b.amount - a.amount)[0]
  if (big) lines.push(`单笔最大退款 ${bpMoney(big.amount)}（${big.fin ?? '--'}，原因：${big.reason || '--'}）。`)
  const reasons: Record<string, number> = {}
  rb.list.forEach((r) => { if (r.reason) reasons[r.reason] = (reasons[r.reason] || 0) + 1 })
  const topR = Object.entries(reasons).sort((a, b) => b[1] - a[1])[0]
  if (topR) lines.push(`高频退款原因：「${topR[0]}」${topR[1]} 笔，建议从详情页描述与品控入手优化。`)
  if (tot > 0 && rb.rtN / tot > 0.4) lines.push(`风险：退货退款占比 ${((rb.rtN / tot) * 100).toFixed(0)}%，商品体验或物流问题突出，建议核查。`)
  return lines
}

export function summaryTexts(a: BpAgg, p: BpAgg, winDays: number): { short: string; weakness: string; note: string } {
  const mom = a.pay - p.pay
  const momPct = p.pay ? (mom / p.pay) * 100 : 0
  const netMom = a.net - p.net
  const pnl = a.profit >= 0 ? '盈利' : '亏损'
  const short = `近${a.days}天流水 ${bpMoney(a.pay)}（环比${momPct >= 0 ? '↑' : '↓'} ${Math.abs(momPct).toFixed(1)}% · ${mom >= 0 ? '+' : ''}${bpMoney(mom)}），净销 ${bpMoney(a.net)}${netMom >= 0 ? '（环比↑' : '（环比↓'}${bpMoney(Math.abs(netMom))}），退款率 ${a.rr.toFixed(1)}%，${a.pr >= 0 ? '利润率' + a.pr.toFixed(1) + '%' : '整体亏损 ' + bpMoney(Math.abs(a.profit))}。`
  const weakness = `主要风险：退款率 ${a.rr.toFixed(1)}%${a.rr > 25 ? '（高于警戒线 25%）' : ''}；${a.dn} 个亏损日 / 共 ${a.days} 天；利润 ${pnl} ${bpMoney(Math.abs(a.profit))}。`
  const note = `评语基于当前「${winDays === 1 ? '昨日' : '近' + winDays + '天'}」窗口真实聚合数据生成（窗口实时数值以 02 聚合为准）`
  return { short, weakness, note }
}

// ---------- 09 建议动作（蓝本规则） ----------
export interface BpAction { k: string; c: string; t: string; d: string }
export function bpActions(opts: {
  a: BpAgg; promoTop: BpPromoRow[]; dsr: BpDsrMap; keywords: Array<{ word: string; vis: number; buy: number }>
}): BpAction[] {
  const { a, promoTop, dsr, keywords } = opts
  const out: BpAction[] = []
  if (a.rr > 25) out.push({ k: 'P0', c: 'red', t: '退款率 ' + a.rr.toFixed(1) + '% 高于警戒线', d: `近${a.days}天退款 ${bpMoney(a.refund)}，优先排查高频退款原因与售后履约，目标压回 20% 以内。` })
  if (a.dn > a.up) out.push({ k: 'P0', c: 'red', t: '亏损日多于盈利日', d: `${a.dn} 天亏损 / ${a.up} 天盈利，需复盘推广效率与费用结构，暂停亏损单品投放。` })
  const badPromo = promoTop.filter((x) => x.roi != null && x.roi < 1)
  if (badPromo.length) out.push({ k: 'P1', c: 'amber', t: badPromo.length + ' 个推广计划 ROI 低于 1', d: badPromo.slice(0, 3).map((x) => String(x.name ?? '').slice(0, 10) + '…').join('、') + ' 投产亏损，建议立即下调出价或暂停。' })
  if (a.rr > 20 && a.rr <= 25) out.push({ k: 'P1', c: 'amber', t: '退款率处于中位', d: '当前 ' + a.rr.toFixed(1) + '%，关注高频退款原因，优化详情页预期管理。' })
  const weak: Array<{ label: string; row: BpDsrRow }> = [
    { label: '描述相符', row: dsr.desc },
    { label: '服务态度', row: dsr.service },
    { label: '物流质量', row: dsr.logistics }
  ].filter((x) => x.row.industryAvg != null && x.row.score != null && x.row.score < x.row.industryAvg)
  if (weak.length) out.push({ k: 'P1', c: 'amber', t: 'DSR 低于行业', d: weak.map((x) => x.label + ' ' + (x.row.score as number).toFixed(2) + ' vs 行业 ' + (x.row.industryAvg as number).toFixed(2)).join('；') + '，按目标补齐 5 分评价订单。' })
  const lowKw = keywords.filter((x) => x.vis >= 5 && x.buy === 0)
  if (lowKw.length) out.push({ k: 'P2', c: 'green', t: lowKw.length + ' 个高流量词无成交', d: lowKw.map((x) => x.word).join('、') + ' 访客较多但无转化，检查标题匹配与价格竞争力。' })
  const goodPromo = promoTop.filter((x) => x.roi != null && x.roi >= 3)
  if (goodPromo.length) out.push({ k: 'P2', c: 'green', t: goodPromo.length + ' 个计划 ROI 表现良好', d: goodPromo.slice(0, 3).map((x) => String(x.name ?? '').slice(0, 10) + '…').join('、') + ' ROI ' + goodPromo[0].roi?.toFixed(1) + '，可持续放量并复制打法。' })
  out.push({ k: 'P2', c: 'green', t: '建立数据日报机制', d: '按昨日/近7/15/30天窗口持续跟踪流水、退款率与 ROI，异常即复盘。' })
  return out
}
