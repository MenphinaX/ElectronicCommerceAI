<script setup lang="ts">
import { computed } from 'vue'
import AppIcon from './AppIcon.vue'
import { useDialogStore } from '../stores/dialog'

const dialog = useDialogStore()

const meta = {
  info: { icon: 'info', tone: 'info', label: '提示' },
  confirm: { icon: 'warning', tone: 'warning', label: '确认' },
  error: { icon: 'error', tone: 'danger', label: '错误' }
} as const

const current = computed(() => meta[dialog.type])
const lines = computed(() => dialog.message.split('\n'))

function onPrimary(): void {
  if (dialog.type === 'confirm') dialog.onConfirm?.()
  dialog.close()
}
</script>

<template>
  <Teleport to="body">
    <Transition name="fade">
      <div v-if="dialog.visible" class="overlay" @mousedown.self="dialog.type !== 'confirm' && dialog.close()">
        <div class="dialog glass-card" role="dialog" :aria-label="current.label">
          <div class="dialog-head">
            <span class="dialog-icon" :class="`tone-${current.tone}`">
              <AppIcon :name="current.icon" :size="22" />
            </span>
            <h3 class="dialog-title">{{ dialog.title }}</h3>
          </div>
          <div class="dialog-body">
            <p v-for="(line, i) in lines" :key="i" class="dialog-line">{{ line }}</p>
          </div>
          <div class="dialog-actions">
            <button v-if="dialog.type === 'confirm'" class="btn btn-ghost" @click="dialog.close()">取消</button>
            <button class="btn btn-primary" @click="onPrimary">
              {{ dialog.type === 'confirm' ? '确认' : '知道了' }}
            </button>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.55);
  backdrop-filter: blur(4px);
  display: grid;
  place-items: center;
  z-index: 100;
}
.dialog {
  width: 400px;
  max-width: calc(100vw - 48px);
  padding: 22px;
}
.dialog-head {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 14px;
}
.dialog-icon {
  width: 42px;
  height: 42px;
  border-radius: 12px;
  display: grid;
  place-items: center;
  flex-shrink: 0;
}
.tone-info {
  background: var(--info);
  color: #ffffff;
}
.tone-warning {
  background: var(--warning);
  color: #ffffff;
}
.tone-danger {
  background: var(--danger);
  color: #ffffff;
}
.dialog-title {
  margin: 0;
  font-size: 16px;
  font-weight: 700;
}
.dialog-body {
  margin-bottom: 20px;
}
.dialog-line {
  margin: 0 0 6px;
  font-size: 13.5px;
  line-height: 1.6;
  color: var(--text-secondary);
}
.dialog-line:last-child {
  margin-bottom: 0;
}
.dialog-actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
}
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.18s ease;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>