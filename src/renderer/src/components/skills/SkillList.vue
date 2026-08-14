<!-- 已安装技能（任务 5）：查看/编辑提示词（保存立即生效）/删除 -->
<script setup lang="ts">
import { ref } from 'vue'
import AppIcon from '../AppIcon.vue'
import ModalShell from '../dashboard/ModalShell.vue'
import { useSkillsStore, type SkillItem } from '../../stores/skills'
import { useDialogStore } from '../../stores/dialog'

const store = useSkillsStore()
const dialog = useDialogStore()

const editId = ref<number | null>(null)
const editContent = ref('')
const saving = ref(false)

async function openEdit(s: SkillItem): Promise<void> {
  try {
    const r = await store.read(s.id)
    editId.value = s.id
    editContent.value = r.content
  } catch (e) {
    dialog.error('读取失败', (e as Error).message)
  }
}

async function saveEdit(): Promise<void> {
  if (editId.value === null) return
  saving.value = true
  try {
    await store.save(editId.value, editContent.value)
    dialog.info('已保存', '提示词已更新，立即生效')
    editId.value = null
  } catch (e) {
    dialog.error('保存失败', (e as Error).message)
  } finally {
    saving.value = false
  }
}

function askDelete(s: SkillItem): void {
  dialog.confirm('删除技能？', `删除「${s.name}」后，绑定该技能的模块将回到内置默认模板。`, () => {
    void store.remove(s.id)
  })
}
</script>

<template>
  <div class="list-panel">
    <div v-if="store.skills.length === 0" class="empty">还没有安装技能（内置 全店/单品/指南 会在首次启动时自动就绪）</div>
    <div v-else class="skill-list">
      <div v-for="s in store.skills" :key="s.id" class="skill-row">
        <div class="s-main">
          <span class="s-name">{{ s.name }}</span>
          <span class="s-path">{{ s.path }}</span>
          <p class="s-desc">{{ s.description || '（无描述）' }}</p>
        </div>
        <div class="s-actions">
          <button class="icon-btn" title="编辑提示词" @click="openEdit(s)"><AppIcon name="edit" :size="14" /></button>
          <button class="icon-btn danger" title="删除" @click="askDelete(s)"><AppIcon name="trash" :size="14" /></button>
        </div>
      </div>
    </div>
  </div>

  <ModalShell v-if="editId !== null" title="编辑技能提示词" @close="editId = null">
    <p class="modal-hint">SKILL.md = YAML frontmatter（name/description）+ 正文；保存后立即生效</p>
    <textarea v-model="editContent" class="code" spellcheck="false"></textarea>
    <div class="modal-foot">
      <button class="btn" @click="editId = null">取消</button>
      <button class="btn btn-primary" :disabled="saving" @click="saveEdit">{{ saving ? '保存中…' : '保存' }}</button>
    </div>
  </ModalShell>
</template>

<style scoped>
.list-panel {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.empty {
  padding: 26px;
  border: 1.5px dashed var(--border);
  border-radius: 12px;
  color: var(--text-tertiary);
  font-size: 13px;
  text-align: center;
}
.skill-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.skill-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 12px 14px;
  border: 1px solid var(--border);
  border-radius: 12px;
  background: var(--bg-elevated);
}
.s-main {
  min-width: 0;
}
.s-name {
  font-size: 13.5px;
  font-weight: 600;
}
.s-path {
  margin-left: 8px;
  font-size: 11.5px;
  color: var(--text-tertiary);
}
.s-desc {
  margin: 3px 0 0;
  font-size: 12px;
  color: var(--text-secondary);
}
.s-actions {
  display: flex;
  gap: 4px;
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
.icon-btn:hover {
  background: var(--bg-hover);
  color: var(--text-primary);
}
.icon-btn.danger:hover {
  color: #ff6b6b;
}
.modal-hint {
  margin: 0;
  font-size: 12px;
  color: var(--text-tertiary);
}
.code {
  width: 100%;
  height: 46vh;
  padding: 12px;
  border-radius: 10px;
  border: 1px solid var(--border);
  background: var(--bg-hover);
  color: var(--text-primary);
  font-family: Consolas, 'Courier New', monospace;
  font-size: 12.5px;
  line-height: 1.6;
  outline: none;
  resize: vertical;
  box-sizing: border-box;
}
.code:focus {
  border-color: var(--accent);
}
.modal-foot {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
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
