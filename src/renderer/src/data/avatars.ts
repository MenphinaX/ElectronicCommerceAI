// 内置线性头像库（任务 10）：引导/设置/开屏共用；avatar 值 = 'a1'~'a8' 或 'file:文件名'
export interface AvatarDef {
  id: string
  title: string
  svg: string
}

export const AVATARS: AvatarDef[] = [
  { id: 'a1', title: '经典', svg: '<circle cx="12" cy="9" r="4.2"/><path d="M4.5 19.5c1.8-3.4 4.2-5 7.5-5s5.7 1.6 7.5 5"/>' },
  { id: 'a2', title: '短穗', svg: '<path d="M7.8 9.4c0-3.2 1.9-5.4 4.2-5.4s4.2 2.2 4.2 5.4c.9.2 1.5.8 1.8 1.8H6c.3-1 .9-1.6 1.8-1.8z"/><path d="M4.5 19.5c1.8-3.4 4.2-5 7.5-5s5.7 1.6 7.5 5"/>' },
  { id: 'a3', title: '眼镜', svg: '<circle cx="12" cy="9" r="4.2"/><circle cx="9.3" cy="9" r="1.5"/><circle cx="14.7" cy="9" r="1.5"/><path d="M4.5 19.5c1.8-3.4 4.2-5 7.5-5s5.7 1.6 7.5 5"/>' },
  { id: 'a4', title: '丸子头', svg: '<circle cx="12" cy="9" r="4.2"/><circle cx="12" cy="3.6" r="1.7"/><path d="M4.5 19.5c1.8-3.4 4.2-5 7.5-5s5.7 1.6 7.5 5"/>' },
  { id: 'a5', title: '微笑', svg: '<circle cx="12" cy="9" r="4.2"/><path d="M10.2 9.6h3.6"/><path d="M4.5 19.5c1.8-3.4 4.2-5 7.5-5s5.7 1.6 7.5 5"/>' },
  { id: 'a6', title: '耳机', svg: '<circle cx="12" cy="9" r="4.2"/><path d="M7.4 12.8a5.6 5.6 0 0 0 9.2 0"/><rect x="5.6" y="12" width="2.6" height="4.6" rx="1.3"/><rect x="15.8" y="12" width="2.6" height="4.6" rx="1.3"/><path d="M4.5 19.5c1.8-3.4 4.2-5 7.5-5s5.7 1.6 7.5 5"/>' },
  { id: 'a7', title: '马尾', svg: '<circle cx="12" cy="9" r="4.2"/><path d="M15.4 7.2c1.7 1.3 2 3.4 1 5.4"/><path d="M4.5 19.5c1.8-3.4 4.2-5 7.5-5s5.7 1.6 7.5 5"/>' },
  { id: 'a8', title: '贝雷帽', svg: '<path d="M6.5 9.8c0-3.6 2.5-5.6 5.5-5.6s5.5 2 5.5 5.6c.4 0 .8.3 1 1.2H5.5c.2-.9.6-1.2 1-1.2z"/><path d="M4.5 19.5c1.8-3.4 4.2-5 7.5-5s5.7 1.6 7.5 5"/>' }
]

export function avatarSvg(id: string): string {
  return AVATARS.find((a) => a.id === id)?.svg ?? AVATARS[0].svg
}

/** 任务 4H：是否为品牌默认头像（渲染走品牌图标图片而非 SVG） */
export function isBrandAvatar(id: string): boolean {
  return id === 'brand' || (!id || !AVATARS.some((a) => a.id === id))
}

export function avatarFileUrl(avatar: string): string {
  if (!avatar.startsWith('file:')) return ''
  // 任务 4I：固定 host local，文件名放 pathname（旧格式把文件名解析成 hostname → 协议 403）
  return `ecai-avatar://local/${encodeURIComponent(avatar.slice(5))}`
}