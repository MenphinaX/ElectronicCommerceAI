// 任务 9 授权状态（渲染层唯一入口：window.api.auth.*）
// 任务 4H：新增 loaded 标志 → 门禁三态（pending/ok/denied），校验中绝不渲染「未授权」
import { defineStore } from 'pinia'

export interface AuthUiState {
  loaded: boolean
  ok: boolean
  reason: string
  kind: 'machine' | 'unlock' | null
  expires: string | null
  issuer: string | null
  purpose: string | null
  expiresInDays: number | null
  expiringSoon: boolean
  machineCode: string
  hardId: string
  fingerprint: string
  message: string
  error: string
  busy: boolean
}

const initial: AuthUiState = {
  loaded: false,
  ok: false,
  reason: 'no-license',
  kind: null,
  expires: null,
  issuer: null,
  purpose: null,
  expiresInDays: null,
  expiringSoon: false,
  machineCode: '',
  hardId: '',
  fingerprint: '',
  message: '',
  error: '',
  busy: false
}

export const useAuthStore = defineStore('auth', {
  state: (): AuthUiState => ({ ...initial }),
  actions: {
    async load(): Promise<void> {
      const snap = await window.api.auth.state()
      this.applySnapshot(snap)
      this.loaded = true
    },
    applySnapshot(snap: {
      state: {
        ok: boolean
        reason: string
        kind: 'machine' | 'unlock' | null
        expires: string | null
        issuer: string | null
        purpose: string | null
        expiresInDays: number | null
        expiringSoon: boolean
      }
      machineCode: string
      hardId: string
      fingerprint: string
    }): void {
      this.ok = snap.state.ok
      this.reason = snap.state.reason
      this.kind = snap.state.kind
      this.expires = snap.state.expires
      this.issuer = snap.state.issuer
      this.purpose = snap.state.purpose
      this.expiresInDays = snap.state.expiresInDays
      this.expiringSoon = snap.state.expiringSoon
      this.machineCode = snap.machineCode
      this.hardId = snap.hardId
      this.fingerprint = snap.fingerprint
    },
    async pickAndImport(): Promise<{ ok: boolean; canceled?: boolean }> {
      this.busy = true
      this.error = ''
      this.message = ''
      try {
        const picked = await window.api.auth.pickFile()
        if (!picked.ok || !picked.filePath) return { ok: false, canceled: true }
        return await this.importFile(picked.filePath)
      } finally {
        this.busy = false
      }
    },
    async importFile(filePath: string): Promise<{ ok: boolean }> {
      this.busy = true
      this.error = ''
      this.message = ''
      try {
        const r = await window.api.auth.importFile(filePath)
        await this.load()
        if (r.ok) {
          this.message = '授权导入成功'
        } else {
          this.error = typeof r.message === 'string' ? r.message : '授权导入失败'
        }
        return { ok: !!r.ok }
      } finally {
        this.busy = false
      }
    },
    async copyMachineCode(): Promise<void> {
      try {
        await window.api.auth.copy(this.machineCode)
        this.message = '机器码已复制，请发给管理员'
      } catch {
        this.error = '复制失败'
      }
    },
    async clearError(): Promise<void> {
      this.error = ''
      this.message = ''
    }
  }
})
