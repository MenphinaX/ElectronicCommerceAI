// 头像落盘（任务 4F ④）：nativeImage 解码校验 → 超限 1:1 居中裁切+压缩 ≤512px → 写 userData/avatars
import { nativeImage } from 'electron'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { extname, join } from 'node:path'
import { assertAvatarSize, avatarOutExt, fitAvatarSquare } from './avatar'

const AVATAR_ALLOWED_EXTS = ['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp']

export interface AvatarProcessResult {
  ok: boolean
  avatar?: string
  error?: string
  width?: number
  height?: number
  /** 是否做过裁切/压缩 */
  processed?: boolean
}

export function processAvatarFile(srcPath: string, avatarDir: string): AvatarProcessResult {
  const srcExt = extname(srcPath).toLowerCase().replace('.', '')
  if (!(AVATAR_ALLOWED_EXTS as readonly string[]).includes(srcExt)) {
    return { ok: false, error: `不支持的图片格式：${srcExt || '无扩展名'}，仅支持 png/jpg/jpeg/webp/gif/bmp` }
  }
  const bytes = readFileSync(srcPath)
  try {
    assertAvatarSize(bytes)
  } catch (err) {
    return { ok: false, error: (err as Error).message }
  }
  const img = nativeImage.createFromBuffer(bytes)
  if (img.isEmpty()) {
    return { ok: false, error: '无法解析图片，请换一张有效的 png/jpg/jpeg/webp 图片（文件可能已损坏或格式不支持）' }
  }
  const { width: w, height: h } = img.getSize()
  if (!w || !h) return { ok: false, error: '无法解析图片尺寸' }
  const fit = fitAvatarSquare({ width: w, height: h })
  let out = img
  let processed = false
  if (fit.crop) {
    out = out.crop(fit.crop)
    processed = true
  }
  if (fit.resize) {
    out = out.resize({ width: fit.resize.width, height: fit.resize.height })
    processed = true
  }
  const ext = avatarOutExt(srcPath)
  const bytesOut = ext === 'jpg' ? out.toJPEG(90) : out.toPNG()
  const name = `avatar-${Date.now()}.${ext}`
  mkdirSync(avatarDir, { recursive: true })
  writeFileSync(join(avatarDir, name), bytesOut)
  const size = out.getSize()
  return { ok: true, avatar: `file:${name}`, width: size.width, height: size.height, processed }
}
