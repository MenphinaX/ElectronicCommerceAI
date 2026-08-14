import { defineStore } from 'pinia'

export type DialogType = 'info' | 'confirm' | 'error'

interface DialogState {
  visible: boolean
  type: DialogType
  title: string
  message: string
  onConfirm: (() => void) | null
  pendingConfirm: ((v: boolean) => void) | null
}

// 全应用唯一弹窗出口：提示/确认/错误都走这里，禁止原生 alert/confirm/prompt
export const useDialogStore = defineStore('dialog', {
  state: (): DialogState => ({
    visible: false,
    type: 'info',
    title: '',
    message: '',
    onConfirm: null,
    pendingConfirm: null
  }),
  actions: {
    open(type: DialogType, title: string, message: string, onConfirm?: () => void): void {
      this.type = type
      this.title = title
      this.message = message
      this.onConfirm = onConfirm ?? null
      this.visible = true
    },
    info(title: string, message: string): void {
      this.open('info', title, message)
    },
    confirm(title: string, message: string, onConfirm: () => void): void {
      this.open('confirm', title, message, onConfirm)
    },
    /** promise 版确认：确认返回 true，取消/关闭返回 false */
    confirmAsync(title: string, message: string): Promise<boolean> {
      return new Promise((resolve) => {
        this.pendingConfirm = resolve
        this.open('confirm', title, message, () => resolve(true))
      })
    },
    error(title: string, message: string): void {
      this.open('error', title, message)
    },
    close(): void {
      if (this.visible && this.type === 'confirm' && this.pendingConfirm) {
        this.pendingConfirm(false)
      }
      this.visible = false
      this.onConfirm = null
      this.pendingConfirm = null
    }
  }
})