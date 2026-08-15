// 任务 10 系统级 IPC：应用信息 / 个人资料 / 密码锁 / 数据库瘦身 / 日志与诊断包 / 自动更新
import { app, clipboard, dialog, ipcMain, shell } from 'electron'
import { hashPassword, verifyPassword } from './password'
import {
  copyFileSync, createWriteStream, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync
} from 'node:fs'
import { tmpdir } from 'node:os'
import { extname, join } from 'node:path'
import os from 'node:os'
import archiver from 'archiver'
import type { AppDatabase } from '../db/database'
import { computeAuthSnapshot, authLogFile } from '../auth/ipc'
import { readSettings, writeSettings, type ProfileData } from './settings-store'
import { processAvatarFile } from './avatar-io'
import { assertThemeBgSize, themeBgAllowed, themeBgOutExt } from './theme'
import { appLog, initLogger, logFilePath } from './logger'
import { sanitizeText } from './sanitize'
import { activeSourceName, checkForUpdates, downloadUpdate, initUpdater, installUpdate, scheduleAutoCheck } from './updater'

function fileTimestamp(d = new Date()): string {
  const p = (n: number): string => String(n).padStart(2, '0')
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`
}

function todayStr(d = new Date()): string {
  const p = (n: number): string => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

// ---------- 诊断包 ----------
async function zipDir(dir: string, dest: string): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const output = createWriteStream(dest)
    const archive = archiver('zip', { zlib: { level: 9 } })
    output.on('close', () => resolve())
    archive.on('error', (err) => reject(err))
    archive.pipe(output)
    archive.directory(dir, false)
    void archive.finalize()
  })
}

async function collectDiagnostics(userData: string, getDb: () => AppDatabase): Promise<{ ok: boolean; path?: string; error?: string }> {
  try {
    const settings = readSettings(userData)
    const outDir = join(app.getPath('documents'), 'EC AI 诊断包')
    mkdirSync(outDir, { recursive: true })
    const zipPath = join(outDir, `EC-AI-诊断-${fileTimestamp()}.zip`)
    const tmp = mkdtempSync(join(tmpdir(), 'ecai-diag-'))
    const info: Record<string, unknown> = {
      app: { productName: 'EC AI', version: app.getVersion() },
      runtime: {
        electron: process.versions.electron,
        node: process.versions.node,
        chrome: process.versions.chrome
      },
      system: {
        platform: process.platform,
        arch: process.arch,
        release: os.release(),
        version: os.version(),
        cpu: os.cpus()[0]?.model ?? '',
        cores: os.cpus().length,
        memTotalGb: Math.round((os.totalmem() / 1024 ** 3) * 10) / 10,
        uptimeSec: Math.round(os.uptime())
      },
      settings: {
        theme: settings.theme ?? 'dark',
        performanceMode: !!settings.performanceMode,
        trayOnClose: settings.trayOnClose !== false,
        splashEnabled: settings.splashEnabled !== false,
        onboardingDone: !!settings.onboardingDone,
        profileSet: !!(settings.profile?.username),
        updateRepo: settings.updateRepo ?? ''
      }
    }
    try {
      const snap = await computeAuthSnapshot(userData)
      info.license = { kind: snap.state.kind, expires: snap.state.expires ?? '', purpose: snap.state.purpose ?? '' }
    } catch {
      info.license = { kind: 'unknown' }
    }
    writeFileSync(join(tmp, 'info.json'), JSON.stringify(info, null, 2))
    const logFile = logFilePath()
    if (existsSync(logFile)) writeFileSync(join(tmp, 'logs-ecai.txt'), sanitizeText(readFileSync(logFile, 'utf8')))
    const authFile = authLogFile(userData)
    if (existsSync(authFile)) writeFileSync(join(tmp, 'logs-auth.txt'), sanitizeText(readFileSync(authFile, 'utf8')))
    const dbPath = getDb().path
    if (existsSync(dbPath)) {
      writeFileSync(join(tmp, 'db-size.txt'), `${statSync(dbPath).size}`)
    }
    await zipDir(tmp, zipPath)
    rmSync(tmp, { recursive: true, force: true })
    appLog('system', '诊断包已导出')
    return { ok: true, path: zipPath }
  } catch (err) {
    appLog('system', `诊断包导出失败: ${String((err as Error)?.message ?? err)}`)
    return { ok: false, error: String((err as Error)?.message ?? err) }
  }
}

export function registerSystemIpc(getDb: () => AppDatabase, userData: () => string): void {
  initLogger(userData())
  initUpdater()
  scheduleAutoCheck()

  ipcMain.handle('app:info', () => ({
    version: app.getVersion(),
    productName: 'EC AI',
    electron: process.versions.electron,
    node: process.versions.node,
    chrome: process.versions.chrome,
    platform: process.platform,
    arch: process.arch
  }))

  ipcMain.handle('profile:get', () => readSettings(userData()).profile ?? { username: '', avatar: '' })

  ipcMain.handle('profile:set', (_e, profile: ProfileData) => {
    const safe: ProfileData = {
      username: String(profile?.username ?? '').slice(0, 24),
      avatar: String(profile?.avatar ?? 'a1').slice(0, 200)
    }
    const s = readSettings(userData())
    s.profile = safe
    writeSettings(userData(), s)
    appLog('profile', `已更新（username=${safe.username ? 'set' : 'empty'}, avatar=${safe.avatar.slice(0, 6)}…）`)
    return safe
  })

  ipcMain.handle('profile:pick-avatar', async () => {
    const r = await dialog.showOpenDialog({
      title: '选择头像图片',
      filters: [{ name: '图片', extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp'] }],
      properties: ['openFile']
    })
    if (r.canceled || !r.filePaths[0]) return { ok: false }
    try {
      // 任务 4F ④：解码校验 + 超限 1:1 居中裁切 + 压缩到 ≤512px，解码失败明确报错
      return processAvatarFile(r.filePaths[0], join(userData(), 'avatars'))
    } catch (err) {
      return { ok: false, error: String((err as Error)?.message ?? err) }
    }
  })


  ipcMain.handle('theme:pick-background', async () => {
    const r = await dialog.showOpenDialog({
      title: '选择背景图',
      filters: [{ name: '图片', extensions: ['jpg', 'jpeg', 'png', 'webp'] }],
      properties: ['openFile']
    })
    if (r.canceled || !r.filePaths[0]) return { ok: false }
    try {
      const srcPath = r.filePaths[0]
      const srcExt = extname(srcPath).toLowerCase().replace('.', '')
      if (!themeBgAllowed(srcExt)) {
        return { ok: false, error: `不支持的图片格式：${srcExt || '无扩展名'}，仅支持 jpg/png/webp` }
      }
      const bytes = readFileSync(srcPath)
      assertThemeBgSize(bytes)
      const dir = join(userData(), 'themes')
      mkdirSync(dir, { recursive: true })
      const name = `theme-bg-${Date.now()}.${themeBgOutExt(srcPath)}`
      copyFileSync(srcPath, join(dir, name))
      appLog('system', `背景图已上传 ${name}`)
      return { ok: true, file: name }
    } catch (err) {
      return { ok: false, error: String((err as Error)?.message ?? err) }
    }
  })

  ipcMain.handle('theme:remove-background', () => {
    const s = readSettings(userData())
    const name = s.backgroundImage
    if (name) {
      try {
        const full = join(userData(), 'themes', name)
        if (existsSync(full) && !name.includes('..') && !name.includes('\\') && !name.includes('/')) {
          rmSync(full, { force: true })
        }
      } catch {
        // 文件已不存在也视为移除成功
      }
      appLog('system', `背景图已移除 ${name}`)
    }
    return { ok: true }
  })
  ipcMain.handle('system:password-status', () => {
    const s = readSettings(userData())
    return { enabled: !!(s.passwordHash && s.passwordHash.includes(':')) }
  })

  ipcMain.handle('system:password-set', (_e, pwd: string) => {
    const p = String(pwd ?? '')
    if (p.length < 4 || p.length > 64) return { ok: false, message: '密码长度需在 4-64 位之间' }
    const s = readSettings(userData())
    s.passwordHash = hashPassword(p)
    writeSettings(userData(), s)
    appLog('security', '应用密码已设置（哈希存储）')
    return { ok: true }
  })

  ipcMain.handle('system:password-clear', () => {
    const s = readSettings(userData())
    if (s.passwordHash) {
      s.passwordHash = undefined
      writeSettings(userData(), s)
      appLog('security', '应用密码已清除')
    }
    return { ok: true }
  })

  ipcMain.handle('system:password-verify', (_e, pwd: string) => {
    const s = readSettings(userData())
    if (!s.passwordHash) return { ok: false, reason: 'not-set' }
    const ok = verifyPassword(String(pwd ?? ''), s.passwordHash)
    appLog('security', `密码校验 ${ok ? '通过' : '失败'}`)
    return { ok, reason: ok ? 'ok' : 'mismatch' }
  })

  ipcMain.handle('system:vacuum', () => {
    const db = getDb()
    const before = statSync(db.path).size
    db.raw.exec('VACUUM')
    const after = statSync(db.path).size
    appLog('system', `数据库瘦身完成 ${before} -> ${after} 字节`)
    return { ok: true, before, after }
  })

  ipcMain.handle('system:db-size', () => {
    const db = getDb()
    return { bytes: existsSync(db.path) ? statSync(db.path).size : 0 }
  })

  ipcMain.handle('system:logs', () => {
    try {
      const f = logFilePath()
      const text = existsSync(f) ? readFileSync(f, 'utf8') : ''
      const lines = text.split(/\r?\n/).filter(Boolean).slice(-300)
      return { lines: lines.map((l) => sanitizeText(l)) }
    } catch (err) {
      return { lines: [], error: String((err as Error)?.message ?? err) }
    }
  })

  ipcMain.handle('system:open-path', (_e, target: string) => {
    try {
      const t = String(target ?? '')
      if (!t) return { ok: false }
      if (existsSync(t)) {
        const st = statSync(t)
        if (st.isDirectory()) void shell.openPath(t)
        else shell.showItemInFolder(t)
      } else {
        void shell.openExternal(t)
      }
      return { ok: true }
    } catch (err) {
      return { ok: false, error: String((err as Error)?.message ?? err) }
    }
  })

  ipcMain.handle('system:open-external', (_e, url: string) => {
    try {
      void shell.openExternal(String(url ?? ''))
      return { ok: true }
    } catch (err) {
      return { ok: false, error: String((err as Error)?.message ?? err) }
    }
  })

  ipcMain.handle('system:diagnostics', async () => collectDiagnostics(userData(), getDb))

  ipcMain.handle('system:copy', (_e, text: string) => {
    clipboard.writeText(String(text ?? ''))
    return true
  })

  // 测试钩子（env 门控，生产不启用）：EC_AI_MOCK_DATE / EC_AI_MOCK_HOUR 用于验收开屏问候分级与语录轮换
  ipcMain.handle('system:now', () => {
    const now = new Date()
    let dateStr = todayStr(now)
    let hour = now.getHours()
    const md = process.env.EC_AI_MOCK_DATE
    const mh = process.env.EC_AI_MOCK_HOUR
    if (md && /^\d{4}-\d{2}-\d{2}$/.test(md)) dateStr = md
    if (mh && /^\d{1,2}$/.test(mh)) {
      const h = Number(mh)
      if (h >= 0 && h <= 23) hour = h
    }
    return { dateStr, hour }
  })

  ipcMain.handle('updater:check', () => checkForUpdates())
  ipcMain.handle('updater:download', () => downloadUpdate())
  ipcMain.handle('updater:install', () => installUpdate())
  ipcMain.handle('updater:feed', () => ({
    feed: process.env.EC_AI_UPDATE_FEED ?? 'GitHub Releases',
    repo: readSettings(userData()).updateRepo ?? '',
    source: activeSourceName()
  }))

  ipcMain.handle('system:pick-file', async (_e, opts: { title?: string; filters?: Array<{ name: string; extensions: string[] }> }) => {
    const r = await dialog.showOpenDialog({
      title: opts?.title ?? '选择文件',
      filters: opts?.filters,
      properties: ['openFile']
    })
    return { ok: !r.canceled && r.filePaths.length > 0, filePath: r.filePaths[0] ?? null }
  })
}