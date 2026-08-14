<script setup lang="ts">
defineProps<{ title: string; desc: string }>()
</script>

<template>
  <section class="page">
    <header class="page-head">
      <h2 class="page-title">{{ title }}</h2>
      <p class="page-desc">{{ desc }}</p>
    </header>
    <div class="page-body">
      <slot />
    </div>
  </section>
</template>

<style scoped>
.page-head {
  margin-bottom: 22px;
}
.page-title {
  margin: 0 0 6px;
  font-size: 22px;
  font-weight: 700;
  letter-spacing: 0.2px;
}
.page-desc {
  margin: 0;
  font-size: 13px;
  color: var(--text-secondary);
}
.chart-blank {
  height: 260px;
  border: 1.5px dashed var(--border);
  border-radius: 14px;
  display: grid;
  place-items: center;
  color: var(--text-tertiary);
  font-size: 13px;
}
</style>