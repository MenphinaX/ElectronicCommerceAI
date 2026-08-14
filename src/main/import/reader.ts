// 文件读取：xls/xlsx 用 SheetJS（普通模式，避开只读模式 1×1 误报坑）；csv 自动探测 gbk/utf-8-sig 且解码零错误
import fs from 'node:fs'
import { createHash } from 'node:crypto'
import { extname } from 'node:path'
import * as XLSX from 'xlsx'

XLSX.set_fs(fs)

export type RawCell = string | number | null
export type RawRow = RawCell[]
export interface RawSheet {
  rows: RawRow[]
  encoding: string
  decodeError?: string
}

const UTF8_BOM = '\uFEFF'

/** csv 编码探测：utf-8（容忍 BOM）→ gbk（fatal，零错误才算成功） */
function detectCsvEncoding(buf: Buffer): { encoding: string; text: string; decodeError?: string } {
  // 有 UTF-8 BOM 直接按 utf-8 解
  if (buf.length >= 3 && buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf) {
    return { encoding: 'utf8', text: new TextDecoder('utf-8').decode(buf).replace(/^\uFEFF/, '') }
  }
  try {
    const text = new TextDecoder('utf-8', { fatal: true }).decode(buf)
    return { encoding: 'utf8', text: text.replace(/^\uFEFF/, '') }
  } catch {
    try {
      const text = new TextDecoder('gbk', { fatal: true }).decode(buf)
      return { encoding: 'gbk', text }
    } catch (e) {
      return { encoding: 'gbk', text: '', decodeError: `GBK 解码失败：${(e as Error).message}` }
    }
  }
}

export function readSourceFile(filePath: string): RawSheet {
  const ext = extname(filePath).toLowerCase()
  if (ext === '.csv' || ext === '.txt') {
    const buf = fs.readFileSync(filePath)
    const { encoding, text, decodeError } = detectCsvEncoding(buf)
    if (decodeError) return { rows: [], encoding, decodeError }
    const wb = XLSX.read(text, { type: 'string' })
    const ws = wb.Sheets[wb.SheetNames[0]]
    const rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: '' }) as RawRow[]
    return { rows, encoding }
  }
  const wb = XLSX.readFile(filePath) // 普通模式：客服表只读模式会误报 1×1
  const ws = wb.Sheets[wb.SheetNames[0]]
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: '' }) as RawRow[]
  return { rows, encoding: ext === '.xls' ? 'xls' : 'xlsx' }
}

export function sha256File(filePath: string): string {
  return createHash('sha256').update(fs.readFileSync(filePath)).digest('hex')
}

export function cellText(v: RawCell): string {
  if (v === null || v === undefined) return ''
  return String(v).trim()
}

/** 表头行非空单元格数（列数校验口径：忽略尾部/空白列） */
export function nonEmptyHeaderCols(row: RawRow | undefined): number {
  if (!row) return 0
  let n = 0
  for (const c of row) if (cellText(c) !== '') n++
  return n
}