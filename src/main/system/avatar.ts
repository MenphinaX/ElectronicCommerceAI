// 头像处理（任务 4F ④）：纯几何函数，与 Electron nativeImage 解码解耦，便于单测
// 规则：≤512px 原样保留；超限先 1:1 居中裁切，再等比缩到 ≤512px；20MB 上限防解码卡顿

export const MAX_AVATAR_EDGE = 512
export const MAX_AVATAR_BYTES = 20 * 1024 * 1024

export interface AvatarFit {
  /** 需要裁切的矩形（null = 不裁切） */
  crop: { x: number; y: number; width: number; height: number } | null
  /** 需要缩放的尺寸（null = 不缩放） */
  resize: { width: number; height: number } | null
}

export function fitAvatarSquare(size: { width: number; height: number }, maxEdge = MAX_AVATAR_EDGE): AvatarFit {
  const { width: w, height: h } = size
  if (!w || !h) return { crop: null, resize: null }
  const max = Math.max(w, h)
  if (max <= maxEdge) return { crop: null, resize: null }
  const side = Math.min(w, h)
  const crop = {
    x: Math.round((w - side) / 2),
    y: Math.round((h - side) / 2),
    width: side,
    height: side
  }
  const resize = side > maxEdge ? { width: maxEdge, height: maxEdge } : null
  return { crop, resize }
}

export function assertAvatarSize(bytes: Buffer): void {
  if (bytes.length > MAX_AVATAR_BYTES) {
    throw new Error(`图片超过 ${MAX_AVATAR_BYTES / 1024 / 1024}MB 上限（${(bytes.length / 1024 / 1024).toFixed(1)}MB），请换一张小一点的图片`)
  }
}

/** 输出扩展名：jpg/jpeg 存 jpg，其余统一 png（webp/gif/bmp 解码后转 png） */
export function avatarOutExt(origName: string): 'jpg' | 'png' {
  const ext = origName.split('.').pop()?.toLowerCase() ?? ''
  return ext === 'jpg' || ext === 'jpeg' ? 'jpg' : 'png'
}
