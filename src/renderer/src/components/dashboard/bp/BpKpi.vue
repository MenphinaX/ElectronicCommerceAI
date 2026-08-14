<template>
  <div>
    <div class="kpi-block" id="kpi-block">
      <p class="section-kicker">01 / KPI</p>
      <div class="kpi-row-title"><span v-html="BP_ICONS.calendar"></span> 当月汇总（{{ m.ym }} · 实际覆盖 {{ m.covered }}/{{ m.total }} 天 · 缺 {{ m.missing }} 天）</div>
      <div class="cards">
        <div class="kpi"><div class="label">当月流水</div><div class="value">{{ bpMoney(m.agg.pay) }}</div><div class="delta ghost">{{ m.agg.days }} 天合计</div></div>
        <div class="kpi"><div class="label">当月净销售额</div><div class="value bull">{{ bpMoney(m.agg.net) }}</div><div class="delta ghost">占流水 {{ m.agg.pay ? Math.round((m.agg.net / m.agg.pay) * 100) : 0 }}%</div></div>
        <div class="kpi"><div class="label">当月净利润</div><div class="value" :class="m.agg.profit >= 0 ? 'bull' : 'warn'">{{ bpMoney(m.agg.profit) }}</div><div class="delta ghost">利润率 {{ m.agg.pay ? (m.agg.profit / m.agg.pay * 100).toFixed(2) : 0 }}%</div></div>
        <div class="kpi"><div class="label">当月退款+退货</div><div class="value bear">{{ bpMoney(m.agg.refund) }}</div><div class="delta ghost">占流水 {{ m.agg.pay ? Math.round((m.agg.refund / m.agg.pay) * 100) : 0 }}%</div></div>
        <div class="kpi"><div class="label">当月访客 / 订单</div><div class="value">{{ bpNum(m.agg.vis) }} / {{ bpNum(m.agg.orders) }}</div><div class="delta ghost">支付转化率 {{ m.agg.cv.toFixed(1) }}%</div></div>
        <div class="kpi"><div class="label">当月盈亏天数</div><div class="value" :class="m.agg.up >= m.agg.dn ? 'bull' : 'warn'">{{ m.agg.up }} 盈 / {{ m.agg.dn }} 亏</div><div class="delta ghost">亏损日占比 {{ m.agg.days ? Math.round((m.agg.dn / m.agg.days) * 100) : 0 }}%</div></div>
      </div>
      <p class="section-kicker">02 / KPI</p>
      <div class="kpi-row-title" style="margin-top:20px;"><span v-html="BP_ICONS.calendarDays"></span> 最近一天数据（{{ m.lastDate ?? '--' }}）</div>
      <div class="cards kpi-today-row">
        <div class="kpi kpi-today"><div class="label">当日流水</div><div class="value">{{ last ? bpMoney(last.pay) : '--' }}</div><div class="delta ghost">单日流水</div></div>
        <div class="kpi kpi-today"><div class="label">当日净销售额</div><div class="value bull">{{ last ? bpMoney(last.net) : '--' }}</div><div class="delta ghost">占流水 {{ last && last.pay ? Math.round((last.net / last.pay) * 100) : 0 }}%</div></div>
        <div class="kpi kpi-today"><div class="label">当日净利润</div><div class="value" :class="last && last.profit >= 0 ? 'bull' : 'warn'">{{ last ? bpMoney(last.profit) : '--' }}</div><div class="delta ghost">单日利润</div></div>
        <div class="kpi kpi-today"><div class="label">当日退款+退货</div><div class="value bear">{{ last ? bpMoney(last.refund) : '--' }}</div><div class="delta ghost">占流水 {{ last && last.pay ? Math.round((last.refund / last.pay) * 100) : 0 }}%</div></div>
        <div class="kpi kpi-today"><div class="label">当日访客 / 订单</div><div class="value">{{ last ? bpNum(last.vis) + ' / ' + bpNum(last.orders) : '--' }}</div><div class="delta ghost">支付转化率 {{ last && last.vis ? (last.orders / last.vis * 100).toFixed(1) : '--' }}%</div></div>
        <div class="kpi kpi-today"><div class="label">当日盈亏</div><div class="value" :class="last && last.profit >= 0 ? 'bull' : 'warn'">{{ last ? (last.profit >= 0 ? '盈利' : '亏损') : '--' }}</div><div class="delta ghost">{{ last ? (last.profit >= 0 ? '当日为正' : '当日为负') : '' }}</div></div>
      </div>
    </div>
    <div class="kpi-report" id="kpi-report">
      <div class="kpi-report-head"><span v-html="BP_ICONS.chart"></span> 核心指标分析报告<template v-if="stamp"><span class="ghost" style="font-weight:500;font-size:11px;margin-left:6px;">（{{ stamp }}）</span></template></div>
      <div class="kpi-report-body">{{ comment }}</div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useBpData, bpMoney, bpNum } from './bp-utils'
import { BP_ICONS } from './BpIcons'

const bp = useBpData()
const m = computed(() => bp.month.value)
const last = computed(() => m.value.last)
const stamp = computed(() => (bp.comments.items.some((x) => x.content) ? 'AI 自动生成' : null))
const comment = computed(() => {
  const t = bp.commentText('指标')
  return t ? t.split('\n').map((x) => '· ' + x).join('\n') : '等待生成评语（窗口切换/数据导入后自动生成）'
})
</script>
