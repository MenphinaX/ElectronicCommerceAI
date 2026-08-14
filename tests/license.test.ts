// 任务 9 授权与激活（离线）TDD 测试：验签/机器码/有效期/万能解锁/容差/防篡改
import { describe, expect, it } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  canonicalLicense, generateKeyPair, parseMachineCode, signLicensePayload, verifyLicenseSignature,
  type LicensePayload
} from '../src/main/auth/license-core.mjs'
import { LICENSE_PUBLIC_KEY_FINGERPRINT, LICENSE_PUBLIC_KEY_PEM } from '../src/main/auth/public-key'
import { evaluateLicense, type LicenseState } from '../src/main/auth/license'

const NOW = '2026-08-14'
// 授权工具源码单独分发（含私钥，勿公开）；主程序开源仓库无 tools/ 时跳过跨端配对测试
const HAS_LICENSE_TOOL = existsSync(join(process.cwd(), 'tools/license-tool/keys/admin-private.pem'))
const key = generateKeyPair()
const pub = key.publicKey
const priv = key.privateKey

function payload(over: Partial<LicensePayload> = {}): LicensePayload {
  return {
    ver: 1,
    type: 'machine',
    machine: 'hardA',
    expires: '2026-12-31',
    issuer: '管理员',
    issuedAt: '2026-08-14T08:00:00.000Z',
    purpose: '',
    ...over
  }
}

function signed(over: Partial<LicensePayload> = {}): string {
  const p = payload(over)
  const sig = signLicensePayload(priv, p)
  return JSON.stringify({ ...p, signature: sig })
}

function state(content: string | null, machine = { hard: 'hardA', full: 'fullA' }, now = NOW): LicenseState {
  return evaluateLicense(content, machine, now, pub)
}

describe('授权核心：签名/验签', () => {
  it('生成密钥对可签发并可验证（RSA-SHA256 真实验签）', () => {
    const p = payload()
    const sig = signLicensePayload(priv, p)
    expect(sig.length).toBeGreaterThan(100)
    expect(verifyLicenseSignature(pub, p, sig)).toBe(true)
  })
  it('公钥与私钥不匹配时验证失败', () => {
    const other = generateKeyPair()
    const p = payload()
    const sig = signLicensePayload(priv, p)
    expect(verifyLicenseSignature(other.publicKey, p, sig)).toBe(false)
  })
  it('同一载荷 canonical 序列化稳定（签名可复现）', () => {
    expect(canonicalLicense(payload())).toBe(canonicalLicense(payload()))
    const sig1 = signLicensePayload(priv, payload())
    const sig2 = signLicensePayload(priv, payload())
    expect(sig1).toBe(sig2)
  })
  it.skipIf(!HAS_LICENSE_TOOL)('嵌入的公钥与授权工具私钥配对（tools/license-tool/keys/admin-public.pem）', () => {
    const pem = readFileSync(join(process.cwd(), 'tools/license-tool/keys/admin-public.pem'), 'utf8').trim()
    expect(LICENSE_PUBLIC_KEY_PEM).toBe(pem)
    expect(LICENSE_PUBLIC_KEY_FINGERPRINT.length).toBeGreaterThanOrEqual(16)
  })
  it.skipIf(!HAS_LICENSE_TOOL)('授权工具 vendor 副本与主应用 license-core 内容一致（跨端验签一致性）', () => {
    const a = readFileSync(join(process.cwd(), 'src/main/auth/license-core.mjs'), 'utf8')
    const b = readFileSync(join(process.cwd(), 'tools/license-tool/vendor/license-core.mjs'), 'utf8')
    expect(b).toBe(a)
  })
  it.skipIf(!HAS_LICENSE_TOOL)('授权工具私钥签发 → 应用内置公钥验签通过（真实配对）', () => {
    const realPriv = readFileSync(join(process.cwd(), 'tools/license-tool/keys/admin-private.pem'), 'utf8')
    const p = payload()
    const sig = signLicensePayload(realPriv, p)
    expect(verifyLicenseSignature(LICENSE_PUBLIC_KEY_PEM, p, sig)).toBe(true)
  })
})

describe('授权状态：机器绑定', () => {
  it('有效授权 → ok', () => {
    const s = state(signed())
    expect(s.ok).toBe(true)
    expect(s.reason).toBe('ok')
    expect(s.kind).toBe('machine')
    expect(s.expires).toBe('2026-12-31')
  })
  it('机器码不匹配（换机）→ machine-mismatch', () => {
    const s = state(signed(), { hard: 'hardB', full: 'fullB' })
    expect(s.ok).toBe(false)
    expect(s.reason).toBe('machine-mismatch')
  })
  it('仅硬盘序列号变化（hard 相同 full 不同）不锁死', () => {
    const s = state(signed(), { hard: 'hardA', full: 'fullC' })
    expect(s.ok).toBe(true)
  })
  it('license 绑定 full 时也放行（兼容粘贴单段哈希）', () => {
    const s = state(signed({ machine: 'fullA' }), { hard: 'hardA', full: 'fullA' })
    expect(s.ok).toBe(true)
  })
  it('无授权文件 → no-license', () => {
    const s = state(null)
    expect(s.ok).toBe(false)
    expect(s.reason).toBe('no-license')
  })
  it('文件损坏（非法 JSON）→ corrupt', () => {
    const s = state('{not-json')
    expect(s.ok).toBe(false)
    expect(s.reason).toBe('corrupt')
  })
})

describe('授权状态：有效期', () => {
  it('已过期 → expired', () => {
    const s = state(signed({ expires: '2026-08-13' }))
    expect(s.ok).toBe(false)
    expect(s.reason).toBe('expired')
  })
  it('到期当天仍可用，且进入 14 天提醒', () => {
    const s = state(signed({ expires: '2026-08-14' }))
    expect(s.ok).toBe(true)
    expect(s.expiresInDays).toBe(0)
    expect(s.expiringSoon).toBe(true)
  })
  it('到期前 14 天起提醒（14 天内含边界）', () => {
    expect(state(signed({ expires: '2026-08-28' })).expiringSoon).toBe(true)
    expect(state(signed({ expires: '2026-08-29' })).expiringSoon).toBe(false)
    expect(state(signed({ expires: '2026-09-30' })).expiringSoon).toBe(false)
  })
})

describe('授权状态：防篡改', () => {
  it('改一个字节（篡改到期日）→ invalid-signature', () => {
    const good = JSON.parse(signed({ expires: '2026-12-31' })) as LicensePayload & { signature: string }
    good.expires = '2026-12-30'
    const s = state(JSON.stringify(good))
    expect(s.ok).toBe(false)
    expect(s.reason).toBe('invalid-signature')
  })
  it('改一个字符（篡改签名字符串中段）→ invalid-signature', () => {
    const good = JSON.parse(signed()) as LicensePayload & { signature: string }
    const i = Math.floor(good.signature.length / 2)
    const tampered = good.signature.slice(0, i) + (good.signature[i] === 'A' ? 'B' : 'A') + good.signature.slice(i + 1)
    const s = state(JSON.stringify({ ...good, signature: tampered }))
    expect(s.ok).toBe(false)
    expect(s.reason).toBe('invalid-signature')
  })
  it('文件改一个字节（Buffer 翻转）→ invalid-signature', () => {
    const good = Buffer.from(signed(), 'utf8')
    const mid = Math.floor(good.length / 2)
    good[mid] = good[mid] === 65 ? 66 : 65
    const s = state(good.toString('utf8'))
    expect(s.ok).toBe(false)
    expect(s.reason).toBe('invalid-signature')
  })
  it('伪造签名（随机字符串）→ invalid-signature', () => {
    const p = payload()
    const s = state(JSON.stringify({ ...p, signature: 'AAAA' + 'x'.repeat(200) }))
    expect(s.ok).toBe(false)
  })
})

describe('万能解锁', () => {
  it('不绑定机器码，任意机器可用，带有效期', () => {
    const s = state(signed({ type: 'unlock', machine: '', purpose: '上门重置密码锁' }), { hard: 'hardX', full: 'fullX' })
    expect(s.ok).toBe(true)
    expect(s.kind).toBe('unlock')
    expect(s.purpose).toBe('上门重置密码锁')
  })
  it('万能解锁过期 → expired', () => {
    const s = state(signed({ type: 'unlock', machine: '', expires: '2026-08-01' }))
    expect(s.ok).toBe(false)
    expect(s.reason).toBe('expired')
  })
  it('万能解锁篡改一个字节 → invalid-signature', () => {
    const good = JSON.parse(signed({ type: 'unlock', machine: '', purpose: 'x' })) as LicensePayload & { signature: string }
    good.purpose = 'y'
    const s = state(JSON.stringify(good))
    expect(s.ok).toBe(false)
    expect(s.reason).toBe('invalid-signature')
  })
})

describe('机器码格式', () => {
  it('parseMachineCode 解析 ECAI-hard-full 双段格式', () => {
    const hard = 'a'.repeat(64)
    const full = 'b'.repeat(64)
    const parsed = parseMachineCode(`ECAI-${hard}-${full}`)
    expect(parsed).toEqual({ hard, full })
  })
  it('parseMachineCode 兼容单段 64 位十六进制（hard=full=该段）', () => {
    const h = 'c'.repeat(64)
    const parsed = parseMachineCode(h)
    expect(parsed).toEqual({ hard: h, full: h })
  })
  it('parseMachineCode 拒绝非法输入', () => {
    expect(parseMachineCode('')).toBeNull()
    expect(parseMachineCode('ECAI-123')).toBeNull()
    expect(parseMachineCode('ECAI-' + 'z'.repeat(64) + '-' + 'b'.repeat(64))).toBeNull()
  })
})