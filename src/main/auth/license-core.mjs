// 任务 9 授权核心（纯 ESM，主应用与授权工具共用；改动后重跑 tools/license-tool/scripts/sync-vendor.cjs 同步 vendor 副本）
import { createHash, generateKeyPairSync, sign, verify } from 'node:crypto'

export const LICENSE_VERSION = 1
export const MACHINE_CODE_PREFIX = 'ECAI-'

export function sha256Hex(input) {
  return createHash('sha256').update(input, 'utf8').digest('hex')
}

// 规范化载荷：固定字段顺序，签名与验签必须用同一份序列化
export function canonicalLicense(p) {
  const keys = ['ver', 'type', 'machine', 'expires', 'issuer', 'issuedAt', 'purpose']
  const obj = {}
  for (const k of keys) obj[k] = p[k]
  return JSON.stringify(obj)
}

export function signLicensePayload(privateKeyPem, payload) {
  return sign('RSA-SHA256', Buffer.from(canonicalLicense(payload), 'utf8'), privateKeyPem).toString('base64')
}

export function verifyLicenseSignature(publicKeyPem, payload, signature) {
  try {
    return verify('RSA-SHA256', Buffer.from(canonicalLicense(payload), 'utf8'), publicKeyPem, Buffer.from(signature, 'base64'))
  } catch {
    return false
  }
}

export function generateKeyPair() {
  const { publicKey, privateKey } = generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
  })
  return { publicKey: publicKey.trim(), privateKey: privateKey.trim() }
}

export function publicKeyFingerprint(pem) {
  const body = pem.replace(/-----(BEGIN|END) PUBLIC KEY-----/g, '').replace(/\s+/g, '')
  const digest = createHash('sha256').update(Buffer.from(body, 'base64')).digest('hex').toUpperCase()
  return digest.match(/.{1,2}/g).join(':')
}

// 机器码：ECAI-<hard 64hex>-<full 64hex>；兼容单段 64 位十六进制（视为 hard=full=该段）
export function parseMachineCode(input) {
  if (typeof input !== 'string') return null
  const t = input.trim()
  const m = /^ECAI-([0-9a-f]{64})-([0-9a-f]{64})$/.exec(t)
  if (m) return { hard: m[1], full: m[2] }
  if (/^[0-9a-f]{64}$/.test(t)) return { hard: t, full: t }
  return null
}