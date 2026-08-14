<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'
import AppIcon from './AppIcon.vue'
import BrandIcon from './BrandIcon.vue'
import { useSettingsStore } from '../stores/settings'

const settings = useSettingsStore()
const maximized = ref(false)
let unsubscribe: (() => void) | null = null

onMounted(() => {
  void window.api.window.isMaximized().then((m) => {
    maximized.value = m
  })
  unsubscribe = window.api.window.onMaximizedChange((m) => {
    maximized.value = m
  })
})
onUnmounted(() => {
  unsubscribe?.()
})

const minimize = (): void => {
  void window.api.window.minimize()
}
const toggleMaximize = (): void => {
  void window.api.window.toggleMaximize()
}
const close = (): void => {
  void window.api.window.close()
}
</script>

<template>
  <header class="titlebar" :class="{ 'is-maximized': maximized }">
    <div class="titlebar-brand" :class="{ collapsed: settings.navCollapsed }">
      <BrandIcon :size="18" class="brand-mark" />
      <span class="brand-name">EC AI</span>
      <span class="brand-sub">Electronic Commerce AI</span>
    </div>
    <div class="titlebar-drag" @dblclick="toggleMaximize"></div>
    <div class="titlebar-controls">
      <button class="ctl" aria-label="最小化" title="最小化" @click="minimize">
        <AppIcon name="minimize" :size="15" />
      </button>
      <button class="ctl" aria-label="最大化" title="最大化" @click="toggleMaximize">
        <AppIcon :name="maximized ? 'restore' : 'maximize'" :size="14" />
      </button>
      <button class="ctl ctl-close" aria-label="关闭" title="关闭" @click="close">
        <AppIcon name="close" :size="15" />
      </button>
    </div>
  </header>
</template>

<style scoped>
.titlebar {
  height: var(--titlebar-height);
  display: flex;
  align-items: stretch;
  background: var(--bg-elevated);
  border-bottom: 1px solid var(--border);
  -webkit-app-region: drag;
  flex-shrink: 0;
  z-index: 30;
}
.titlebar-brand {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0 14px;
  width: var(--sidebar-width);
  transition: width 0.2s ease;
  overflow: hidden;
  white-space: nowrap;
}
.titlebar-brand.collapsed {
  width: var(--sidebar-collapsed-width);
}
.brand-mark {
  color: var(--accent);
  flex-shrink: 0;
}
.brand-name {
  font-size: 14px;
  font-weight: 700;
  letter-spacing: 0.4px;
}
.brand-sub {
  font-size: 11px;
  color: var(--text-tertiary);
  margin-left: 2px;
}
.titlebar-drag {
  flex: 1;
}
.titlebar-controls {
  display: flex;
  -webkit-app-region: no-drag;
}
.ctl {
  width: 46px;
  border: none;
  background: transparent;
  color: var(--text-secondary);
  display: grid;
  place-items: center;
  cursor: pointer;
  transition: background 0.15s ease, color 0.15s ease;
}
.ctl:hover {
  background: var(--bg-hover);
  color: var(--text-primary);
}
.ctl-close:hover {
  background: #e5484d;
  color: #ffffff;
}
</style>