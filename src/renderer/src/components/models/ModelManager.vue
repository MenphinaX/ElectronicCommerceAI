<!-- 模型配置（任务 5）：服务商预设 + CRUD + 测速 + 设默认；API key 只见「已设置/未设置」 -->
<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import AppIcon from '../AppIcon.vue'
import ModalShell from '../dashboard/ModalShell.vue'
import { useModelsStore, type ModelItem } from '../../stores/models'
import { MODEL_PRESETS, modelPresetLabel } from '../../data/model-presets'
import { useDialogStore } from '../../stores/dialog'

const store = useModelsStore()
const dialog = useDialogStore()

const PRESETS = [
  { id: 'deepseek', label: 'DeepSeek', baseUrl: 'https://api.deepseek.com/v1', model: 'deepseek-chat' },
  { id: 'qwen', label: '通义千问', baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1', model: 'qwen-plus' },
  { id: 'kimi', label: 'Kimi 月之暗面', baseUrl: 'https://api.moonshot.cn/v1', model: 'moonshot-v1-8k' },
  { id: 'openai', label: 'OpenAI', baseUrl: 'https://api.openai.com/v1', model: 'gpt-4o-mini' },
  { id: 'anthropic', label: 'Anthropic', baseUrl: 'https://api.anthropic.com/v1', model: 'claude-sonnet-4-20250514' },
  { id: 'ollama', label: 'Ollama 本地', baseUrl: 'http://127.0.0.1:11434/v1', model: 'llama3.1' }
] as const

const providerLabel = (id: string): string =>
  PRESETS.find((p) => p.id === id)?.label ?? (id === 'openai-compatible' ? '通用 OpenAI 兼容' : id)

const showForm = ref(false)
const editing = ref<ModelItem | null>(null)
const formProvider = ref('deepseek')
const formName = ref('')
const formBase = ref('')
const formKey = ref('')
const saving = ref(false)
const testingId = ref<number | null>(null)
const testResult = ref<{ id: number; text: string; ok: boolean } | null>(null)

const rows = computed(() => store.models)

onMounted(() => {
  void store.load()
})

function pickPreset(id: string): void {
  const p = PRESETS.find((x) => x.id === id)
  formProvider.value = id
  formName.value = p?.model ?? ''
  formBase.value = p?.baseUrl ?? ''
}

function openAdd(): void {
  editing.value = null
  pickPreset('deepseek')
  formKey.value = ''
  showForm.value = true
}

function openEdit(m: ModelItem): void {
  editing.value = m
  formProvider.value = m.provider
  formName.value = m.name
  formBase.value = m.baseUrl ?? ''
  formKey.value = ''
  showForm.value = true
}

function closeForm(): void {
  showForm.value = false
  editing.value = null
}

async function save(): Promise<void> {
  if (!formName.value.trim() || !formBase.value.trim()) {
    dialog.error('信息不完整', '请填写模型名与 base_url')
    return
  }
  saving.value = true
  try {
    if (editing.value) {
      await store.update(editing.value.id, {
        name: formName.value,
        provider: formProvider.value,
        baseUrl: formBase.value,
        apiKey: formKey.value || undefined
      })
    } else {
      await store.create({
        name: formName.value,
        provider: formProvider.value,
        baseUrl: formBase.value,
        apiKey: formKey.value || undefined
      })
    }
    closeForm()
  } catch (e) {
    dialog.error('保存失败', (e as Error).message)
  } finally {
    saving.value = false
  }
}

function askDelete(m: ModelItem): void {
  dialog.confirm('删除模型？', `删除「${m.name}」后无法恢复。`, () => {
    void store.remove(m.id)
  })
}

async function setDefault(m: ModelItem): Promise<void> {
  await store.setDefault(m.id)
}

async function testModel(m: ModelItem): Promise<void> {
  testingId.value = m.id
  testResult.value = null
  try {
    const r = await store.test(m.id)
    testResult.value = {
      id: m.id,
      ok: r.ok,
      text: r.ok ? `正常响应，耗时 ${r.elapsedMs} ms` : `失败（${r.elapsedMs} ms）：${r.message ?? '未知错误'}`
    }
  } catch (e) {
    testResult.value = { id: m.id, ok: false, text: (e as Error).message }
  } finally {
    testingId.value = null
  }
}
</script>

<template>
  <section class="glass-card setting-block">
    <div class="head">
      <div>
        <h3 class="block-title">AI 模型</h3>
        <p class="block-desc">管理评语/兜底解析用的模型；API key 用系统加密存储，界面只显示「已设置/未设置」，日志无明文</p>
      </div>
      <button class="btn btn-primary" @click="openAdd"><AppIcon name="plus-square" :size="14" />添加模型</button>
    </div>

    <div v-if="rows.length === 0" class="empty">还没有模型，点「添加模型」从预设服务商开始（Ollama 本地不用 key）</div>

    <div v-else class="model-list">
      <div v-for="m in rows" :key="m.id" class="model-row">
        <div class="m-main">
          <span class="m-name">{{ m.name }}</span>
          <span v-if="m.isDefault === 1" class="badge default">默认</span>
          <span class="m-meta">{{ providerLabel(m.provider) }} · {{ m.baseUrl }}</span>
          <span class="badge" :class="m.apiKeySet ? 'ok' : 'off'">{{ m.apiKeySet ? '已设置' : '未设置' }}</span>
        </div>
        <div class="m-actions">
          <button class="icon-btn" title="测速" :disabled="testingId === m.id" @click="testModel(m)">
            <AppIcon v-if="testingId === m.id" name="refresh" :size="14" class="spin" />
            <AppIcon v-else name="bolt" :size="14" />
          </button>
          <button v-if="m.isDefault !== 1" class="text-btn" @click="setDefault(m)">设为默认</button>
          <span v-else class="default-tag">默认模型</span>
          <button class="icon-btn" title="编辑" @click="openEdit(m)"><AppIcon name="edit" :size="14" /></button>
          <button class="icon-btn danger" title="删除" @click="askDelete(m)"><AppIcon name="trash" :size="14" /></button>
        </div>
      </div>
    </div>

    <p v-if="testResult && rows.some((r) => r.id === testResult!.id)" class="test-line" :class="{ fail: !testResult.ok }">
      {{ testResult.text }}
    </p>
  </section>

  <ModalShell v-if="showForm" :title="editing ? '编辑模型' : '添加模型'" @close="closeForm">
    <label class="field">
      <span class="field-label">服务商预设</span>
      <select v-model="formProvider" class="input" @change="editing === null && pickPreset(formProvider)">
        <option v-for="p in PRESETS" :key="p.id" :value="p.id">{{ p.label }}</option>
        <option value="openai-compatible">通用 OpenAI 兼容</option>
      </select>
    </label>
    <label class="field">
      <span class="field-label">模型名</span>
      <input v-model="formName" class="input" placeholder="如 deepseek-chat / gpt-4o-mini" />
    </label>
    <label class="field">
      <span class="field-label">base_url</span>
      <input v-model="formBase" class="input" placeholder="OpenAI 兼容接口地址，如 https://api.deepseek.com/v1" />
    </label>
    <label class="field">
      <span class="field-label">API key</span>
      <input v-model="formKey" type="password" class="input" :placeholder="editing && editing.apiKeySet ? '已设置 API key（留空不修改）' : 'API key（Ollama 本地可留空）'" />
    </label>
    <div class="modal-foot">
      <button class="btn" @click="closeForm">取消</button>
      <button class="btn btn-primary" :disabled="saving" @click="save">{{ saving ? '保存中…' : '保存' }}</button>
    </div>
  </ModalShell>
</template>

<style scoped>
.setting-block {
  padding: 20px;
  margin-bottom: 16px;
  max-width: 860px;
}
.head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 14px;
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
  max-width: 560px;
}
.empty {
  padding: 22px;
  border: 1.5px dashed var(--border);
  border-radius: 12px;
  color: var(--text-tertiary);
  font-size: 13px;
  text-align: center;
}
.model-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.model-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 11px 14px;
  border: 1px solid var(--border);
  border-radius: 12px;
  background: var(--bg-elevated);
}
.m-main {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  min-width: 0;
}
.m-name {
  font-size: 13.5px;
  font-weight: 600;
}
.m-meta {
  font-size: 12px;
  color: var(--text-tertiary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 300px;
}
.badge {
  padding: 1px 8px;
  border-radius: 999px;
  font-size: 11px;
}
.badge.default {
  background: var(--accent-soft);
  color: var(--accent);
}
.badge.ok {
  background: var(--accent-soft);
  color: var(--accent);
}
.badge.off {
  background: var(--bg-hover);
  color: var(--text-tertiary);
}
.m-actions {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
}
.icon-btn {
  width: 28px;
  height: 28px;
  border: none;
  border-radius: 8px;
  background: transparent;
  color: var(--text-secondary);
  display: grid;
  place-items: center;
  cursor: pointer;
}
.icon-btn:hover:not(:disabled) {
  background: var(--bg-hover);
  color: var(--text-primary);
}
.icon-btn.danger:hover {
  color: #ff6b6b;
}
.icon-btn:disabled {
  opacity: 0.5;
}
.text-btn {
  border: none;
  background: transparent;
  color: var(--text-secondary);
  font-size: 12px;
  cursor: pointer;
  padding: 4px 6px;
}
.text-btn:hover {
  color: var(--accent);
}
.default-tag {
  font-size: 11px;
  color: var(--text-tertiary);
}
.test-line {
  margin: 10px 0 0;
  font-size: 12.5px;
  color: var(--accent);
}
.test-line.fail {
  color: #ff6b6b;
}
.spin {
  animation: spin 0.9s linear infinite;
}
@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
.field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.field-label {
  font-size: 12.5px;
  color: var(--text-secondary);
}
.input {
  height: 36px;
  padding: 0 12px;
  border-radius: 9px;
  border: 1px solid var(--border);
  background: var(--bg-hover);
  color: var(--text-primary);
  font-size: 13px;
  outline: none;
}
.input:focus {
  border-color: var(--accent);
}
.modal-foot {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  margin-top: 6px;
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
}
.btn.primary {
  background: var(--accent);
  border-color: var(--accent);
  color: #000;
  font-weight: 600;
}
</style>
