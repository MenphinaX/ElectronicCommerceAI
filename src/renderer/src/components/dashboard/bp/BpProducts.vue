<template>
  <div>
    <div class="prod-cards" id="prod-root">
      <div v-for="(p, i) in prods" :key="p.pid" class="prod-card" :class="{ open: openProds.has(p.pid) }" :data-pid="p.pid">
        <div class="fold-wrap" @click="toggle('prod', p.pid)">
          <BpImage :product-id="p.pid" :size="76" />
          <div class="pinfo">
            <div class="pname">{{ p.name }}</div>
            <div class="pid">[{{ p.pid }}] · 状态：{{ p.status || '--' }} · <span class="ghost">{{ winLbl }}汇总 {{ bp.winStart.value.slice(5) }}~{{ bp.winEnd.value.slice(5) }}</span></div>
            <div class="pstats">
              <span class="ps-core"><span class="st">销售额</span><span class="sv">{{ bpMoney(p.sales) }}</span></span>
              <span class="ps-core"><span class="st">退款金额</span><span class="sv bear">{{ bpMoney(p.refund) }}</span></span>
              <span class="ps-core"><span class="st">推广费</span><span class="sv">{{ bpMoney(p.promo) }}</span></span>
              <span class="ps-core"><span class="st">利润</span><span class="sv" :class="p.profit >= 0 ? 'bull' : 'bear'">{{ p.profit >= 0 ? '+' : '' }}{{ bpNum(p.profit) }}</span></span>
              <span class="ps-core"><span class="st">搜索人数</span><span class="sv">{{ bpNum(p.search) }}</span></span>
              <span class="ps-core"><span class="st">咨询人数</span><span class="sv">{{ bpNum(p.consult) }}</span></span>
            </div>
          </div>
          <span class="rank">TOP{{ i + 1 }}</span>
          <span class="fold-arrow" v-html="openProds.has(p.pid) ? BP_ICONS.chevronDown : BP_ICONS.chevronRight"></span>
        </div>
        <div class="prod-detail">
          <div class="pd-inner">
            <div class="pd-split">
              <div class="pd-left">
                <div class="pd-figure">
                  <BpImage :product-id="p.pid" :size="150" />
                  <div class="pd-info">
                    <div class="pd-pname">{{ p.name }}</div>
                    <div class="pid" style="font-size:11px;margin-top:3px;">[{{ p.pid }}]</div>
                    <div class="pd-stats-wrap">
                      <div class="pd-st"><span>销售额 <i class="ghost">{{ winLbl }}</i></span><b>{{ bpMoney(p.sales) }}</b></div>
                      <div class="pd-st"><span>退款金额 <i class="ghost">{{ winLbl }}</i></span><b class="bear">{{ bpMoney(p.refund) }}</b></div>
                      <div class="pd-st"><span>利润 <i class="ghost">{{ winLbl }}</i></span><b :class="p.profit >= 0 ? 'bull' : 'bear'">{{ p.profit >= 0 ? '+' : '' }}{{ bpNum(p.profit) }}</b></div>
                      <div class="pd-st"><span>推广费 <i class="ghost">{{ winLbl }}</i></span><b>{{ bpMoney(p.promo) }}</b></div>
                      <div class="pd-st"><span>搜索人数 <i class="ghost">{{ winLbl }}</i></span><b>{{ bpNum(p.search) }}</b></div>
                      <div class="pd-st"><span>咨询人数 <i class="ghost">{{ winLbl }}</i></span><b>{{ bpNum(p.consult) }}</b></div>
                    </div>
                    <div class="pd-note">窗口 {{ winLbl }}（{{ bp.winStart.value.slice(5) }}~{{ bp.winEnd.value.slice(5) }}）：退款金额=商品报表成功退款金额窗口相加；推广费=商品报表同主体花费窗口相加；销售额/利润/搜索/咨询优先商品日报按日真实，缺日回落当日快照。</div>
                    <div class="pd-note">主图已绑定商品 ID {{ p.pid }}：正式版上传后全看板复用，无需重复添加。点击占位可上传本地主图。</div>
                  </div>
                </div>
                <p class="section-kicker">单品分析</p>
                <div class="pd-head"><span v-html="BP_ICONS.pin"></span> 单品分析</div>
                <div class="kpi-report" style="margin-top:0;">
                  <div class="kpi-report-head"><span v-html="BP_ICONS.chart"></span> 商品分析评语</div>
                  <div class="kpi-report-body">{{ itemComment(p) }}</div>
                </div>
              </div>
              <div class="pd-right">
                <div class="pd-head"><span v-html="BP_ICONS.chart"></span> 每日数据 <span class="ghost" style="font-size:11px;font-weight:500;">[{{ winLbl }} {{ bp.winStart.value.slice(5) }}~{{ bp.winEnd.value.slice(5) }} · 商品报表口径]</span></div>
                <table class="pd-table">
                  <thead><tr><th>日期</th><th class="num">销售额</th><th class="num">退款金额</th><th class="num">推广费</th><th class="num">利润</th><th class="num">搜索人数</th><th class="num">咨询人数</th></tr></thead>
                  <tbody>
                    <tr v-for="r in dailyRows(p.pid)" :key="r.d">
                      <td class="mono">{{ r.d.slice(5) }}</td>
                      <td class="mono num" :class="r.sales == null ? 'na' : ''">{{ r.sales != null ? bpMoney(r.sales) : '—' }}</td>
                      <td class="mono num" :class="r.refund == null ? 'na' : (r.refund > 0 ? 'bear' : 'ghost')">{{ r.refund != null ? (r.refund ? bpMoney(r.refund) : '¥0') : '—' }}</td>
                      <td class="mono num" :class="r.promo == null ? 'na' : ''">{{ r.promo != null ? bpMoney(r.promo) : '—' }}</td>
                      <td class="mono num" :class="r.profit != null ? (r.profit >= 0 ? 'bull' : 'bear') : 'na'">{{ r.profit != null ? (r.profit >= 0 ? '+' : '') + bpNum(r.profit) : '—' }}</td>
                      <td class="mono num" :class="r.search == null ? 'na' : ''">{{ r.search != null ? bpNum(r.search) : '—' }}</td>
                      <td class="mono num" :class="r.consult == null ? 'na' : ''">{{ r.consult != null ? bpNum(r.consult) : '—' }}</td>
                    </tr>
                  </tbody>
                </table>
                <div class="pd-note">销售额/利润/搜索/咨询优先商品日报按日真实；退款金额=商品报表成功退款金额按日真实（无行回落快照/—）；推广费=商品报表同主体花费按日相加（无推广行回落快照/—）。</div>
                <div class="pd-head"><span v-html="BP_ICONS.pin"></span> 单品退款拆解 <span class="ghost" style="font-size:11px;font-weight:500;">[窗口 {{ bp.winStart.value.slice(5) }} ~ {{ bp.winEnd.value.slice(5) }} · {{ rbOf(p.pid).totalN }} 笔]</span></div>
                <div class="refund-bars">
                  <div class="rb-row"><span class="rb-label">未发货</span><div class="rb-track"><div class="rb-fill wf" :style="{ width: barW(rbOf(p.pid).wf, rbOf(p.pid).max) }"></div></div><span class="rb-val">{{ rbOf(p.pid).wfN }}笔/{{ bpMoney(rbOf(p.pid).wf) }}</span></div>
                  <div class="rb-row"><span class="rb-label">已发货仅退款</span><div class="rb-track"><div class="rb-fill jr" :style="{ width: barW(rbOf(p.pid).jr, rbOf(p.pid).max) }"></div></div><span class="rb-val">{{ rbOf(p.pid).jrN }}笔/{{ bpMoney(rbOf(p.pid).jr) }}</span></div>
                  <div class="rb-row"><span class="rb-label">退货退款</span><div class="rb-track"><div class="rb-fill rt" :style="{ width: barW(rbOf(p.pid).rt, rbOf(p.pid).max) }"></div></div><span class="rb-val">{{ rbOf(p.pid).rtN }}笔/{{ bpMoney(rbOf(p.pid).rt) }}</span></div>
                </div>
                <button class="prod-orders-toggle" @click="toggleOrders(p.pid)">
                  <span v-html="openProdOrders.has(p.pid) ? BP_ICONS.chevronDown : BP_ICONS.chevronRight"></span> 退款订单明细（{{ rbOf(p.pid).totalN }} 笔）<span class="ghost" style="font-weight:500;margin-left:auto;">{{ openProdOrders.has(p.pid) ? '点击收起' : '点击展开' }}</span>
                </button>
                <div class="prod-orders-body" :class="{ open: openProdOrders.has(p.pid) }">
                  <div class="refund-tabs">
                    <button v-for="(t, ti) in tabsOf(p.pid)" :key="t.key" :class="{ active: prodRefundTabs[p.pid] === ti }" @click="prodRefundTabs[p.pid] = ti">{{ t.label }} ({{ t.n }})</button>
                  </div>
                  <div class="refund-orders-wrap">
                    <table class="refund-orders">
                      <thead><tr><th>退款时间</th><th>下单时间</th><th>订单号</th><th>订单金额</th><th>退款金额</th><th class="refund-reason">退款原因</th></tr></thead>
                      <tbody>
                        <tr v-for="o in ordersOf(p.pid)" :key="o.refundNo || o.orderNo + '|' + (o.fin ?? '')">
                          <td class="mono">{{ o.fin || o.d || '--' }}</td><td class="mono">{{ o.ot || '--' }}</td><td class="mono">{{ o.orderNo }}</td>
                          <td class="mono num">{{ o.pay != null ? bpMoney(o.pay) : '--' }}</td><td class="mono num bear">{{ bpMoney(o.amount) }}</td><td class="refund-reason">{{ o.reason || '--' }}</td>
                        </tr>
                        <tr v-if="!ordersOf(p.pid).length"><td colspan="6" style="text-align:center;color:var(--text3);padding:18px;">该档窗口内暂无订单</td></tr>
                      </tbody>
                    </table>
                  </div>
                  <div class="pd-note">退款时间=退款完结时间；订单金额=买家实际支付金额；明细随所选 昨日/7/15/30 天窗口实时过滤。</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, reactive, watch } from 'vue'
import { useBpData, productComment, buildProductDailyRows, bpMoney, bpNum, type BpProductRow, type BpProductDailyRowInput } from './bp-utils'
import { BP_ICONS } from './BpIcons'
import BpImage from './BpImage.vue'

const bp = useBpData()
const winLbl = computed(() => bp.winLbl.value)
const openProds = reactive(new Set<string>())
const openProdOrders = reactive(new Set<string>())
const prodRefundTabs = reactive<Record<string, number>>({})

// 4S：窗口内每商品 product_daily 按日真实数据（一次 IPC 查该商品全部日期，免逐日 N+1）
const productDaily = reactive<Record<string, Array<Record<string, unknown>>>>({})
async function loadProductDaily(): Promise<void> {
  const list = bp.products.value
  const from = bp.winStart.value
  const to = bp.winEnd.value
  if (!list.length || !from || !to) return
  for (const p of list) {
    try {
      const d = (await window.api.dashboard.productDetail({ shopId: bp.shopId.value, productId: p.pid, from, to })) as { series?: Array<Record<string, unknown>> }
      productDaily[p.pid] = d.series ?? []
    } catch {
      productDaily[p.pid] = []
    }
  }
}
// 4U：窗口内批量拉各商品 promo_daily 按日 SUM(cost_fen)（推广费口径=商品报表同主体花费相加）
const promoDaily = reactive<Record<string, Array<{ date: string; costFen: number }>>>({})
async function loadPromoDaily(): Promise<void> {
  const list = bp.products.value
  const from = bp.winStart.value
  const to = bp.winEnd.value
  if (!list.length || !from || !to) return
  try {
    const map = (await window.api.dashboard.promoDailyByProducts({ shopId: bp.shopId.value, productIds: list.map((x) => x.pid), from, to })) as Record<string, Array<{ date: string; costFen: number }>>
    for (const p of list) promoDaily[p.pid] = map[p.pid] ?? []
  } catch {
    for (const p of list) promoDaily[p.pid] = []
  }
}
watch(
  () => [bp.winStart.value, bp.winEnd.value, bp.products.value.map((x) => x.pid).join(',')],
  () => { void loadProductDaily(); void loadPromoDaily() },
  { immediate: true }
)
// 卡片统计：退款=product_daily 窗口 SUM（bp.products 已按成功退款金额）；推广费=promo_daily 同主体窗口 SUM
const prods = computed(() => {
  const winPromo: Record<string, number> = {}
  for (const [pid, rows] of Object.entries(promoDaily)) {
    winPromo[pid] = rows.reduce((s, r) => s + (Number(r.costFen) || 0), 0) / 100
  }
  return bp.products.value.map((p) => ({ ...p, promo: winPromo[p.pid] ?? 0 }))
})

function toggle(kind: 'prod' | 'refund', pid: string): void {
  if (kind === 'prod') openProds.has(pid) ? openProds.delete(pid) : openProds.add(pid)
}
function toggleOrders(pid: string): void {
  openProdOrders.has(pid) ? openProdOrders.delete(pid) : openProdOrders.add(pid)
}
function rbOf(pid: string) {
  const rb = bp.refundOf(pid)
  return {
    wf: rb.wf, jr: rb.jr, rt: rb.rt, wfN: rb.wfN, jrN: rb.jrN, rtN: rb.rtN,
    max: Math.max(rb.wf, rb.jr, rb.rt, 1),
    totalN: rb.wfN + rb.jrN + rb.rtN,
    days: bp.days.value.length,
    refundDays: new Set(rb.list.filter((x) => x.fin).map((x) => x.fin)).size
  }
}
function barW(v: number, max: number): string {
  return (max > 0 ? (v / max) * 100 : 0).toFixed(1) + '%'
}
function tabsOf(pid: string): Array<{ key: string; label: string; n: number }> {
  const rb = rbOf(pid)
  return [
    { key: 'wf', label: '未发货', n: rb.wfN },
    { key: 'jr', label: '已发货仅退款', n: rb.jrN },
    { key: 'rt', label: '已发货退货退款', n: rb.rtN }
  ]
}
function ordersOf(pid: string) {
  const rb = bp.refundOf(pid)
  const tab = tabsOf(pid)[prodRefundTabs[pid] ?? 0]
  return rb.list
    .filter((r) => r.bucket === tab?.key)
    .sort((a, b) => (String(b.fin ?? '').localeCompare(String(a.fin ?? ''))))
    .slice(0, 80)
    .map((r) => ({ ...r, d: r.fin ?? '' }))
}
function dailyRows(pid: string) {
  const p = bp.products.value.find((x) => x.pid === pid)
  const promoByDay: Record<string, number> = {}
  for (const row of promoDaily[pid] ?? []) promoByDay[String(row.date)] = (Number(row.costFen) || 0) / 100
  const snapshot = p ? { d: bp.lastDay.value, sales: p.sales, refund: p.refund, promo: prods.value.find((x) => x.pid === pid)?.promo ?? p.promo, profit: p.profit, search: p.search, consult: p.consult } : null
  return buildProductDailyRows(bp.days.value, (productDaily[pid] ?? []) as unknown as BpProductDailyRowInput[], snapshot, promoByDay)
}
function itemComment(p: BpProductRow): string {
  const lines = productComment(p, bp.refundOf(p.pid), winLbl.value, bp.lastDay.value)
  return lines.map((x) => '· ' + x).join('\n')
}
</script>
