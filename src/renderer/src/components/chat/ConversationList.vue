<!-- 对话页左侧会话列表（任务 6）：新建 / 搜索 / 重命名 / 删除 / 切换 -->
<script setup lang="ts">
import { ref } from 'vue'
import AppIcon from '../AppIcon.vue'
import { useChatStore } from '../../stores/chat'

const store = useChatStore()
const editing = ref(0)
const draft = ref('')

function startRename(id: number, title: string | null): void {
  editing.value = id
  draft.value = title ?? ''
}
function commitRename(id: number): void {
  const t = draft.value.trim()
  if (t) void store.rename(id, t)
  editing.value = 0
}
function remove(id: number): void {
  void store.remove(id)
}
</script>

<template>
  <aside class="conv-list">
    <div class="list-head">
      <button class="btn btn-primary new-btn" type="button" @click="store.create()">
        <AppIcon name="plus" :size="15" /> 新会话
      </button>
    </div>
    <div class="search-box">
      <AppIcon name="search" :size="14" />
      <input v-model="store.search" type="text" placeholder="搜索会话" />
    </div>
    <div class="scroll">
      <div v-if="!store.filteredConversations.length" class="empty">暂无会话，点击「新会话」开始</div>
      <div
        v-for="c in store.filteredConversations"
        :key="c.id"
        class="item"
        :class="{ active: c.id === store.activeId }"
        @click="store.open(c.id)"
      >
        <template v-if="editing === c.id">
          <input v-model="draft" class="rename-input" type="text" @keydown.enter="commitRename(c.id)" @keydown.esc="editing = 0" @blur="commitRename(c.id)" />
        </template>
        <template v-else>
          <div class="item-title">{{ c.title || '新会话' }}</div>
          <div class="item-preview">{{ c.lastPreview || '暂无消息' }}</div>
          <div class="item-actions">
            <button type="button" title="重命名" @click.stop="startRename(c.id, c.title)"><AppIcon name="edit" :size="13" /></button>
            <button type="button" title="删除" @click.stop="remove(c.id)"><AppIcon name="trash" :size="13" /></button>
          </div>
        </template>
      </div>
    </div>
  </aside>
</template>

<style scoped>
.conv-list {
  display: flex;
  flex-direction: column;
  height: 100%;
  border-right: 1px solid var(--border);
  background: var(--bg-elevated);
}
.list-head {
  padding: 14px 14px 8px;
}
.new-btn {
  width: 100%;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
}
.search-box {
  display: flex;
  align-items: center;
  gap: 6px;
  margin: 0 12px 8px;
  padding: 6px 10px;
  border-radius: var(--radius-sm);
  background: var(--bg-hover);
  color: var(--text-tertiary);
}
.search-box input {
  flex: 1;
  min-width: 0;
  border: none;
  outline: none;
  background: transparent;
  color: var(--text-primary);
  font-size: 12.5px;
}
.scroll {
  flex: 1;
  overflow-y: auto;
  padding: 4px 8px 12px;
}
.empty {
  padding: 26px 10px;
  text-align: center;
  color: var(--text-tertiary);
  font-size: 12.5px;
}
.item {
  position: relative;
  padding: 10px 12px;
  margin-bottom: 4px;
  border-radius: var(--radius-sm);
  cursor: pointer;
}
.item:hover {
  background: var(--bg-hover);
}
.item.active {
  background: var(--accent-soft);
}
.item-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  padding-right: 44px;
}
.item-preview {
  margin-top: 3px;
  font-size: 11.5px;
  color: var(--text-tertiary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  padding-right: 44px;
}
.item-actions {
  position: absolute;
  top: 50%;
  right: 8px;
  transform: translateY(-50%);
  display: none;
  gap: 2px;
}
.item:hover .item-actions {
  display: flex;
}
.item-actions button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: var(--text-secondary);
  cursor: pointer;
}
.item-actions button:hover {
  background: var(--bg-hover);
  color: var(--text-primary);
}
.rename-input {
  width: 100%;
  padding: 4px 8px;
  border: 1px solid var(--accent);
  border-radius: 6px;
  outline: none;
  background: var(--bg-base);
  color: var(--text-primary);
  font-size: 12.5px;
}
</style>