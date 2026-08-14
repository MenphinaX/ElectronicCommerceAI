<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import AppIcon from '../AppIcon.vue'
import { useShopsStore } from '../../stores/shops'
import { useDialogStore } from '../../stores/dialog'

interface PickItem {
  path: string
  name: string
  detectedType: string | null
  detectedLabel: string
  headerRow: number
  reason: string | null
  decodeError: string | null
}

interface RunResult {
  file: string
  detectedLabel: string
  status: 'ok' | 'failed' | 'skipped'
  rows: number
  elapsedMs: number
  message: string
  issues: string[]
  fallbackUsed?: boolean
}

const emit = defineEmits<{ imported: [] }>()

const shops = useShopsStore()
const dialog = useDialogStore()

const fileInput = ref<HTMLInputElement | null>(null)
const items = ref<PickItem[]>([])
const running = ref(false)
const dragging = ref(false)
const allowFallback = ref(false)
const llmStatus = ref<{ configured: boolean; baseUrl: string | null; model: string | null }>({ configured: false, baseUrl: null, model: null })
const showLlmConfig = ref(false)
const llmBase = ref('')
const llmModel = ref('')
const llmKey = ref('')
const keySet = ref(false)
const results = ref<RunResult[]>([])

const shopId = computed(() => shops.defaultId)

onMounted(async () => {
  await shops.refresh()
  await loadLlmStatus()
})

async function loadLlmStatus(): Promise<void> {
  llmStatus.value = await window.api.importData.llmStatus()
  const cfg = await window.api.importData.llmConfigGet()
  llmBase.value = cfg.baseUrl ?? ''
  llmModel.value = cfg.model ?? ''
  keySet.value = !!cfg.keySet
}

function openPicker(): void {
  fileInput.value?.click()
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

async function addPaths(paths: string[]): Promise<void> {
  if (paths.length === 0) {
    dialog.error('无法获取文件路径', '拖入的文件可能不是本机文件，请改用「选择文件」')
    return
  }
  const analyzed = (await window.api.importData.analyze(paths)) as unknown as PickItem[]
  items.value = [...items.value, ...analyzed].filter(
    (it, i, arr) => arr.findIndex((x) => x.path === it.path) === i
  )
  results.value = []
}

function removeItem(path: string): void {
  items.value = items.value.filter((i) => i.path !== path)
}

function clearAll(): void {
  items.value = []
  results.value = []
}

async function doImport(): Promise<void> {
  if (items.value.length === 0) return
  if (!shopId.value) {
    dialog.error('请先创建店铺', '导入数据必须归属某个店铺，请先在「店铺管理」新建店铺')
    return
  }
  if (allowFallback.value && !llmStatus.value.configured) {
    dialog.error('未配置 AI 模型', '已勾选 AI 兜底，但未配置模型。请先配置 base_url / API key / 模型，或取消勾选。')
    return
  }
  if (allowFallback.value && llmStatus.value.configured) {
    const names = items.value.map((i) => i.name).join('、')
    const confirmed = await dialog.confirmAsync(
      'AI 兜底确认',
      `本地解析失败的文件将发送给你配置的 AI 服务商（${llmStatus.value.model}）解析：${names}\n确定继续？`
    )
    if (!confirmed) return
  }
  running.value = true
  try {
    const res = (await window.api.importData.run({
      paths: items.value.map((i) => i.path),
      shopId: shopId.value,
      allowFallback: allowFallback.value
    })) as unknown as RunResult[]
    results.value = res
    items.value = []
    emit('imported')
  } catch (e) {
    dialog.error('导入失败', (e as Error).message)
  } finally {
    running.value = false
  }
}

async function saveLlmConfig(): Promise<void> {
  if (!llmBase.value.trim() || !llmModel.value.trim() || !llmKey.value.trim()) {
    dialog.error('信息不完整', '请填写 base_url、模型名与 API key')
    return
  }
  try {
    await window.api.importData.llmConfigSet({ baseUrl: llmBase.value, model: llmModel.value, apiKey: llmKey.value })
    llmKey.value = ''
    await loadLlmStatus()
    dialog.info('已保存', 'AI 兜底配置已保存（API key 已加密存储）')
  } catch (e) {
    dialog.error('保存失败', (e as Error).message)
  }
}

const statusColor: Record<string, string> = { ok: 'var(--accent)', failed: '#ff6b6b', skipped: 'var(--text-tertiary)' }
</script>

<template>
  <section class="glass-card block">
    <div class="block-head">
      <div>
        <h3 class="block-title">数据导入</h3>
        <p class="block-desc">拖拽或选择文件，多文件批量；识别规则 = 文件名关键词 + 表头双重判断</p>
      </div>
      <div class="shop-tip">
        归属店铺：
        <span class="shop-tip-val">{{ shops.defaultShop?.name ?? '未设置' }}</span>
      </div>
    </div>

    <div
      class="dropzone"
      :class="{ dragging }"
      @dragover.prevent="dragging = true"
      @dragleave.prevent="dragging = false"
      @drop.prevent="onDrop"
      @click="openPicker"
    >
      <AppIcon name="upload" :size="26" class="dz-icon" />
      <div class="dz-main">拖拽文件到这里，或点击选择文件</div>
      <div class="dz-sub">支持 csv / xls / xlsx，一次可多选（9 类数据源）</div>
      <input ref="fileInput" type="file" class="hidden-input" multiple accept=".csv,.xls,.xlsx" @change="onInputChange" />
    </div>

    <div v-if="items.length > 0" class="file-list">
      <div v-for="it in items" :key="it.path" class="file-item">
        <AppIcon name="file" :size="15" class="file-icon" />
        <span class="file-name" :title="it.path">{{ it.name }}</span>
        <span class="file-detect" :class="{ unknown: !it.detectedType }">
          {{ it.detectedLabel }}
        </span>
        <span v-if="it.decodeError" class="file-err" :title="it.decodeError">解码失败</span>
        <button class="icon-sm" title="移除" aria-label="移除" @click="removeItem(it.path)">
          <AppIcon name="trash" :size="13" />
        </button>
      </div>
      <div class="file-actions">
        <button class="btn ghost sm" @click="clearAll">清空</button>
      </div>
    </div>

    <div class="run-row">
      <label class="chk">
        <input v-model="allowFallback" type="checkbox" />
        <span>本地解析失败时使用 AI 兜底</span>
        <span class="llm-state" :class="{ off: !llmStatus.configured }">
          {{ llmStatus.configured ? `已配置：${llmStatus.model}` : '未配置模型' }}
        </span>
      </label>
      <button class="btn primary" :disabled="running || items.length === 0" @click="doImport">
        <AppIcon v-if="running" name="refresh" :size="15" class="spin" />
        <AppIcon v-else name="upload" :size="15" />
        {{ running ? '导入中…' : `导入 ${items.length} 个文件` }}
      </button>
    </div>

    <button class="link-btn" @click="showLlmConfig = !showLlmConfig">
      <AppIcon name="settings" :size="13" /> AI 兜底模型配置
    </button>
    <div v-if="showLlmConfig" class="llm-config">
      <input v-model="llmBase" class="input" placeholder="base_url（OpenAI 兼容，如 http://127.0.0.1:11434/v1）" />
      <input v-model="llmModel" class="input" placeholder="模型名（如 deepseek-v4-flash / gpt-5.5）" />
      <input v-model="llmKey" type="password" class="input" :placeholder="keySet ? '已设置 API key（留空不修改）' : 'API key'" />
      <button class="btn primary sm" @click="saveLlmConfig">保存配置</button>
    </div>

    <div v-if="results.length > 0" class="results">
      <h4 class="results-title">导入结果</h4>
      <div v-for="r in results" :key="r.file" class="result-item">
        <span class="result-dot" :style="{ background: statusColor[r.status] }"></span>
        <span class="result-name">{{ r.file }}</span>
        <span class="result-type">{{ r.detectedLabel }}</span>
        <span class="result-rows">{{ r.status === 'ok' ? r.rows + ' 行' : '-' }}</span>
        <span class="result-ms">{{ r.elapsedMs }} ms</span>
        <span class="result-status" :class="r.status">{{ r.status === 'ok' ? '成功' : r.status === 'skipped' ? '已存在跳过' : '失败' }}</span>
        <span class="result-msg" :title="r.message">{{ r.message }}</span>
        <details v-if="r.issues.length > 0" class="result-issues">
          <summary>问题清单（{{ r.issues.length }}）</summary>
          <ul><li v-for="(m, i) in r.issues" :key="i">{{ m }}</li></ul>
        </details>
      </div>
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
.shop-tip {
  font-size: 12px;
  color: var(--text-tertiary);
  white-space: nowrap;
}
.shop-tip-val {
  color: var(--accent);
  font-weight: 600;
}
.dropzone {
  border: 1.5px dashed var(--border);
  border-radius: 14px;
  padding: 34px 20px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
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
.hidden-input {
  display: none;
}
.file-list {
  margin-top: 12px;
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
  color: #ff6b6b;
}
.file-actions {
  display: flex;
  justify-content: flex-end;
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
  color: #ff6b6b;
}
.run-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-top: 14px;
}
.chk {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: var(--text-secondary);
  cursor: pointer;
}
.llm-state {
  font-size: 11px;
  color: var(--accent);
}
.llm-state.off {
  color: var(--text-tertiary);
}
.btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 34px;
  padding: 0 14px;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: var(--bg-hover);
  color: var(--text-primary);
  font-size: 13px;
  cursor: pointer;
  white-space: nowrap;
}
.btn:hover:not(:disabled) {
  filter: brightness(1.12);
}
.btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.btn.primary {
  background: var(--accent);
  border-color: var(--accent);
  color: #000;
  font-weight: 600;
}
.btn.sm {
  height: 30px;
  padding: 0 12px;
  font-size: 12px;
}
.btn.ghost {
  background: transparent;
  border-color: transparent;
  color: var(--text-secondary);
}
.spin {
  animation: spin 0.9s linear infinite;
}
@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
.link-btn {
  margin-top: 10px;
  border: none;
  background: transparent;
  color: var(--text-secondary);
  font-size: 12px;
  display: inline-flex;
  align-items: center;
  gap: 5px;
  cursor: pointer;
}
.link-btn:hover {
  color: var(--text-primary);
}
.llm-config {
  margin-top: 10px;
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}
.input {
  height: 32px;
  padding: 0 12px;
  border-radius: 9px;
  border: 1px solid var(--border);
  background: var(--bg-hover);
  color: var(--text-primary);
  font-size: 12.5px;
  outline: none;
  min-width: 220px;
  flex: 1;
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
.result-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
}
.result-name {
  min-width: 180px;
  font-weight: 600;
}
.result-type,
.result-rows,
.result-ms {
  color: var(--text-tertiary);
  min-width: 60px;
}
.result-status {
  padding: 2px 8px;
  border-radius: 999px;
  font-size: 11px;
}
.result-status.ok {
  background: var(--accent-soft);
  color: var(--accent);
}
.result-status.failed {
  background: rgba(255, 107, 107, 0.14);
  color: #ff6b6b;
}
.result-status.skipped {
  background: var(--bg-hover);
  color: var(--text-tertiary);
}
.result-msg {
  color: var(--text-secondary);
  font-size: 12px;
}
.result-issues {
  width: 100%;
  font-size: 12px;
  color: var(--text-tertiary);
}
.result-issues summary {
  cursor: pointer;
}
.result-issues ul {
  margin: 4px 0 0;
  padding-left: 18px;
}
</style>