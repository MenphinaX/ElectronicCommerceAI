<!-- 经营趋势区块（任务 4）：折线图 + 每日明细表，点某天 → 下钻当天明细 -->
<script setup lang="ts">
import { computed } from 'vue'
import type { EChartsOption, ECElementEvent } from 'echarts'
import EChart from './EChart.vue'
import AppIcon from '../AppIcon.vue'
import { useDashboardStore } from '../../stores/dashboard'
import { md, num, pct, yuan, yuanShort } from '../../utils/format'

const emit = defineEmits<{ (e: 'open-day', date: string): void }>()
const store = useDashboardStore()

const kpi = computed(() => store.data?.kpi as Record<string, unknown> | null | undefined)
const trend = computed(() => ((kpi.value?.trend ?? []) as Array<Record<string, unknown>>))

const chartOptions = computed<EChartsOption>(() => {
  const dates = trend.value.map((p) => md(String(p.date)))
  return {
    backgroundColor: 'transparent',
    tooltip: { trigger: 'axis' },
    legend: { data: ['支付金额', '净销售额', '利润'], textStyle: { color: '#b3b3b3' }, top: 0 },
    grid: { left: 10, right: 10, top: 34, bottom: 4, containLabel: true },
    xAxis: {
      type: 'category',
      data: dates,
      axisLine: { lineStyle: { color: 'rgba(255,255,255,0.15)' } },
      axisLabel: { color: '#7d7d7d', fontSize: 11 }
    },
    yAxis: {
      type: 'value',
      axisLabel: { color: '#7d7d7d', fontSize: 11, formatter: (v: number) => yuanShort(v * 100) },
      splitLine: { lineStyle: { color: 'rgba(255,255,255,0.06)' } }
    },
    series: [
      { name: '支付金额', type: 'bar', barMaxWidth: 26, data: trend.value.map((p) => Number(p.payAmountFen) / 100), itemStyle: { color: '#1db954', borderRadius: [4, 4, 0, 0] } },
      { name: '净销售额', type: 'bar', barMaxWidth: 26, data: trend.value.map((p) => Number(p.netSalesFen) / 100), itemStyle: { color: 'rgba(29,185,84,0.35)', borderRadius: [4, 4, 0, 0] } },
      { name: '利润', type: 'line', smooth: true, symbolSize: 6, data: trend.value.map((p) => Number(p.profitFen) / 100), lineStyle: { color: '#f5a623' }, itemStyle: { color: '#f5a623' } }
    ]
  }
})

function onChartClick(params: ECElementEvent): void {
  const idx = params.dataIndex
  if (typeof idx !== 'number') return
  const p = trend.value[idx]
  if (p) emit('open-day', String(p.date))
}
</script>

<template>
  <div class="trend-wrap">
    <EChart :options="chartOptions" :height="280" :on-click="onChartClick" />
    <div class="trend-tip">
      <AppIcon name="pin" :size="13" />
      <span>点击柱状/折线上的某一天，查看当天明细；仅展示窗口内有数据的日期</span>
    </div>
    <div class="trend-table-wrap">
      <table class="data-table">
        <thead>
          <tr>
            <th>日期</th><th class="num">支付金额</th><th class="num">净销售额</th><th class="num">退款率</th>
            <th class="num">利润</th><th class="num">利润率</th><th class="num">访客</th><th class="num">转化率</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="p in trend" :key="String(p.date)" class="clickable" @click="emit('open-day', String(p.date))">
            <td>{{ p.date }}</td>
            <td class="num">{{ yuan(p.payAmountFen) }}</td>
            <td class="num">{{ yuan(p.netSalesFen) }}</td>
            <td class="num" :class="{ warn: (p.refundRate as number) > 0.25 }">{{ pct(p.refundRate) }}</td>
            <td class="num" :class="Number(p.profitFen) < 0 ? 'neg' : ''">{{ yuan(p.profitFen) }}</td>
            <td class="num">{{ Number(p.payAmountFen) ? pct((Number(p.profitFen) / Number(p.payAmountFen))) : '--' }}</td>
            <td class="num">{{ num(p.visitors) }}</td>
            <td class="num">{{ pct(p.payRate) }}</td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<style scoped>
.trend-wrap {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.trend-tip {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 11.5px;
  color: var(--text-tertiary);
}
.trend-table-wrap {
  overflow: auto;
  max-height: 260px;
  border: 1px solid var(--border);
  border-radius: 12px;
}
.data-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 12px;
  font-variant-numeric: tabular-nums;
}
.data-table th,
.data-table td {
  padding: 8px 12px;
  border-bottom: 1px solid var(--border);
  text-align: left;
  white-space: nowrap;
}
.data-table thead th {
  position: sticky;
  top: 0;
  background: var(--bg-elevated);
  color: var(--text-tertiary);
  font-weight: 600;
  font-size: 11px;
  z-index: 2;
}
.data-table tbody tr:hover {
  background: var(--bg-hover);
}
.num {
  text-align: right;
}
.warn {
  color: var(--warning);
}
.neg {
  color: var(--danger);
}
.clickable {
  cursor: pointer;
}
</style>
