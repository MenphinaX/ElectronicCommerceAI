<!-- 评语折叠卡（任务 6）：内嵌各模块卡片下方，可折叠展开；无 key/失败均有明确提示 -->
<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import AppIcon from '../AppIcon.vue'
import { useCommentsStore } from '../../stores/comments'
import { renderMarkdownLite } from '../../utils/md-lite'

const props = defineProps<{ module: string }>()
const store = useCommentsStore()
const open = ref(false)
// 评语更新后自动展开（新生成时）
watch(
  () => store.byModule[props.module]?.content,
  (v, old) => {
    if (v && v !== old) open.value = true
  }
)

const item = computed(() => store.byModule[props.module])

const state = computed(() => {
  const it = item.value
  if (!it) return { kind: 'empty', text: 'AI 评语未生成' }
  if (it.loading) return { kind: 'loading', text: 'AI 评语生成中…' }
  if (it.status === 'no-key') return { kind: 'nokey', text: it.error || '未配置模型' }
  if (it.status === 'error') return { kind: 'error', text: it.error || '生成失败' }
  if (!it.content) return { kind: 'empty', text: 'AI 评语未生成' }
  return { kind: 'ok', text: '' }
})
</script>

<template>
  <div class="comment-card glass-card">
    <button class="comment-head" type="button" :aria-expanded="open" @click="open = !open">
      <AppIcon name="spark" :size="14" />
      <span class="comment-label">AI 评语</span>
      <span v-if="item?.skillName" class="skill-tag">{{ item.skillName }}</span>
      <span v-if="item?.model && item.content" class="model-tag">{{ item.model }}</span>
      <span class="comment-state" :class="state.kind">{{ state.text }}</span>
      <AppIcon class="chev" :name="open ? 'chevron-up' : 'chevron-down'" :size="14" />
    </button>
    <div v-if="open" class="comment-body">
      <template v-if="state.kind === 'ok'">
        <div class="comment-text" v-html="renderMarkdownLite(item!.content ?? '')"></div>
        <div class="comment-meta">
          <span v-if="item!.model">模型：{{ item!.model }}</span>
          <span v-if="item!.skillName">所用技能：{{ item!.skillName }}</span>
          <button class="mini-btn" type="button" @click="store.regenerate(props.module)">
            <AppIcon name="refresh" :size="13" />
            重新生成
          </button>
        </div>
      </template>
      <div v-else class="comment-empty">
        <p class="comment-text dim">{{ state.text }}</p>
        <button v-if="state.kind === 'nokey' || state.kind === 'error' || state.kind === 'empty'" class="mini-btn" type="button" @click="store.regenerate(props.module)">
          <AppIcon name="refresh" :size="13" />
          重新生成
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.comment-card {
  margin-top: 10px;
  border-radius: 12px;
  overflow: hidden;
}
.comment-head {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 9px 14px;
  border: none;
  background: transparent;
  color: var(--text-secondary);
  font-size: 12.5px;
  cursor: pointer;
  text-align: left;
}
.comment-head:hover {
  background: var(--bg-hover);
  color: var(--text-primary);
}
.comment-label {
  font-weight: 700;
}
.skill-tag,
.model-tag {
  font-size: 11px;
  color: var(--accent);
  background: var(--accent-soft);
  padding: 1px 8px;
  border-radius: 999px;
}
.comment-state {
  margin-left: auto;
  font-size: 12px;
}
.comment-state.nokey,
.comment-state.error {
  color: var(--danger);
}
.comment-state.loading {
  color: var(--text-secondary);
}
.comment-state.ok {
  color: var(--text-tertiary);
}
.chev {
  transition: transform 0.15s ease;
}
button[aria-expanded='true'] .chev {
  transform: rotate(180deg);
}
.comment-body {
  padding: 2px 14px 12px;
  border-top: 1px solid var(--border);
}
.comment-text {
  margin: 10px 0 0;
  font-size: 13px;
  line-height: 1.7;
  color: var(--text-primary);
}
.comment-text :deep(p) {
  margin: 6px 0;
}
.comment-text :deep(p:first-child) {
  margin-top: 0;
}
.comment-text :deep(p:last-child) {
  margin-bottom: 0;
}
.comment-text :deep(strong) {
  font-weight: 700;
}
.comment-text :deep(h4),
.comment-text :deep(h5) {
  margin: 10px 0 4px;
  font-size: 13.5px;
  font-weight: 700;
  line-height: 1.5;
}
.comment-text :deep(ul),
.comment-text :deep(ol) {
  margin: 6px 0;
  padding-left: 20px;
}
.comment-text :deep(li) {
  margin: 3px 0;
}
.comment-text.dim {
  color: var(--text-secondary);
}
.comment-meta {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-top: 10px;
  font-size: 11.5px;
  color: var(--text-tertiary);
}
.mini-btn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  margin-left: auto;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: transparent;
  color: var(--text-secondary);
  font-size: 12px;
  padding: 3px 10px;
  cursor: pointer;
}
.mini-btn:hover {
  color: var(--accent);
  border-color: var(--accent);
}
.comment-empty {
  display: flex;
  align-items: center;
  gap: 12px;
}
</style>
