<script setup lang="ts">
import PageShell from '../components/PageShell.vue'
</script>

<template>
  <PageShell title="单品分析" desc="单个商品的流量、转化与利润拆解（任务 4 填充）">
    <div class="glass-card panel">
      <div class="ph-line w-2/5"></div>
      <div class="chart-blank">单品维度图表区域（任务 4 填充）</div>
    </div>
  </PageShell>
</template>

<style scoped>
.panel {
  padding: 18px;
  display: flex;
  flex-direction: column;
  gap: 14px;
}
</style>