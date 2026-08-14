<template>
  <div>
    <table class="bp-trend-table">
      <thead><tr><th>日期</th><th>支付</th><th>净销</th><th>退款率</th><th>利润</th><th>利润率</th><th>访客</th><th>转化</th><th>状态</th></tr></thead>
      <tbody>
        <tr v-for="d in bp.days.value" :key="d.d">
          <td class="mono">{{ bpSlice(d.d) }}</td>
          <td class="mono num">{{ bpNum(d.sales) }}</td>
          <td class="mono num">{{ bpNum(d.net) }}</td>
          <td class="num">{{ (d.rr ?? 0).toFixed(1) }}%</td>
          <td class="mono num" :class="d.profit >= 0 ? 'bull' : 'bear'">{{ bpNum(d.profit) }}</td>
          <td class="num" :class="d.profit >= 0 ? 'bull' : 'bear'">{{ d.sales ? (d.profit / d.sales * 100).toFixed(1) : '--' }}%</td>
          <td class="mono num">{{ bpNum(d.vis) }}</td>
          <td class="num">{{ d.vis ? (d.orders / d.vis * 100).toFixed(1) : '--' }}%</td>
          <td><span class="tag" :class="d.profit >= 0 ? 'tag-green' : 'tag-red'">{{ d.profit >= 0 ? '盈利' : '亏损' }}</span></td>
        </tr>
      </tbody>
    </table>
    <div class="kpi-report trend-analysis" style="margin-top:6px;">
      <div class="kpi-report-head"><span v-html="BP_ICONS.pin"></span> 经营趋势分析<span class="ghost" style="font-weight:500;font-size:11px;margin-left:6px;">（窗口 {{ bp.winStart.value.slice(5) }} ~ {{ bp.winEnd.value.slice(5) }} · 覆盖 {{ bp.days.value.length }} 天）</span></div>
      <div class="kpi-report-body">{{ comment }}</div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useBpData, bpNum, bpSlice } from './bp-utils'
import { BP_ICONS } from './BpIcons'

const bp = useBpData()
const comment = computed(() => {
  const t = bp.commentText('趋势')
  return t ? t.split('\n').map((x) => '· ' + x).join('\n') : '等待生成评语（窗口切换/数据导入后自动生成）'
})
</script>
