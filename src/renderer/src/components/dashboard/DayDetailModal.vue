<!-- 某天明细弹窗（任务 4）：趋势图点某天 → 当天经营/商品/退款/推广 -->
<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import ModalShell from './ModalShell.vue'
import { useDashboardStore } from '../../stores/dashboard'
import { num, pct, yuan } from '../../utils/format'

const props = defineProps<{ date: string }>()
const emit = defineEmits<{ (e: 'close'): void }>()
const store = useDashboardStore()
const loading = ref(true)
const data = ref<Record<string, unknown> | null>(null)

const daily = computed(() => (data.value?.daily ?? null) as Record<string, unknown> | null)
const products = computed(() => ((data.value?.products ?? []) as Array<Record<string, unknown>>))
const refund = computed(() => (data.value?.refund ?? { n: 0, fen: 0 }) as { n: number; fen: number })
const promo = computed(() => (data.value?.promo ?? { costFen: 0, impressions: 0, clicks: 0 }) as Record<string, unknown>)

onMounted(async () => {
  try {
    data.value = (await window.api.dashboard.dayDetail({ shopId: store.shopId, date: props.date })) as unknown as Record<string, unknown>
  } finally {
    loading.value = false
  }
})
</script>

<template>
  <ModalShell :title="`当天明细 · ${date}`" @close="emit('close')">
    <div v-if="loading" class="loading-block"></div>
    <template v-else>
      <div v-if="daily" class="day-sum">
        <div class="ds"><span>支付金额</span><b>¥{{ yuan(daily.payAmountFen) }}</b></div>
        <div class="ds"><span>净销售额</span><b>¥{{ yuan(daily.netSalesFen) }}</b></div>
        <div class="ds"><span>利润</span><b :class="{ neg: Number(daily.profitFen) < 0 }">¥{{ yuan(daily.profitFen) }}</b></div>
        <div class="ds"><span>访客</span><b>{{ num(daily.visitors) }}</b></div>
        <div class="ds"><span>退款</span><b>¥{{ yuan(daily.refundAmountFen) }}</b></div>
        <div class="ds"><span>推广花费</span><b>¥{{ yuan(daily.promoCostFen) }}</b></div>
        <div class="ds"><span>转化率</span><b>{{ pct(daily.payRate) }}</b></div>
      </div>
      <div v-else class="empty-tip">该日无经营数据（如实标注，未补数）</div>

      <div class="sub-title">当天退款（按完结时间）</div>
      <div class="inline-stats">
        <span>{{ refund.n }} 笔</span>
        <span>¥{{ yuan(refund.fen) }}</span>
      </div>

      <div class="sub-title">当天推广</div>
      <div class="inline-stats">
        <span>花费 ¥{{ yuan(promo.costFen) }}</span>
        <span>展现 {{ num(promo.impressions) }}</span>
        <span>点击 {{ num(promo.clicks) }}</span>
      </div>

      <div class="sub-title">当天商品 TOP</div>
      <div class="scroll-box">
        <table class="data-table">
          <thead><tr><th class="num">#</th><th>商品</th><th class="num">支付金额</th><th class="num">退款</th><th class="num">利润</th><th class="num">销量</th></tr></thead>
          <tbody>
            <tr v-for="(p, i) in products" :key="i">
              <td class="num">{{ i + 1 }}</td>
              <td class="name" :title="String(p.productName || '')">{{ p.productName || p.productId }}</td>
              <td class="num">{{ yuan(p.payAmountFen) }}</td>
              <td class="num">{{ yuan(p.refundAmountFen) }}</td>
              <td class="num" :class="Number(p.profitFen) < 0 ? 'neg' : ''">{{ yuan(p.profitFen) }}</td>
              <td class="num">{{ num(p.salesCount) }}</td>
            </tr>
            <tr v-if="!products.length"><td colspan="6" class="empty">当天无商品数据</td></tr>
          </tbody>
        </table>
      </div>
    </template>
  </ModalShell>
</template>

<style scoped>
.day-sum {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
  gap: 10px;
}
.ds {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 10px 12px;
  background: var(--bg-elevated);
  border: 1px solid var(--border);
  border-radius: 12px;
}
.ds span {
  font-size: 11px;
  color: var(--text-tertiary);
}
.ds b {
  font-size: 14px;
  font-variant-numeric: tabular-nums;
}
.neg {
  color: var(--danger);
}
.inline-stats {
  display: flex;
  gap: 16px;
  font-size: 12.5px;
  color: var(--text-secondary);
  font-variant-numeric: tabular-nums;
}
.sub-title {
  font-size: 11px;
  font-weight: 700;
  color: var(--text-tertiary);
  letter-spacing: 0.04em;
  margin-top: 4px;
}
.scroll-box {
  border: 1px solid var(--border);
  border-radius: 10px;
  overflow: auto;
  max-height: 200px;
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
  max-width: 260px;
  overflow: hidden;
  text-overflow: ellipsis;
}
.empty {
  text-align: center;
  color: var(--text-tertiary);
  padding: 14px;
}
.empty-tip {
  padding: 10px 14px;
  border: 1px dashed var(--border);
  border-radius: 10px;
  color: var(--text-tertiary);
  font-size: 12px;
}
.loading-block {
  height: 220px;
  border-radius: 12px;
  background: linear-gradient(90deg, transparent, var(--bg-hover), transparent);
  background-size: 200% 100%;
  animation: shimmer 1.2s infinite;
}
@keyframes shimmer {
  from { background-position: 200% 0; }
  to { background-position: -200% 0; }
}
</style>
