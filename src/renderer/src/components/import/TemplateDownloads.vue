<script setup lang="ts">
import { onMounted, ref } from 'vue'
import AppIcon from '../AppIcon.vue'
import { useDialogStore } from '../../stores/dialog'

interface TemplateItem {
  type: string
  label: string
  fileName: string
  path: string
}

const dialog = useDialogStore()
const dir = ref('')
const items = ref<TemplateItem[]>([])

async function load(): Promise<void> {
  const res = await window.api.importData.templates()
  dir.value = res.dir
  items.value = (res.items ?? []) as unknown as TemplateItem[]
}

onMounted(() => void load())

async function saveTo(): Promise<void> {
  const res = await window.api.importData.templatesSaveTo()
  if (res.canceled) return
  dialog.info('模板已导出', `已复制 ${res.count} 个模板文件到：${res.dest}`)
}

function openDir(): void {
  void window.api.importData.templatesOpen()
}
</script>

<template>
  <section class="glass-card block">
    <div class="block-head">
      <div>
        <h3 class="block-title">标准模板下载</h3>
        <p class="block-desc">每个数据源提供标准模板 CSV（UTF-8 BOM）+ 说明文档，平台改格式/手动录入时供对照</p>
      </div>
      <div class="act">
        <button class="btn ghost sm" @click="saveTo">
          <AppIcon name="download" :size="14" /> 导出到文件夹
        </button>
        <button class="btn ghost sm" @click="openDir">
          <AppIcon name="folder" :size="14" /> 打开模板目录
        </button>
      </div>
    </div>
    <div class="tmpl-grid">
      <div v-for="t in items" :key="t.type" class="tmpl-card">
        <AppIcon name="file" :size="18" class="tmpl-icon" />
        <span class="tmpl-name">{{ t.fileName }}</span>
        <span class="tmpl-label">{{ t.label }}</span>
      </div>
    </div>
    <p class="hint">模板目录：{{ dir }}</p>
  </section>
</template>

<style scoped>
.block {
  padding: 20px;
  margin-bottom: 16px;
}
.block-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 14px;
}
.block-title {
  margin: 0 0 4px;
  font-size: 15px;
  font-weight: 700;
}
.block-desc {
  margin: 0;
  font-size: 12.5px;
  color: var(--text-secondary);
}
.act {
  display: flex;
  gap: 8px;
}
.btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 30px;
  padding: 0 12px;
  border: 1px solid var(--border);
  border-radius: 9px;
  background: transparent;
  color: var(--text-secondary);
  font-size: 12px;
  cursor: pointer;
}
.btn:hover {
  color: var(--text-primary);
  background: var(--bg-hover);
}
.tmpl-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: 10px;
}
.tmpl-card {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px;
  border: 1px solid var(--border);
  border-radius: 12px;
  background: var(--bg-base);
}
.tmpl-icon {
  color: var(--accent);
  flex-shrink: 0;
}
.tmpl-name {
  flex: 1;
  font-size: 12.5px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.tmpl-label {
  font-size: 11px;
  padding: 2px 8px;
  border-radius: 999px;
  background: var(--accent-soft);
  color: var(--accent);
}
.hint {
  margin: 12px 0 0;
  font-size: 12px;
  color: var(--text-tertiary);
  word-break: break-all;
}
</style>