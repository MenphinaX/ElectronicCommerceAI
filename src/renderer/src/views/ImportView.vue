<script setup lang="ts">
import { ref } from 'vue'
import PageShell from '../components/PageShell.vue'
import ShopManager from '../components/import/ShopManager.vue'
import ImportPanel from '../components/import/ImportPanel.vue'
import ImportHistory from '../components/import/ImportHistory.vue'
import FixCenter from '../components/import/FixCenter.vue'
import TemplateDownloads from '../components/import/TemplateDownloads.vue'
import DataPackagePanel from '../components/package/DataPackagePanel.vue'
import { useShopsStore } from '../stores/shops'
import { useCommentsStore } from '../stores/comments'

const tab = ref<'shop' | 'import' | 'fix' | 'tpl' | 'pkg'>('import')
const shops = useShopsStore()
const historyRef = ref<InstanceType<typeof ImportHistory> | null>(null)
const fixRef = ref<InstanceType<typeof FixCenter> | null>(null)

function onImported(): void {
  void useCommentsStore().auto()
}

const tabs = [
  { id: 'import', label: '数据导入', icon: 'upload' },
  { id: 'shop', label: '店铺管理', icon: 'store' },
  { id: 'fix', label: '人工处理', icon: 'tool' },
  { id: 'tpl', label: '模板下载', icon: 'download' },
  { id: 'pkg', label: '数据包', icon: 'archive' }
] as const
</script>

<template>
  <PageShell title="导入中心" desc="店铺管理 + 9 类数据源导入（识别/清洗/去重/归档/兜底/人工处理）">
    <div class="tabs">
      <button
        v-for="t in tabs"
        :key="t.id"
        class="tab"
        :class="{ active: tab === t.id }"
        @click="tab = t.id"
      >
        <AppIcon :name="t.icon" :size="15" />
        {{ t.label }}
      </button>
    </div>

    <template v-if="tab === 'import'">
      <ImportPanel @imported="onImported" />
    </template>
    <template v-else-if="tab === 'shop'">
      <ShopManager />
    </template>
    <template v-else-if="tab === 'fix'">
      <FixCenter ref="fixRef" />
    </template>
    <template v-else-if="tab === 'pkg'">
      <DataPackagePanel />
    </template>
    <template v-else>
      <TemplateDownloads />
    </template>

    <template v-if="tab === 'import'">
      <ImportHistory ref="historyRef" />
    </template>
  </PageShell>
</template>

<style scoped>
.tabs {
  display: flex;
  gap: 8px;
  margin-bottom: 18px;
  flex-wrap: wrap;
}
.tab {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  height: 34px;
  padding: 0 16px;
  border: 1px solid var(--border);
  border-radius: 999px;
  background: var(--bg-base);
  color: var(--text-secondary);
  font-size: 13px;
  cursor: pointer;
  transition: all 0.15s ease;
}
.tab:hover {
  color: var(--text-primary);
  background: var(--bg-hover);
}
.tab.active {
  background: var(--accent-soft);
  border-color: var(--accent);
  color: var(--accent);
  font-weight: 600;
}
</style>