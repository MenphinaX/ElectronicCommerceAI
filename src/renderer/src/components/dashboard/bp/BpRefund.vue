<template>
  <div>
    <div class="insight" id="refund-banner">
      <strong><span v-html="BP_ICONS.pin"></span> 三档退款：</strong><span class="mono">合计 {{ bpMoney(rw.total) }}</span> · 未发货 <span class="mono bull">{{ bpMoney(rw.wf) }}</span> · 已发货仅退款 <span class="mono">{{ bpMoney(rw.jr) }}</span> · 已发货退货退款 <span class="mono bear">{{ bpMoney(rw.rt) }}</span><span class="ghost" style="margin-left:8px;">（窗口 {{ bp.winStart.value.slice(5) }} ~ {{ bp.winEnd.value.slice(5) }} · {{ rw.list.length }} 笔完结）</span>
    </div>
    <div class="prod-cards" id="refund-cards">
      <div v-for="p in top" :key="p.pid" class="prod-card" :class="{ 'refund-open': openRefunds.has(p.pid) }" :data-pid="p.pid" data-refund="1">
        <div class="fold-wrap" @click="toggle(p.pid)">
          <BpImage :product-id="p.pid" :size="64" />
          <div class="pinfo">
            <div class="pname">{{ p.title }}</div>
            <div class="pid">[{{ p.pid }}] · 合计 <span class="mono">{{ bpMoney(rbOf(p.pid).total) }}</span></div>
            <div class="refund3">
              <span class="r3 r3-wf"><span class="rn">{{ rbOf(p.pid).wfN }}笔/{{ bpMoney(rbOf(p.pid).wf) }}</span>未发货</span>
              <span class="r3 r3-jr"><span class="rn">{{ rbOf(p.pid).jrN }}笔/{{ bpMoney(rbOf(p.pid).jr) }}</span>已发货仅退款</span>
              <span class="r3 r3-rt"><span class="rn">{{ rbOf(p.pid).rtN }}笔/{{ bpMoney(rbOf(p.pid).rt) }}</span>已发货退货退款</span>
            </div>
          </div>
          <span class="ghost" style="font-size:11.5px;display:flex;align-items:center;gap:5px;"><span v-html="openRefunds.has(p.pid) ? BP_ICONS.chevronDown : BP_ICONS.chevronRight"></span> {{ openRefunds.has(p.pid) ? '收起' : '展开订单' }}</span>
        </div>
        <div class="refund-detail">
          <div class="refund-detail-inner">
            <div class="refund-tabs">
              <button v-for="(t, ti) in tabsOf(p.pid)" :key="t.key" :class="{ active: refundTabs[p.pid] === ti }" @click="refundTabs[p.pid] = ti">{{ t.label }} ({{ t.n }})</button>
            </div>
            <div class="refund-orders-wrap">
              <table class="refund-orders">
                <thead><tr><th>退款时间</th><th>下单时间</th><th>订单号</th><th>金额</th><th class="refund-reason">退款原因</th></tr></thead>
                <tbody>
                  <tr v-for="o in ordersOf(p.pid)" :key="o.refundNo || o.orderNo + '|' + (o.fin ?? '')">
                    <td class="mono">{{ o.d }}</td><td class="mono">{{ o.ot || '--' }}</td><td class="mono">{{ o.orderNo }}</td>
                    <td class="mono num">{{ bpMoney(o.amount) }}</td><td class="refund-reason">{{ o.reason || '--' }}</td>
                  </tr>
                  <tr v-if="!ordersOf(p.pid).length"><td colspan="5" style="text-align:center;color:var(--text3);padding:18px;">该档窗口内暂无订单</td></tr>
                </tbody>
              </table>
            </div>
            <div class="pd-head" style="margin-top:14px;"><span v-html="BP_ICONS.pin"></span> 退款分析</div>
            <div class="kpi-report" style="margin-top:0;">
              <div class="kpi-report-head"><span v-html="BP_ICONS.chart"></span> 退款分析评语</div>
              <div class="kpi-report-body">{{ itemComment(p) }}</div>
            </div>
          </div>
        </div>
      </div>
    </div>
    <div class="ghost" style="font-size:11px;margin-top:6px;">口径：未发货 = 仅退款 · 未发货；已发货仅退款 = 仅退款 · 非未发货；已发货退货退款 = 退货退款（与 BI 一致）。金额为窗口内退款完结金额。</div>
  </div>
</template>

<script setup lang="ts">
import { computed, reactive } from 'vue'
import { useBpData, refundComment, bpMoney } from './bp-utils'
import { BP_ICONS } from './BpIcons'
import BpImage from './BpImage.vue'

const bp = useBpData()
const rw = computed(() => bp.refundWin.value)
const top = computed(() => bp.refundTop.value)
const openRefunds = reactive(new Set<string>())
const refundTabs = reactive<Record<string, number>>({})

function toggle(pid: string): void {
  openRefunds.has(pid) ? openRefunds.delete(pid) : openRefunds.add(pid)
}
function rbOf(pid: string) {
  return bp.refundOf(pid)
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
  const rb = rbOf(pid)
  const tab = tabsOf(pid)[refundTabs[pid] ?? 0]
  return rb.list
    .filter((r) => r.bucket === tab?.key)
    .sort((a, b) => String(b.fin ?? '').localeCompare(String(a.fin ?? '')))
    .slice(0, 60)
    .map((r) => ({ ...r, d: r.fin ?? '' }))
}
function itemComment(p: { pid: string; title: string | null }): string {
  return refundComment(p.pid, p.title, rbOf(p.pid)).map((x) => '· ' + x).join('\n')
}
</script>
