<!-- AI 对话页（任务 6）：左侧会话列表 + 消息流 + 输入栏；流式事件在此挂载 -->
<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import PageShell from '../components/PageShell.vue'
import AppIcon from '../components/AppIcon.vue'
import ConversationList from '../components/chat/ConversationList.vue'
import MessageBubble from '../components/chat/MessageBubble.vue'
import ChatInput from '../components/chat/ChatInput.vue'
import { useChatStore, type ChatMessageRow } from '../stores/chat'

const store = useChatStore()
const listRef = ref<HTMLElement | null>(null)
const offs: Array<() => void> = []

const streamMsg = computed<ChatMessageRow>(() => ({
  id: -1,
  role: 'assistant',
  content: store.streamText || '…',
  skillId: null,
  skillName: null,
  createdAt: ''
}))

function scrollBottom(): void {
  requestAnimationFrame(() => {
    const el = listRef.value
    if (el) el.scrollTop = el.scrollHeight
  })
}

onMounted(async () => {
  await store.loadConversations()
  if (store.conversations.length && !store.activeId) await store.open(store.conversations[0].id)
  offs.push(window.api.chat.onStart(() => scrollBottom()))
  offs.push(window.api.chat.onChunk((p) => {
    store.onChunk(p.conversationId, p.delta)
    scrollBottom()
  }))
  offs.push(window.api.chat.onDone((p) => {
    store.onDone(p.conversationId, p.messageId, p.content)
    scrollBottom()
  }))
  offs.push(window.api.chat.onError((p) => store.onError(p.conversationId, p.message)))
})

onBeforeUnmount(() => {
  for (const off of offs) off()
})
</script>

<template>
  <PageShell title="AI 对话" desc="多会话聊天 · 流式回复 · 斜杠技能 · 附件 · 引用看板数据">
    <div class="chat-layout">
      <ConversationList class="chat-side" />
      <div class="chat-main">
        <div v-if="!store.activeId" class="empty-state">
          <AppIcon name="chat" :size="44" />
          <h3>开始一段新对话</h3>
          <p>点左侧「新会话」，或直接提问：今天有哪些异常？哪些商品该重点盯？</p>
          <button class="btn btn-primary" type="button" @click="store.create()">新建会话</button>
        </div>
        <template v-else>
          <div ref="listRef" class="msg-list">
            <MessageBubble v-for="m in store.messages" :key="m.id" :message="m" :streaming="false" />
            <div v-if="store.streaming" class="stream-row">
              <MessageBubble :message="streamMsg" :streaming="true" />
            </div>
            <div v-if="store.error" class="error-line">{{ store.error }}</div>
          </div>
          <ChatInput />
        </template>
      </div>
    </div>
  </PageShell>
</template>

<style scoped>
.chat-layout {
  display: flex;
  height: calc(100vh - var(--topbar-height) - 96px);
  border: 1px solid var(--border);
  border-radius: 16px;
  overflow: hidden;
  background: var(--bg-base);
}
.chat-side {
  width: 250px;
  flex-shrink: 0;
}
.chat-main {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
}
.msg-list {
  flex: 1;
  overflow-y: auto;
  padding: 18px 20px;
}
.stream-row {
  margin-bottom: 16px;
}
.error-line {
  margin: 4px 0 12px;
  padding: 8px 12px;
  border-radius: 8px;
  background: var(--danger-soft, rgba(224, 49, 49, 0.12));
  color: var(--danger);
  font-size: 12.5px;
}
.empty-state {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  color: var(--text-secondary);
  text-align: center;
}
.empty-state h3 {
  margin: 6px 0 0;
  color: var(--text-primary);
}
.empty-state p {
  margin: 0 0 8px;
  font-size: 13px;
  color: var(--text-tertiary);
}
</style>
