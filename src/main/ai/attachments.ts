// 任务 6 对话附件读取（主进程）：文本/表格/图片/PDF 归一化为模型可读内容；超限截断并提示
import { readFileSync, statSync } from 'node:fs'
import { basename, extname } from 'node:path'
import * as XLSX from 'xlsx'

export const MAX_IMAGE_BYTES = 3_000_000
export const MAX_TEXT_CHARS = 30_000

const TEXT_EXTS = new Set(['.txt', '.csv', '.md', '.json', '.xml', '.log', '.js', '.ts', '.html', '.css', '.yaml', '.yml', '.ini', '.py', '.sql', '.env'])
const IMAGE_EXTS = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp'])
const TABLE_EXTS = new Set(['.xlsx', '.xls'])

export interface AttachmentResult {
  name: string
  kind: 'text' | 'table' | 'image' | 'pdf' | 'error'
  text?: string
  base64?: string
  mime?: string
  sizeBytes: number
  error?: string
  truncated?: boolean
}

function imageMime(ext: string): string {
  if (ext === '.png') return 'image/png'
  if (ext === '.gif') return 'image/gif'
  if (ext === '.webp') return 'image/webp'
  if (ext === '.bmp') return 'image/bmp'
  return 'image/jpeg'
}

export async function readAttachment(filePath: string): Promise<AttachmentResult> {
  const name = basename(filePath)
  const ext = extname(filePath).toLowerCase()
  try {
    const st = statSync(filePath)
    if (!st.isFile()) return { name, kind: 'error', sizeBytes: 0, error: '不是文件' }
    if (IMAGE_EXTS.has(ext)) {
      if (st.size > MAX_IMAGE_BYTES) return { name, kind: 'error', sizeBytes: st.size, error: `图片超过 ${MAX_IMAGE_BYTES / 1e6}MB 上限` }
      return { name, kind: 'image', base64: readFileSync(filePath).toString('base64'), mime: imageMime(ext), sizeBytes: st.size }
    }
    if (TABLE_EXTS.has(ext)) {
      const wb = XLSX.readFile(filePath, { cellDates: false })
      const first = wb.SheetNames[0]
      const rows = first ? XLSX.utils.sheet_to_json(wb.Sheets[first], { header: 1, defval: '' }) : []
      const head = ((rows[0] as unknown[]) ?? []).slice(0, 20).map((v) => String(v).slice(0, 40))
      const body = rows.slice(1, 12).map((r) => ((r as unknown[]) ?? []).slice(0, 20).map((v) => String(v).slice(0, 40)).join(' | '))
      const text = `表格文件 ${name}：工作表 ${first ?? '无'}，数据行 ${Math.max(0, rows.length - 1)}（预览前 11 行）\n表头：${head.join(' | ')}\n${body.join('\n')}`
      return { name, kind: 'table', text, sizeBytes: st.size }
    }
    if (ext === '.pdf') {
      const mod = await import('pdf-parse/lib/pdf-parse.js')
      const pdf = mod.default as (buf: Buffer) => Promise<{ text: string; numpages: number }>
      const data = await pdf(readFileSync(filePath))
      let text = String(data.text ?? '')
      const truncated = text.length > MAX_TEXT_CHARS
      if (truncated) text = text.slice(0, MAX_TEXT_CHARS) + '\n…（超限截断）'
      return { name, kind: 'pdf', text: `PDF 文件 ${name}：共 ${data.numpages ?? '?'} 页\n${text}`, sizeBytes: st.size, truncated }
    }
    if (TEXT_EXTS.has(ext)) {
      let text = readFileSync(filePath, 'utf8')
      const truncated = text.length > MAX_TEXT_CHARS
      if (truncated) text = text.slice(0, MAX_TEXT_CHARS) + '\n…（超限截断）'
      return { name, kind: 'text', text, sizeBytes: st.size, truncated }
    }
    return { name, kind: 'error', sizeBytes: st.size, error: '不支持的文件类型' }
  } catch (e) {
    return { name, kind: 'error', sizeBytes: 0, error: (e as Error).message }
  }
}

export async function readAttachments(paths: string[]): Promise<AttachmentResult[]> {
  const out: AttachmentResult[] = []
  for (const p of paths) out.push(await readAttachment(p))
  return out
}
