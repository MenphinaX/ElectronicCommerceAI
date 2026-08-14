<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import AppIcon from './AppIcon.vue'
import { useSettingsStore } from '../stores/settings'

const route = useRoute()
const settings = useSettingsStore()

// 六轮拍板：导航精简为 5 项；单品/推广/客服/DSR/搜索词/全店分析 保留路由，仅作看板区块载体/下钻落地页，不在导航展示
// 七轮拍板：导航 7 项 = 数据看板/AI 对话/导入中心/店铺对比/技能管理/聊天质检/设置
// 任务 4J ②：店铺对比加「测试版」角标（固定显示，后续可接设置开关）
const items = [
  { name: 'dashboard', label: '数据看板', icon: 'dashboard', path: '/dashboard' },
  { name: 'roi', label: '投产比计算', icon: 'roi', path: '/roi' },
  { name: 'chat', label: 'AI 对话', icon: 'chat', path: '/chat' },
  { name: 'import', label: '导入中心', icon: 'upload', path: '/import' },
  { name: 'compare', label: '店铺对比', icon: 'compare', path: '/compare', badge: '测试版' },
  { name: 'skills', label: '技能管理', icon: 'skills', path: '/skills' },
  { name: 'qa', label: '聊天质检', icon: 'qa', path: '/qa' },
  { name: 'settings', label: '设置', icon: 'settings', path: '/settings' }
]

const activePath = computed(() => route.path)
</script>

<template>
  <aside class="sidebar" :class="{ collapsed: settings.navCollapsed }">
    <nav class="nav">
      <RouterLink
        v-for="item in items"
        :key="item.name"
        :to="item.path"
        class="nav-item"
        :class="{ active: activePath === item.path }"
        :title="item.label"
      >
        <AppIcon :name="item.icon" :size="20" />
        <span class="nav-label">
          {{ item.label }}
          <span v-if="item.badge" class="nav-badge" data-test="compare-badge">{{ item.badge }}</span>
        </span>
      </RouterLink>
    </nav>
    <div class="sidebar-foot">
      <span class="ver">v0.1.0</span>
      <button
        class="collapse-btn"
        :aria-label="settings.navCollapsed ? '展开导航' : '折叠导航'"
        :title="settings.navCollapsed ? '展开导航' : '折叠导航'"
        @click="settings.setNavCollapsed(!settings.navCollapsed)"
      >
        <AppIcon :name="settings.navCollapsed ? 'collapse-right' : 'collapse-left'" :size="16" />
      </button>
    </div>
  </aside>
</template>

<style scoped>
.sidebar {
  width: var(--sidebar-width);
  display: flex;
  flex-direction: column;
  background: var(--bg-elevated);
  border-right: 1px solid var(--border);
  padding: 14px 10px 12px;
  flex-shrink: 0;
  transition: width 0.2s ease;
  overflow: hidden;
}
.sidebar.collapsed {
  width: var(--sidebar-collapsed-width);
}
.nav {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 2px;
  overflow-y: auto;
}
.nav-item {
  position: relative;
  display: flex;
  align-items: center;
  gap: 12px;
  height: 40px;
  padding: 0 12px;
  border-radius: 12px;
  color: var(--text-secondary);
  text-decoration: none;
  font-size: 13.5px;
  font-weight: 500;
  white-space: nowrap;
  transition: background 0.15s ease, color 0.15s ease;
}
.nav-item:hover {
  background: var(--bg-hover);
  color: var(--text-primary);
}
.nav-item.active {
  background: var(--accent-soft);
  color: var(--accent);
}
.nav-item.active::before {
  content: '';
  position: absolute;
  left: -10px;
  top: 50%;
  transform: translateY(-50%);
  width: 3px;
  height: 20px;
  border-radius: 3px;
  background: var(--accent);
}
.nav-label {
  display: inline-flex;
  align-items: center;
  overflow: hidden;
  text-overflow: ellipsis;
}
.nav-badge {
  display: inline-block;
  margin-left: 8px;
  padding: 0 7px;
  border-radius: 999px;
  font-size: 10px;
  font-weight: 700;
  line-height: 17px;
  color: var(--accent);
  background: var(--accent-soft);
  border: 1px solid var(--accent);
  letter-spacing: 0.02em;
  flex-shrink: 0;
}
.sidebar.collapsed .nav-label,
.sidebar.collapsed .ver {
  display: none;
}
.sidebar.collapsed .nav-item {
  justify-content: center;
  padding: 0;
}
.sidebar-foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 8px 0;
  border-top: 1px solid var(--border);
}
.ver {
  font-size: 11px;
  color: var(--text-tertiary);
}
.collapse-btn {
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
.collapse-btn:hover {
  background: var(--bg-hover);
  color: var(--text-primary);
}
.sidebar.collapsed .sidebar-foot {
  justify-content: center;
  padding: 10px 0 0;
}
</style>
