<template>
  <div class="bp-replica" :class="{ perf: perf }">
    <BpGapBanner />
    <h2 id="sec-summary">01 · 高管摘要</h2>
    <BpSummary />
    <h2 id="sec-kpi">02 · 核心指标仪表盘</h2>
    <BpKpi />
    <h2 id="sec-trend">03 · 近 {{ winDays }} 日经营趋势 <span class="ghost">{{ winStart.slice(5) }} ~ {{ winEnd.slice(5) }} | 覆盖完整 {{ daysN }} 天</span></h2>
    <BpTrend />
    <h2 id="sec-product">04 · 商品分析 <span class="ghost">{{ prodSub }}</span></h2>
    <BpProducts />
    <h2 id="sec-ad">05 · 推广分析（点击卡片展开 · 明细为 {{ lastDay }} 单日）</h2>
    <BpPromo />
    <h2 id="sec-refund">06 · 退款与退货分析（三档口径）</h2>
    <BpRefund />
    <h2 id="sec-dsr">07 · DSR 评分与客服绩效</h2>
    <BpDsrCs />
    <h2 id="sec-search">08 · 搜索词与商品咨询</h2>
    <BpSearchZx />
    <h2 id="sec-action">09 · 建议动作（按优先级）</h2>
    <BpActions />
    <div class="footer">
      电商运营总监调度 · analytics-reporter + executive-summary-generator 生成<br>
      复刻蓝本：数据看板-原型.html（九源模板导出：经营数据 07-13~08-11 · 商品/搜索/咨询/推广为 08-11 单日快照 · 退款按窗口实时聚合）<br>
      商品 ID 主键 · 退款三档与 BI 一致 · 评语由 EC AI 模型生成
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { useBpData } from './bp-utils'
import BpGapBanner from './BpGapBanner.vue'
import BpSummary from './BpSummary.vue'
import BpKpi from './BpKpi.vue'
import BpTrend from './BpTrend.vue'
import BpProducts from './BpProducts.vue'
import BpPromo from './BpPromo.vue'
import BpRefund from './BpRefund.vue'
import BpDsrCs from './BpDsrCs.vue'
import BpSearchZx from './BpSearchZx.vue'
import BpActions from './BpActions.vue'

const bp = useBpData()
const perf = ref(false)
const winDays = computed(() => bp.winDays.value)
const winStart = computed(() => bp.winStart.value)
const winEnd = computed(() => bp.winEnd.value)
const lastDay = computed(() => bp.lastDay.value)
const daysN = computed(() => bp.days.value.length)
const prodSub = computed(() => {
  const c = bp.productCounts.value
  return `（${bp.winLbl.value} ${winStart.value.slice(5)}~${winEnd.value.slice(5)} · 动销商品：${c.sold} / 总商品：${c.total} · 展示 TOP ${bp.products.value.length}）`
})
</script>
