// 任务 9 授权 IPC：状态查询 / 选择授权文件 / 导入（验签+落盘+日志）
// 任务 4H：auth:state 记录耗时（launchToDecision 供冷启动验收）；issuer 显示层 UTF-8 清洗（历史 GBK 错位乱码兜底）
import { clipboard, dialog, ipcMain } from 'electron'
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { evaluateLicense, today, type LicenseState, type MachineIdentity } from './license'
import { collectMachineId } from './machine'
import { LICENSE_PUBLIC_KEY_FINGERPRINT } from './public-key'

export interface AuthSnapshot {
  state: LicenseState
  machineCode: string
  hardId: string
  fingerprint: string
}

// 任务 4H：进程启动基准时间（模块加载 ≈ 进程启动），冷启动「launch → 门禁判定」实测口径
const launchMs = Date.now()

export function licenseFile(userData: string): string {
  return join(userData, 'license.json')
}

export function authLogFile(userData: string): string {
  return join(userData, 'auth-events.log')
}

function appendAuthLog(userData: string, line: string): void {
  try {
    const f = authLogFile(userData)
    mkdirSync(userData, { recursive: true })
    appendFileSync(f, `${line}\n`)
  } catch {
    // 日志写入失败不影响授权判定
  }
}

export function shortMachine(machine: MachineIdentity): string {
  return `${machine.display.slice(0, 22)}…${machine.display.slice(-8)}`
}
// 任务 4H：显示层兜底——历史 GBK 错位/替换符乱码清洗为可读值；授权文件本身统一 UTF-8 写读（签名覆盖 issuer，乱码文件本就无法验签）
export function cleanIssuerForDisplay(issuer: string | null): string | null {
  if (!issuer) return issuer
  const s = issuer.replace(/[\u0000-\u001f\u007f]/g, '').trim()
  if (!s || s.includes('\uFFFD')) return null
  return s
}

export async function computeAuthSnapshot(userData: string, machine?: MachineIdentity): Promise<AuthSnapshot> {
  const m = machine ?? (await collectMachineId())
  let content: string | null = null
  try {
    const f = licenseFile(userData)
    if (existsSync(f)) content = readFileSync(f, 'utf8')
  } catch {
    content = null
  }
  const state = evaluateLicense(content, m, today())
  if (state.issuer) state.issuer = cleanIssuerForDisplay(state.issuer)
  return { state, machineCode: m.display, hardId: m.hard, fingerprint: LICENSE_PUBLIC_KEY_FINGERPRINT }
}

export function registerAuthIpc(userData: () => string): void {
  ipcMain.handle('auth:state', async () => {
    const t0 = Date.now()
    const snap = await computeAuthSnapshot(userData())
    const elapsed = Date.now() - t0
    const launchToDecision = Date.now() - launchMs
    const u = userData()
    appendAuthLog(u, `${new Date().toISOString()} | action=state | reason=${snap.state.reason} | elapsedMs=${elapsed} | launchToDecisionMs=${launchToDecision} | kind=${snap.state.kind ?? 'none'}`)
    return snap
  })

  ipcMain.handle('auth:copy', (_e, text: string) => {
    clipboard.writeText(String(text ?? ''))
    return true
  })

  ipcMain.handle('auth:pick-file', async () => {
    const r = await dialog.showOpenDialog({
      title: '选择授权文件',
      filters: [{ name: '授权文件', extensions: ['lic', 'json'] }],
      properties: ['openFile']
    })
    return { ok: !r.canceled && r.filePaths.length > 0, filePath: r.filePaths[0] ?? null }
  })

  ipcMain.handle('auth:import', async (_e, filePath: string) => {
    const dir = userData()
    let content: string | null = null
    try {
      content = readFileSync(filePath, 'utf8')
    } catch {
      return { ok: false, reason: 'read-error', message: '无法读取授权文件' }
    }
    const machine = await collectMachineId()
    const state = evaluateLicense(content, machine, today())
    const who = shortMachine(machine)
    if (state.ok) {
      try {
        mkdirSync(dir, { recursive: true })
        // 统一 UTF-8 写（默认 utf8，显式声明防历史 GBK 错位）
        writeFileSync(licenseFile(dir), content, 'utf8')
      } catch {
        return { ok: false, reason: 'write-error', message: '授权文件写入失败' }
      }
      appendAuthLog(dir, `${new Date().toISOString()} | action=import | kind=${state.kind} | machine=${who} | expires=${state.expires ?? ''} | issuer=${cleanIssuerForDisplay(state.issuer) ?? ''} | purpose=${state.purpose ?? ''} | result=ok`)
    } else {
      appendAuthLog(dir, `${new Date().toISOString()} | action=import | kind=${state.kind ?? 'none'} | reason=${state.reason} | machine=${who} | result=rejected`)
    }
    const snapshot = await computeAuthSnapshot(dir, machine)
    return { ok: state.ok, reason: state.reason, message: reasonText(state.reason), state: snapshot.state }
  })
}

function reasonText(reason: string): string {
  switch (reason) {
    case 'no-license':
      return '未授权：请将本机机器码发给管理员获取授权文件'
    case 'machine-mismatch':
      return '机器不匹配：授权文件与本机机器码不一致'
    case 'expired':
      return '授权已过期：请联系管理员重新授权'
    case 'invalid-signature':
      return '授权文件无效：签名校验失败（文件可能被篡改）'
    case 'corrupt':
      return '授权文件损坏：内容无法解析'
    default:
      return '授权状态异常'
  }
}
