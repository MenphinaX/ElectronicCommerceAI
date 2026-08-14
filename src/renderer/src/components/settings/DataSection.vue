<!-- 数据维护（任务 10）：手动备份/从备份恢复/数据库完整性体检/一键瘦身（VACUUM） -->
<script setup lang="ts">
import { onMounted, ref } from 'vue'
import AppIcon from '../AppIcon.vue'
import { useDialogStore } from '../../stores/dialog'
import { useSettingsStore } from '../../stores/settings'

const dialog = useDialogStore()
const settings = useSettingsStore()

const dbPath = ref('')
const dbBytes = ref(0)
const backups = ref<string[]>([])
const busy = ref<'backup' | 'restore' | 'vacuum' | 'integrity' | null>(null)
const lastResult = ref('')

onMounted(refresh)

async function refresh(): Promise<void> {
  const status = (await window.api.db.status()) as Record<string, unknown>
  dbPath.value = String(status.path ?? '')
  const size = await window.api.system.dbSize()
  dbBytes.value = size.bytes
  backups.value = await window.api.db.listBackups()
}

function fmtBytes(n: number): string {
  if (!n) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB']
  let v = n
  let i = 0
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024
    i++
  }
  return `${v.toFixed(v >= 100 ? 0 : 1)} ${units[i]}`
}

async function backup(): Promise<void> {
  if (busy.value) return
  busy.value = 'backup'
  try {
    const r = await window.api.db.backup('manual')
    await refresh()
    lastResult.value = `已备份：${r.path}`
    dialog.info('备份完成', '已生成一致性快照并保留最近 5 份')
  } finally {
    busy.value = null
  }
}

async function restore(): Promise<void> {
  if (busy.value) return
  const picked = await window.api.system.pickFile({
    title: '选择备份文件',
    filters: [{ name: '数据库备份', extensions: ['db'] }]
  })
  if (!picked.ok || !picked.filePath) return
  const confirmed = await dialog.confirmAsync(
    '恢复备份',
    '恢复会用备份覆盖当前数据，建议先手动备份一次当前数据。确定继续？'
  )
  if (!confirmed) return
  busy.value = 'restore'
  try {
    const r = await window.api.db.restore(picked.filePath)
    await refresh()
    lastResult.value = `已从备份恢复，完整性检查：${r.integrity}`
    dialog.info('恢复完成', `数据库完整性检查：${r.integrity}`)
  } catch (e) {
    dialog.error('恢复失败', (e as Error).message)
  } finally {
    busy.value = null
  }
}

async function vacuum(): Promise<void> {
  if (busy.value) return
  busy.value = 'vacuum'
  try {
    const r = await window.api.system.vacuum()
    await refresh()
    lastResult.value = `瘦身完成：${fmtBytes(r.before)} → ${fmtBytes(r.after)}`
    dialog.info('瘦身完成', `数据库从 ${fmtBytes(r.before)} 压缩到 ${fmtBytes(r.after)}`)
  } catch (e) {
    dialog.error('瘦身失败', (e as Error).message)
  } finally {
    busy.value = null
  }
}

async function integrity(): Promise<void> {
  if (busy.value) return
  busy.value = 'integrity'
  try {
    const r = await window.api.db.integrity()
    lastResult.value = `完整性检查：${r}`
    if (r === 'ok') dialog.info('检查通过', '数据库完整性检查通过')
    else dialog.error('发现异常', `完整性检查结果：${r}`)
  } finally {
    busy.value = null
  }
}

function openDataDir(): void {
  void window.api.system.openPath(dbPath.value)
}

function openFile(path: string): void {
  void window.api.system.openPath(path)
}

function openBackupDir(): void {
  void window.api.system.openPath(dbPath.value.replace(/ecai\.db$/, 'backups'))
}
</script>

<template>
  <section class="glass-card setting-block">
    <h3 class="block-title">数据与备份</h3>
    <p class="block-desc">数据只存本机。建议定期手动备份；恢复会覆盖当前数据</p>
    <div class="db-row">
      <span class="db-path" :title="dbPath">{{ dbPath || '加载中…' }}</span>
      <button class="link-btn" type="button" @click="openDataDir">打开所在目录</button>
    </div>
    <div class="stat-row">
      <span class="stat-chip">当前大小 {{ fmtBytes(dbBytes) }}</span>
      <span class="stat-chip">备份 {{ backups.length }} 份</span>
    </div>
    <div class="actions">
      <button class="btn btn-ghost" type="button" :disabled="!!busy" @click="backup">
        <AppIcon name="download" :size="15" />手动备份
      </button>
      <button class="btn btn-ghost" type="button" :disabled="!!busy" @click="restore">
        <AppIcon name="upload" :size="15" />从备份恢复
      </button>
      <button class="btn btn-ghost" type="button" :disabled="!!busy" @click="integrity">
        <AppIcon name="db" :size="15" />完整性体检
      </button>
      <button class="btn btn-ghost" type="button" :disabled="!!busy" @click="vacuum">
        <AppIcon name="bolt" :size="15" />数据库瘦身
      </button>
    </div>
    <div v-if="backups.length" class="backup-list">
      <p class="list-title">最近备份</p>
      <div v-for="b in backups.slice(-5).reverse()" :key="b" class="backup-item">
        <span class="backup-name" :title="b">{{ b.split('\\').pop() }}</span>
        <button class="link-btn" type="button" @click="openFile(b)">打开</button>
      </div>
    </div>
    <p v-if="lastResult" class="last-result">{{ lastResult }}</p>
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
}
.db-row {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-top: 12px;
  flex-wrap: wrap;
}
.db-path {
  font-family: Consolas, monospace;
  font-size: 12px;
  color: var(--text-tertiary);
  word-break: break-all;
  flex: 1;
  min-width: 200px;
}
.link-btn {
  border: none;
  background: transparent;
  color: var(--text-secondary);
  font-size: 12px;
  cursor: pointer;
  white-space: nowrap;
}
.link-btn:hover {
  color: var(--accent);
}
.stat-row {
  display: flex;
  gap: 10px;
  margin-top: 10px;
  flex-wrap: wrap;
}
.stat-chip {
  font-size: 11.5px;
  padding: 4px 12px;
  border-radius: 999px;
  background: var(--bg-hover);
  color: var(--text-secondary);
}
.actions {
  display: flex;
  gap: 10px;
  margin-top: 16px;
  flex-wrap: wrap;
}
.backup-list {
  margin-top: 14px;
  border-top: 1px solid var(--border);
  padding-top: 10px;
}
.list-title {
  margin: 0 0 6px;
  font-size: 12px;
  font-weight: 700;
  color: var(--text-secondary);
}
.backup-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 4px 0;
  font-size: 12px;
}
.backup-name {
  font-family: Consolas, monospace;
  color: var(--text-tertiary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.last-result {
  margin: 12px 0 0;
  font-size: 12px;
  color: var(--accent);
}
</style>