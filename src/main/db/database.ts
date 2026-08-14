// 主进程数据库封装：建库/迁移/完整性/备份/恢复（任务 2）
import Database from 'better-sqlite3'
import { copyFileSync, existsSync, mkdirSync, readdirSync, rmSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { MIGRATIONS, ALL_TABLES } from './schema'
import { fileTimestamp } from './units'

export const BACKUP_KEEP = 5

function sanitizeReason(reason: string): string {
  const s = reason.replace(/[^\w\u4e00-\u9fa5-]+/g, '-').replace(/^-+|-+$/g, '')
  return s || 'manual'
}

export class AppDatabase {
  readonly path: string
  readonly backupDir: string
  readonly avatarsDir: string
  private db: Database.Database

  constructor(path: string) {
    this.path = path
    this.backupDir = join(dirname(path), 'backups')
    this.avatarsDir = join(dirname(path), 'avatars')
    mkdirSync(dirname(path), { recursive: true })
    this.db = new Database(path)
    this.db.pragma('journal_mode = WAL')
    this.db.pragma('foreign_keys = ON')
    this.db.pragma('busy_timeout = 5000')
  }

  /** 供仓库层使用（仅主进程内部，绝不跨 IPC 暴露） */
  get raw(): Database.Database {
    return this.db
  }

  /** 幂等建库 + 迁移；建数据目录（avatars/） */
  init(): void {
    this.runMigrations()
    mkdirSync(this.avatarsDir, { recursive: true })
  }

  /** 按 PRAGMA user_version 跑未执行的迁移，重复调用不报错 */
  runMigrations(): void {
    const current = this.userVersion()
    for (const m of MIGRATIONS) {
      if (m.version > current) {
        const run = this.db.transaction(() => {
          for (const stmt of m.statements) this.db.exec(stmt)
          this.db.pragma(`user_version = ${m.version}`)
        })
        run()
      }
    }
  }

  userVersion(): number {
    return this.db.pragma('user_version', { simple: true }) as number
  }

  /** PRAGMA integrity_check：'ok' 表示通过 */
  integrityCheck(): string {
    const rows = this.db.pragma('integrity_check') as Array<{ integrity_check: string }>
    return rows[0]?.integrity_check ?? 'unknown'
  }

  /** 手动/自动备份：VACUUM INTO 一致性快照到 backups/，保留最近 5 份 */
  backup(reason = 'manual'): string {
    mkdirSync(this.backupDir, { recursive: true })
    const dest = join(this.backupDir, `ecai-${fileTimestamp()}-${sanitizeReason(reason)}.db`)
    this.db.exec(`VACUUM INTO '${dest.replace(/'/g, "''")}'`)
    this.pruneBackups(BACKUP_KEEP)
    return dest
  }

  /** 导入/生成/导出前的自动备份包装 */
  withAutoBackup<T>(reason: string, fn: () => T): T {
    this.backup(reason)
    return fn()
  }

  listBackups(): string[] {
    if (!existsSync(this.backupDir)) return []
    return readdirSync(this.backupDir)
      .filter((f) => f.startsWith('ecai-') && f.endsWith('.db'))
      .sort()
      .map((f) => join(this.backupDir, f))
  }

  pruneBackups(keep: number): void {
    const files = this.listBackups()
    for (const f of files.slice(0, Math.max(0, files.length - keep))) {
      rmSync(f)
    }
  }

  /** 从备份恢复：先验备份完整性，关库→覆盖→清 WAL→重开→补迁移 */
  restore(backupPath: string): void {
    if (!backupPath.endsWith('.db') || !existsSync(backupPath)) {
      throw new Error(`备份文件不存在：${backupPath}`)
    }
    const check = new Database(backupPath, { readonly: true, fileMustExist: true })
    try {
      const rows = check.pragma('integrity_check') as Array<{ integrity_check: string }>
      if (rows[0]?.integrity_check !== 'ok') {
        throw new Error('备份文件完整性检查未通过，拒绝恢复')
      }
    } finally {
      check.close()
    }
    this.close()
    copyFileSync(backupPath, this.path)
    for (const suffix of ['-wal', '-shm']) {
      const p = this.path + suffix
      if (existsSync(p)) rmSync(p)
    }
    this.db = new Database(this.path)
    this.db.pragma('journal_mode = WAL')
    this.db.pragma('foreign_keys = ON')
    this.db.pragma('busy_timeout = 5000')
    this.runMigrations()
  }

  close(): void {
    try {
      this.db.close()
    } catch {
      // 已关闭则忽略
    }
  }

  /** 各表行数（验收/自检用） */
  rowCounts(): Record<string, number> {
    const out: Record<string, number> = {}
    for (const t of ALL_TABLES) {
      const row = this.db.prepare(`SELECT COUNT(*) AS n FROM "${t}"`).get() as { n: number }
      out[t] = row.n
    }
    return out
  }
}
