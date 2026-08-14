<!-- 推广分析区块（任务 4）：汇总 + 主体明细表 -->
<script setup lang="ts">
import { computed } from 'vue'
import { useDashboardStore } from '../../stores/dashboard'
import { num, pct, roi, yuan } from '../../utils/format'

const store = useDashboardStore()
const promo = computed(() => store.data?.promo as Record<string, unknown> | undefined)
const totals = computed(() => (promo.value?.totals ?? null) as Record<string, unknown> | null)
const entities = computed(() => ((promo.value?.entities ?? []) as Array<Record<string, unknown>>))
</script>

<template>
  <div class="promo-wrap">
    <div v-if="totals" class="promo-stats">
      <div class="stat"><span class="s-label">花费</span><span class="s-val">¥{{ yuan(totals.costFen) }}</span></div>
      <div class="stat"><span class="s-label">展现</span><span class="s-val">{{ num(totals.impressions) }}</span></div>
      <div class="stat"><span class="s-label">点击</span><span class="s-val">{{ num(totals.clicks) }}</span></div>
      <div class="stat"><span class="s-label">点击率</span><span class="s-val">{{ pct(totals.ctr) }}</span></div>
      <div class="stat"><span class="s-label">ROI</span><span class="s-val" :class="{ warn: Number(totals.roas) < 2 }">{{ roi(totals.roas) }}</span></div>
      <div class="stat"><span class="s-label">推广主体数</span><span class="s-val">{{ num(entities.length) }}<span class="s-sub">（窗口内）</span></span></div>
    </div>
    <div class="table-box">
      <table class="data-table">
        <thead>
          <tr><th>#</th><th>推广主体</th><th class="num">展现</th><th class="num">点击</th><th class="num">花费</th><th class="num">点击率</th><th class="num">ROI</th></tr>
        </thead>
        <tbody>
          <tr v-for="(e, i) in entities" :key="String(e.adEntityId)">
            <td>{{ i + 1 }}</td>
            <td class="name" :title="String(e.adEntityName || '')">{{ e.adEntityName || e.adEntityId }}</td>
            <td class="num">{{ num(e.impressions) }}</td>
            <td class="num">{{ num(e.clicks) }}</td>
            <td class="num">{{ yuan(e.costFen) }}</td>
            <td class="num">{{ pct(e.ctr) }}</td>
            <td class="num" :class="{ warn: Number(e.roas) < 2 }">{{ roi(e.roas) }}</td>
          </tr>
        </tbody>
      </table>
    </div>
    <p class="note" v-if="totals">口径：ROI = 窗口内支付金额 ÷ 推广花费（按花费加权）；推广数据为窗口内全部主体。</p>
  </div>
</template>

<style scoped>
.promo-wrap {
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.promo-stats {
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
.s-sub {
  font-size: 11px;
  color: var(--text-tertiary);
  font-weight: 500;
}
.warn {
  color: var(--warning);
}
.table-box {
  border: 1px solid var(--border);
  border-radius: 12px;
  overflow: auto;
  max-height: 300px;
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
.name {
  max-width: 280px;
  overflow: hidden;
  text-overflow: ellipsis;
}
.note {
  font-size: 11px;
  color: var(--text-tertiary);
  margin: 0;
}
</style>
