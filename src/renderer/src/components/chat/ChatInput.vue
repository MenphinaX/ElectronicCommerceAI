<!-- 对话输入区（任务 6 + 任务 4F ⑥）：参考 GPT 输入框重做——自适应高度 textarea、附件按钮内嵌、发送/取数排布合理、附件弹窗不形变 -->
<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import AppIcon from '../AppIcon.vue'
import { useChatStore } from '../../stores/chat'
import { useShopsStore } from '../../stores/shops'
import { useDashboardStore } from '../../stores/dashboard'

const store = useChatStore()
const draft = ref('')
const textRef = ref<HTMLTextAreaElement | null>(null)
const fileInput = ref<HTMLInputElement | null>(null)
const folderInput = ref<HTMLInputElement | null>(null)
const attachOpen = ref(false)
const slashIdx = ref(0)

interface MenuItem {
  type: 'skill' | 'cmd'
  id?: number
  name: string
  desc: string
}
const skills = ref<Array<Record<string, unknown>>>([])
const pendingSkill = ref<{ id: number; name: string } | null>(null)

const QUICK_CMDS: MenuItem[] = [
  { type: 'cmd', name: '今天有哪些异常', desc: '结合异常清单给出今日预警' },
  { type: 'cmd', name: '哪些商品该重点盯', desc: '按销量与亏损排序给建议' },
  { type: 'cmd', name: '写一段今日经营小结', desc: '生成可直接复制的经营小结' }
]

const slashOpen = computed(() => draft.value.startsWith('/'))
const slashFilter = computed(() => draft.value.slice(1).trim().toLowerCase())
const menuItems = computed<MenuItem[]>(() => {
  const s = slashFilter.value
  const list = skills.value
    .filter((k) => String(k.name ?? '').toLowerCase().includes(s))
    .map((k) => ({ type: 'skill' as const, id: Number(k.id), name: String(k.name), desc: String(k.description ?? '') }))
  const cmds = QUICK_CMDS.filter((c) => c.name.toLowerCase().includes(s))
  return [...list, ...cmds]
})

/** 任务 4F ⑥：textarea 自适应高度（1~8 行，随内容伸缩） */
function resizeTextarea(): void {
  const el = textRef.value
  if (!el) return
  el.style.height = 'auto'
  el.style.height = Math.min(Math.max(el.scrollHeight, 44), 200) + 'px'
}

watch(draft, () => resizeTextarea())

function pickItem(item: MenuItem): void {
  slashIdx.value = 0
  if (item.type === 'skill') {
    pendingSkill.value = { id: item.id ?? 0, name: item.name }
    draft.value = ''
  } else {
    pendingSkill.value = null
    draft.value = item.name
  }
  void textRef.value?.focus()
  resizeTextarea()
}

function onKeydown(e: KeyboardEvent): void {
  if (slashOpen.value && menuItems.value.length) {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      slashIdx.value = (slashIdx.value + 1) % menuItems.value.length
      return
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault()
      slashIdx.value = (slashIdx.value - 1 + menuItems.value.length) % menuItems.value.length
      return
    }
    if (e.key === 'Enter') {
      e.preventDefault()
      pickItem(menuItems.value[slashIdx.value] ?? menuItems.value[0])
      return
    }
    if (e.key === 'Escape') {
      draft.value = draft.value.replace(/^\/[^\s]*/, '')
      return
    }
  }
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault()
    send()
  }
}

function send(): void {
  const text = draft.value.trim()
  if (!text || store.sending) return
  void store.send(text, pendingSkill.value?.id ?? null)
  pendingSkill.value = null
  draft.value = ''
  resizeTextarea()
}

function onFiles(e: Event): void {
  const el = e.target as HTMLInputElement
  const paths = Array.from(el.files ?? []).map((f) => window.api.webUtils.getPathForFile(f)).filter(Boolean)
  if (paths.length) void store.addFiles(paths)
  el.value = ''
  attachOpen.value = false
}

const templates = ref<Array<Record<string, unknown>>>([])
const templateId = ref('')
const queryMsg = ref('')

onMounted(async () => {
  try {
    const res = (await window.api.skills.list()) as { skills: Array<Record<string, unknown>> }
    skills.value = res.skills ?? []
  } catch {
    skills.value = []
  }
  try {
    templates.value = (await window.api.data.templates()) as Array<Record<string, unknown>>
    if (templates.value.length) templateId.value = String(templates.value[0].id)
  } catch {
    templates.value = []
  }
  resizeTextarea()
})

function ymd(d: Date): string {
  const p = (n: number): string => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}
function rangeOf(mode: string): { from: string; to: string } {
  const now = new Date()
  const to = ymd(now)
  if (mode === 'yesterday') {
    const d = new Date(now.getTime() - 86400000)
    const from = ymd(d)
    return { from, to: from }
  }
  const days = mode === '15' ? 15 : mode === '30' ? 30 : 7
  const from = ymd(new Date(now.getTime() - (days - 1) * 86400000))
  return { from, to }
}

async function runQuery(): Promise<void> {
  if (!templateId.value) return
  queryMsg.value = '查询中...'
  try {
    const tpl = templates.value.find((t) => String(t.id) === templateId.value)
    const shopId = useShopsStore().defaultId ?? 0
    const w = rangeOf(useDashboardStore().mode)
    const res = (await window.api.data.query({
      templateId: templateId.value,
      params: { shopId, from: w.from, to: w.to, limit: 10 }
    })) as { label?: string; columns?: string[]; rows?: unknown[][]; rowCount?: number }
    const cols = res.columns ?? []
    const rows = res.rows ?? []
    const lines = [`【${res.label ?? '经营查询'}】命中 ${res.rowCount ?? rows.length} 行（${w.from} ~ ${w.to}）`]
    if (cols.length) lines.push('| ' + cols.join(' | ') + ' |')
    if (cols.length) lines.push('|' + cols.map(() => '---').join('|') + '|')
    for (const r of rows.slice(0, 10)) lines.push('| ' + (r as unknown[]).map((v) => String(v ?? '')).join(' | ') + ' |')
    draft.value = draft.value ? draft.value + '\n\n' + lines.join('\n') : lines.join('\n')
    queryMsg.value = ''
  } catch (err) {
    queryMsg.value = '查询失败：' + (err as Error).message
  }
}
</script>

<template>
  <div class="input-wrap">
    <div v-if="pendingSkill" class="pending-tag">
      <AppIcon name="slash" :size="12" /> 以技能「{{ pendingSkill.name }}」提问
      <button type="button" class="x" @click="pendingSkill = null">x</button>
    </div>
    <div v-if="store.attachments.length" class="attach-list">
      <span v-for="(a, i) in store.attachments" :key="i" class="attach-chip" :class="{ err: a.error }">
        <AppIcon :name="a.kind === 'image' ? 'file' : 'paperclip'" :size="12" />
        {{ a.name }}
        <button type="button" class="x" @click="store.removeAttachment(i)">x</button>
      </span>
    </div>
    <div v-if="queryMsg" class="query-msg">{{ queryMsg }}</div>
    <div class="composer">
      <div class="attach-box">
        <button type="button" class="icon-btn attach-btn" title="上传文件/文件夹" @click="attachOpen = !attachOpen">
          <AppIcon name="paperclip" :size="18" />
        </button>
        <div v-if="attachOpen" class="attach-menu">
          <button type="button" @click="fileInput?.click()">上传文件</button>
          <button type="button" @click="folderInput?.click()">上传文件夹</button>
        </div>
        <input ref="fileInput" type="file" multiple style="display: none" @change="onFiles" />
        <input ref="folderInput" type="file" multiple webkitdirectory style="display: none" @change="onFiles" />
      </div>
      <div class="textarea-box">
        <div v-if="slashOpen && menuItems.length" class="slash-menu">
          <button
            v-for="(m, i) in menuItems"
            :key="m.type + m.name"
            type="button"
            :class="{ active: i === slashIdx }"
            @mousedown.prevent="pickItem(m)"
            @mouseenter="slashIdx = i"
          >
            <AppIcon :name="m.type === 'skill' ? 'slash' : 'spark'" :size="13" />
            <span class="m-name">{{ m.name }}</span>
            <span class="m-desc">{{ m.desc }}</span>
          </button>
        </div>
        <textarea
          ref="textRef"
          v-model="draft"
          rows="1"
          placeholder="输入问题，/ 呼出技能菜单；Enter 发送，Shift+Enter 换行"
          @keydown="onKeydown"
        ></textarea>
      </div>
      <button type="button" class="send-btn" :disabled="store.sending" @click="send">
        <AppIcon name="send" :size="16" />
      </button>
    </div>
    <div class="tool-row">
      <label class="toggle">
        <input v-model="store.useBoardData" type="checkbox" />
        <span class="track"></span>
        引用看板数据
      </label>
      <select v-model="templateId" class="tpl-select" title="查数据库（白名单只读模板）">
        <option v-for="t in templates" :key="String(t.id)" :value="String(t.id)">{{ t.label }}</option>
      </select>
      <button type="button" class="icon-btn" title="执行查询并插入输入框" @click="runQuery">
        <AppIcon name="db" :size="15" />
      </button>
      <span class="tool-hint">快捷提问</span>
    </div>
    <div class="quick-row">
      <button v-for="q in QUICK_CMDS" :key="q.name" type="button" class="quick" @click="draft = q.name; pendingSkill = null; resizeTextarea()">
        {{ q.name }}
      </button>
    </div>
  </div>
</template>

<style scoped>
.input-wrap {
  border-top: 1px solid var(--border);
  padding: 10px 16px 12px;
  background: var(--bg-elevated);
}
.pending-tag {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 8px;
  padding: 4px 10px;
  border-radius: 999px;
  background: var(--accent-soft);
  color: var(--accent);
  font-size: 12px;
}
.x {
  border: none;
  background: transparent;
  color: inherit;
  cursor: pointer;
  font-size: 12px;
}
.attach-list {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-bottom: 8px;
}
.attach-chip {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 3px 8px;
  border-radius: 999px;
  background: var(--bg-hover);
  color: var(--text-secondary);
  font-size: 11.5px;
}
.attach-chip.err {
  color: var(--danger);
}
.query-msg {
  margin-bottom: 6px;
  font-size: 11.5px;
  color: var(--info);
}
.composer {
  display: flex;
  align-items: flex-end;
  gap: 6px;
  padding: 6px 8px 6px 6px;
  border: 1px solid var(--border);
  border-radius: 16px;
  background: var(--bg-base);
  transition: border-color 0.15s ease;
}
.composer:focus-within {
  border-color: var(--accent);
}
.attach-box {
  position: relative;
  flex-shrink: 0;
  align-self: flex-end;
}
.attach-btn {
  width: 34px;
  height: 34px;
  border-radius: 50%;
}
.attach-btn:hover {
  background: var(--bg-hover);
}
.attach-menu {
  position: absolute;
  bottom: calc(100% + 8px);
  left: 0;
  z-index: 40;
  display: flex;
  flex-direction: column;
  min-width: 128px;
  padding: 6px;
  border-radius: 10px;
  background: var(--bg-elevated);
  border: 1px solid var(--border);
  box-shadow: var(--shadow);
}
.attach-menu button {
  padding: 7px 12px;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: var(--text-primary);
  font-size: 12.5px;
  text-align: left;
  cursor: pointer;
  white-space: nowrap;
}
.attach-menu button:hover {
  background: var(--bg-hover);
}
.textarea-box {
  position: relative;
  flex: 1;
  min-width: 0;
}
.slash-menu {
  position: absolute;
  bottom: calc(100% + 6px);
  left: 0;
  right: 0;
  z-index: 40;
  max-height: 240px;
  overflow-y: auto;
  padding: 6px;
  border-radius: 10px;
  background: var(--bg-elevated);
  border: 1px solid var(--border);
  box-shadow: var(--shadow);
}
.slash-menu button {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 7px 10px;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: var(--text-primary);
  text-align: left;
  cursor: pointer;
}
.slash-menu button.active {
  background: var(--accent-soft);
}
.m-name {
  flex-shrink: 0;
  font-size: 12.5px;
  font-weight: 600;
}
.m-desc {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--text-tertiary);
  font-size: 11.5px;
}
.textarea-box textarea {
  display: block;
  width: 100%;
  max-height: 200px;
  min-height: 34px;
  resize: none;
  border: none;
  outline: none;
  padding: 8px 4px;
  background: transparent;
  color: var(--text-primary);
  font-size: 13.5px;
  line-height: 1.5;
  font-family: inherit;
}
.textarea-box textarea::placeholder {
  color: var(--text-tertiary);
}
.icon-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border: none;
  border-radius: 8px;
  background: transparent;
  color: var(--text-secondary);
  cursor: pointer;
}
.icon-btn:hover {
  background: var(--bg-hover);
  color: var(--text-primary);
}
.send-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  width: 36px;
  height: 36px;
  border: none;
  border-radius: 50%;
  background: var(--accent);
  color: #ffffff;
  cursor: pointer;
  transition: opacity 0.15s ease;
}
.send-btn:hover:not(:disabled) {
  filter: brightness(1.08);
}
.send-btn:disabled {
  opacity: 0.5;
  cursor: default;
}
.tool-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 8px;
}
.toggle {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: 11.5px;
  color: var(--text-secondary);
  white-space: nowrap;
  cursor: pointer;
}
.toggle input {
  display: none;
}
.track {
  width: 26px;
  height: 14px;
  border-radius: 999px;
  background: var(--border);
  position: relative;
  transition: background 0.2s;
}
.track::after {
  content: '';
  position: absolute;
  top: 2px;
  left: 2px;
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: var(--text-secondary);
  transition: transform 0.2s;
}
.toggle input:checked + .track {
  background: var(--accent-soft);
}
.toggle input:checked + .track::after {
  transform: translateX(12px);
  background: var(--accent);
}
.tpl-select {
  max-width: 160px;
  border: 1px solid var(--border);
  border-radius: 6px;
  padding: 4px 6px;
  background: var(--bg-base);
  color: var(--text-secondary);
  font-size: 11.5px;
  outline: none;
}
.tool-hint {
  margin-left: auto;
  font-size: 11px;
  color: var(--text-tertiary);
}
.quick-row {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 8px;
}
.quick {
  padding: 3px 10px;
  border: 1px solid var(--border);
  border-radius: 999px;
  background: transparent;
  color: var(--text-secondary);
  font-size: 11.5px;
  cursor: pointer;
}
.quick:hover {
  border-color: var(--accent);
  color: var(--accent);
}
</style>
