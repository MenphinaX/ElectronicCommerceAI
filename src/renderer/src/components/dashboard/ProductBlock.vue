<!-- 单品分析区块（任务 4）：TOP 商品卡片，展开固定高度+内部滚动，不退形 -->
<script setup lang="ts">
import { computed, ref } from 'vue'
import AppIcon from '../AppIcon.vue'
import ProductImageBox from './ProductImageBox.vue'
import { useDashboardStore } from '../../stores/dashboard'
import { num, pct, yuan } from '../../utils/format'

const emit = defineEmits<{ (e: 'open-product', p: Record<string, unknown>): void }>()
const store = useDashboardStore()
const products = computed(() => (store.data?.product ?? []) as Array<Record<string, unknown>>)
const expanded = ref<Record<string, boolean>>({})
const details = ref<Record<string, Record<string, unknown>>>({})

async function toggle(p: Record<string, unknown>): Promise<void> {
  const pid = String(p.productId)
  expanded.value[pid] = !expanded.value[pid]
  if (expanded.value[pid] && !details.value[pid]) {
    try {
      const d = await window.api.dashboard.productDetail({
        shopId: store.shopId,
        productId: pid,
        from: store.data!.window.start,
        to: store.data!.window.end
      })
      details.value[pid] = d as unknown as Record<string, unknown>
    } catch {
      details.value[pid] = { series: [], refunds: { n: 0, fen: 0 }, rows: [] }
    }
  }
}

function rate(v: unknown): number | null {
  return v == null ? null : Number(v)
}
</script>

<template>
  <div class="prod-grid">
    <div v-for="(p, i) in products" :key="String(p.productId)" class="prod-card glass-card" :class="{ open: expanded[String(p.productId)] }">
      <div class="prod-head" role="button" tabindex="0" @click="toggle(p)" @keydown.enter="toggle(p)">
        <ProductImageBox :product-id="String(p.productId)" :size="60" />
        <span class="rank" :class="'rk-' + Math.min(i + 1, 3)">{{ i + 1 }}</span>
        <span class="prod-name">{{ p.productName || p.productId }}</span>
        <span class="prod-id">{{ p.productId }}</span>
        <span class="prod-metric">
          <span class="m-label">支付</span>{{ yuan(p.payAmountFen) }}
        </span>
        <span class="prod-metric">
          <span class="m-label">利润</span><span :class="Number(p.profitFen) < 0 ? 'neg' : ''">{{ yuan(p.profitFen) }}</span>
        </span>
        <span class="prod-metric">
          <span class="m-label">销量</span>{{ num(p.salesCount) }}
        </span>
        <AppIcon :name="expanded[String(p.productId)] ? 'chevron-down' : 'chevron-right'" :size="15" class="chev" />
      </div>
      <div class="prod-detail" :class="{ show: expanded[String(p.productId)] }">
        <div class="prod-detail-inner">
          <template v-if="details[String(p.productId)]">
            <div class="detail-stats">
              <span class="ds">窗口支付 {{ yuan(details[String(p.productId)].series ? (details[String(p.productId)].series as Array<Record<string, unknown>>).reduce((a, r) => a + Number(r.payAmountFen), 0) : 0) }}</span>
              <span class="ds">退款 {{ (details[String(p.productId)].refunds as Record<string, unknown>)?.n }} 笔 / {{ yuan((details[String(p.productId)].refunds as Record<string, unknown>)?.fen) }}</span>
              <span class="ds">推广费 {{ yuan(p.promoCostFen) }}</span>
              <span class="ds">访客 {{ num(p.visitors) }}</span>
              <span class="ds">咨询 {{ num(p.consultCount) }}</span>
              <span class="ds">利润率 {{ rate(p.profitFen) != null && Number(p.payAmountFen) ? pct(Number(p.profitFen) / Number(p.payAmountFen)) : '--' }}</span>
            </div>
            <div class="sub-title">每日明细</div>
            <div class="scroll-box">
              <table class="data-table">
                <thead>
                  <tr><th>日期</th><th class="num">支付金额</th><th class="num">退款金额</th><th class="num">利润</th><th class="num">销量</th><th class="num">访客</th><th class="num">咨询</th></tr>
                </thead>
                <tbody>
                  <tr v-for="r in (details[String(p.productId)].series as Array<Record<string, unknown>>)" :key="String(r.date)">
                    <td>{{ r.date }}</td>
                    <td class="num">{{ yuan(r.payAmountFen) }}</td>
                    <td class="num">{{ yuan(r.refundAmountFen) }}</td>
                    <td class="num" :class="Number(r.profitFen) < 0 ? 'neg' : ''">{{ yuan(r.profitFen) }}</td>
                    <td class="num">{{ num(r.salesCount) }}</td>
                    <td class="num">{{ num(r.visitors) }}</td>
                    <td class="num">{{ num(r.consultCount) }}</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <div class="sub-title">窗口内退款明细（最近 10 笔）</div>
            <button class="detail-btn" @click="emit('open-product', p)">在新弹窗查看单品详情</button>
            <div class="scroll-box">
              <table class="data-table">
                <thead>
                  <tr><th>订单号</th><th class="num">退款金额</th><th>完结日期</th><th>售后类型</th><th>货物状态</th><th>原因</th></tr>
                </thead>
                <tbody>
                  <tr v-for="(r, ri) in (details[String(p.productId)].rows as Array<Record<string, unknown>>)" :key="ri">
                    <td class="mono">{{ r.orderNo }}</td>
                    <td class="num">{{ yuan(r.fen) }}</td>
                    <td>{{ r.finishDate }}</td>
                    <td>{{ r.afterSaleType || '--' }}</td>
                    <td>{{ r.goodsStatus || '--' }}</td>
                    <td class="reason" :title="String(r.reason || '')">{{ r.reason || '--' }}</td>
                  </tr>
                  <tr v-if="!(details[String(p.productId)].rows as Array<Record<string, unknown>>).length">
                    <td colspan="6" class="empty">窗口内无退款记录</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </template>
          <div v-else class="loading-line"></div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.prod-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(340px, 1fr));
  gap: 14px;
}
.prod-card {
  overflow: hidden;
}
.prod-head {
  display: grid;
  grid-template-columns: auto auto minmax(0, 1fr) auto auto auto auto auto;
  align-items: center;
  gap: 12px;
  width: 100%;
  padding: 14px 16px;
  border: none;
  background: transparent;
  color: var(--text-primary);
  text-align: left;
  cursor: pointer;
}
.prod-head:hover {
  background: var(--bg-hover);
}
.rank {
  width: 22px;
  height: 22px;
  border-radius: 7px;
  display: grid;
  place-items: center;
  font-size: 11.5px;
  font-weight: 800;
  background: var(--bg-hover);
  color: var(--text-secondary);
}
.rk-1 {
  background: var(--accent);
  color: #000000;
}
.prod-name {
  font-size: 13px;
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.prod-id {
  font-size: 10.5px;
  color: var(--text-tertiary);
  font-variant-numeric: tabular-nums;
}
.prod-metric {
  font-size: 12px;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
  color: var(--text-secondary);
}
.m-label {
  font-size: 10px;
  color: var(--text-tertiary);
  margin-right: 3px;
}
.neg {
  color: var(--danger);
}
.chev {
  color: var(--text-tertiary);
  transition: transform 0.2s ease;
}
.prod-card.open .chev {
  transform: rotate(180deg);
}
.prod-detail {
  max-height: 0;
  overflow: hidden;
  transition: max-height 0.3s ease;
}
.prod-detail.show {
  max-height: 480px; /* 展开区固定高度，内部滚动，卡片不退形 */
}
.prod-detail-inner {
  height: 480px;
  padding: 0 16px 16px;
  border-top: 1px solid var(--border);
  display: flex;
  flex-direction: column;
  gap: 8px;
  overflow-y: auto;
}
.detail-stats {
  display: flex;
  flex-wrap: wrap;
  gap: 6px 14px;
  padding: 10px 0 2px;
  font-size: 12px;
  color: var(--text-secondary);
}
.ds {
  font-variant-numeric: tabular-nums;
}
.sub-title {
  font-size: 11px;
  font-weight: 700;
  color: var(--text-tertiary);
  letter-spacing: 0.04em;
}
.scroll-box {
  border: 1px solid var(--border);
  border-radius: 10px;
  overflow: auto;
  max-height: 150px;
}
.data-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 11.5px;
  font-variant-numeric: tabular-nums;
}
.data-table th,
.data-table td {
  padding: 6px 10px;
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
  font-size: 10.5px;
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
  max-width: 180px;
  overflow: hidden;
  text-overflow: ellipsis;
}
.empty {
  text-align: center;
  color: var(--text-tertiary);
  padding: 14px;
}
.loading-line {
  height: 120px;
  border-radius: 10px;
  background: linear-gradient(90deg, transparent, var(--bg-hover), transparent);
  background-size: 200% 100%;
  animation: shimmer 1.2s infinite;
}
@keyframes shimmer {
  from { background-position: 200% 0; }
  to { background-position: -200% 0; }
}
</style>
