<!-- 对话消息气泡（任务 6）：用户右侧 / AI 左侧；markdown 渲染；流式光标；技能标注 -->
<script setup lang="ts">
import { computed } from 'vue'
import AppIcon from '../AppIcon.vue'
import { renderMarkdown } from '../../utils/markdown'
import type { ChatMessageRow } from '../../stores/chat'

const props = withDefaults(defineProps<{ message: ChatMessageRow; streaming?: boolean }>(), { streaming: false })
const html = computed(() => renderMarkdown(props.message.content || ''))
</script>

<template>
  <div class="bubble-row" :class="message.role === 'user' ? 'mine' : 'ai'">
    <div class="bubble" :class="{ streaming }">
      <div v-if="message.skillName" class="skill-tag">
        <AppIcon name="slash" :size="12" /> {{ message.skillName }}
      </div>
      <div class="md" v-html="html"></div>
      <span v-if="streaming" class="cursor"></span>
    </div>
  </div>
</template>

<style scoped>
.bubble-row {
  display: flex;
  margin-bottom: 16px;
}
.bubble-row.mine {
  justify-content: flex-end;
}
.bubble {
  max-width: 78%;
  padding: 10px 14px;
  border-radius: 14px;
  font-size: 13.5px;
  line-height: 1.65;
  word-break: break-word;
  background: var(--bg-elevated);
  border: 1px solid var(--border);
}
.bubble-row.mine .bubble {
  background: var(--accent-soft);
  border-color: transparent;
}
.skill-tag {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  margin-bottom: 6px;
  padding: 2px 8px;
  border-radius: 999px;
  background: var(--accent-soft);
  color: var(--accent);
  font-size: 11px;
}
.md :deep(p) {
  margin: 4px 0;
}
.md :deep(ul),
.md :deep(ol) {
  margin: 4px 0;
  padding-left: 20px;
}
.md :deep(pre) {
  margin: 8px 0;
  padding: 10px 12px;
  overflow-x: auto;
  border-radius: 8px;
  background: rgba(0, 0, 0, 0.35);
  font-size: 12px;
}
.md :deep(code) {
  font-family: Consolas, monospace;
  font-size: 12px;
}
.md :deep(table) {
  border-collapse: collapse;
  margin: 8px 0;
  font-size: 12px;
  width: 100%;
}
.md :deep(th),
.md :deep(td) {
  border: 1px solid var(--border);
  padding: 4px 8px;
  text-align: left;
}
.cursor {
  display: inline-block;
  width: 2px;
  height: 15px;
  margin-left: 2px;
  vertical-align: -2px;
  background: var(--accent);
  animation: blink 0.9s steps(1) infinite;
}
@keyframes blink {
  50% {
    opacity: 0;
  }
}
</style>