<!-- 聊天质检页（任务 6）：导入记录 -> 可编辑提示词 -> 流式质检报告 -> 历史留痕 -->
<script setup lang="ts">
// 任务 4F ②：keep-alive 保活名（App.vue KeepAlive include 匹配）
defineOptions({ name: 'QaView' })
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { buildQaHistoryCsv } from '../utils/qa-export'
import PageShell from '../components/PageShell.vue'
import AppIcon from '../components/AppIcon.vue'
import { renderMarkdown } from '../utils/markdown'

interface ParsedFile {
  name: string
  count: number
  error?: string
}
interface QaStats {
  sessions: number
  agents: string[]
  start: string
  end: string
}
interface QaRunRow {
  id: number
  fileCount: number
  sessionCount: number
  agentCount?: number
  model: string
  elapsedMs: number
  status: string
  report: string
  createdAt: string
}

const files = ref<ParsedFile[]>([])
const filePaths = ref<string[]>([])
const stats = ref<QaStats | null>(null)
const recordCount = ref(0)
const dragOver = ref(false)
const fileInput = ref<HTMLInputElement | null>(null)

const promptText = ref('')
const promptSaved = ref(false)
const promptExists = ref(false)
const promptSource = ref('')

const running = ref(false)
const streamText = ref('')
const resultStats = ref<QaStats | null>(null)
const resultElapsed = ref(0)
const runError = ref('')
const notice = ref('')

const history = ref<QaRunRow[]>([])
const expanded = ref(0)
const offs: Array<() => void> = []

const reportHtml = computed(() => renderMarkdown(streamText.value || ''))

function collectPaths(list: FileList | null): string[] {
  return Array.from(list ?? []).map((f) => window.api.webUtils.getPathForFile(f)).filter(Boolean)
}

async function onPick(e: Event): Promise<void> {
  const el = e.target as HTMLInputElement
  await parseFiles(collectPaths(el.files))
  el.value = ''
}

async function parseFiles(paths: string[]): Promise<void> {
  if (!paths.length) return
  runError.value = ''
  try {
    const res = (await window.api.qa.parse(paths)) as { files: ParsedFile[]; records: unknown[]; stats: QaStats }
    files.value = res.files ?? []
    filePaths.value = paths
    recordCount.value = (res.records ?? []).length
    stats.value = res.stats ?? null
  } catch (err) {
    runError.value = '解析失败：' + (err as Error).message
  }
}

function onDrop(e: DragEvent): void {
  dragOver.value = false
  void parseFiles(collectPaths(e.dataTransfer?.files ?? null))
}

async function loadPrompt(): Promise<void> {
  try {
    const res = (await window.api.qa.promptGet()) as { currentText: string; exists: boolean; sourceFile: string }
    promptText.value = res.currentText ?? ''
    promptExists.value = !!res.exists
    promptSource.value = res.sourceFile ?? ''
  } catch (err) {
    runError.value = '提示词载入失败：' + (err as Error).message
  }
}

async function savePrompt(): Promise<void> {
  await window.api.qa.promptSet(promptText.value)
  promptSaved.value = true
  setTimeout(() => (promptSaved.value = false), 2000)
}

async function resetPrompt(): Promise<void> {
  const res = (await window.api.qa.promptReset()) as { currentText: string }
  promptText.value = res.currentText ?? ''
}

async function runQa(): Promise<void> {
  if (running.value || !filePaths.value.length) return
  running.value = true
  runError.value = ''
  notice.value = ''
  streamText.value = ''
  resultStats.value = null
  let res: { ok: boolean; message?: string }
  try {
    // ref 数组 .value 是响应式 Proxy，过 IPC 会报 "could not be cloned"，先展开为普通数组
    res = await window.api.qa.run({ paths: [...filePaths.value], prompt: promptText.value })
    void window.api.debug.log('QA-RUN-RES:' + JSON.stringify(res))
  } catch (err) {
    res = { ok: false, message: (err as Error).message }
  }
  if (!res.ok) {
    runError.value = res.message ?? '质检失败'
    running.value = false
    void refreshHistory()
  }
}

async function refreshHistory(): Promise<void> {
  try {
    history.value = (await window.api.qa.history()) as unknown as QaRunRow[]
  } catch {
    history.value = []
  }
}

async function copyReport(): Promise<void> {
  const text = streamText.value
  if (!text) return
  try {
    await navigator.clipboard.writeText(text)
    notice.value = '已复制到剪贴板'
  } catch {
    const ta = document.createElement('textarea')
    ta.value = text
    document.body.appendChild(ta)
    ta.select()
    document.execCommand('copy')
    ta.remove()
    notice.value = '已复制到剪贴板'
  }
  setTimeout(() => (notice.value = ''), 2000)
}

function downloadText(text: string, filename: string, mime = 'text/plain;charset=utf-8'): void {
  const blob = new Blob([text], { type: mime })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 2000)
}

function exportTxt(): void {
  const text = streamText.value
  if (!text) return
  downloadText(text, `聊天质检报告-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.txt`)
}

// 任务 4F ③：质检历史导出——单条 md/txt + 批量汇总 csv（内容与库中 qa_runs 一致）
function histStamp(id: number, createdAt: string): string {
  return `${id}-${String(createdAt).replace(/[: ]/g, '-')}`
}

function exportHistoryMd(h: QaRunRow): void {
  if (!h.report) return
  downloadText(h.report, `质检报告-${histStamp(h.id, h.createdAt)}.md`)
}

function exportHistoryTxt(h: QaRunRow): void {
  if (!h.report) return
  downloadText(h.report, `质检报告-${histStamp(h.id, h.createdAt)}.txt`)
}

function exportHistoryCsv(): void {
  if (!history.value.length) return
  const csv = buildQaHistoryCsv(history.value.map((h) => ({
    id: h.id, createdAt: h.createdAt, fileCount: h.fileCount, sessionCount: h.sessionCount,
    agentCount: h.agentCount ?? 0, model: h.model, elapsedMs: h.elapsedMs, status: h.status, report: h.report
  })))
  // UTF-8 BOM，Excel 直接打开不乱码
  downloadText('\uFEFF' + csv, `质检历史汇总-${new Date().toISOString().slice(0, 10)}.csv`, 'text/csv;charset=utf-8')
}

function fmtMs(ms: number): string {
  if (!ms) return '--'
  return ms >= 60000 ? `${(ms / 60000).toFixed(1)} 分钟` : `${Math.round(ms / 1000)} 秒`
}

onMounted(async () => {
  await loadPrompt()
  await refreshHistory()
  // 验收辅助（仅 EC_AI_AUTOSHOT 注入时生效）：用真实 Desktop 聊天记录走真实 parse IPC
  const acceptPaths = (window as unknown as { __QA_ACCEPT_PATHS__?: string[] }).__QA_ACCEPT_PATHS__
  if (acceptPaths && acceptPaths.length) {
    await parseFiles(acceptPaths)
    void window.api.debug.log('QA-ACCEPT-PARSE:' + JSON.stringify({ parsed: files.value.length, records: recordCount.value, sessions: stats.value?.sessions ?? 0 }))
  }
  offs.push(window.api.qa.onChunk((p) => (streamText.value += p.delta)))
  offs.push(window.api.qa.onDone((p) => {
    streamText.value = p.content
    resultStats.value = p.stats as unknown as QaStats
    resultElapsed.value = p.elapsedMs
    running.value = false
    if (p.truncated) notice.value = '报告较长，模型输出在部分批次被截断，已保留全部已生成内容'
    void refreshHistory()
  }))
  offs.push(window.api.qa.onError((p) => {
    runError.value = p.message
    if (p.truncated) notice.value = '报告超长被模型截断，已保留已生成部分；可减少导入量或调大输出上限后重试'
    running.value = false
    void refreshHistory()
  }))
  offs.push(window.api.qa.onNotice((p) => (notice.value = p.message)))
})

onBeforeUnmount(() => {
  for (const off of offs) off()
})
</script>

<template>
  <PageShell title="聊天质检" desc="导入客服聊天记录 · 可编辑提示词 · AI 质检报告 · 历史留痕">
    <div class="qa-layout">
      <div class="qa-left">
        <section class="card">
          <h3 class="card-title">导入聊天记录</h3>
          <div
            class="drop-zone"
            :class="{ over: dragOver }"
            @dragover.prevent="dragOver = true"
            @dragleave="dragOver = false"
            @drop.prevent="onDrop"
          >
            <AppIcon name="upload" :size="26" />
            <p>拖拽 csv / txt / json 文件到此处，或多选导入</p>
            <button class="btn btn-primary" type="button" @click="fileInput?.click()">选择文件</button>
            <input ref="fileInput" type="file" multiple accept=".csv,.txt,.json" style="display: none" @change="onPick" />
          </div>
          <div v-if="files.length" class="file-preview">
            <div v-for="f in files" :key="f.name" class="file-row" :class="{ err: f.error }">
              <AppIcon name="file" :size="14" />
              <span class="f-name">{{ f.name }}</span>
              <span class="f-count">{{ f.error || `${f.count} 条` }}</span>
            </div>
            <div v-if="stats" class="stats-line">
              会话 {{ stats.sessions }} 个 · 客服 {{ stats.agents.length }} 名 · 消息 {{ recordCount }} 条 · {{ stats.start || '--' }} ~ {{ stats.end || '--' }}
            </div>
          </div>
        </section>

        <section class="card">
          <div class="card-head">
            <h3 class="card-title">质检提示词</h3>
            <span class="hint">默认载入提示词文件原文，可编辑，保存立即生效</span>
          </div>
          <textarea v-model="promptText" class="prompt-box" rows="9" spellcheck="false"></textarea>
          <div class="btn-row">
            <button class="btn btn-primary" type="button" @click="savePrompt">保存提示词</button>
            <button class="btn" type="button" @click="resetPrompt">恢复默认</button>
            <span v-if="promptSaved" class="saved-tip">已保存</span>
            <span v-if="!promptExists" class="hint warn">未找到提示词文件，使用空模板</span>
          </div>
        </section>
      </div>

      <div class="qa-right">
        <section class="card">
          <div class="card-head">
            <h3 class="card-title">质检结果</h3>
            <div class="btn-row">
              <button class="btn btn-primary" type="button" :disabled="running || !filePaths.length" @click="runQa">
                <AppIcon name="spark" :size="14" /> {{ running ? '质检中...' : '开始质检' }}
              </button>
              <button class="btn" type="button" :disabled="!streamText" @click="copyReport">
                <AppIcon name="copy" :size="14" /> 复制
              </button>
              <button class="btn" type="button" :disabled="!streamText" @click="exportTxt">
                <AppIcon name="export" :size="14" /> 导出 txt
              </button>
            </div>
          </div>
          <div v-if="notice" class="notice">{{ notice }}</div>
          <div v-if="runError" class="error-box">{{ runError }}</div>
          <div v-if="resultStats" class="stats-line">
            会话 {{ resultStats.sessions }} 个 · 客服 {{ resultStats.agents.length }} 名 · 耗时 {{ fmtMs(resultElapsed) }}
          </div>
          <div class="report">
            <div v-if="!streamText" class="placeholder">导入记录后点击「开始质检」，报告将流式生成</div>
            <div v-else class="md" v-html="reportHtml"></div>
            <span v-if="running" class="cursor"></span>
          </div>
        </section>

        <section class="card">
          <div class="card-head">
            <h3 class="card-title">分析历史</h3>
            <button class="btn btn-mini" type="button" :disabled="!history.length" @click="exportHistoryCsv">
              <AppIcon name="download" :size="13" /> 导出汇总 CSV
            </button>
          </div>
          <div v-if="!history.length" class="placeholder">暂无质检记录</div>
          <div v-for="h in history" :key="h.id" class="hist-row">
            <div class="hist-line" @click="expanded = expanded === h.id ? 0 : h.id">
              <span class="h-time">{{ h.createdAt }}</span>
              <span class="h-meta">{{ h.fileCount }} 文件 · {{ h.sessionCount }} 会话 · {{ h.agentCount ?? 0 }} 客服 · {{ h.model }} · {{ fmtMs(h.elapsedMs) }}</span>
              <span class="h-status" :class="h.status">{{ h.status === 'ok' ? '成功' : '失败' }}</span>
            </div>
            <div class="hist-actions">
              <button class="btn btn-mini" type="button" :disabled="!h.report" @click.stop="exportHistoryMd(h)">导出 md</button>
              <button class="btn btn-mini" type="button" :disabled="!h.report" @click.stop="exportHistoryTxt(h)">导出 txt</button>
            </div>
            <pre v-if="expanded === h.id && h.report" class="hist-report">{{ h.report }}</pre>
          </div>
        </section>
      </div>
    </div>
  </PageShell>
</template>

<style scoped>
.qa-layout {
  display: grid;
  grid-template-columns: 380px 1fr;
  gap: 16px;
  align-items: start;
}
.card {
  padding: 16px;
  margin-bottom: 16px;
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  background: var(--bg-card);
}
.card-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  flex-wrap: wrap;
}
.card-title {
  margin: 0 0 12px;
  font-size: 15px;
  font-weight: 700;
}
.card-head .card-title {
  margin: 0;
}
.drop-zone {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 22px 12px;
  border: 1.5px dashed var(--border);
  border-radius: var(--radius-sm);
  color: var(--text-tertiary);
  font-size: 12.5px;
  text-align: center;
}
.drop-zone.over {
  border-color: var(--accent);
  color: var(--accent);
}
.file-preview {
  margin-top: 10px;
}
.file-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 5px 8px;
  border-radius: 6px;
  font-size: 12px;
  color: var(--text-secondary);
}
.file-row.err {
  color: var(--danger);
}
.f-name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.f-count {
  color: var(--text-tertiary);
  font-size: 11.5px;
}
.stats-line {
  margin-top: 8px;
  font-size: 11.5px;
  color: var(--text-secondary);
}
.prompt-box {
  width: 100%;
  resize: vertical;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  padding: 10px;
  background: var(--bg-base);
  color: var(--text-primary);
  font-size: 12px;
  line-height: 1.55;
  font-family: Consolas, monospace;
  outline: none;
}
.prompt-box:focus {
  border-color: var(--accent);
}
.btn-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 10px;
  flex-wrap: wrap;
}
.btn-row .btn {
  display: inline-flex;
  align-items: center;
  gap: 5px;
}
.saved-tip {
  color: var(--accent);
  font-size: 12px;
}
.hint {
  color: var(--text-tertiary);
  font-size: 11.5px;
}
.hint.warn {
  color: var(--warning);
}
.notice {
  margin-bottom: 8px;
  font-size: 12px;
  color: var(--info);
}
.error-box {
  margin-bottom: 8px;
  padding: 10px 12px;
  border: 1px solid rgba(229, 72, 77, 0.55);
  border-radius: var(--radius-sm);
  background: rgba(229, 72, 77, 0.15);
  color: var(--danger);
  font-size: 12.5px;
  font-weight: 600;
  line-height: 1.6;
}
.report {
  margin-top: 12px;
  max-height: 460px;
  overflow-y: auto;
  padding: 12px 14px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--bg-elevated);
  font-size: 13px;
  line-height: 1.7;
}
.md :deep(p) {
  margin: 6px 0;
}
.md :deep(ul),
.md :deep(ol) {
  margin: 6px 0;
  padding-left: 20px;
}
.md :deep(pre) {
  margin: 8px 0;
  padding: 10px 12px;
  overflow-x: auto;
  border-radius: 8px;
  background: rgba(0, 0, 0, 0.35);
}
.md :deep(code) {
  font-family: Consolas, monospace;
  font-size: 12px;
}
.md :deep(table) {
  border-collapse: collapse;
  margin: 8px 0;
  width: 100%;
  font-size: 12px;
}
.md :deep(th),
.md :deep(td) {
  border: 1px solid var(--border);
  padding: 4px 8px;
  text-align: left;
}
.placeholder {
  color: var(--text-tertiary);
  font-size: 12.5px;
}
.cursor {
  display: inline-block;
  width: 2px;
  height: 15px;
  vertical-align: -2px;
  background: var(--accent);
  animation: blink 0.9s steps(1) infinite;
}
@keyframes blink {
  50% {
    opacity: 0;
  }
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
.hist-actions {
  display: flex;
  gap: 6px;
  padding: 0 10px 8px;
}
.hist-row {
  padding: 8px 10px;
  border-radius: var(--radius-sm);
  cursor: pointer;
}
.hist-row:hover {
  background: var(--bg-hover);
}
.hist-line {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 12px;
  flex-wrap: wrap;
}
.h-time {
  color: var(--text-secondary);
}
.h-meta {
  color: var(--text-tertiary);
  font-size: 11.5px;
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
.h-status.error {
  background: rgba(229, 72, 77, 0.15);
  color: var(--danger);
}
.hist-report {
  margin-top: 8px;
  max-height: 200px;
  overflow-y: auto;
  padding: 8px 10px;
  border-radius: 6px;
  background: var(--bg-base);
  font-size: 11.5px;
  white-space: pre-wrap;
  word-break: break-word;
  color: var(--text-secondary);
}
</style>