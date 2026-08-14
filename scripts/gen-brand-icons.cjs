// 任务 4H 品牌图标生成：素材 PNG → 去白底(连通域) → 圆形居中裁剪 → 多尺寸 PNG/ICO/托盘变体
// 验收只依赖产物文件与尺寸（不读像素做判定）
const { app, nativeImage } = require('electron')
const fs = require('fs')
const path = require('path')

const SRC = 'C:/Users/Public/Desktop/PixPin_2026-08-14_17-00-55.png'
const root = path.resolve(__dirname, '..')
const SIZES = [16, 24, 32, 48, 64, 128, 256]

function makeBmp(w, h, getter) {
  const buf = Buffer.alloc(w * h * 4)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const { r, g, b, a } = getter(x, y)
      const i = (y * w + x) * 4
      buf[i] = b; buf[i + 1] = g; buf[i + 2] = r; buf[i + 3] = a
    }
  }
  return buf
}

app.whenReady().then(() => {
  const img = nativeImage.createFromPath(SRC)
  if (img.isEmpty()) { console.error('BRAND_ICON_SRC_EMPTY'); app.exit(1); return }
  const { width: W, height: H } = img.getSize()
  const src = img.toBitmap() // BGRA premultiplied
  const px = (x, y) => {
    const i = (y * W + x) * 4
    return { b: src[i], g: src[i + 1], r: src[i + 2], a: src[i + 3] }
  }
  const isLight = (x, y) => {
    const p = px(x, y)
    return p.r >= 235 && p.g >= 235 && p.b >= 235
  }
  // 1) 从四边做连通域标记，仅清除与边缘相连的浅色背景（圈内浅色细节保留）
  const visited = new Uint8Array(W * H)
  const queue = new Int32Array(W * H)
  let qh = 0, qt = 0
  const push = (x, y) => {
    const i = y * W + x
    if (visited[i]) return
    visited[i] = 1
    queue[qt++] = x; queue[qt++] = y
  }
  for (let x = 0; x < W; x++) { if (isLight(x, 0)) push(x, 0); if (isLight(x, H - 1)) push(x, H - 1) }
  for (let y = 0; y < H; y++) { if (isLight(0, y)) push(0, y); if (isLight(W - 1, y)) push(W - 1, y) }
  while (qh < qt) {
    const x = queue[qh++], y = queue[qh++]
    for (const [nx, ny] of [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]]) {
      if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue
      if (isLight(nx, ny)) push(nx, ny)
    }
  }
  // 2) 背景置透明（premultiplied：RGB 归零），再清一遍近白残留晕边
  const alphaMap = new Uint8Array(W * H)
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = y * W + x
      if (visited[i]) {
        alphaMap[i] = 0
        src[i * 4 + 3] = 0; src[i * 4] = 0; src[i * 4 + 1] = 0; src[i * 4 + 2] = 0
      } else {
        alphaMap[i] = src[i * 4 + 3]
      }
    }
  }
  const nearWhite = (x, y) => {
    const p = px(x, y)
    return p.r >= 235 && p.g >= 235 && p.b >= 235
  }
  let cleaned = 0
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = y * W + x
      if (alphaMap[i] === 0 || !nearWhite(x, y)) continue
      const touched = (x > 0 && alphaMap[i - 1] === 0) || (x < W - 1 && alphaMap[i + 1] === 0) ||
        (y > 0 && alphaMap[i - W] === 0) || (y < H - 1 && alphaMap[i + W] === 0)
      if (touched) {
        cleaned++
        alphaMap[i] = 0
        src[i * 4 + 3] = 0; src[i * 4] = 0; src[i * 4 + 1] = 0; src[i * 4 + 2] = 0
      }
    }
  }
  // 3) 不透明内容包围盒 → 圆形居中裁成正方形
  let minX = W, minY = H, maxX = -1, maxY = -1
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (alphaMap[y * W + x] > 0) {
        if (x < minX) minX = x
        if (x > maxX) maxX = x
        if (y < minY) minY = y
        if (y > maxY) maxY = y
      }
    }
  }
  if (maxX < 0) { console.error('BRAND_ICON_NO_CONTENT'); app.exit(1); return }
  const bw = maxX - minX + 1, bh = maxY - minY + 1
  const side = Math.max(bw, bh)
  const cx = Math.round((minX + maxX) / 2), cy = Math.round((minY + maxY) / 2)
  const cropX = Math.max(0, cx - Math.floor(side / 2))
  const cropY = Math.max(0, cy - Math.floor(side / 2))
  // 4) 生成 256 主图（透明底、圆形）
  const full = nativeImage.createFromBitmap(src, { width: W, height: H }).crop({ x: cropX, y: cropY, width: side, height: side })
  const base256 = full.resize({ width: 256, height: 256 })
  const out = (rel, data) => {
    const p = path.join(root, rel)
    fs.mkdirSync(path.dirname(p), { recursive: true })
    fs.writeFileSync(p, data)
    return p
  }
  const pngs = []
  for (const s of SIZES) {
    const png = base256.resize({ width: s, height: s }).toPNG()
    pngs.push({ size: s, data: png })
    out(path.join('resources', 'icons', s + '.png'), png)
  }
  out('build/icon.png', base256.toPNG())
  out('src/renderer/src/assets/brand.png', base256.toPNG())
  // 5) ICO：多尺寸 PNG 条目（Windows 7+ 支持 PNG 压缩 ICO）
  function makeIco(list) {
    const header = Buffer.alloc(6)
    header.writeUInt16LE(0, 0)
    header.writeUInt16LE(1, 2)
    header.writeUInt16LE(list.length, 4)
    const dirs = []
    const blobs = []
    let offset = 6 + 16 * list.length
    for (const { size, data } of list) {
      const dir = Buffer.alloc(16)
      dir.writeUInt8(size === 256 ? 0 : size, 0)
      dir.writeUInt8(size === 256 ? 0 : size, 1)
      dir.writeUInt8(0, 2)
      dir.writeUInt8(0, 3)
      dir.writeUInt16LE(1, 4)
      dir.writeUInt16LE(32, 6)
      dir.writeUInt32LE(data.length, 8)
      dir.writeUInt32LE(offset, 12)
      dirs.push(dir)
      blobs.push(data)
      offset += data.length
    }
    return Buffer.concat([header, ...dirs, ...blobs])
  }
  out('build/icon.ico', makeIco(pngs))
  // 6) 托盘：32px 原版（浅色任务栏）+ 白描边版（深色任务栏可见）
  const trayPlain = base256.resize({ width: 32, height: 32 })
  out('resources/tray.png', trayPlain.toPNG())
  const t32 = trayPlain.toBitmap()
  const ring = makeBmp(32, 32, (x, y) => {
    const i = (y * 32 + x) * 4
    const a = t32[i + 3]
    if (a === 0) return { r: 0, g: 0, b: 0, a: 0 }
    const edge = (x > 0 && t32[i - 4 + 3] === 0) || (x < 31 && t32[i + 4 + 3] === 0) ||
      (y > 0 && t32[i - 128 + 3] === 0) || (y < 31 && t32[i + 128 + 3] === 0)
    if (edge) return { r: 255, g: 255, b: 255, a: 255 }
    return { r: t32[i + 2], g: t32[i + 1], b: t32[i], a }
  })
  const ringImg = nativeImage.createFromBitmap(ring, { width: 32, height: 32 })
  out('resources/tray-ring.png', ringImg.toPNG())
  console.log('BRAND_ICON_OK src=' + W + 'x' + H + ' bbox=' + bw + 'x' + bh + ' cleaned=' + cleaned + ' sizes=' + SIZES.join(','))
  app.exit(0)
})
