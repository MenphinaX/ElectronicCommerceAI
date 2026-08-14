<!-- 全店分析（任务 4A 增补）：商品贡献列表，复用看板窗口数据 + 商品图绑定 -->
<script setup lang="ts">
import { computed, onMounted } from 'vue'
import PageShell from '../components/PageShell.vue'
import ProductImageBox from '../components/dashboard/ProductImageBox.vue'
import { useDashboardStore } from '../stores/dashboard'
import { num, pct, yuan } from '../utils/format'

const store = useDashboardStore()

const products = computed(() => (store.data?.product ?? []) as Array<Record<string, unknown>>)
const windowLabel = computed(() => store.data?.window?.label ?? '近7天')

onMounted(async () => {
  if (!store.data) await store.init()
})
</script>

<template>
  <PageShell title="全店分析" desc="全店商品贡献列表 · 窗口数据与看板联动 · 支持绑定商品主图">
    <div v-if="!store.data?.hasData" class="empty glass-card">
      <div class="empty-title">暂无窗口数据</div>
      <div class="empty-desc">请先在导入中心导入经营/商品/推广等数据源，再回来看全店商品贡献。</div>
    </div>

    <div v-else class="glass-card pad">
      <div class="list-head">
        <span class="list-title">商品贡献（{{ windowLabel }} · 按支付金额 TOP{{ products.length }}）</span>
        <span class="list-sub">数字可回溯到源文件；点击图片可上传/替换商品主图</span>
      </div>
      <div class="scroll-box">
        <table class="data-table">
          <thead>
            <tr>
              <th>图</th><th>商品</th><th class="mono-th">商品 ID</th>
              <th class="num">支付金额</th><th class="num">利润</th><th class="num">销量</th>
              <th class="num">访客</th><th class="num">咨询</th><th class="num">利润率</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(p, i) in products" :key="String(p.productId)">
              <td class="td-img"><ProductImageBox :product-id="String(p.productId)" :size="44" :radius="8" /></td>
              <td class="p-name">{{ p.productName || p.productId }}</td>
              <td class="mono">{{ p.productId }}</td>
              <td class="num">{{ yuan(p.payAmountFen) }}</td>
              <td class="num" :class="Number(p.profitFen) < 0 ? 'neg' : ''">{{ yuan(p.profitFen) }}</td>
              <td class="num">{{ num(p.salesCount) }}</td>
              <td class="num">{{ num(p.visitors) }}</td>
              <td class="num">{{ num(p.consultCount) }}</td>
              <td class="num">{{ Number(p.payAmountFen) ? pct(Number(p.profitFen) / Number(p.payAmountFen)) : '--' }}</td>
            </tr>
            <tr v-if="!products.length"><td colspan="9" class="empty">窗口内无商品数据</td></tr>
          </tbody>
        </table>
      </div>
      <div class="note">TOP{{ products.length }} 排序口径与看板单品分析一致（支付金额降序）。</div>
    </div>
  </PageShell>
</template>

<style scoped>
.pad {
  padding: 18px 20px;
}
.list-head {
  display: flex;
  align-items: baseline;
  gap: 12px;
  margin-bottom: 12px;
  flex-wrap: wrap;
}
.list-title {
  font-size: 14px;
  font-weight: 800;
}
.list-sub {
  font-size: 11px;
  color: var(--text-tertiary);
}
.scroll-box {
  border: 1px solid var(--border);
  border-radius: 12px;
  overflow: auto;
  max-height: 480px;
}
.data-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 12.5px;
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
.num {
  text-align: right;
}
.mono-th {
  font-family: Consolas, monospace;
}
.mono {
  font-family: Consolas, monospace;
  font-size: 11px;
  color: var(--text-secondary);
}
.td-img {
  width: 56px;
}
.p-name {
  max-width: 260px;
  overflow: hidden;
  text-overflow: ellipsis;
}
.neg {
  color: var(--danger);
}
.empty {
  text-align: center;
  color: var(--text-tertiary);
  padding: 20px;
}
.note {
  margin-top: 10px;
  font-size: 11px;
  color: var(--text-tertiary);
}
</style>
