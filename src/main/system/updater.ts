// 自动更新（任务 4L）：electron-updater + GitHub Releases（可私有仓库），多源加速 + 启动自动检查 + 稍后强制更新
// - 源列表：0=官方 GitHub（默认 provider，读 app-update.yml）→ 1=ghproxy.com 加速 → 2=ghps.cc 加速
// - 检查更新：按序预检 GET {feed}/latest.yml（超时 8s）→ 第一个成功的 setFeedURL 并 checkForUpdates；全挂广播 error
// - EC_AI_UPDATE_FEED 环境变量仍最优先（测试用，跳过网络预检）
// - 下载完成 → settings.json 写 updaterPendingInstall=version；下次启动 initUpdater 查标记 → 强制安装
// - EC_AI_UPDATE_FAKE_INSTALL=1：测试模式，跳过真实 quitAndInstall（真实安装留给用户手动实测）
// - 只请求版本元数据，不携带任何经营数据；任何失败都回传渲染层，绝不崩溃、不阻塞使用
import { app, BrowserWindow } from 'electron'
import updaterPkg from 'electron-updater'
const { autoUpdater } = updaterPkg
import { appLog } from './logger'
import { buildUpdateSources, selectFeed, PROBE_TIMEOUT_MS, type UpdateSource } from './update-sources'
import { clearPendingInstall, readPendingInstall, shouldAutoInstall, writePendingInstall } from './update-pending'

export type UpdaterEventType =
  | 'checking'
  | 'available'
  | 'not-available'
  | 'progress'
  | 'downloaded'
  | 'error'
  | 'installing'

let initialized = false
let activeSource: UpdateSource | null = null

function userData(): string {
  return app.getPath('userData')
}

function broadcast(payload: Record<string, unknown>): void {
  for (const w of BrowserWindow.getAllWindows()) {
    w.webContents.send('updater:event', payload)
  }
}

function logEvent(payload: Record<string, unknown>): void {
  appLog('updater', JSON.stringify({ ...payload, transferred: undefined, total: undefined }))
}

export function initUpdater(): void {
  if (initialized) return
  initialized = true
  try {
    const envFeed = process.env.EC_AI_UPDATE_FEED
    if (envFeed) {
      autoUpdater.setFeedURL({ provider: 'generic', url: envFeed })
      activeSource = null
      appLog('updater', `测试源已启用: ${envFeed}`)
    }
    autoUpdater.autoDownload = true
    autoUpdater.autoInstallOnAppQuit = false
    autoUpdater.logger = {
      info: (m: unknown) => appLog('updater', `info: ${String(m ?? '')}`),
      warn: (m: unknown) => appLog('updater', `warn: ${String(m ?? '')}`),
      error: (m: unknown) => appLog('updater', `error: ${String(m ?? '')}`),
      debug: (m: unknown) => appLog('updater', `debug: ${String(m ?? '')}`)
    }
    autoUpdater.on('checking-for-update', () => broadcast({ type: 'checking' }))
    autoUpdater.on('update-available', (info) => {
      const payload = { type: 'available' as const, version: String(info.version) }
      broadcast(payload)
      logEvent(payload)
    })
    autoUpdater.on('update-not-available', (info) => {
      const payload = { type: 'not-available' as const, version: String(info.version) }
      broadcast(payload)
      logEvent(payload)
    })
    autoUpdater.on('error', (err) => {
      const payload = { type: 'error' as const, message: String((err as Error)?.message ?? err) }
      broadcast(payload)
      logEvent(payload)
    })
    autoUpdater.on('download-progress', (p) => {
      broadcast({
        type: 'progress',
        percent: Math.round(p.percent),
        transferred: p.transferred,
        total: p.total,
        bytesPerSecond: p.bytesPerSecond
      })
    })
    autoUpdater.on('update-downloaded', (info) => {
      const version = String(info.version)
      const file = (info as unknown as { downloadedFile?: string }).downloadedFile ?? ''
      try {
        writePendingInstall(userData(), version)
        appLog('updater', `已写待安装标记 ${version}`)
      } catch (err) {
        appLog('updater', `写待安装标记失败: ${String((err as Error)?.message ?? err)}`)
      }
      const payload = { type: 'downloaded' as const, version, file }
      broadcast(payload)
      logEvent({ ...payload, file: file ? '已下载到本地缓存' : '' })
    })
  } catch (err) {
    appLog('updater', `初始化失败: ${String((err as Error)?.message ?? err)}`)
  }
  // 启动时处理待安装标记（稍后下载 → 下次启动强制安装）
  handlePendingInstall()
}

/** 启动时若存在待安装标记：广播 installing → quitAndInstall；失败提示手动安装 */
function handlePendingInstall(): void {
  try {
    const pending = readPendingInstall(userData())
    if (!pending) return
    const current = app.getVersion()
    appLog('updater', `启动检查待安装标记: ${pending}（当前 ${current}）`)
    if (!shouldAutoInstall(pending, current)) {
      clearPendingInstall(userData())
      appLog('updater', `待安装标记 ${pending} 已与当前版本一致，清除标记`)
      return
    }
    broadcast({ type: 'installing', version: pending })
    appLog('updater', `启动强制安装 ${pending}（将调用 quitAndInstall）`)
    if (process.env.EC_AI_UPDATE_FAKE_INSTALL === '1') {
      appLog('updater', '测试模式 EC_AI_UPDATE_FAKE_INSTALL=1：跳过真实 quitAndInstall，清除标记')
      clearPendingInstall(userData())
      return
    }
    clearPendingInstall(userData())
    try {
      autoUpdater.quitAndInstall(false, true)
    } catch (err) {
      writePendingInstall(userData(), pending)
      const msg = `自动安装失败，请手动下载最新安装包（${String((err as Error)?.message ?? err)}）`
      broadcast({ type: 'error', message: msg })
      appLog('updater', msg)
    }
  } catch (err) {
    appLog('updater', `待安装标记处理失败: ${String((err as Error)?.message ?? err)}`)
  }
}

async function doCheck(): Promise<boolean> {
  try {
    await autoUpdater.checkForUpdates()
    return true
  } catch (err) {
    broadcast({ type: 'error', message: '检查失败（不影响正常使用）' })
    appLog('updater', `检查失败: ${String((err as Error)?.message ?? err)}`)
    return false
  }
}

export async function checkForUpdates(): Promise<boolean> {
  const envFeed = process.env.EC_AI_UPDATE_FEED
  if (envFeed) {
    autoUpdater.setFeedURL({ provider: 'generic', url: envFeed })
    activeSource = null
    return doCheck()
  }
  // 每次检查重新按序预检（网络状态会变），命中源本次会话复用（下载沿用当前 feed）
  const sources = buildUpdateSources()
  const hit = await selectFeed(sources, PROBE_TIMEOUT_MS)
  if (!hit) {
    const msg = '检查失败（不影响正常使用）'
    broadcast({ type: 'error', message: msg })
    appLog('updater', `全部更新源预检失败（${sources.map((s) => s.name).join('、')}）→ ${msg}`)
    return false
  }
  if (hit.provider === 'generic') {
    autoUpdater.setFeedURL({ provider: 'generic', url: hit.feedUrl })
  }
  // 官方源保持默认 github provider（读 app-update.yml），无需 setFeedURL
  activeSource = hit
  appLog('updater', `更新源已切换: ${hit.name} ${hit.feedUrl}`)
  return doCheck()
}

export function downloadUpdate(): boolean {
  try {
    void autoUpdater.downloadUpdate()
    return true
  } catch (err) {
    broadcast({ type: 'error', message: String((err as Error)?.message ?? err) })
    return false
  }
}

export function installUpdate(): boolean {
  try {
    broadcast({ type: 'installing' })
    autoUpdater.quitAndInstall(false, true)
    return true
  } catch (err) {
    broadcast({ type: 'error', message: String((err as Error)?.message ?? err) })
    return false
  }
}

/** 当前命中的更新源名（设置页展示用） */
export function activeSourceName(): string {
  if (process.env.EC_AI_UPDATE_FEED) return '测试源'
  return activeSource?.name ?? 'GitHub Releases'
}

/** app ready 后延迟静默检查更新（默认 5s，不弹窗，发现新版才提示） */
export function scheduleAutoCheck(delayMs = 5000): void {
  setTimeout(() => {
    appLog('updater', '启动自动检查开始')
    void checkForUpdates()
  }, delayMs)
  appLog('updater', `启动自动检查已调度（${delayMs}ms 后静默检查）`)
}
