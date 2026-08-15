// 设置持久化（userData/settings.json）——主进程唯一读写点，渲染层走 IPC
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

export interface ProfileData {
  username: string
  avatar: string
}

export interface AppSettings {
  theme?: string
  shopId?: string | null
  shops?: string[]
  performanceMode?: boolean
  navCollapsed?: boolean
  trayOnClose?: boolean
  passwordHash?: string
  onboardingDone?: boolean
  splashEnabled?: boolean
  splashDuration?: number
  lastSplashDate?: string
  profile?: ProfileData
  updateRepo?: string
  backgroundImage?: string
  updaterPendingInstall?: string
}

export function settingsFile(userData: string): string {
  return join(userData, 'settings.json')
}

export function readSettings(userData: string): AppSettings {
  try {
    return JSON.parse(readFileSync(settingsFile(userData), 'utf8')) as AppSettings
  } catch {
    return {}
  }
}

export function writeSettings(userData: string, settings: AppSettings): void {
  mkdirSync(userData, { recursive: true })
  writeFileSync(settingsFile(userData), JSON.stringify(settings, null, 2))
}
