<script setup lang="ts">
import { onMounted, ref } from 'vue'
import AppIcon from '../AppIcon.vue'
import { useDialogStore } from '../../stores/dialog'

interface HistoryRow {
  id: number
  shopName: string
  sourceType: string
  sourceFile: string
  rowCount: number
  dateStart: string | null
  dateEnd: string | null
  status: string
  note: string | null
  fixLog: string | null
  elapsedMs: number
  importedAt: string
}

const dialog = useDialogStore()
const rows = ref<HistoryRow[]>([])

async function load(): Promise<void> {
  rows.value = (await window.api.importData.history()) as unknown as HistoryRow[]
}

onMounted(() => void load())

defineExpose({ load })

function confirmDelete(row: HistoryRow): void {
  dialog.confirm(
    '删除导入记录',
    `删除「${row.sourceFile}」的导入记录？\\n只删除历史记录，不会删除已导入的数据（数据按业务主键已合并）。删除后可重新导入该文件。`,
    () => void remove(row.id)
  )
}

async function remove(id: number): Promise<void> {
  await window.api.importData.deleteHistory(id)
  await load()
}

const statusLabel: Record<string, string> = { ok: '成功', failed: '失败', manual: '人工修正', partial: '部分' }
</script>

<template>
  <section class="glass-card block">
    <div class="block-head">
      <div>
        <h3 class="block-title">导入历史</h3>
        <p class="block-desc">每次导入留痕：文件/类型/行数/日期范围/耗时/状态/哈希；同文件重复导入自动跳过</p>
      </div>
      <button class="btn ghost sm" @click="load">
        <AppIcon name="refresh" :size="14" /> 刷新
      </button>
    </div>

    <div v-if="rows.length === 0" class="empty">还没有导入记录</div>
    <div v-else class="table-wrap">
      <table class="tbl">
        <thead>
          <tr>
            <th>时间</th><th>店铺</th><th>文件</th><th>类型</th><th>行数</th>
            <th>日期范围</th><th>耗时</th><th>状态</th><th>备注</th><th></th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="r in rows" :key="r.id">
            <td class="dim">{{ r.importedAt }}</td>
            <td>{{ r.shopName || '-' }}</td>
            <td class="fname" :title="r.sourceFile">{{ r.sourceFile }}</td>
            <td>{{ r.sourceType }}</td>
            <td class="num">{{ r.rowCount }}</td>
            <td class="dim">{{ r.dateStart ? r.dateStart + ' ~ ' + (r.dateEnd ?? '') : '-' }}</td>
            <td class="num">{{ r.elapsedMs }} ms</td>
            <td><span class="badge" :class="r.status">{{ statusLabel[r.status] ?? r.status }}</span></td>
            <td class="note" :title="r.note ?? ''">{{ r.note ?? '' }}</td>
            <td>
              <button class="icon-sm" title="删除记录" aria-label="删除记录" @click="confirmDelete(r)">
                <AppIcon name="trash" :size="14" />
              </button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
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
.empty {
  padding: 24px;
  text-align: center;
  color: var(--text-tertiary);
  font-size: 13px;
  border: 1.5px dashed var(--border);
  border-radius: 12px;
}
.table-wrap {
  overflow-x: auto;
}
.tbl {
  width: 100%;
  border-collapse: collapse;
  font-size: 12.5px;
}
.tbl th {
  text-align: left;
  padding: 8px 10px;
  color: var(--text-tertiary);
  font-weight: 600;
  border-bottom: 1px solid var(--border);
  white-space: nowrap;
}
.tbl td {
  padding: 8px 10px;
  border-bottom: 1px solid var(--border);
  vertical-align: middle;
}
.fname {
  max-width: 240px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.num {
  text-align: right;
  font-variant-numeric: tabular-nums;
}
.dim {
  color: var(--text-tertiary);
}
.note {
  max-width: 220px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--text-tertiary);
}
.badge {
  padding: 2px 8px;
  border-radius: 999px;
  font-size: 11px;
  white-space: nowrap;
}
.badge.ok {
  background: var(--accent-soft);
  color: var(--accent);
}
.badge.failed {
  background: rgba(255, 107, 107, 0.14);
  color: #ff6b6b;
}
.badge.manual {
  background: rgba(255, 193, 7, 0.16);
  color: #ffc107;
}
.icon-sm {
  width: 28px;
  height: 28px;
  border: none;
  border-radius: 8px;
  background: transparent;
  color: var(--text-tertiary);
  display: grid;
  place-items: center;
  cursor: pointer;
}
.icon-sm:hover {
  background: var(--bg-hover);
  color: #ff6b6b;
}
</style>