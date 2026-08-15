<!-- DSR + 客服绩效区块（任务 4） -->
<script setup lang="ts">
import { computed } from 'vue'
import { useDashboardStore } from '../../stores/dashboard'
import { num, pct, seconds } from '../../utils/format'

const store = useDashboardStore()
const dsr = computed(() => store.data?.dsr as Record<string, unknown> | undefined)
const cs = computed(() => store.data?.cs as { dates: string[]; staff: Array<Record<string, unknown>> } | undefined)
const daily = computed(() => (dsr.value?.daily ?? null) as Record<string, unknown> | null)
const snapshot = computed(() => ((dsr.value?.snapshot ?? []) as Array<Record<string, unknown>>))

const dsrItems = computed(() => {
  if (!daily.value) return []
  return [
    { label: '描述相符', score: daily.value.descriptionScore },
    { label: '物流质量', score: daily.value.logisticsScore },
    { label: '服务态度', score: daily.value.serviceScore }
  ]
})
</script>

<template>
  <div class="dsr-cs-grid">
    <div class="dsr-col">
      <div v-if="daily" class="dsr-daily">
        <div class="sub-title">店铺 DSR（日维度 · {{ daily.date }}）</div>
        <div class="score-row">
          <div v-for="d in dsrItems" :key="d.label" class="score-item">
            <span class="score-label">{{ d.label }}</span>
            <span class="score-val">{{ d.score == null ? '--' : Number(d.score).toFixed(2) }}</span>
          </div>
        </div>
      </div>
      <div v-else class="dsr-empty">窗口内无 DSR 日维度数据{{ dsr?.snapshotDate ? `（最近快照 ${dsr?.snapshotDate}）` : '' }}</div>
      <div class="sub-title" style="margin-top: 14px">近 180 天 DSR 指标（快照{{ dsr?.snapshotDate ? ' ' + dsr?.snapshotDate : '' }}）</div>
      <div class="table-box">
        <table class="data-table">
          <thead><tr><th>指标</th><th class="num">得分</th><th class="num">行业均值</th><th class="num">目标</th><th>对比</th></tr></thead>
          <tbody>
            <tr v-for="(s, i) in snapshot" :key="i">
              <td class="name" :title="String(s.indicator || '')">{{ s.indicator || '--' }}</td>
              <td class="num" :class="{ warn: s.score != null && s.industryAvg != null && Number(s.score) < Number(s.industryAvg) }">{{ s.score == null ? '--' : Number(s.score).toFixed(2) }}</td>
              <td class="num">{{ s.industryAvg == null ? '--' : Number(s.industryAvg).toFixed(2) }}</td>
              <td class="num">{{ s.target == null ? '--' : Number(s.target).toFixed(2) }}</td>
              <td class="cmp" :title="String(s.compareText || '')">{{ s.compareText || '--' }}</td>
            </tr>
            <tr v-if="!snapshot.length"><td colspan="5" class="empty">暂无 180 天快照</td></tr>
          </tbody>
        </table>
      </div>
    </div>

    <div class="cs-col">
      <div class="sub-title">客服绩效（{{ cs?.dates?.join('、') || '窗口内无数据' }}）</div>
      <div class="table-box">
        <table class="data-table">
          <thead>
            <tr>
              <th>客服</th><th class="num">询单付款人数</th><th class="num">询单人数</th><th class="num">转化率</th>
              <th class="num">首次响应</th><th class="num">平均响应</th><th class="num">满意率</th><th class="num">回复率</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(s, i) in cs?.staff ?? []" :key="i">
              <td>{{ s.staffName }}</td>
              <td class="num">{{ num(s.inquiryFinalPayCount) }}</td>
              <td class="num">{{ num(s.inquiryCount) }}</td>
              <td class="num">{{ pct(s.inquiryFinalPayRate) }}</td>
              <td class="num">{{ seconds(s.firstResponseSeconds) }}</td>
              <td class="num">{{ seconds(s.avgResponseSeconds) }}</td>
              <td class="num">{{ pct(s.satisfactionRate) }}</td>
              <td class="num">{{ pct(s.replyRate) }}</td>
            </tr>
            <tr v-if="!(cs?.staff?.length)"><td colspan="8" class="empty">窗口内无客服数据</td></tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>
</template>

<style scoped>
.dsr-cs-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(360px, 1fr));
  gap: 16px;
}
.dsr-col,
.cs-col {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.sub-title {
  font-size: 11px;
  font-weight: 700;
  color: var(--text-tertiary);
  letter-spacing: 0.04em;
}
.score-row {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
}
.score-item {
  flex: 1;
  min-width: 110px;
  padding: 12px 14px;
  background: var(--bg-elevated);
  border: 1px solid var(--border);
  border-radius: 14px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.score-label {
  font-size: 11px;
  color: var(--text-tertiary);
}
.score-val {
  font-size: 18px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}
.dsr-empty {
  padding: 12px 14px;
  border: 1px dashed var(--border);
  border-radius: 12px;
  color: var(--text-tertiary);
  font-size: 12px;
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
  max-width: 200px;
  overflow: hidden;
  text-overflow: ellipsis;
}
.cmp {
  max-width: 220px;
  overflow: hidden;
  text-overflow: ellipsis;
  color: var(--text-secondary);
}
.warn {
  color: var(--warning);
  font-weight: 700;
}
.empty {
  text-align: center;
  color: var(--text-tertiary);
  padding: 14px;
}
</style>
