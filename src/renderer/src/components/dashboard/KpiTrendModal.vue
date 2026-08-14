<!-- KPI 指标趋势小图弹窗（任务 4）：当前窗口 vs 上一周期 -->
<script setup lang="ts">
import { computed } from 'vue'
import type { EChartsOption } from 'echarts'
import ModalShell from './ModalShell.vue'
import EChart from './EChart.vue'
import { useDashboardStore } from '../../stores/dashboard'
import { num, pct, yuan, yuanShort } from '../../utils/format'

const props = defineProps<{ kpiKey: string }>()
const emit = defineEmits<{ (e: 'close'): void }>()
const store = useDashboardStore()

const meta: Record<string, { label: string; fmt: (v: number | null | undefined) => string }> = {
  payAmountFen: { label: '支付金额', fmt: (v) => `¥${yuan(v)}` },
  netSalesFen: { label: '净销售额', fmt: (v) => `¥${yuan(v)}` },
  profitFen: { label: '利润', fmt: (v) => `¥${yuan(v)}` },
  visitors: { label: '访客数', fmt: (v) => num(v) },
  refundAmountFen: { label: '退款金额', fmt: (v) => `¥${yuan(v)}` },
  promoCostFen: { label: '推广花费', fmt: (v) => `¥${yuan(v)}` },
  roi: { label: '投入产出比', fmt: (v) => (v == null ? '--' : Number(v).toFixed(2)) },
  payRate: { label: '支付转化率', fmt: (v) => pct(v) }
}
const m = computed(() => meta[props.kpiKey] ?? { label: props.kpiKey, fmt: (v: number | null | undefined) => String(v) })

const cur = computed(() => ((store.data?.kpi?.trend ?? []) as Array<Record<string, unknown>>).map((p) => ({ d: String(p.date), v: Number(p[props.kpiKey]) || 0 })))
const prev = computed(() => ((store.data?.kpi?.prevTrend ?? []) as Array<Record<string, unknown>>))

const options = computed(() => ({
  backgroundColor: 'transparent',
  tooltip: {
    trigger: 'axis',
    formatter: (ps: Array<{ seriesName: string; name: string; value: number }>) =>
      ps.map((p) => `${p.seriesName} ${p.name}：${p.value.toLocaleString('zh-CN', { maximumFractionDigits: 2 })}`).join('<br/>')
  },
  legend: { data: ['当前窗口', '上一周期'], textStyle: { color: '#b3b3b3' }, top: 0 },
  grid: { left: 10, right: 10, top: 34, bottom: 4, containLabel: true },
  xAxis: { type: 'category', data: cur.value.map((p) => p.d.slice(5)), axisLine: { lineStyle: { color: 'rgba(255,255,255,0.15)' } }, axisLabel: { color: '#7d7d7d', fontSize: 11 } },
  yAxis: { type: 'value', axisLabel: { color: '#7d7d7d', fontSize: 11, formatter: (v: number) => yuanShort(v * 100) }, splitLine: { lineStyle: { color: 'rgba(255,255,255,0.06)' } } },
  series: [
    { name: '当前窗口', type: 'line', smooth: true, symbolSize: 6, data: cur.value.map((p) => p.v / 100), lineStyle: { color: '#1db954' }, itemStyle: { color: '#1db954' } },
    ...(prev.value.length
      ? [{ name: '上一周期', type: 'line', smooth: true, symbolSize: 5, data: prev.value.map((p) => (Number(p[props.kpiKey]) || 0) / 100), lineStyle: { color: '#7d7d7d', type: 'dashed' as const }, itemStyle: { color: '#7d7d7d' } }]
      : [])
  ]
}) as EChartsOption)
</script>

<template>
  <ModalShell :title="`指标趋势 · ${m.label}`" @close="emit('close')">
    <div class="kpi-cur">
      <span class="kpi-cur-label">窗口合计（{{ store.data?.window.label }}）</span>
      <span class="kpi-cur-val">{{ m.fmt((store.data?.kpi as Record<string, unknown>)?.[kpiKey] as number) }}</span>
      <span class="kpi-cur-sub">折线为窗口内每日数值，虚线为上一周期同序日</span>
    </div>
    <EChart :options="options" :height="280" />
  </ModalShell>
</template>

<style scoped>
.kpi-cur {
  display: flex;
  align-items: baseline;
  gap: 10px;
  flex-wrap: wrap;
}
.kpi-cur-label {
  font-size: 12px;
  color: var(--text-secondary);
}
.kpi-cur-val {
  font-size: 22px;
  font-weight: 800;
  font-variant-numeric: tabular-nums;
}
.kpi-cur-sub {
  font-size: 11.5px;
  color: var(--text-tertiary);
}
</style>
