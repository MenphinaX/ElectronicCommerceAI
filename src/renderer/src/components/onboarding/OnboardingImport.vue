<!-- 首次引导第 3 步：拖拽/选择导入九源，走与导入中心完全相同的 analyze/run 链路 -->
<script setup lang="ts">
import { ref } from 'vue'
import AppIcon from '../AppIcon.vue'

interface PickItem {
  path: string
  name: string
  detectedLabel: string
  reason: string | null
}

interface RunResult {
  file: string
  detectedLabel: string
  status: 'ok' | 'failed' | 'skipped'
  rows: number
  message: string
}

const props = defineProps<{ shopId: number }>()
const emit = defineEmits<{ imported: [results: RunResult[]] }>()

const fileInput = ref<HTMLInputElement | null>(null)
const items = ref<PickItem[]>([])
const results = ref<RunResult[]>([])
const running = ref(false)
const dragging = ref(false)
const done = ref(false)

function openPicker(): void {
  fileInput.value?.click()
}

async function addPaths(paths: string[]): Promise<void> {
  if (paths.length === 0) return
  const analyzed = (await window.api.importData.analyze(paths)) as unknown as PickItem[]
  items.value = [...items.value, ...analyzed].filter((it, i, arr) => arr.findIndex((x) => x.path === it.path) === i)
  results.value = []
  done.value = false
}

async function onInputChange(event: Event): Promise<void> {
  const input = event.target as HTMLInputElement
  if (!input.files) return
  const paths: string[] = []
  for (const f of Array.from(input.files)) {
    const p = window.api.webUtils.getPathForFile(f)
    if (p) paths.push(p)
  }
  input.value = ''
  await addPaths(paths)
}

async function onDrop(event: DragEvent): Promise<void> {
  dragging.value = false
  const files = event.dataTransfer?.files
  if (!files || files.length === 0) return
  const paths: string[] = []
  for (const f of Array.from(files)) {
    const p = window.api.webUtils.getPathForFile(f)
    if (p) paths.push(p)
  }
  await addPaths(paths)
}

function removeItem(path: string): void {
  items.value = items.value.filter((i) => i.path !== path)
}

async function doImport(): Promise<void> {
  if (items.value.length === 0 || running.value || !props.shopId) return
  running.value = true
  try {
    const res = (await window.api.importData.run({
      paths: items.value.map((i) => i.path),
      shopId: props.shopId,
      allowFallback: false
    })) as unknown as RunResult[]
    results.value = res
    items.value = []
    done.value = true
    emit('imported', res)
  } finally {
    running.value = false
  }
}
</script>

<template>
  <div class="ob-import">
    <input ref="fileInput" class="hidden-input" type="file" multiple accept=".csv,.xls,.xlsx" @change="onInputChange" />
    <div
      class="dropzone"
      :class="{ dragging }"
      role="button"
      tabindex="0"
      @click="openPicker"
      @keydown.enter="openPicker"
      @dragover.prevent="dragging = true"
      @dragleave="dragging = false"
      @drop.prevent="onDrop"
    >
      <AppIcon name="upload" :size="30" class="dz-icon" />
      <span class="dz-main">拖入文件，或点击选择</span>
      <span class="dz-sub">支持 9 个生意参谋报表文件（csv / xls / xlsx），可多选</span>
    </div>

    <div v-if="items.length" class="file-list">
      <div v-for="it in items" :key="it.path" class="file-item">
        <AppIcon name="file" :size="15" class="file-icon" />
        <span class="file-name">{{ it.name }}</span>
        <span class="file-detect" :class="{ unknown: !it.detectedLabel }">{{ it.detectedLabel || '待识别' }}</span>
        <span v-if="it.reason" class="file-err" :title="it.reason">需检查</span>
        <button class="icon-sm" type="button" title="移除" @click="removeItem(it.path)">
          <AppIcon name="close" :size="14" />
        </button>
      </div>
      <div class="run-row">
        <button class="btn btn-primary" type="button" :disabled="running || !items.length" @click="doImport">
          {{ running ? '导入中…' : `导入 ${items.length} 个文件` }}
        </button>
        <span class="run-hint">导入后数据归属当前店铺，可在导入中心查看历史</span>
      </div>
    </div>

    <div v-if="results.length" class="results">
      <p class="results-title">导入结果（共 {{ results.length }} 个文件）</p>
      <div v-for="r in results" :key="r.file" class="result-item">
        <span class="check" :class="r.status">✓</span>
        <span class="result-name">{{ r.detectedLabel || r.file }}</span>
        <span v-if="r.status === 'ok'" class="result-rows">入库 {{ r.rows }} 行</span>
        <span v-else-if="r.status === 'skipped'" class="result-status skipped">已跳过</span>
        <span v-else class="result-status failed">失败</span>
        <span class="result-msg">{{ r.message }}</span>
      </div>
      <p v-if="done" class="done-note">全部文件处理完成，可进入下一步生成首批评语</p>
    </div>
  </div>
</template>

<style scoped>
.hidden-input {
  display: none;
}
.dropzone {
  border: 1.5px dashed var(--border);
  border-radius: 16px;
  padding: 38px 20px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  transition: border-color 0.15s ease, background 0.15s ease;
}
.dropzone:hover,
.dropzone.dragging {
  border-color: var(--accent);
  background: var(--accent-soft);
}
.dz-icon {
  color: var(--accent);
}
.dz-main {
  font-size: 14px;
  font-weight: 600;
}
.dz-sub {
  font-size: 12px;
  color: var(--text-tertiary);
}
.file-list {
  margin-top: 14px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.file-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 12px;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: var(--bg-base);
  animation: pop 0.3s ease;
}
.file-icon {
  color: var(--accent);
  flex-shrink: 0;
}
.file-name {
  flex: 1;
  font-size: 12.5px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.file-detect {
  font-size: 11px;
  padding: 2px 8px;
  border-radius: 999px;
  background: var(--accent-soft);
  color: var(--accent);
  white-space: nowrap;
}
.file-detect.unknown {
  background: var(--bg-hover);
  color: var(--text-tertiary);
}
.file-err {
  font-size: 11px;
  color: var(--warning);
}
.icon-sm {
  width: 26px;
  height: 26px;
  border: none;
  border-radius: 7px;
  background: transparent;
  color: var(--text-tertiary);
  display: grid;
  place-items: center;
  cursor: pointer;
}
.icon-sm:hover {
  background: var(--bg-hover);
  color: var(--danger);
}
.run-row {
  display: flex;
  align-items: center;
  gap: 14px;
  margin-top: 12px;
}
.run-hint {
  font-size: 11.5px;
  color: var(--text-tertiary);
}
.results {
  margin-top: 16px;
  border-top: 1px solid var(--border);
  padding-top: 12px;
}
.results-title {
  margin: 0 0 8px;
  font-size: 13px;
  font-weight: 700;
}
.result-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 7px 4px;
  font-size: 12.5px;
  border-bottom: 1px solid var(--border);
  flex-wrap: wrap;
}
.check {
  width: 18px;
  height: 18px;
  border-radius: 50%;
  display: grid;
  place-items: center;
  font-size: 11px;
  font-weight: 700;
  flex-shrink: 0;
}
.check.ok {
  background: var(--accent-soft);
  color: var(--accent);
  animation: pop 0.35s ease;
}
.check.skipped {
  background: var(--bg-hover);
  color: var(--text-tertiary);
}
.check.failed {
  background: rgba(229, 72, 77, 0.15);
  color: var(--danger);
}
.result-name {
  min-width: 160px;
  font-weight: 600;
}
.result-rows {
  color: var(--text-secondary);
}
.result-status {
  font-size: 11px;
  padding: 2px 8px;
  border-radius: 999px;
}
.result-status.skipped {
  background: var(--bg-hover);
  color: var(--text-tertiary);
}
.result-status.failed {
  background: rgba(229, 72, 77, 0.15);
  color: var(--danger);
}
.result-msg {
  color: var(--text-secondary);
  font-size: 12px;
}
.done-note {
  margin: 10px 0 0;
  font-size: 12.5px;
  color: var(--accent);
  font-weight: 600;
}
.btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 36px;
  padding: 0 18px;
  border: none;
  border-radius: 999px;
  background: var(--bg-hover);
  color: var(--text-primary);
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
}
.btn:hover:not(:disabled) {
  filter: brightness(1.1);
}
.btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.btn-primary {
  background: var(--accent);
  color: #000000;
}
@keyframes pop {
  0% {
    transform: scale(0.85);
    opacity: 0.4;
  }
  100% {
    transform: scale(1);
    opacity: 1;
  }
}
</style>