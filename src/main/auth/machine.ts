// 任务 9 机器码：CPU+主板+磁盘序列号 → SHA-256；授权仅绑定 hard（CPU+主板），换硬盘不锁死
// 任务 4H 提速：systeminformation si.system() 实测 5606ms 是首屏瓶颈，改用 wmic 并行直取（实测 5 项合计 ≈250ms，
// 硬件值与本机 si 完全一致：hard 哈希实测与现有 license 完全匹配）；systeminformation 仅作 wmic 不可用时的兜底
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import si from 'systeminformation'
import { sha256Hex } from './license-core.mjs'
import type { MachineIdentity } from './license'

export interface MachineParts {
  cpuId: string
  systemUuid: string
  systemSerial: string
  boardSerial: string
  diskSerials: string[]
}

export interface MachineProvider {
  getHardware(): Promise<MachineParts>
}

function norm(s: string): string {
  return String(s ?? '').trim().toLowerCase()
}

export function buildMachineIdentity(parts: MachineParts): MachineIdentity {
  const cpuId = norm(parts.cpuId) || 'unknown-cpu'
  const sysUuid = norm(parts.systemUuid) || 'unknown-sys'
  const sysSerial = norm(parts.systemSerial) || 'unknown-sysserial'
  const boardSerial = norm(parts.boardSerial) || 'unknown-board'
  const hard = sha256Hex(`cpu:${cpuId}|sys:${sysUuid}|sysserial:${sysSerial}|board:${boardSerial}`)
  const disks = parts.diskSerials.map(norm).filter(Boolean).sort()
  const diskPart = disks.length ? disks.join('|') : 'none'
  const full = sha256Hex(`hard:${hard}|disk:${diskPart}`)
  return { hard, full, display: `ECAI-${hard}-${full}` }
}

const execFileAsync = promisify(execFile)

function parseWmicValue(out: string, key: string): string {
  const m = new RegExp(`${key}=([^\\r\\n]+)`).exec(out)
  return m ? m[1].trim() : ''
}

async function wmicValue(cls: string, key: string): Promise<string> {
  try {
    const { stdout } = await execFileAsync('wmic', [cls, 'get', key, '/value'], {
      encoding: 'utf8',
      timeout: 8000,
      windowsHide: true
    })
    return parseWmicValue(stdout, key)
  } catch {
    return ''
  }
}

async function wmicDiskSerials(): Promise<string[]> {
  try {
    const { stdout } = await execFileAsync('wmic', ['diskdrive', 'get', 'SerialNumber', '/value'], {
      encoding: 'utf8',
      timeout: 8000,
      windowsHide: true
    })
    const out: string[] = []
    const re = /SerialNumber=([^\r\n]+)/g
    let m: RegExpExecArray | null
    while ((m = re.exec(stdout)) !== null) {
      const v = m[1].trim()
      if (v) out.push(v)
    }
    return out
  } catch {
    return []
  }
}

export const realProvider: MachineProvider = {
  async getHardware(): Promise<MachineParts> {
    if (process.platform === 'win32') {
      // 主路径：wmic 并行直取（Windows 7+ 可用；实测总耗时远低于 systeminformation）
      const [cpuId, systemUuid, systemSerial, boardSerial, diskSerials] = await Promise.all([
        wmicValue('cpu', 'ProcessorId'),
        wmicValue('csproduct', 'UUID'),
        wmicValue('csproduct', 'IdentifyingNumber'),
        wmicValue('baseboard', 'SerialNumber'),
        wmicDiskSerials()
      ])
      if (cpuId || systemUuid || systemSerial || boardSerial) {
        return { cpuId, systemUuid, systemSerial, boardSerial, diskSerials }
      }
      // wmic 全部失败才走 systeminformation 兜底（保证非 Windows/旧环境仍可采集）
    }
    const [system, baseboard, cpu, disk] = await Promise.all([si.system(), si.baseboard(), si.cpu(), si.diskLayout()])
    const diskSerials = disk.map((d) => d.serialNum ?? '').filter(Boolean)
    return {
      cpuId: `${cpu.brand}|${cpu.family}|${cpu.model}|${cpu.stepping}`,
      systemUuid: system.uuid ?? '',
      systemSerial: system.serial ?? '',
      boardSerial: baseboard.serial ?? '',
      diskSerials
    }
  }
}

// 验收辅助：模拟换机（仅 EC_AI_AUTOSHOT=1 时可通过 debug:machine-simulate 设置；生产环境无入口）
let override: MachineIdentity | null = null

export function setMachineOverride(m: MachineIdentity | null): void {
  override = m
}

// 任务 4H：进程内缓存（hard 段不变即复用；仅内存，不落盘，防篡改旁路；换机模拟优先）
const cacheByProvider = new WeakMap<MachineProvider, Promise<MachineIdentity>>()

export async function collectMachineId(provider: MachineProvider = realProvider): Promise<MachineIdentity> {
  if (override) return override
  const hit = cacheByProvider.get(provider)
  if (hit) return hit
  const p = provider.getHardware().then(buildMachineIdentity)
  cacheByProvider.set(provider, p)
  p.catch(() => {
    if (cacheByProvider.get(provider) === p) cacheByProvider.delete(provider)
  })
  return p
}

/** 任务 4H：应用启动时预采集，冷启动门禁判定不等 wmic（无副作用、可重复调用） */
export function warmMachineId(): void {
  void collectMachineId()
}
