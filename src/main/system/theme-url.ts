// 背景图协议 URL 解析（任务 4J）：仿头像协议，兼容 host/path 两种形式
// 返回文件名；任何非法输入（非 ecai-theme 协议/空/目录穿越/反斜杠）返回 null（调用方按 403 拦截）
export function themeNameFromUrl(rawUrl: string): string | null {
  try {
    const url = new URL(rawUrl)
    if (url.protocol !== 'ecai-theme:') return null
    const host = url.hostname
    const seg = host && host !== 'local' ? host : (url.pathname.split('/').filter(Boolean)[0] ?? '')
    if (!seg) return null
    const name = decodeURIComponent(seg)
    if (!name || name.includes('..') || name.includes('\\') || name.includes('/')) return null
    return name
  } catch {
    return null
  }
}
