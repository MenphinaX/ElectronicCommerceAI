// 轻量主进程日志（userData/logs/ecai.log，1MB 轮转），供设置页查看与诊断包导出
import { appendFileSync, existsSync, mkdirSync, renameSync, statSync } from 'node:fs'
import { join } from 'node:path'

const MAX_LOG_BYTES = 1024 * 1024
let logDir = ''

export function initLogger(userData: string): void {
  logDir = join(userData, 'logs')
  mkdirSync(logDir, { recursive: true })
}

export function logFilePath(): string {
  return join(logDir, 'ecai.log')
}

function ts(): string {
  const d = new Date()
  const p = (n: number, l = 2): string => String(n).padStart(l, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`
}

export function appLog(scope: string, message: string): void {
  try {
    const file = logFilePath()
    const line = `[${ts()}] [${scope}] ${message}\n`
    if (existsSync(file) && statSync(file).size > MAX_LOG_BYTES) {
      try {
        renameSync(file, `${file}.1`)
      } catch {
        // 轮转失败不影响主流程
      }
    }
    appendFileSync(file, line)
  } catch {
    // 日志写入失败不影响主流程
  }
}