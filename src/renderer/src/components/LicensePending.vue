<!-- 任务 4H 门禁 pending 态：校验中只显示品牌图标 + 加载动画，不渲染任何授权拒绝文案 -->
<script setup lang="ts">
import BrandIcon from './BrandIcon.vue'
</script>

<template>
  <div class="pending-body">
    <div class="pending-card">
      <div class="pending-logo">
        <BrandIcon :size="72" />
        <span class="spinner-ring" aria-hidden="true"></span>
      </div>
      <p class="pending-title">EC AI</p>
      <p class="pending-desc">正在校验授权…</p>
    </div>
  </div>
</template>

<style scoped>
.pending-body {
  flex: 1;
  min-height: 0;
  display: grid;
  place-items: center;
  background:
    radial-gradient(1000px 500px at 50% -10%, var(--accent-soft), transparent 60%),
    var(--bg-base);
}
.pending-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
}
.pending-logo {
  position: relative;
  width: 92px;
  height: 92px;
  display: grid;
  place-items: center;
}
.spinner-ring {
  position: absolute;
  inset: 0;
  border-radius: 50%;
  border: 3px solid transparent;
  border-top-color: var(--accent);
  animation: pending-spin 0.9s linear infinite;
}
.pending-title {
  margin: 10px 0 0;
  font-size: 17px;
  font-weight: 800;
  letter-spacing: 0.5px;
}
.pending-desc {
  margin: 0;
  font-size: 12.5px;
  color: var(--text-tertiary);
}
@keyframes pending-spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
