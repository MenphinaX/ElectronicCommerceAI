<!-- 通用弹窗外壳（任务 4 下钻弹窗共用） -->
<script setup lang="ts">
import AppIcon from '../AppIcon.vue'
defineProps<{ title: string }>()
const emit = defineEmits<{ (e: 'close'): void }>()
</script>

<template>
  <div class="modal-mask" @click.self="emit('close')">
    <div class="modal glass-card">
      <div class="modal-head">
        <div class="modal-title">{{ title }}</div>
        <button class="x" aria-label="关闭" @click="emit('close')"><AppIcon name="close" :size="16" /></button>
      </div>
      <div class="modal-body">
        <slot />
      </div>
    </div>
  </div>
</template>

<style scoped>
.modal-mask {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.55);
  display: grid;
  place-items: center;
  z-index: 60;
}
.modal {
  width: min(760px, 92vw);
  max-height: 84vh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.modal-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px 12px;
  border-bottom: 1px solid var(--border);
}
.modal-title {
  font-size: 15px;
  font-weight: 700;
}
.x {
  width: 30px;
  height: 30px;
  border: none;
  border-radius: 8px;
  background: transparent;
  color: var(--text-secondary);
  display: grid;
  place-items: center;
  cursor: pointer;
}
.x:hover {
  background: var(--bg-hover);
  color: var(--text-primary);
}
.modal-body {
  padding: 16px 20px 20px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
</style>
