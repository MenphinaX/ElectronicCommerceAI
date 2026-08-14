// 开屏欢迎页显示与停留时长（任务 4F ⑤ / 4J ①）：纯函数便于单测
export interface SplashState {
  splashEnabled: boolean
  onboardingDone: boolean
  nowDate: string
  lastSplashDate: string
}

export function shouldShowSplash(s: SplashState): boolean {
  return s.splashEnabled && s.onboardingDone && s.nowDate !== s.lastSplashDate
}

// 任务 4J ①：开屏停留时长选项（秒），0 = 永不自动进入；默认 4 秒
export const SPLASH_DURATION_OPTIONS = [2, 4, 6, 0] as const
export const DEFAULT_SPLASH_DURATION = 4

/** 自动进入延时（毫秒）；返回 null 表示不自动进入；性能模式不播动画、停留缩短 */
export function splashDelayMs(durationSec: number, performanceMode: boolean): number | null {
  if (durationSec === 0) return null
  if (performanceMode) return 600
  return durationSec * 1000
}

/** 开屏提示文案，与实际延时保持一致 */
export function splashHintText(durationSec: number): string {
  return durationSec === 0 ? '点击任意位置进入工作台' : `点击任意位置或等待 ${durationSec} 秒自动进入`
}
