// 头像协议 URL 解析（任务 4I）：兼容旧格式 host 形式（ecai-avatar://文件名）与新格式 path 形式（ecai-avatar://local/文件名）
// 返回文件名；任何非法输入（非头像协议/空/目录穿越/反斜杠）返回 null（调用方按 403 拦截）
export function avatarNameFromUrl(rawUrl: string): string | null {
  try {
    const url = new URL(rawUrl)
    if (url.protocol !== 'ecai-avatar:') return null
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
