import { app, BrowserWindow, clipboard, ipcMain, Menu, nativeImage, net, protocol, safeStorage, screen, shell, Tray } from 'electron'
import { execFileSync } from 'node:child_process'
import { join, resolve, sep } from 'node:path'
import { pathToFileURL } from 'node:url'
import { appendFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { AppDatabase } from './db'
import { registerImportIpc } from './import/ipc'
import { registerDashboardIpc } from './dashboard/ipc'
import { registerImagesIpc } from './images/ipc'
import { registerModelsIpc } from './ai/models-ipc'
import { registerSkillsIpc } from './ai/skills-ipc'
import { registerCommentsIpc } from './ai/comments-ipc'
import { registerChatIpc } from './ai/chat-ipc'
import { registerQaIpc } from './ai/qa-ipc'
import { registerReportIpc } from './report/report-ipc'
import { registerPackageIpc } from './package/ipc'
import { registerAuthIpc } from './auth/ipc'
import { registerSystemIpc } from './system/ipc'
import { registerRoiIpc } from './roi/ipc'
import { processAvatarFile } from './system/avatar-io'
import { avatarNameFromUrl } from './system/avatar-url'
import { themeNameFromUrl } from './system/theme-url'
import { appLog, initLogger } from './system/logger'
import { readSettings, writeSettings, type AppSettings } from './system/settings-store'
import { setMachineOverride, warmMachineId } from './auth/machine'
import { createModel, setDefaultModel } from './db/repo'
import { ensureBuiltinSkills } from './ai/skills-service'

// ---------- 商品图协议（任务 4A）：ecai-img://img/{店铺}/{商品}.{ext}，仅允许读 userData/product-images 内文件 ----------
protocol.registerSchemesAsPrivileged([
  { scheme: 'ecai-img', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true } },
  { scheme: 'ecai-avatar', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true } },
  { scheme: 'ecai-theme', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true } }
])

// ---------- 单实例锁：防止双开同时写数据库（任务 2 起数据库落地） ----------
const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
} else {
  bootstrap()
}

function bootstrap(): void {
  app.on('second-instance', () => {
    const win = BrowserWindow.getAllWindows()[0]
    if (win) showWindow(win)
  })

  app.whenReady().then(() => {
    initLogger(app.getPath('userData'))
    initDatabase()
    registerImageProtocol()
    registerIpc()
    appLog('app', `EC AI v${app.getVersion()} 启动（electron ${process.versions.electron} / node ${process.versions.node}）`)
    // 任务 4H：授权机器码预采集（wmic 并行），冷启动门禁判定不阻塞在采集上
    warmMachineId()
    createMainWindow()
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createMainWindow()
    })
  })

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit()
  })

  app.on('will-quit', () => {
    appLog('app', '应用退出')
    appDb?.close()
    appDb = null
  })
}

// ---------- 窗口状态记忆（大小/位置/最大化，重启保持） ----------
interface WinState {
  x?: number
  y?: number
  width: number
  height: number
  isMaximized: boolean
}

function windowStateFile(): string {
  return join(app.getPath('userData'), 'window-state.json')
}

function loadWindowState(): WinState | null {
  try {
    const raw = JSON.parse(readFileSync(windowStateFile(), 'utf8')) as Partial<WinState>
    if (typeof raw.width !== 'number' || typeof raw.height !== 'number') return null
    // 校验窗口位置仍落在某个屏幕的工作区内（外接屏拔掉等场景）
    if (typeof raw.x === 'number' && typeof raw.y === 'number') {
      const w = raw.width
      const h = raw.height
      const onScreen = screen.getAllDisplays().some((d) => {
        const a = d.workArea
        return raw.x! < a.x + a.width && raw.x! + w > a.x && raw.y! < a.y + a.height && raw.y! + h > a.y
      })
      if (!onScreen) return null
    }
    return { x: raw.x, y: raw.y, width: raw.width, height: raw.height, isMaximized: !!raw.isMaximized }
  } catch {
    return null
  }
}

function saveWindowState(win: BrowserWindow): void {
  try {
    const isMaximized = win.isMaximized()
    const bounds = isMaximized ? win.getNormalBounds() : win.getBounds()
    mkdirSync(app.getPath('userData'), { recursive: true })
    writeFileSync(windowStateFile(), JSON.stringify({ ...bounds, isMaximized }))
  } catch {
    // 状态保存失败不阻塞窗口使用
  }
}

// ---------- 应用设置（任务 10 起统一走 system/settings-store，含密码锁/引导/资料等） ----------

// ---------- 数据库（任务 2 起：SQLite 落盘 userData/ecai.db，WAL 模式） ----------
let appDb: AppDatabase | null = null

function dbPath(): string {
  return join(app.getPath('userData'), 'ecai.db')
}

function initDatabase(): void {
  appDb = new AppDatabase(dbPath())
  appDb.init()
  // 任务 5：内置技能种子（全店/单品/指南），不配 GitHub 也能生成评语
  ensureBuiltinSkills(appDb, app.getPath('userData'))
}

function getDb(): AppDatabase {
  if (!appDb) throw new Error('数据库未初始化')
  return appDb
}

// ---------- 商品图协议（任务 4A）：只服务 product-images 目录，防目录穿越 ----------
function registerImageProtocol(): void {
  const base = join(app.getPath('userData'), 'product-images')
  protocol.handle('ecai-img', (request) => {
    try {
      const url = new URL(request.url)
      const segs = url.pathname.split('/').filter(Boolean).map((seg) => decodeURIComponent(seg))
      if (segs.length < 2) return new Response('Not found', { status: 404 })
      const full = resolve(base, ...segs)
      if (full !== base && !full.startsWith(base + sep)) return new Response('Forbidden', { status: 403 })
      if (!existsSync(full)) return new Response('Not found', { status: 404 })
      return net.fetch(pathToFileURL(full).toString())
    } catch {
      return new Response('Bad request', { status: 400 })
    }
  })
  // 头像协议（任务 10）：只服务 userData/avatars 内文件，防目录穿越
  protocol.handle('ecai-avatar', (request) => {
    try {
      // 任务 4I：host 形式（旧）与 path 形式（新）双取，非法返回 null → 403
      const name = avatarNameFromUrl(request.url)
      if (!name) {
        return new Response('Forbidden', { status: 403 })
      }
      const full = join(app.getPath('userData'), 'avatars', name)
      if (!existsSync(full)) return new Response('Not found', { status: 404 })
      return net.fetch(pathToFileURL(full).toString())
    } catch {
      return new Response('Bad request', { status: 400 })
    }
  })
  // 背景图协议（任务 4J）：只服务 userData/themes 内文件，防目录穿越
  protocol.handle('ecai-theme', (request) => {
    try {
      const name = themeNameFromUrl(request.url)
      if (!name) {
        return new Response('Forbidden', { status: 403 })
      }
      const full = join(app.getPath('userData'), 'themes', name)
      if (!existsSync(full)) return new Response('Not found', { status: 404 })
      return net.fetch(pathToFileURL(full).toString())
    } catch {
      return new Response('Bad request', { status: 400 })
    }
  })
}

// ---------- IPC（渲染层一律走这里，不许直接读写文件） ----------
function registerIpc(): void {
  registerImportIpc(getDb)
  registerDashboardIpc(getDb)
  registerImagesIpc(getDb)
  registerModelsIpc(getDb)
  registerSkillsIpc(getDb, () => app.getPath('userData'))
  registerCommentsIpc(getDb, () => app.getPath('userData'))
  registerChatIpc(getDb, () => app.getPath('userData'))
  registerQaIpc(getDb)
  registerReportIpc(getDb, () => app.getPath('userData'))
  registerPackageIpc(getDb, () => join(app.getPath('userData'), 'product-images'))
  registerAuthIpc(() => app.getPath('userData'))
  registerSystemIpc(getDb, () => app.getPath('userData'))
  registerRoiIpc(getDb, () => app.getPath('userData'))
  ipcMain.handle('window:minimize', (e) => {
    BrowserWindow.fromWebContents(e.sender)?.minimize()
  })
  ipcMain.handle('window:toggle-maximize', (e) => {
    const win = BrowserWindow.fromWebContents(e.sender)
    if (!win) return false
    if (win.isMaximized()) win.unmaximize()
    else win.maximize()
    return win.isMaximized()
  })
  ipcMain.handle('window:close', (e) => {
    BrowserWindow.fromWebContents(e.sender)?.close()
  })
  ipcMain.handle('window:is-maximized', (e) => {
    return BrowserWindow.fromWebContents(e.sender)?.isMaximized() ?? false
  })
  ipcMain.handle('settings:get', () => readSettings(app.getPath('userData')))
  ipcMain.handle('settings:set', (_e, patch: AppSettings) => {
    const merged = { ...readSettings(app.getPath('userData')), ...patch }
    writeSettings(app.getPath('userData'), merged)
    return merged
  })

  // 数据库：渲染层只允许走高层入口，不许直接写 SQL / 碰文件
  ipcMain.handle('db:status', () => {
    const d = getDb()
    return {
      path: d.path,
      userVersion: d.userVersion(),
      integrity: d.integrityCheck(),
      rowCounts: d.rowCounts()
    }
  })
  ipcMain.handle('db:backup', (_e, reason?: string) => {
    return { path: getDb().backup(reason || 'manual') }
  })
  ipcMain.handle('db:restore', (_e, backupPath: string) => {
    const d = getDb()
    d.restore(backupPath)
    return { ok: true, integrity: d.integrityCheck() }
  })
  ipcMain.handle('db:integrity', () => {
    return getDb().integrityCheck()
  })
  ipcMain.handle('db:list-backups', () => {
    return getDb().listBackups()
  })

  // 验收辅助（env 门控，正常使用不注册）：渲染层请求截图保存到项目 shots/
  if (process.env.EC_AI_AUTOSHOT === '1') {
    ipcMain.handle('debug:shot', async (_e, name: string, rect?: { x: number; y: number; width: number; height: number }) => {
      const win = BrowserWindow.getAllWindows()[0]
      if (!win) return false
      const image = await win.webContents.capturePage()
      let out = image
      if (rect) {
        // 元素矩形（DIP）-> 截图像素：按内容区宽度比例换算
        const scale = image.getSize().width / Math.max(1, win.getContentBounds().width)
        out = image.crop({
          x: Math.max(0, Math.round(rect.x * scale)),
          y: Math.max(0, Math.round(rect.y * scale)),
          width: Math.max(1, Math.round(rect.width * scale)),
          height: Math.max(1, Math.round(rect.height * scale))
        })
      }
      const dir = join(process.cwd(), 'shots')
      mkdirSync(dir, { recursive: true })
      writeFileSync(join(dir, name + '.png'), out.toPNG())
      return true
    })
    // 验收辅助：任务 6 联验——从环境变量读取 DeepSeek key（仅内存传输，不落盘），
    // 走应用内 safeStorage 加密配置模型并设为默认（与 models:create 同一加密路径）；重复调用复用已有模型
    // 验收辅助：任务 7 导出 HTML 用隐藏浏览器窗口渲染并截图（证明导出文件可打开且图表/评语正常）
    ipcMain.handle('debug:render-html-shot', async (_e, filePath: string, shotName: string) => {
      const win = new BrowserWindow({ show: false, width: 1000, height: 1400, webPreferences: { sandbox: false } })
      await win.loadFile(filePath)
      await new Promise((r) => setTimeout(r, 2800))
      const image = await win.webContents.capturePage()
      const dir = join(process.cwd(), 'shots')
      mkdirSync(dir, { recursive: true })
      writeFileSync(join(dir, `${shotName}.png`), image.toPNG())
      win.destroy()
      return true
    })
    ipcMain.handle('debug:model-setup', () => {
      const key = process.env.EC_AI_TASK6_KEY
      if (!key || !key.trim()) return { ok: false, message: '缺少 EC_AI_TASK6_KEY 环境变量' }
      if (!safeStorage.isEncryptionAvailable()) return { ok: false, message: 'safeStorage 不可用' }
      const db = getDb()
      const rows = db.raw.prepare("SELECT id FROM models WHERE name='deepseek-chat' AND provider='deepseek' ORDER BY id LIMIT 1").all() as Array<{ id: number }>
      let id = rows[0]?.id ?? 0
      if (id) {
        setDefaultModel(db, id)
        return { ok: true, id, model: 'deepseek-chat', reused: true }
      }
      const apiKeyEnc = safeStorage.encryptString(key.trim()).toString('base64')
      id = createModel(db, { name: 'deepseek-chat', provider: 'deepseek', baseUrl: 'https://api.deepseek.com', apiKeyEnc })
      setDefaultModel(db, id)
      return { ok: true, id, model: 'deepseek-chat' }
    })
    // 验收辅助：任务 9 模拟换机（仅 EC_AI_AUTOSHOT=1 注册；生产环境无此入口，验签流程仍真实执行）
    ipcMain.handle('debug:machine-simulate', (_e, m: { hard: string; full: string } | null) => {
      if (!m) {
        setMachineOverride(null)
        return true
      }
      setMachineOverride({ hard: m.hard, full: m.full, display: `ECAI-${m.hard}-${m.full}` })
      return true
    })
    // 验收辅助：任务 9 清空本机授权（仅 EC_AI_AUTOSHOT=1 注册）
    ipcMain.handle('debug:license-reset', () => {
      try {
        const f = join(app.getPath('userData'), 'license.json')
        if (existsSync(f)) rmSync(f)
        setMachineOverride(null)
      } catch {
        // 忽略清理异常
      }
      return true
    })
    // 验收辅助：任务 9 剪贴板回读（验证复制机器码真实生效）
    ipcMain.handle('debug:clipboard-read', () => {
      try {
        return clipboard.readText()
      } catch {
        return ''
      }
    })
    // 验收辅助：任务 9 读取授权事件日志（脱敏由验收脚本处理）
    ipcMain.handle('debug:auth-log', () => {
      try {
        const f = join(app.getPath('userData'), 'auth-events.log')
        return existsSync(f) ? readFileSync(f, 'utf8') : ''
      } catch {
        return ''
      }
    })
    // 验收辅助：任务 4F 头像——跳过系统对话框，用真实文件路径走同一条处理管线（生产无此入口）
    ipcMain.handle('debug:avatar-from-path', (_e, srcPath: string) => {
      try {
        const res = processAvatarFile(String(srcPath), join(app.getPath('userData'), 'avatars'))
        if (res.ok) appLog('profile', `头像验收处理 ok processed=${res.processed} size=${res.width}x${res.height}`)
        return res
      } catch (err) {
        return { ok: false, error: String((err as Error)?.message ?? err) }
      }
    })
    ipcMain.handle('debug:log', (_e, line: string) => {
      try {
        appendFileSync(join(process.cwd(), 'autoshot-debug.log'), `${String(line)}\n`)
      } catch {
        // 日志写入失败不影响主流程
      }
      return true
    })
  }
}

// ---------- 系统托盘（任务 10）：关闭窗口默认最小化到托盘，托盘菜单可恢复/退出 ----------
let tray: Tray | null = null
let quitRequested = false

// ---------- 任务 4H：窗口/任务栏图标统一为品牌图标（打包后 Windows 任务栏取 exe 图标，窗口 icon 走 resources） ----------
function systemUsesLightTheme(): boolean {
  try {
    const out = execFileSync('reg', ['query', 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Themes\\Personalize', '/v', 'SystemUsesLightTheme'], { encoding: 'utf8', windowsHide: true, timeout: 4000 })
    const m = /SystemUsesLightTheme\s+REG_DWORD\s+0x([0-9a-f]+)/i.exec(out)
    return m ? parseInt(m[1], 16) === 1 : true
  } catch {
    return true
  }
}

function trayIconPath(): string {
  const base = app.isPackaged
    ? join(process.resourcesPath, 'resources')
    : join(app.getAppPath(), 'resources')
  return join(base, systemUsesLightTheme() ? 'tray.png' : 'tray-ring.png')
}

function showWindow(win: BrowserWindow): void {
  if (!win || win.isDestroyed()) return
  if (win.isMinimized()) win.restore()
  win.show()
  win.focus()
}

function createTray(win: BrowserWindow): void {
  try {
    const icon = nativeImage.createFromPath(trayIconPath())
    tray = new Tray(icon.isEmpty() ? nativeImage.createEmpty() : icon)
    tray.setToolTip('EC AI')
    tray.setContextMenu(
      Menu.buildFromTemplate([
        { label: '打开主界面', click: () => showWindow(win) },
        { type: 'separator' },
        { label: '退出 EC AI', click: () => { quitRequested = true; app.quit() } }
      ])
    )
    tray.on('click', () => showWindow(win))
    appLog('tray', '系统托盘已创建')
  } catch (err) {
    tray = null
    appLog('tray', `托盘创建失败: ${String((err as Error)?.message ?? err)}`)
  }
}

// ---------- 任务 4H：窗口/任务栏图标统一为品牌图标（打包后 Windows 任务栏取 exe 图标，窗口 icon 走 resources） ----------
function windowIconPath(): string {
  return app.isPackaged
    ? join(process.resourcesPath, 'resources', 'icons', '256.png')
    : join(app.getAppPath(), 'build', 'icon.ico')
}

// ---------- 主窗口 ----------
function createMainWindow(): void {
  const state = loadWindowState()
  const win = new BrowserWindow({
    width: state?.width ?? 1280,
    height: state?.height ?? 800,
    x: state?.x,
    y: state?.y,
    minWidth: 960,
    minHeight: 600,
    show: false,
    frame: false,
    backgroundColor: '#121212',
    title: 'EC AI',
    icon: windowIconPath(),
    webPreferences: {
      preload: join(__dirname, '../preload/index.mjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  })

  createTray(win)

  win.once('ready-to-show', () => {
    if (state?.isMaximized) win.maximize()
    win.show()
  })

  // 移动/缩放/最大化后防抖保存窗口状态
  let saveTimer: ReturnType<typeof setTimeout> | null = null
  const scheduleSave = (): void => {
    if (saveTimer) clearTimeout(saveTimer)
    saveTimer = setTimeout(() => saveWindowState(win), 500)
  }
  win.on('resize', scheduleSave)
  win.on('move', scheduleSave)
  win.on('maximize', () => {
    scheduleSave()
    win.webContents.send('window:maximized-changed', true)
  })
  win.on('unmaximize', () => {
    scheduleSave()
    win.webContents.send('window:maximized-changed', false)
  })
  win.on('close', (e) => {
    saveWindowState(win)
    const s = readSettings(app.getPath('userData'))
    if (s.trayOnClose !== false && !quitRequested) {
      e.preventDefault()
      win.hide()
      appLog('tray', '窗口关闭时最小化到托盘')
    }
  })
  win.on('closed', () => {
    if (saveTimer) clearTimeout(saveTimer)
  })

  // 外链一律交给系统浏览器，不在应用内新开窗口
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  // 渲染层错误写入主进程日志（诊断包用；正常使用无副作用）
  win.webContents.on('console-message', (...args: unknown[]) => {
    try {
      const first = args[1]
      if (first && typeof first === 'object' && 'level' in (first as object)) {
        const d = first as { level?: number; message?: string }
        if ((d.level ?? 0) >= 3 && d.message) appLog('renderer', d.message)
      } else if (typeof first === 'number' && first >= 3) {
        appLog('renderer', String(args[2] ?? ''))
      }
    } catch {
      // 忽略日志解析异常
    }
  })

  // 验收辅助：抓取渲染层 console 到项目根 autoshot-console.log（env 门控）
  if (process.env.EC_AI_AUTOSHOT === '1') {
    win.webContents.on('console-message', (_e, level: number, message: string, line: number, sourceId: string) => {
      try {
        appendFileSync(join(process.cwd(), 'autoshot-console.log'), `[${level}] ${String(message)} (${String(sourceId)}:${line})\n`)
      } catch {
        // 忽略
      }
    })
  }
  const devUrl = process.env['ELECTRON_RENDERER_URL']
  if (devUrl) {
    const autoshot = process.env.EC_AI_AUTOSHOT === '1'
    const autoshotMode = process.env.EC_AI_AUTOSHOT_MODE || 'full'
    const autoshotQuery = process.env.EC_AI_AUTOSHOT_QUERY || ''
    win.loadURL(devUrl + (autoshot ? `?autoshot=${autoshotMode}${autoshotQuery}` : ''))
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'))
  }
}
