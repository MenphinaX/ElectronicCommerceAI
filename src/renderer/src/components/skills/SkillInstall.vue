<!-- 技能安装（任务 5）：GitHub 链接/本地目录 → 真实解析 SKILL.md → 勾选安装 -->
<script setup lang="ts">
import { ref } from 'vue'
import AppIcon from '../AppIcon.vue'
import { useSkillsStore } from '../../stores/skills'
import { useDialogStore } from '../../stores/dialog'

const store = useSkillsStore()
const dialog = useDialogStore()

interface Candidate {
  source: 'github' | 'local'
  relPath: string
  name: string
  description: string
  rawUrl?: string
  content: string
  frontmatterOk: boolean
}

const link = ref('')
const parsing = ref(false)
const installing = ref(false)
const candidates = ref<Candidate[]>([])
const selected = ref<Set<number>>(new Set())
const parseError = ref('')

async function doParse(): Promise<void> {
  if (!link.value.trim()) {
    dialog.error('缺少输入', '请输入 GitHub 仓库链接（或本地目录路径）')
    return
  }
  parsing.value = true
  parseError.value = ''
  candidates.value = []
  selected.value = new Set()
  try {
    candidates.value = (await store.parse(link.value.trim())) as unknown as Candidate[]
    selected.value = new Set(candidates.value.map((_, i) => i))
  } catch (e) {
    const msg = String((e as Error).message).replace(/^Error invoking remote method '[^']+': (Error: )?/, '')
    parseError.value = msg
    // 主动取消不弹错误弹窗，仅恢复按钮状态
    if (!msg.includes('已取消')) dialog.error('解析失败', parseError.value)
  } finally {
    parsing.value = false
  }
}

function doCancel(): void {
  void window.api.skills.parseCancel()
}

function toggle(i: number): void {
  const s = new Set(selected.value)
  if (s.has(i)) s.delete(i)
  else s.add(i)
  selected.value = s
}

function toggleAll(): void {
  selected.value = selected.value.size === candidates.value.length ? new Set() : new Set(candidates.value.map((_, i) => i))
}

async function doInstall(): Promise<void> {
  const picks = candidates.value.filter((_, i) => selected.value.has(i))
  if (picks.length === 0) {
    dialog.error('未选择技能', '请至少勾选一个技能再安装')
    return
  }
  installing.value = true
  try {
    const r = await store.install(picks.map((c) => ({ name: c.name, description: c.description, content: c.content })))
    dialog.info('安装完成', `已安装 ${r.length} 个技能：${r.map((x) => x.name).join('、')}`)
    candidates.value = []
    selected.value = new Set()
    link.value = ''
  } catch (e) {
    dialog.error('安装失败', (e as Error).message)
  } finally {
    installing.value = false
  }
}
</script>

<template>
  <div class="install-panel">
    <div class="link-row">
      <input v-model="link" class="input" placeholder="GitHub 链接或本地仓库目录，如 https://github.com/anthropics/skills 或 C:\repo" @keyup.enter="doParse" />
      <button class="btn btn-primary" :disabled="parsing" @click="doParse">
        <AppIcon v-if="parsing" name="refresh" :size="14" class="spin" />
        <AppIcon v-else name="link" :size="14" />
        {{ parsing ? '解析中…' : '解析' }}
      </button>
      <button class="btn" :disabled="!parsing" @click="doCancel">
        <AppIcon name="close" :size="14" />
        取消
      </button>
    </div>
    <p class="hint">解析真实读取仓库里的 SKILL.md（支持仓库根 / skills/ 目录 / 子目录，可一次列出多个）；断网或链接无效会明确报错。</p>

    <div v-if="candidates.length > 0" class="cand-box">
      <div class="cand-head">
        <label class="chk"><input type="checkbox" :checked="selected.size === candidates.length && candidates.length > 0" @change="toggleAll" />全选</label>
        <span class="cand-count">共 {{ candidates.length }} 个技能</span>
        <button class="btn btn-primary sm" :disabled="installing" @click="doInstall">
          <AppIcon v-if="installing" name="refresh" :size="13" class="spin" />
          <AppIcon v-else name="download" :size="13" />
          安装所选（{{ selected.size }}）
        </button>
      </div>
      <div v-for="(c, i) in candidates" :key="c.relPath" class="cand-item" :class="{ picked: selected.has(i) }">
        <label class="chk"><input type="checkbox" :checked="selected.has(i)" @change="toggle(i)" />
          <span class="c-name">{{ c.name }}</span>
        </label>
        <span class="c-src">{{ c.source === 'github' ? 'GitHub' : '本地' }}</span>
        <span class="c-path">{{ c.relPath }}</span>
        <p class="c-desc">{{ c.description || '（无描述）' }}</p>
      </div>
    </div>
  </div>
</template>

<style scoped>
.install-panel {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.link-row {
  display: flex;
  gap: 10px;
}
.input {
  flex: 1;
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
.hint {
  margin: 0;
  font-size: 12px;
  color: var(--text-tertiary);
}
.cand-box {
  border: 1px solid var(--border);
  border-radius: 12px;
  overflow: hidden;
}
.cand-head {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 14px;
  background: var(--bg-elevated);
  border-bottom: 1px solid var(--border);
}
.cand-count {
  flex: 1;
  font-size: 12.5px;
  color: var(--text-secondary);
}
.cand-item {
  display: flex;
  align-items: baseline;
  gap: 10px;
  padding: 10px 14px;
  border-bottom: 1px solid var(--border);
  flex-wrap: wrap;
}
.cand-item:last-child {
  border-bottom: none;
}
.cand-item.picked {
  background: var(--accent-soft);
}
.chk {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  cursor: pointer;
}
.c-name {
  font-weight: 600;
}
.c-src {
  font-size: 11px;
  padding: 1px 8px;
  border-radius: 999px;
  background: var(--bg-hover);
  color: var(--text-tertiary);
}
.c-path {
  font-size: 11.5px;
  color: var(--text-tertiary);
}
.c-desc {
  width: 100%;
  margin: 2px 0 0 24px;
  font-size: 12px;
  color: var(--text-secondary);
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
.btn.sm {
  height: 30px;
  padding: 0 12px;
  font-size: 12px;
}
.spin {
  animation: spin 0.9s linear infinite;
}
@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
