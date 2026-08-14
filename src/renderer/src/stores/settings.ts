import { defineStore } from 'pinia'
import { shouldShowSplash, DEFAULT_SPLASH_DURATION } from '../utils/splash'
import { isThemeId, themeFileUrl, type ThemeName } from '../data/themes'

export type { ThemeName }

export interface ProfileData {
  username: string
  avatar: string
}

/** 开屏停留时长可选值（秒），0 = 永不自动进入 */
export const SPLASH_DURATION_CHOICES = [2, 4, 6, 0] as const

interface SettingsState {
  theme: ThemeName
  shopId: string | null
  performanceMode: boolean
  navCollapsed: boolean
  trayOnClose: boolean
  onboardingDone: boolean
  splashEnabled: boolean
  splashDuration: number
  lastSplashDate: string
  profile: ProfileData
  passwordEnabled: boolean
  lockUnlocked: boolean
  now: { dateStr: string; hour: number }
  appInfo: { version: string; productName: string; electron: string; node: string; chrome: string; platform: string; arch: string } | null
  backgroundImage: string
  loaded: boolean
}

export const useSettingsStore = defineStore('settings', {
  state: (): SettingsState => ({
    theme: 'dark',
    shopId: null,
    performanceMode: false,
    navCollapsed: false,
    trayOnClose: true,
    onboardingDone: false,
    splashEnabled: true,
    splashDuration: DEFAULT_SPLASH_DURATION,
    lastSplashDate: '',
    profile: { username: '', avatar: 'brand' },
    passwordEnabled: false,
    lockUnlocked: true,
    now: { dateStr: '', hour: 0 },
    appInfo: null,
    backgroundImage: '',
    loaded: false
  }),
  actions: {
    async load(): Promise<void> {
      const s = (await window.api.settings.get()) as Record<string, unknown>
      // 任务 4J ①：兼容已有 settings.json——缺 splashDuration/backgroundImage 字段走默认，不覆盖
      if (isThemeId(s.theme)) this.theme = s.theme as ThemeName
      if (typeof s.shopId === 'string' || s.shopId === null) this.shopId = s.shopId as string | null
      if (typeof s.performanceMode === 'boolean') this.performanceMode = s.performanceMode as boolean
      if (typeof s.navCollapsed === 'boolean') this.navCollapsed = s.navCollapsed as boolean
      if (typeof s.trayOnClose === 'boolean') this.trayOnClose = s.trayOnClose as boolean
      if (typeof s.onboardingDone === 'boolean') this.onboardingDone = s.onboardingDone as boolean
      if (typeof s.splashEnabled === 'boolean') this.splashEnabled = s.splashEnabled as boolean
      if (typeof s.splashDuration === 'number' && (SPLASH_DURATION_CHOICES as readonly number[]).includes(s.splashDuration)) {
        this.splashDuration = s.splashDuration as number
      }
      if (typeof s.lastSplashDate === 'string') this.lastSplashDate = s.lastSplashDate as string
      if (typeof s.backgroundImage === 'string') this.backgroundImage = s.backgroundImage as string
      if (s.profile && typeof s.profile === 'object') {
        const p = s.profile as Partial<ProfileData>
        this.profile = { username: p.username ?? '', avatar: p.avatar ?? 'brand' }
      }
      const pw = await window.api.system.passwordStatus()
      this.passwordEnabled = pw.enabled
      this.lockUnlocked = !pw.enabled
      const now = await window.api.system.now()
      this.now = now
      this.appInfo = (await window.api.app.info()) as SettingsState['appInfo']
      this.applyTheme()
      this.applyBackground()
      this.applyPerformanceMode()
      this.loaded = true
    },
    applyTheme(): void {
      document.documentElement.dataset.theme = this.theme
    },
    async setTheme(theme: ThemeName): Promise<void> {
      this.theme = theme
      this.applyTheme()
      await window.api.settings.set({ theme })
    },
    /** 任务 4J ④：背景图挂到 html[data-background] + --bg-image（body/主界面背景） */
    applyBackground(): void {
      const root = document.documentElement
      if (this.backgroundImage) {
        root.dataset.background = 'on'
        root.style.setProperty('--bg-image', `url("${themeFileUrl(this.backgroundImage)}")`)
      } else {
        delete root.dataset.background
        root.style.removeProperty('--bg-image')
      }
    },
    async setBackgroundImage(file: string): Promise<void> {
      this.backgroundImage = file
      this.applyBackground()
      await window.api.settings.set({ backgroundImage: file })
    },
    applyPerformanceMode(): void {
      document.documentElement.classList.toggle('perf-mode', this.performanceMode)
    },
    async setPerformanceMode(enabled: boolean): Promise<void> {
      this.performanceMode = enabled
      this.applyPerformanceMode()
      await window.api.settings.set({ performanceMode: enabled })
    },
    async selectShop(shopId: string | null): Promise<void> {
      this.shopId = shopId
      await window.api.settings.set({ shopId })
    },
    async setNavCollapsed(collapsed: boolean): Promise<void> {
      this.navCollapsed = collapsed
      await window.api.settings.set({ navCollapsed: collapsed })
    },
    async setTrayOnClose(enabled: boolean): Promise<void> {
      this.trayOnClose = enabled
      await window.api.settings.set({ trayOnClose: enabled })
    },
    async setSplashEnabled(enabled: boolean): Promise<void> {
      this.splashEnabled = enabled
      await window.api.settings.set({ splashEnabled: enabled })
    },
    async setSplashDuration(sec: number): Promise<void> {
      this.splashDuration = sec
      await window.api.settings.set({ splashDuration: sec })
    },
    async setOnboardingDone(done = true): Promise<void> {
      this.onboardingDone = done
      await window.api.settings.set({ onboardingDone: done })
    },
    async setLastSplashDate(dateStr: string): Promise<void> {
      this.lastSplashDate = dateStr
      await window.api.settings.set({ lastSplashDate: dateStr })
    },
    async setProfile(profile: ProfileData): Promise<void> {
      this.profile = profile
      await window.api.profile.set(profile)
    },
    async setPasswordEnabled(enabled: boolean, pwd?: string): Promise<{ ok: boolean; message?: string }> {
      if (enabled && pwd) {
        const res = await window.api.system.passwordSet(pwd)
        if (!res.ok) return res
        this.passwordEnabled = true
        this.lockUnlocked = true
      } else if (!enabled) {
        await window.api.system.passwordClear()
        this.passwordEnabled = false
        this.lockUnlocked = true
      }
      return { ok: true }
    },
    /** 开屏问候是否待展示（每天首次启动，设置可关闭；mock 日期由主进程 system:now 提供） */
    splashPending(): boolean {
      return shouldShowSplash({
        splashEnabled: this.splashEnabled,
        onboardingDone: this.onboardingDone,
        nowDate: this.now.dateStr,
        lastSplashDate: this.lastSplashDate
      })
    }
  }
})
