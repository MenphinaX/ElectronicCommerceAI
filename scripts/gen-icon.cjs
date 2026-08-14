// 用隐藏 BrowserWindow 渲染 build/icon.svg 再截图，产出 256px 应用图标与 32px 托盘图标
const { app, BrowserWindow } = require('electron')
const fs = require('fs')
const path = require('path')
const { pathToFileURL } = require('url')

app.whenReady().then(async () => {
  const root = path.resolve(__dirname, '..')
  const svgPath = path.join(root, 'build', 'icon.svg')
  const win = new BrowserWindow({ width: 256, height: 256, show: false, frame: false, transparent: true, webPreferences: { sandbox: true } })
  await win.loadURL(pathToFileURL(svgPath).toString())
  await new Promise((r) => setTimeout(r, 600))
  const image = await win.webContents.capturePage()
  if (image.isEmpty()) {
    console.error('ICON_EMPTY')
    app.exit(1)
    return
  }
  fs.writeFileSync(path.join(root, 'build', 'icon.png'), image.resize({ width: 256, height: 256 }).toPNG())
  fs.writeFileSync(path.join(root, 'resources', 'tray.png'), image.resize({ width: 32, height: 32 }).toPNG())
  console.log('ICON_OK')
  app.exit(0)
})