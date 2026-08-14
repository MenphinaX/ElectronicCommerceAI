<!-- 日报导出工具栏（任务 7）：一键日报/周报 + PDF + 明细导出，全部走主进程 IPC -->
<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'
import AppIcon from '../AppIcon.vue'
import { useDashboardStore } from '../../stores/dashboard'
import { useDialogStore } from '../../stores/dialog'

const store = useDashboardStore()
const dialog = useDialogStore()

// Ctrl+E 全局快捷键触发一键日报（事件由 App.vue 派发）
onMounted(() => window.addEventListener('ecai:export-daily', onExportDaily))
onUnmounted(() => window.removeEventListener('ecai:export-daily', onExportDaily))

function onExportDaily(): void {
  void run('daily')
}

type Busy = 'daily' | 'weekly' | 'pdf' | 'detail' | null
const busy = ref<Busy>(null)
const kind = ref<'refund' | 'product' | 'daily'>('refund')
const format = ref<'xlsx' | 'csv'>('xlsx')

function shopId(): number {
  return Number(store.shopId) || 0
}

function winMode(): 'yesterday' | '7' | '15' | '30' {
  const m = store.data?.window?.mode
  return m === 'yesterday' || m === '7' || m === '15' || m === '30' ? m : '7'
}

async function run(k: Exclude<Busy, 'detail' | null>): Promise<void> {
  if (busy.value || !shopId()) return
  busy.value = k
  try {
    let res: Record<string, unknown>
    if (k === 'pdf') {
      res = await window.api.report.exportPdf({ shopId: shopId(), mode: winMode(), type: 'daily' })
    } else {
      const mode = k === 'weekly' ? '7' : 'yesterday'
      const type = k === 'weekly' ? 'weekly' : 'daily'
      res = await window.api.report.export({ shopId: shopId(), mode, type })
    }
    if (res.ok && res.filePath) {
      dialog.info(k === 'weekly' ? '周报已导出' : k === 'pdf' ? 'PDF 已导出' : '日报已导出', '已导出并自动打开：\n' + String(res.filePath))
    } else if (res.canceled) {
      dialog.info('已取消', '未选择保存位置，未导出文件。')
    } else {
      dialog.error('导出失败', '未能生成报表文件，请检查后重试。')
    }
  } catch (e) {
    dialog.error('导出失败', (e as Error).message || String(e))
  } finally {
    busy.value = null
  }
}

async function runDetail(): Promise<void> {
  if (busy.value || !shopId()) return
  busy.value = 'detail'
  try {
    const res = await window.api.report.exportDetail({
      shopId: shopId(),
      mode: winMode(),
      kind: kind.value,
      format: format.value
    })
    if (res.ok && res.filePath) {
      dialog.info('明细已导出', '共 ' + String(res.rowCount) + ' 行，已导出：\n' + String(res.filePath))
    } else if (res.canceled) {
      dialog.info('已取消', '未选择保存位置，未导出文件。')
    } else {
      dialog.error('导出失败', '未能生成明细文件，请重试。')
    }
  } catch (e) {
    dialog.error('导出失败', (e as Error).message || String(e))
  } finally {
    busy.value = null
  }
}
</script>

<template>
  <div class="report-toolbar glass-card">
    <div class="tb-group">
      <span class="tb-title">导出</span>
      <button class="tb-btn primary" type="button" :disabled="!!busy" @click="run('daily')">
        <AppIcon name="export" :size="14" />
        一键日报
      </button>
      <button class="tb-btn" type="button" :disabled="!!busy" @click="run('weekly')">
        <AppIcon name="export" :size="14" />
        一键周报
      </button>
      <button class="tb-btn" type="button" :disabled="!!busy" @click="run('pdf')">
        <AppIcon name="file" :size="14" />
        导出 PDF
      </button>
    </div>
    <div class="tb-group">
      <span class="tb-title">明细导出</span>
      <select v-model="kind" class="tb-select" :disabled="!!busy">
        <option value="refund">退款单</option>
        <option value="product">商品明细</option>
        <option value="daily">每日数据</option>
      </select>
      <select v-model="format" class="tb-select" :disabled="!!busy">
        <option value="xlsx">Excel</option>
        <option value="csv">CSV</option>
      </select>
      <button class="tb-btn" type="button" :disabled="!!busy" @click="runDetail()">
        <AppIcon name="download" :size="14" />
        导出
      </button>
    </div>
    <span class="tb-note">一键日报=昨日窗口 · 一键周报=近7天 · PDF 与明细跟随看板当前窗口 · 设置页可选默认导出目录</span>
  </div>
</template>

<style scoped>
.report-toolbar {
  display: flex;
  align-items: center;
  gap: 18px;
  flex-wrap: wrap;
  padding: 12px 16px;
  margin-bottom: 18px;
}
.tb-group {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}
.tb-title {
  font-size: 12px;
  font-weight: 700;
  color: var(--text-secondary);
  margin-right: 2px;
}
.tb-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 32px;
  padding: 0 12px;
  border: 1px solid var(--border);
  border-radius: 9px;
  background: var(--bg-base);
  color: var(--text-secondary);
  font-size: 12.5px;
  font-weight: 600;
  cursor: pointer;
  transition: border-color 0.15s ease, color 0.15s ease, background 0.15s ease;
}
.tb-btn:hover:not(:disabled) {
  border-color: var(--accent);
  color: var(--accent);
}
.tb-btn.primary {
  border-color: var(--accent);
  background: var(--accent-soft);
  color: var(--accent);
}
.tb-btn:disabled {
  opacity: 0.5;
  cursor: default;
}
.tb-select {
  height: 32px;
  padding: 0 8px;
  border: 1px solid var(--border);
  border-radius: 9px;
  background: var(--bg-base);
  color: var(--text-secondary);
  font-size: 12.5px;
  outline: none;
}
.tb-note {
  margin-left: auto;
  font-size: 11px;
  color: var(--text-tertiary);
}
</style>
