<script setup lang="ts">
import PageShell from '../components/PageShell.vue'
</script>

<template>
  <PageShell title="推广分析" desc="推广花费、ROI 与渠道效果（任务 4 填充）">
    <div class="grid-2">
      <div class="glass-card panel">
        <div class="ph-line w-1/2"></div>
        <div class="chart-blank">花费趋势（任务 4 填充）</div>
      </div>
      <div class="glass-card panel">
        <div class="ph-line w-1/2"></div>
        <div class="chart-blank">渠道对比（任务 4 填充）</div>
      </div>
    </div>
  </PageShell>
</template>

<style scoped>
.grid-2 {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
  gap: 16px;
}
.panel {
  padding: 18px;
  display: flex;
  flex-direction: column;
  gap: 14px;
}
</style>