<template>
  <div>
    <div class="insight" id="promo-banner">
      <strong><span v-html="BP_ICONS.pin"></span> 推广总览：</strong><span class="mono">花费 {{ bpMoney(banner.spend) }}</span> · 成交 <span class="mono">{{ bpMoney(banner.pay) }}</span> · 净ROI <span class="mono">{{ banner.spend ? (banner.pay / banner.spend).toFixed(1) : '--' }}</span><span class="ghost" style="margin-left:8px;">（单日快照 {{ bp.lastDay.value }} · 含零成交计划 · 明细仅列有花费计划 TOP{{ bp.promoTop.value.length }}）</span>
    </div>
    <div class="promo-list" id="promo-list">
      <div v-for="x in bp.promoTop.value" :key="x.pid" class="promo-item2" :class="{ open: openPromo.has(x.pid) }" :data-pid="x.pid">
        <button class="promo-head2" @click="toggle(x.pid)">
          <span class="promo-name2">{{ x.name }} <span class="ghost">[{{ x.pid }}]</span></span>
          <span class="promo-stats2 mono">花费 {{ bpMoney(x.spend) }} | 成交 {{ bpMoney(x.pay) }} | 净ROI {{ x.roi != null ? x.roi.toFixed(1) : '--' }}</span>
          <span class="fold-arrow" v-html="openPromo.has(x.pid) ? BP_ICONS.chevronDown : BP_ICONS.chevronRight"></span>
        </button>
        <div class="promo-body2">
          <div class="promo-body2-inner">
            <div class="kpi-report" style="margin-top:14px;">
              <div class="kpi-report-head"><span v-html="BP_ICONS.pin"></span> 推广分析</div>
              <div class="kpi-report-body">{{ itemComment(x) }}</div>
            </div>
            <table class="promo-detail2" style="margin-top:12px;">
              <thead><tr><th>日期</th><th>花费</th><th>点击</th><th>展现</th><th>点击率</th><th>成交金额</th><th>成交笔数</th><th>净ROI</th><th>转化</th></tr></thead>
              <tbody>
                <tr>
                  <td class="mono">{{ bp.lastDay.value }}</td>
                  <td class="mono num">{{ bpMoney(x.spend) }}</td>
                  <td class="mono num">{{ bpNum(x.clicks) }}</td>
                  <td class="mono num">{{ bpNum(x.impressions) }}</td>
                  <td class="num">{{ x.cr != null ? bpPct(x.cr * 100, 2) : '--' }}</td>
                  <td class="mono num">{{ bpMoney(x.pay) }}</td>
                  <td class="mono num">{{ bpNum(x.orders) }}</td>
                  <td class="mono num" :class="x.roi != null && x.roi < 1 ? 'bear' : ''">{{ x.roi != null ? x.roi.toFixed(1) : '--' }}</td>
                  <td class="num">{{ x.conv != null ? bpPct(x.conv * 100, 2) : '--' }}</td>
                </tr>
              </tbody>
            </table>
            <div class="pd-note" style="margin-top:8px;">推广明细数据源为 {{ bp.lastDay.value }} 单日（商品报表）：花费/点击/展现/点击率/成交金额/成交笔数/转化=直接成交口径；净ROI=直接成交金额÷花费；店铺级分日推广花费见 02/03 模块聚合。</div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, reactive } from 'vue'
import { useBpData, promoComment, bpMoney, bpNum, bpPct } from './bp-utils'
import { BP_ICONS } from './BpIcons'

const bp = useBpData()
const openPromo = reactive(new Set<string>())
const banner = computed(() => {
  const top = bp.promoTop.value
  let spend = 0, pay = 0
  top.forEach((x) => { spend += x.spend; pay += x.pay })
  return { spend, pay }
})
function toggle(pid: string): void {
  openPromo.has(pid) ? openPromo.delete(pid) : openPromo.add(pid)
}
function itemComment(x: { pid: string; name: string | null; spend: number; pay: number; clicks: number; impressions: number; cr: number | null; orders: number; roi: number | null; conv: number | null }): string {
  return promoComment(x).map((t) => '· ' + t).join('\n')
}
</script>
