// 背景图校验（任务 4J）：纯函数，与 Electron 解耦便于单测
// 规则：仅 jpg/jpeg/png/webp，≤8MB，原样落盘（不做裁切压缩）
export const MAX_THEME_BG_BYTES = 8 * 1024 * 1024
export const THEME_BG_ALLOWED_EXTS = ['jpg', 'jpeg', 'png', 'webp']

export function assertThemeBgSize(bytes: Uint8Array): void {
  if (bytes.byteLength > MAX_THEME_BG_BYTES) {
    throw new Error(`背景图超过 8MB 上限（${(bytes.byteLength / 1024 / 1024).toFixed(1)}MB），请换一张小一点的图片`)
  }
}

export function themeBgAllowed(ext: string): boolean {
  return (THEME_BG_ALLOWED_EXTS as readonly string[]).includes(ext.toLowerCase())
}

/** 输出扩展名：jpeg 归一为 jpg，其余保留原扩展名 */
export function themeBgOutExt(origName: string): string {
  const ext = origName.split('.').pop()?.toLowerCase() ?? ''
  return ext === 'jpeg' ? 'jpg' : ext
}
