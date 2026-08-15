<script setup lang="ts">
import { onMounted, ref } from 'vue'
import PageShell from '../components/PageShell.vue'
import SkillInstall from '../components/skills/SkillInstall.vue'
import SkillList from '../components/skills/SkillList.vue'
import ModuleBind from '../components/skills/ModuleBind.vue'
import { useSkillsStore } from '../stores/skills'

const store = useSkillsStore()
const tab = ref<'install' | 'installed' | 'bind'>('installed')

const TABS = [
  { id: 'installed', label: '已安装技能' },
  { id: 'install', label: '从 GitHub 安装' },
  { id: 'bind', label: '模块绑定' }
] as const

onMounted(() => {
  void store.load()
})
</script>

<template>
  <PageShell title="技能管理" desc="AI 评语技能的安装、编辑与看板模块绑定（任务 5）">
    <div class="tabs">
      <button
        v-for="t in TABS"
        :key="t.id"
        class="tab"
        :class="{ active: tab === t.id }"
        @click="tab = t.id"
      >
        {{ t.label }}
      </button>
    </div>
    <div class="tab-body glass-card">
      <SkillList v-if="tab === 'installed'" />
      <SkillInstall v-else-if="tab === 'install'" />
      <ModuleBind v-else />
    </div>
  </PageShell>
</template>

<style scoped>
.tabs {
  display: flex;
  gap: 4px;
  margin-bottom: 14px;
  border-bottom: 1px solid var(--border);
}
.tab {
  padding: 8px 16px;
  border: none;
  background: transparent;
  color: var(--text-secondary);
  font-size: 13.5px;
  cursor: pointer;
  border-bottom: 2px solid transparent;
  margin-bottom: -1px;
}
.tab:hover {
  color: var(--text-primary);
}
.tab.active {
  color: var(--accent);
  border-bottom-color: var(--accent);
  font-weight: 600;
}
.tab-body {
  padding: 18px;
}
</style>
