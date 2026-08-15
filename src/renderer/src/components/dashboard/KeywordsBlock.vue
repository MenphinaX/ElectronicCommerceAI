<!-- 搜索词区块（任务 4）：TOP10 搜索词 + 汇总 -->
<script setup lang="ts">
import { computed } from 'vue'
import { useDashboardStore } from '../../stores/dashboard'
import { num, pct, yuan } from '../../utils/format'

const store = useDashboardStore()
const kw = computed(() => store.data?.keywords as Record<string, unknown> | undefined)
const totals = computed(() => (kw.value?.totals ?? null) as Record<string, unknown> | null)
const top = computed(() => ((kw.value?.top ?? []) as Array<Record<string, unknown>>))
const dates = computed(() => ((kw.value?.dates ?? []) as string[]))
</script>

<template>
  <div class="kw-wrap">
    <div v-if="totals" class="kw-stats">
      <div class="stat"><span class="s-label">访客</span><span class="s-val">{{ num(totals.visitors) }}</span></div>
      <div class="stat"><span class="s-label">成交买家</span><span class="s-val">{{ num(totals.payBuyerCount) }}</span></div>
      <div class="stat"><span class="s-label">成交金额</span><span class="s-val">¥{{ yuan(totals.payAmountFen) }}</span></div>
      <div class="stat"><span class="s-label">数据日期</span><span class="s-val sm">{{ dates.join('、') || '--' }}</span></div>
    </div>
    <div class="table-box">
      <table class="data-table">
        <thead>
          <tr><th class="num">#</th><th>搜索词</th><th class="num">访客</th><th class="num">成交买家</th><th class="num">成交金额</th><th class="num">转化率</th><th class="num">UV价值</th></tr>
        </thead>
        <tbody>
          <tr v-for="(k, i) in top" :key="i">
            <td class="num">{{ i + 1 }}</td>
            <td class="name">{{ k.keyword }}</td>
            <td class="num">{{ num(k.visitors) }}</td>
            <td class="num">{{ num(k.payBuyerCount) }}</td>
            <td class="num">{{ yuan(k.payAmountFen) }}</td>
            <td class="num">{{ pct(k.payRate) }}</td>
            <td class="num">{{ yuan(k.uvValueFen, 2) }}</td>
          </tr>
          <tr v-if="!top.length"><td colspan="7" class="empty">窗口内无搜索词数据</td></tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<style scoped>
.kw-wrap {
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.kw-stats {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(130px, 1fr));
  gap: 10px;
}
.stat {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 12px 14px;
  background: var(--bg-elevated);
  border: 1px solid var(--border);
  border-radius: 14px;
}
.s-label {
  font-size: 11px;
  color: var(--text-tertiary);
}
.s-val {
  font-size: 17px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}
.s-val.sm {
  font-size: 13px;
  font-weight: 600;
}
.table-box {
  border: 1px solid var(--border);
  border-radius: 12px;
  overflow: auto;
  max-height: 320px;
}
.data-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 12px;
  font-variant-numeric: tabular-nums;
}
.data-table th,
.data-table td {
  padding: 7px 10px;
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
.num {
  text-align: right;
}
.name {
  font-weight: 600;
}
.empty {
  text-align: center;
  color: var(--text-tertiary);
  padding: 14px;
}
</style>
