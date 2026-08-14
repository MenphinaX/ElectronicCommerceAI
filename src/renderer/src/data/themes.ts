// 多主题与背景图（任务 4J）：主题清单 + 背景图协议 URL 生成；纯函数便于单测
export type ThemeName =
  | 'dark'
  | 'light'
  | 'high-contrast'
  | 'midnight'
  | 'forest'
  | 'warm-sun'
  | 'sakura'

export interface ThemeDef {
  id: ThemeName
  label: string
  desc: string
  /** 深色主题：背景图需半透明深色叠加保证文字可读 */
  isDark: boolean
}

export const THEMES: ThemeDef[] = [
  { id: 'dark', label: 'Spotify 暗色', desc: '默认主题，暗底绿强调', isDark: true },
  { id: 'light', label: '浅色', desc: '亮底，适合白天办公', isDark: false },
  { id: 'high-contrast', label: '高对比', desc: '纯黑底高对比', isDark: true },
  { id: 'midnight', label: '午夜蓝', desc: '深蓝底，夜间护眼', isDark: true },
  { id: 'forest', label: '森林绿', desc: '墨绿底，沉稳自然', isDark: true },
  { id: 'warm-sun', label: '暖阳', desc: '暖米底，柔和明亮', isDark: false },
  { id: 'sakura', label: '樱花', desc: '粉白底，柔和淡雅', isDark: false }
]

export function isThemeId(v: unknown): v is ThemeName {
  return typeof v === 'string' && THEMES.some((t) => t.id === v)
}

/** 背景图协议 URL（任务 4J）：固定 host local，文件名放 pathname（仿头像协议） */
export function themeFileUrl(file: string): string {
  if (!file) return ''
  return `ecai-theme://local/${encodeURIComponent(file)}`
}
