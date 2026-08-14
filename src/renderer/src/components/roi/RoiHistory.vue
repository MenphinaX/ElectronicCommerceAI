<!-- 投产比历史记录（任务 4G）：保存/删除/导出 CSV/点击载入；渲染层走 roi IPC，不直连库 -->
<script setup lang="ts">
import { onMounted, ref } from 'vue'
import AppIcon from '../AppIcon.vue'
import { buildRoiHistoryCsv, type RoiHistoryRow } from '../../utils/roi-export'

export interface RoiSnapshot {
  name: string
  paramsJson: string
  resultJson: string
  passed: boolean
}

const props = defineProps<{ snapshot: RoiSnapshot }>()
const emit = defineEmits<{ (e: 'load', params: Record<string, unknown>): void }>()

interface HistoryRow {
  id: number
  name: string
  paramsJson: string
  resultJson: string
  passed: number
  createdAt: string
}
const history = ref<HistoryRow[]>([])
const savedTip = ref('')

async function refreshHistory(): Promise<void> {
  try {
    history.value = (await window.api.roi.list()) as unknown as HistoryRow[]
  } catch {
    history.value = []
  }
}

async function saveRun(): Promise<void> {
  if (!props.snapshot.name.trim()) {
    savedTip.value = '请先填写计算名称'
    return
  }
  await window.api.roi.save({
    name: props.snapshot.name.trim(),
    paramsJson: props.snapshot.paramsJson,
    resultJson: props.snapshot.resultJson,
    passed: props.snapshot.passed
  })
  savedTip.value = '已保存'
  setTimeout(() => (savedTip.value = ''), 2000)
  await refreshHistory()
}

async function deleteRun(id: number): Promise<void> {
  await window.api.roi.remove(id)
  await refreshHistory()
}

function loadRun(row: HistoryRow): void {
  try {
    emit('load', JSON.parse(row.paramsJson) as Record<string, unknown>)
  } catch {
    // 历史参数损坏则忽略载入
  }
}

function exportCsv(): void {
  const rows: RoiHistoryRow[] = history.value.map((h) => ({
    id: h.id, createdAt: h.createdAt, name: h.name, passed: h.passed,
    params: JSON.parse(h.paramsJson) as Record<string, unknown>,
    result: JSON.parse(h.resultJson) as Record<string, unknown>
  }))
  const csv = buildRoiHistoryCsv(rows)
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `投产比历史-${new Date().toISOString().slice(0, 10)}.csv`
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 2000)
}

onMounted(() => {
  void refreshHistory()
})
</script>

<template>
  <section class="card">
    <h3 class="card-title head-row">
      <span><AppIcon name="history" :size="15" /> 历史记录</span>
      <span class="head-actions">
        <button class="btn-mini" @click="saveRun">保存本次</button>
        <button class="btn-mini" :disabled="!history.length" @click="exportCsv">导出 CSV</button>
      </span>
    </h3>
    <p v-if="savedTip" class="saved-tip">{{ savedTip }}</p>
    <div v-if="!history.length" class="placeholder">暂无记录，填写参数后点「保存本次」。</div>
    <div v-for="h in history" :key="h.id" class="hist-row" @click="loadRun(h)">
      <div class="hist-line">
        <span class="h-name">{{ h.name }}</span>
        <span class="h-status" :class="Number(h.passed) ? 'ok' : 'over'">{{ Number(h.passed) ? '达标' : '未达标' }}</span>
        <span class="h-time">{{ h.createdAt }}</span>
      </div>
      <button class="btn-mini danger" title="删除" @click.stop="deleteRun(h.id)">
        <AppIcon name="trash" :size="13" /> 删除
      </button>
    </div>
  </section>
</template>

<style scoped>
.card {
  padding: 16px;
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  background: var(--bg-card);
}
.card-title {
  display: flex;
  align-items: center;
  gap: 7px;
  margin: 0 0 12px;
  font-size: 14.5px;
  font-weight: 700;
}
.head-row {
  justify-content: space-between;
}
.head-actions {
  display: flex;
  gap: 6px;
}
.saved-tip {
  margin: 0 0 8px;
  font-size: 12px;
  color: var(--accent);
}
.placeholder {
  font-size: 12.5px;
  color: var(--text-tertiary);
}
.hist-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 10px;
  border-radius: 8px;
  cursor: pointer;
}
.hist-row:hover {
  background: var(--bg-hover);
}
.hist-line {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12.5px;
  min-width: 0;
}
.h-name {
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.h-time {
  color: var(--text-tertiary);
  font-size: 11.5px;
  margin-left: auto;
}
.h-status {
  padding: 1px 8px;
  border-radius: 999px;
  font-size: 11px;
}
.h-status.ok {
  background: var(--accent-soft);
  color: var(--accent);
}
.h-status.over {
  background: rgba(229, 72, 77, 0.15);
  color: var(--danger);
}
.btn-mini {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  height: 26px;
  padding: 0 10px;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: transparent;
  color: var(--text-secondary);
  font-size: 11.5px;
  cursor: pointer;
}
.btn-mini:hover:not(:disabled) {
  border-color: var(--accent);
  color: var(--accent);
}
.btn-mini:disabled {
  opacity: 0.45;
  cursor: default;
}
.btn-mini.danger:hover {
  border-color: var(--danger);
  color: var(--danger);
}
</style>
