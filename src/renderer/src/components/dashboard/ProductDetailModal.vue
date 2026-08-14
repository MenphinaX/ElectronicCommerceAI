<!-- 单品详情弹窗（任务 4）：商品条目的每日序列 + 退款明细 -->
<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import ModalShell from './ModalShell.vue'
import ProductImageBox from './ProductImageBox.vue'
import { useDashboardStore } from '../../stores/dashboard'
import { num, yuan } from '../../utils/format'

const props = defineProps<{ productId: string; productName?: string }>()
const emit = defineEmits<{ (e: 'close'): void }>()
const store = useDashboardStore()
const loading = ref(true)
const data = ref<Record<string, unknown> | null>(null)

const series = computed(() => ((data.value?.series ?? []) as Array<Record<string, unknown>>))
const refunds = computed(() => (data.value?.refunds ?? { n: 0, fen: 0 }) as { n: number; fen: number })
const rows = computed(() => ((data.value?.rows ?? []) as Array<Record<string, unknown>>))

onMounted(async () => {
  try {
    data.value = (await window.api.dashboard.productDetail({
      shopId: store.shopId,
      productId: props.productId,
      from: store.data!.window.start,
      to: store.data!.window.end
    })) as unknown as Record<string, unknown>
  } finally {
    loading.value = false
  }
})
</script>

<template>
  <ModalShell :title="`单品详情 · ${productName || productId}`" @close="emit('close')">
    <div v-if="loading" class="loading-block"></div>
    <template v-else>
      <div class="pimg-figure">
        <ProductImageBox :product-id="props.productId" :size="96" :radius="14" />
        <div class="figure-name">{{ productName || productId }}</div>
      </div>
      <div class="inline-stats">
        <span>窗口退款 {{ refunds.n }} 笔 / ¥{{ yuan(refunds.fen) }}</span>
        <span>每日明细 {{ series.length }} 天</span>
        <span class="mono">商品 ID {{ productId }}</span>
      </div>
      <div class="sub-title">每日明细</div>
      <div class="scroll-box">
        <table class="data-table">
          <thead><tr><th>日期</th><th class="num">支付金额</th><th class="num">退款金额</th><th class="num">利润</th><th class="num">销量</th><th class="num">访客</th><th class="num">咨询</th></tr></thead>
          <tbody>
            <tr v-for="(r, i) in series" :key="i">
              <td>{{ r.date }}</td>
              <td class="num">{{ yuan(r.payAmountFen) }}</td>
              <td class="num">{{ yuan(r.refundAmountFen) }}</td>
              <td class="num" :class="Number(r.profitFen) < 0 ? 'neg' : ''">{{ yuan(r.profitFen) }}</td>
              <td class="num">{{ num(r.salesCount) }}</td>
              <td class="num">{{ num(r.visitors) }}</td>
              <td class="num">{{ num(r.consultCount) }}</td>
            </tr>
            <tr v-if="!series.length"><td colspan="7" class="empty">窗口内无该商品数据</td></tr>
          </tbody>
        </table>
      </div>
      <div class="sub-title">窗口内退款明细（最多 10 笔）</div>
      <div class="scroll-box">
        <table class="data-table">
          <thead><tr><th>订单号</th><th class="num">金额</th><th>完结日期</th><th>类型</th><th>货物状态</th><th>原因</th></tr></thead>
          <tbody>
            <tr v-for="(r, i) in rows" :key="i">
              <td class="mono">{{ r.orderNo }}</td>
              <td class="num">{{ yuan(r.fen) }}</td>
              <td>{{ r.finishDate }}</td>
              <td>{{ r.afterSaleType || '--' }}</td>
              <td>{{ r.goodsStatus || '--' }}</td>
              <td class="reason" :title="String(r.reason || '')">{{ r.reason || '--' }}</td>
            </tr>
            <tr v-if="!rows.length"><td colspan="6" class="empty">窗口内无退款记录</td></tr>
          </tbody>
        </table>
      </div>
    </template>
  </ModalShell>
</template>

<style scoped>
.pimg-figure {
  display: flex;
  align-items: center;
  gap: 14px;
  margin-bottom: 12px;
}
.figure-name {
  font-size: 14px;
  font-weight: 700;
  line-height: 1.5;
}
.inline-stats {
  display: flex;
  gap: 16px;
  font-size: 12.5px;
  color: var(--text-secondary);
  font-variant-numeric: tabular-nums;
  flex-wrap: wrap;
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
.mono {
  font-family: Consolas, monospace;
  font-size: 11px;
}
.reason {
  max-width: 200px;
  overflow: hidden;
  text-overflow: ellipsis;
}
.neg {
  color: var(--danger);
}
.empty {
  text-align: center;
  color: var(--text-tertiary);
  padding: 14px;
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
