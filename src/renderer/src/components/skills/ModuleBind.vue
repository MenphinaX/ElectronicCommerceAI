<!-- 模块绑定（任务 5）：看板大模块各选一个已装 skill；未绑定用内置默认评语模板 -->
<script setup lang="ts">
import { useSkillsStore } from '../../stores/skills'

const store = useSkillsStore()

function boundSkillId(module: string): number | null {
  const b = store.bindings.find((x) => x.module === module)
  return b ? Number(b.skillId) : null
}

async function onChange(module: string, skillId: string): Promise<void> {
  await store.setBinding(module, skillId === '' ? null : Number(skillId))
}
</script>

<template>
  <div class="bind-panel">
    <p class="hint">每个看板模块选择生成评语时使用的技能；不绑定（默认）时用内置默认评语模板。</p>
    <div v-for="m in store.modules" :key="m" class="bind-row">
      <span class="m-label">{{ m }}</span>
      <select class="input" :value="boundSkillId(m) ?? ''" @change="onChange(m, ($event.target as HTMLSelectElement).value)">
        <option value="">不绑定（内置默认）</option>
        <option v-for="s in store.skills" :key="s.id" :value="s.id">{{ s.name }}</option>
      </select>
      <span v-if="boundSkillId(m)" class="bound-tag">已绑定</span>
    </div>
  </div>
</template>

<style scoped>
.bind-panel {
  display: flex;
  flex-direction: column;
  gap: 10px;
  max-width: 520px;
}
.hint {
  margin: 0 0 4px;
  font-size: 12.5px;
  color: var(--text-tertiary);
}
.bind-row {
  display: flex;
  align-items: center;
  gap: 12px;
}
.m-label {
  width: 64px;
  font-size: 13.5px;
  font-weight: 600;
  flex-shrink: 0;
}
.input {
  flex: 1;
  height: 34px;
  padding: 0 10px;
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
.bound-tag {
  font-size: 11px;
  color: var(--accent);
}
</style>
