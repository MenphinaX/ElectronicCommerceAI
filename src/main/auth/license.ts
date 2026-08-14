// 任务 9 授权状态判定：RSA 验签 + 机器绑定 + 有效期 + 14 天提醒
import { LICENSE_VERSION, verifyLicenseSignature, type LicensePayload } from './license-core.mjs'
import { LICENSE_PUBLIC_KEY_PEM } from './public-key'

export type LicenseReason = 'ok' | 'no-license' | 'corrupt' | 'invalid-signature' | 'machine-mismatch' | 'expired'

export interface MachineIdentity {
  hard: string
  full: string
  display: string
}

export interface LicenseState {
  ok: boolean
  reason: LicenseReason
  kind: 'machine' | 'unlock' | null
  machine: string
  expires: string | null
  issuedAt: string | null
  issuer: string | null
  purpose: string | null
  expiresInDays: number | null
  expiringSoon: boolean
}

export function daysUntil(expires: string, now: string): number {
  const e = Date.parse(`${expires}T00:00:00Z`)
  const n = Date.parse(`${now}T00:00:00Z`)
  return Math.round((e - n) / 86400000)
}

export function today(): string {
  const d = new Date()
  const p = (n: number): string => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

const emptyState = (reason: LicenseReason): LicenseState => ({
  ok: false,
  reason,
  kind: null,
  machine: '',
  expires: null,
  issuedAt: null,
  issuer: null,
  purpose: null,
  expiresInDays: null,
  expiringSoon: false
})

// 授权文件内容 → 授权状态；machine 为本机当前机器码，now 为 YYYY-MM-DD
export function evaluateLicense(fileContent: string | null, machine: Pick<MachineIdentity, 'hard' | 'full'>, now: string, pubKeyPem: string = LICENSE_PUBLIC_KEY_PEM): LicenseState {
  if (!fileContent || !fileContent.trim()) return emptyState('no-license')
  let raw: unknown
  try {
    raw = JSON.parse(fileContent)
  } catch {
    return emptyState('corrupt')
  }
  const obj = raw as Record<string, unknown>
  const payload: LicensePayload = {
    ver: obj.ver as number,
    type: obj.type as LicensePayload['type'],
    machine: typeof obj.machine === 'string' ? obj.machine : '',
    expires: typeof obj.expires === 'string' ? obj.expires : '',
    issuer: typeof obj.issuer === 'string' ? obj.issuer : '',
    issuedAt: typeof obj.issuedAt === 'string' ? obj.issuedAt : '',
    purpose: typeof obj.purpose === 'string' ? obj.purpose : ''
  }
  const signature = typeof obj.signature === 'string' ? obj.signature : ''
  if (payload.ver !== LICENSE_VERSION || (payload.type !== 'machine' && payload.type !== 'unlock')) return emptyState('corrupt')
  if (!/^\d{4}-\d{2}-\d{2}$/.test(payload.expires)) return emptyState('corrupt')
  if (!verifyLicenseSignature(pubKeyPem, payload, signature)) return emptyState('invalid-signature')

  const left = daysUntil(payload.expires, now)
  const base = {
    kind: payload.type,
    machine: payload.machine,
    expires: payload.expires,
    issuedAt: payload.issuedAt,
    issuer: payload.issuer,
    purpose: payload.purpose,
    expiresInDays: left,
    expiringSoon: left <= 14
  }
  if (left < 0) return { ...emptyState('expired'), ...base, expiringSoon: false }
  if (payload.type === 'machine' && payload.machine !== machine.hard && payload.machine !== machine.full) {
    return { ...emptyState('machine-mismatch'), ...base }
  }
  return { ok: true, reason: 'ok', ...base }
}