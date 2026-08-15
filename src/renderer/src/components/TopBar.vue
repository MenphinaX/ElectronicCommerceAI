<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import ShopSwitcher from './ShopSwitcher.vue'
import AppIcon from './AppIcon.vue'
import { useDashboardStore } from '../stores/dashboard'

const router = useRouter()
const dashboard = useDashboardStore()

const gapCount = computed(() => dashboard.data?.gaps?.length ?? 0)

onMounted(() => {
  // 顶栏缺口角标数据预热（看板页加载时也会刷新）
  if (!dashboard.loaded) void dashboard.load()
})
</script>

<template>
  <header class="topbar">
    <ShopSwitcher />
    <div class="topbar-right">
      <button class="ask-btn" title="问 AI（带当前窗口数据跳转对话页）" aria-label="问 AI" @click="router.push('/chat')">
        <AppIcon name="ask" :size="17" />
        <span class="ask-label">问 AI</span>
        <span class="ask-badge">对话</span>
      </button>
      <button class="icon-btn" title="缺口提示" aria-label="缺口提示" @click="router.push('/dashboard')">
        <AppIcon name="bell" :size="18" />
        <span v-if="gapCount > 0" class="badge">{{ gapCount }}</span>
      </button>
      <button class="icon-btn" title="设置" aria-label="设置" @click="router.push('/settings')">
        <AppIcon name="settings" :size="18" />
      </button>
    </div>
  </header>
</template>

<style scoped>
.topbar {
  height: var(--topbar-height);
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 24px;
  background: var(--bg-base);
  border-bottom: 1px solid var(--border);
  flex-shrink: 0;
}
.topbar-right {
  display: flex;
  align-items: center;
  gap: 8px;
}
.icon-btn {
  position: relative;
  width: 36px;
  height: 36px;
  border: none;
  border-radius: 50%;
  background: transparent;
  color: var(--text-secondary);
  display: grid;
  place-items: center;
  cursor: pointer;
  transition: background 0.15s ease, color 0.15s ease;
}
.icon-btn:hover {
  background: var(--bg-hover);
  color: var(--text-primary);
}
.ask-btn {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  height: 36px;
  padding: 0 14px;
  border: 1px solid var(--accent);
  border-radius: 999px;
  background: var(--accent-soft);
  color: var(--accent);
  font-size: 12.5px;
  font-weight: 700;
  cursor: pointer;
  opacity: 0.9;
  position: relative;
  transition: background 0.15s ease, color 0.15s ease, opacity 0.15s ease;
}
.ask-btn:hover {
  background: var(--accent);
  color: #000000;
  opacity: 1;
}
.ask-label {
  white-space: nowrap;
}
.ask-badge {
  position: absolute;
  top: -7px;
  right: -4px;
  font-size: 9px;
  font-weight: 700;
  padding: 2px 6px;
  border-radius: 999px;
  background: var(--warning);
  color: #000000;
  letter-spacing: 0.02em;
}
.badge {
  position: absolute;
  top: 2px;
  right: 0;
  min-width: 15px;
  height: 15px;
  padding: 0 4px;
  border-radius: 8px;
  background: var(--accent);
  color: #000000;
  font-size: 10px;
  font-weight: 700;
  display: grid;
  place-items: center;
}
</style>
