// 任务 4L：待安装标记（settings.json updaterPendingInstall）读写与启动安装判定（纯函数，不依赖 electron）
import { readSettings, writeSettings, type AppSettings } from './settings-store'

export function pendingInstallOf(settings: AppSettings): string | null {
  return settings.updaterPendingInstall ?? null
}

export function readPendingInstall(userData: string): string | null {
  return pendingInstallOf(readSettings(userData))
}

export function writePendingInstall(userData: string, version: string): void {
  const s = readSettings(userData)
  s.updaterPendingInstall = version
  writeSettings(userData, s)
}

export function clearPendingInstall(userData: string): void {
  const s = readSettings(userData)
  if (s.updaterPendingInstall === undefined) return
  s.updaterPendingInstall = undefined
  writeSettings(userData, s)
}

/** 启动安装判定：有标记且版本高于当前才装（版本一致=已装过，直接清标记） */
export function shouldAutoInstall(pendingVersion: string | null, currentVersion: string): boolean {
  if (!pendingVersion) return false
  return pendingVersion !== currentVersion
}
