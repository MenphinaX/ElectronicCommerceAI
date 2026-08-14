<!-- 日志查看与一键导出诊断包（任务 10）：日志已脱敏（机器码/key/订单号/金额打码） -->
<script setup lang="ts">
import { onMounted, ref } from 'vue'
import AppIcon from '../AppIcon.vue'
import { useDialogStore } from '../../stores/dialog'

const dialog = useDialogStore()
const lines = ref<string[]>([])
const exporting = ref(false)
const logError = ref('')

onMounted(load)

async function load(): Promise<void> {
  const r = await window.api.system.logs()
  lines.value = r.lines
  logError.value = r.error ?? ''
}

async function exportDiagnostics(): Promise<void> {
  if (exporting.value) return
  exporting.value = true
  try {
    const r = await window.api.system.diagnostics()
    if (r.ok && r.path) {
      dialog.info('诊断包已导出', '已生成脱敏诊断包：\n' + r.path)
    } else {
      dialog.error('导出失败', r.error || '未能生成诊断包')
    }
  } finally {
    exporting.value = false
  }
}
</script>

<template>
  <section class="glass-card setting-block">
    <h3 class="block-title">日志与诊断</h3>
    <p class="block-desc">日志已自动脱敏（机器码、API key、订单号、金额均打码）；诊断包含版本号与系统信息，供排查问题</p>
    <div class="log-actions">
      <button class="btn btn-ghost" type="button" @click="load">
        <AppIcon name="refresh" :size="15" />刷新日志
      </button>
      <button class="btn btn-primary" type="button" :disabled="exporting" @click="exportDiagnostics">
        <AppIcon name="export" :size="15" />{{ exporting ? '导出中…' : '一键导出诊断包' }}
      </button>
    </div>
    <p v-if="logError" class="log-err">{{ logError }}</p>
    <pre v-if="lines.length" class="log-view">{{ lines.join('\n') }}</pre>
    <p v-else class="log-empty">暂无日志</p>
  </section>
</template>

<style scoped>
.setting-block {
  padding: 20px;
  margin-bottom: 16px;
  max-width: 760px;
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
  line-height: 1.7;
}
.log-actions {
  display: flex;
  gap: 10px;
  margin-top: 14px;
  flex-wrap: wrap;
}
.log-err {
  margin: 10px 0 0;
  font-size: 12px;
  color: var(--danger);
}
.log-view {
  margin: 12px 0 0;
  max-height: 240px;
  overflow: auto;
  padding: 12px;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: var(--bg-base);
  font-family: Consolas, monospace;
  font-size: 11px;
  line-height: 1.6;
  color: var(--text-secondary);
  white-space: pre-wrap;
  word-break: break-all;
  user-select: text;
}
.log-empty {
  margin: 12px 0 0;
  font-size: 12px;
  color: var(--text-tertiary);
}
</style>