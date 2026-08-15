<!-- 退款分析区块（任务 4）：三档口径 + 商品维度 + 最近明细 -->
<script setup lang="ts">
import { computed } from 'vue'
import AppIcon from '../AppIcon.vue'
import { useDashboardStore } from '../../stores/dashboard'
import { num, yuan } from '../../utils/format'

const store = useDashboardStore()
const refund = computed(() => store.data?.refund as Record<string, unknown> | null | undefined)
const total = computed(() => (refund.value?.total ?? { count: 0, fen: 0 }) as { count: number; fen: number })
const tiers = computed(() => [
  { key: 'wf', label: '未发货（仅退款·未发货）', icon: 'archive', ...((refund.value?.wf ?? {}) as { count: number; fen: number }) },
  { key: 'jr', label: '已发货仅退款', icon: 'refund', ...((refund.value?.jr ?? {}) as { count: number; fen: number }) },
  { key: 'rt', label: '已发货退货退款', icon: 'tool', ...((refund.value?.rt ?? {}) as { count: number; fen: number }) },
  { key: 'other', label: '其他（换货/补寄/退运费）', icon: 'file', ...((refund.value?.other ?? {}) as { count: number; fen: number }) }
])
const byProduct = computed(() => ((refund.value?.byProduct ?? []) as Array<Record<string, unknown>>))
const recent = computed(() => ((refund.value?.recent ?? []) as Array<Record<string, unknown>>))

function share(fen: number): string {
  const t = total.value.fen
  if (!t) return '0.0%'
  return `${((fen / t) * 100).toFixed(1)}%`
}
</script>

<template>
  <div class="refund-wrap">
    <div class="refund-sum">
      <div class="sum-main">
        <span class="sum-label">窗口内退款完结合计</span>
        <span class="sum-val">¥{{ yuan(total.fen) }}</span>
        <span class="sum-sub">{{ num(total.count) }} 笔（按退款完结时间口径）</span>
      </div>
      <div class="tier-grid">
        <div v-for="t in tiers" :key="t.key" class="tier glass-card">
          <div class="tier-head">
            <AppIcon :name="t.icon" :size="15" />
            <span class="tier-label">{{ t.label }}</span>
          </div>
          <div class="tier-val">¥{{ yuan(t.fen) }}</div>
          <div class="tier-foot">
            <span>{{ num(t.count) }} 笔</span>
            <span class="tier-share">{{ share(t.fen) }}</span>
          </div>
        </div>
      </div>
    </div>

    <div class="refund-cols">
      <div class="col">
        <div class="sub-title">按商品 TOP</div>
        <div class="table-box">
          <table class="data-table">
            <thead><tr><th class="num">#</th><th>商品</th><th class="num">笔数</th><th class="num">退款金额</th></tr></thead>
            <tbody>
              <tr v-for="(p, i) in byProduct" :key="i">
                <td class="num">{{ i + 1 }}</td>
                <td class="name" :title="String(p.productTitle || '')">{{ p.productTitle || p.productId || '--' }}</td>
                <td class="num">{{ num(p.count) }}</td>
                <td class="num">{{ yuan(p.fen) }}</td>
              </tr>
              <tr v-if="!byProduct.length"><td colspan="4" class="empty">窗口内无退款记录</td></tr>
            </tbody>
          </table>
        </div>
      </div>
      <div class="col">
        <div class="sub-title">最近退款（8 笔）</div>
        <div class="table-box">
          <table class="data-table">
            <thead><tr><th>订单号</th><th class="num">金额</th><th>完结</th><th>类型</th><th>原因</th></tr></thead>
            <tbody>
              <tr v-for="(r, i) in recent" :key="i">
                <td class="mono">{{ r.orderNo }}</td>
                <td class="num">{{ yuan(r.fen) }}</td>
                <td>{{ r.finishDate }}</td>
                <td>{{ r.afterSaleType || '--' }}</td>
                <td class="reason" :title="String(r.reason || '')">{{ r.reason || '--' }}</td>
              </tr>
              <tr v-if="!recent.length"><td colspan="5" class="empty">窗口内无退款记录</td></tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
    <p class="note">口径：三档与 BI 一致——未发货 = 仅退款·未发货；已发货仅退款 = 仅退款·非未发货；已发货退货退款 = 退货退款；金额为窗口内退款完结金额。</p>
  </div>
</template>

<style scoped>
.refund-wrap {
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.sum-main {
  display: flex;
  align-items: baseline;
  gap: 10px;
  margin-bottom: 10px;
}
.sum-label {
  font-size: 12px;
  color: var(--text-secondary);
}
.sum-val {
  font-size: 26px;
  font-weight: 800;
  font-variant-numeric: tabular-nums;
}
.sum-sub {
  font-size: 11.5px;
  color: var(--text-tertiary);
}
.tier-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 12px;
}
.tier {
  padding: 14px 16px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.tier-head {
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--text-secondary);
}
.tier-label {
  font-size: 12px;
  font-weight: 600;
}
.tier-val {
  font-size: 19px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}
.tier-foot {
  display: flex;
  justify-content: space-between;
  font-size: 11.5px;
  color: var(--text-tertiary);
  font-variant-numeric: tabular-nums;
}
.tier-share {
  color: var(--text-secondary);
}
.refund-cols {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
  gap: 14px;
}
.col {
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
.table-box {
  border: 1px solid var(--border);
  border-radius: 12px;
  overflow: auto;
  max-height: 260px;
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
.mono {
  font-family: Consolas, monospace;
  font-size: 11px;
}
.name {
  max-width: 220px;
  overflow: hidden;
  text-overflow: ellipsis;
}
.reason {
  max-width: 160px;
  overflow: hidden;
  text-overflow: ellipsis;
}
.empty {
  text-align: center;
  color: var(--text-tertiary);
  padding: 14px;
}
.note {
  font-size: 11px;
  color: var(--text-tertiary);
  margin: 0;
}
</style>
