// 对话页 store（任务 6）：会话 CRUD + 流式状态 + 附件 + 取数开关
import { defineStore } from 'pinia'
import { useShopsStore } from './shops'
import { useDashboardStore } from './dashboard'

export interface ChatMessageRow {
  id: number
  role: string
  content: string
  skillId: number | null
  skillName: string | null
  createdAt: string
}

export interface ConversationRow {
  id: number
  shopId: number | null
  title: string | null
  updatedAt: string
  messageCount: number
  lastPreview: string | null
}

export interface AttachmentDraft {
  name: string
  kind: string
  text?: string
  base64?: string
  mime?: string
  error?: string
}

export const useChatStore = defineStore('chat', {
  state: () => ({
    conversations: [] as ConversationRow[],
    activeId: 0,
    messages: [] as ChatMessageRow[],
    sending: false,
    streaming: false,
    streamText: '' as string,
    search: '' as string,
    attachments: [] as AttachmentDraft[],
    useBoardData: true,
    error: '' as string
  }),
  getters: {
    filteredConversations(state): ConversationRow[] {
      const q = state.search.trim().toLowerCase()
      if (!q) return state.conversations
      return state.conversations.filter((c) => (c.title ?? '').toLowerCase().includes(q) || (c.lastPreview ?? '').toLowerCase().includes(q))
    }
  },
  actions: {
    async loadConversations(): Promise<void> {
      this.conversations = (await window.api.chat.conversations()) as unknown as ConversationRow[]
    },
    async open(id: number): Promise<void> {
      this.activeId = id
      this.messages = (await window.api.chat.messages({ conversationId: id })) as unknown as ChatMessageRow[]
      this.streamText = ''
      this.streaming = false
      this.sending = false
      this.attachments = []
      this.error = ''
    },
    async create(): Promise<void> {
      const { id } = await window.api.chat.create({})
      this.activeId = id
      this.messages = []
      this.streamText = ''
      this.streaming = false
      this.attachments = []
      await this.loadConversations()
    },
    async rename(id: number, title: string): Promise<void> {
      await window.api.chat.rename({ id, title })
      await this.loadConversations()
    },
    async remove(id: number): Promise<void> {
      await window.api.chat.remove({ id })
      if (this.activeId === id) {
        this.activeId = 0
        this.messages = []
      }
      await this.loadConversations()
    },
    async send(text: string, skillId?: number | null): Promise<void> {
      const content = text.trim()
      if (!content || this.sending || !this.activeId) return
      const attachments = this.attachments.map((a) => ({
        name: a.name,
        text: a.text,
        image: a.base64 && a.mime ? { base64: a.base64, mime: a.mime } : undefined
      }))
      this.messages.push({ id: -Date.now(), role: 'user', content, skillId: skillId ?? null, skillName: null, createdAt: '' })
      this.sending = true
      this.streaming = true
      this.streamText = ''
      this.error = ''
      const res = await window.api.chat.send({
        conversationId: this.activeId,
        content,
        skillId: skillId ?? null,
        useBoardData: this.useBoardData,
        attachments,
        shopId: useShopsStore().defaultId ?? 0,
        mode: useDashboardStore().mode
      })
      if (!res.ok) {
        this.streaming = false
        this.sending = false
        this.error = res.message ?? '发送失败'
      }
    },
    onChunk(conversationId: number, delta: string): void {
      if (conversationId === this.activeId && this.streaming) this.streamText += delta
    },
    onDone(conversationId: number, messageId: number, content: string): void {
      if (conversationId !== this.activeId) return
      this.streaming = false
      this.sending = false
      this.messages.push({ id: messageId, role: 'assistant', content, skillId: null, skillName: null, createdAt: '' })
      this.streamText = ''
      this.attachments = []
      void this.loadConversations()
    },
    onError(conversationId: number, message: string): void {
      if (conversationId !== this.activeId) return
      this.streaming = false
      this.sending = false
      this.error = message
    },
    async addFiles(paths: string[]): Promise<void> {
      const res = (await window.api.files.read(paths)) as unknown as AttachmentDraft[]
      for (const r of res) this.attachments.push(r)
    },
    removeAttachment(index: number): void {
      this.attachments.splice(index, 1)
    }
  }
})
