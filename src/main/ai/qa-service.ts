// 任务 6 聊天质检：三格式（csv/txt/json）解析归一化 + 提示词组装（纯函数，可单测）
export interface QaMessage {
  sessionId: string
  customerName: string
  sender: string
  role: '客服' | '客户'
  timestamp: string
  type: string
  content: string
}

export interface ParsedFile {
  name: string
  count: number
  error?: string
}

// ---------- CSV：customerId,customerName,sender,senderRole,timestamp,type,content ----------
export function parseQaCsv(text: string): QaMessage[] {
  const out: QaMessage[] = []
  const lines = text.replace(/\r\n/g, '\n').split('\n').filter((l) => l.trim().length > 0)
  if (!lines.length) return out
  const head = lines[0].split(',').map((h) => h.trim().replace(/^"|"$/g, ''))
  const idx = (name: string): number => {
    const i = head.findIndex((h) => h.toLowerCase() === name.toLowerCase())
    return i
  }
  for (const line of lines.slice(1)) {
    const cells = splitCsvLine(line)
    const get = (name: string): string => {
      const i = idx(name)
      return i >= 0 ? (cells[i] ?? '').trim() : ''
    }
    const sessionId = get('customerId') || get('customer_id') || '未知会话'
    const sender = get('sender')
    const senderRole = get('senderRole') || get('sender_role')
    const content = get('content')
    out.push({
      sessionId,
      customerName: get('customerName') || get('customer_name'),
      sender,
      role: senderRole.toLowerCase() === 'agent' ? '客服' : '客户',
      timestamp: get('timestamp'),
      type: get('type') || 'text',
      content
    })
  }
  return out
}

function splitCsvLine(line: string): string[] {
  const cells: string[] = []
  let cur = ''
  let inQ = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (ch === '"') {
      if (inQ && line[i + 1] === '"') {
        cur += '"'
        i++
      } else {
        inQ = !inQ
      }
    } else if (ch === ',' && !inQ) {
      cells.push(cur)
      cur = ''
    } else {
      cur += ch
    }
  }
  cells.push(cur)
  return cells.map((c) => c.trim().replace(/^"|"$/g, ''))
}

// ---------- TXT：[时间] 发送者 (角色): 内容 ----------
const TXT_RE = /^\s*\[([^\]]+)\]\s*([^\s(]+)\s*\(([^)]+)\)\s*:\s*(.*)$/

export function parseQaTxt(text: string): QaMessage[] {
  const out: QaMessage[] = []
  const lines = text.replace(/\r\n/g, '\n').split('\n')
  for (const line of lines) {
    const m = line.match(TXT_RE)
    if (!m) continue
    const roleRaw = m[3].trim()
    const role = roleRaw === '客服' || roleRaw === 'agent' ? '客服' : '客户'
    out.push({
      sessionId: 'TXT',
      customerName: '',
      sender: m[2].trim(),
      role,
      timestamp: m[1].trim(),
      type: 'text',
      content: m[4].trim()
    })
  }
  return out
}

// ---------- JSON：dict{会话ID:{customerName,messageCount,messages[...]}} ----------
export function parseQaJson(text: string): QaMessage[] {
  const out: QaMessage[] = []
  let data: unknown
  try {
    data = JSON.parse(text)
  } catch {
    return out
  }
  if (!data || typeof data !== 'object') return out
  for (const [sessionId, raw] of Object.entries(data as Record<string, unknown>)) {
    if (!raw || typeof raw !== 'object') continue
    const conv = raw as Record<string, unknown>
    const customerName = String(conv.customerName ?? '')
    const msgs = Array.isArray(conv.messages) ? (conv.messages as Array<Record<string, unknown>>) : []
    for (const msg of msgs) {
      const senderRole = String(msg.senderRole ?? msg.sender_role ?? '')
      const type = String(msg.type ?? 'text')
      const content = String(msg.content ?? '')
      out.push({
        sessionId,
        customerName,
        sender: String(msg.sender ?? ''),
        role: senderRole.toLowerCase() === 'agent' ? '客服' : '客户',
        timestamp: String(msg.timestamp ?? ''),
        type,
        content: type === 'image' ? `[图片URL] ${content}` : content
      })
    }
  }
  return out
}

// ---------- 多文件批量解析 + 统计 ----------
export function parseQaText(fileName: string, text: string): QaMessage[] {
  const lower = fileName.toLowerCase()
  if (lower.endsWith('.csv')) return parseQaCsv(text)
  if (lower.endsWith('.txt')) return parseQaTxt(text)
  if (lower.endsWith('.json')) return parseQaJson(text)
  return []
}

export function qaStats(records: QaMessage[]): { sessions: number; agents: string[]; start: string; end: string } {
  const sessionIds = new Set(records.map((r) => r.sessionId))
  const agents = new Set(records.filter((r) => r.role === '客服').map((r) => r.sender))
  const stamps = records.map((r) => r.timestamp).filter((t) => /\d{4}/.test(t)).sort()
  return {
    sessions: sessionIds.size,
    agents: [...agents],
    start: stamps[0] ?? '',
    end: stamps[stamps.length - 1] ?? ''
  }
}

export const QA_MAX_CHARS = 60_000

/** 提示词 = 面板全文 + 归一化记录（按会话分批，总量超限截断并提示） */
export function buildQaPrompt(promptBody: string, records: QaMessage[]): { system: string; user: string; truncated: boolean } {
  const stats = qaStats(records)
  const agentLine = stats.agents.length ? stats.agents.join('、') : '无'
  const header = `聊天记录统计：会话数 ${stats.sessions}，客服数 ${stats.agents.length}（${agentLine}），样本数 ${records.length}，时间跨度 ${stats.start || '未知'} ~ ${stats.end || '未知'}\n\n`
  const lines = records.map((r, i) =>
    `[${i + 1}] ${r.timestamp || '无时间'} | ${r.sessionId} | ${r.role} ${r.sender} | ${r.content.replace(/\n/g, ' ').slice(0, 300)}`
  )
  let body = lines.join('\n')
  let truncated = false
  if (body.length > QA_MAX_CHARS) {
    body = body.slice(0, QA_MAX_CHARS) + '\n…（超限截断，剩余记录未展示）'
    truncated = true
  }
  const system = '你是客服聊天质检专家。请按用户提供的提示词要求，对聊天记录逐会话质检：指出服务态度、响应及时性、问题解决、话术合规等方面的问题，并给出改进建议。输出 markdown 报告，开头包含统计信息（会话数/客服数/样本数/时间跨度）。只依据给定记录，禁止编造。'
  return { system, user: `【质检提示词】\n${promptBody}\n\n【归一化聊天记录】\n${header}${body}`, truncated }
}

// ---------- 任务 4D：输出上限 + 按会话分批（保证 2351 条/30 会话完整报告） ----------
export const QA_DEFAULT_MAX_TOKENS = 8000
export const QA_MAX_TOKENS_CAP = 8192
export const QA_MIN_TOKENS = 1024

// 任务 4F ②：分批更小（≤4 会话 / ≤18k 字符），压低单批模型输出长度，降低 finish_reason=length 截断概率
export const QA_BATCH_DEFAULT_MAX_SESSIONS = 4
export const QA_BATCH_DEFAULT_MAX_CHARS = 18_000

/** 截断续跑收尾：整轮有批次被模型截断时，在报告末尾追加中文说明（未截断原样返回） */
export function withQaTruncationNote(report: string, truncated: boolean): string {
  if (!truncated) return report
  return `${report}\n\n> 注意：报告较长，模型输出在部分批次被截断（finish_reason=length），已保留全部已生成内容`
}

/** maxTokens 钳制：默认 8000（deepseek-chat 上限 8192），非法值回默认 */
export function clampQaMaxTokens(raw: unknown): number {
  const n = typeof raw === 'string' && raw.trim() ? Number(raw) : typeof raw === 'number' ? raw : NaN
  if (!Number.isFinite(n)) return QA_DEFAULT_MAX_TOKENS
  return Math.min(QA_MAX_TOKENS_CAP, Math.max(QA_MIN_TOKENS, Math.round(n)))
}

export interface QaBatch {
  sessions: string[]
  records: QaMessage[]
  part?: { index: number; total: number }
}

/** 按会话分批：整会话归组，超大会话按记录切片（part 标记），保证记录不丢 */
export function splitQaBatches(records: QaMessage[], opts: { maxChars?: number; maxSessions?: number } = {}): QaBatch[] {
  const maxChars = opts.maxChars ?? QA_BATCH_DEFAULT_MAX_CHARS
  const maxSessions = opts.maxSessions ?? QA_BATCH_DEFAULT_MAX_SESSIONS
  const bySession = new Map<string, QaMessage[]>()
  for (const r of records) {
    const arr = bySession.get(r.sessionId) ?? []
    arr.push(r)
    bySession.set(r.sessionId, arr)
  }
  const lineLen = (r: QaMessage): number => r.content.length + 24
  const batches: QaBatch[] = []
  const flush = (sessions: string[], recs: QaMessage[], part?: QaBatch['part']): void => {
    if (recs.length) batches.push({ sessions, records: recs, part })
  }
  let curSessions: string[] = []
  let curRecords: QaMessage[] = []
  let curChars = 0
  const openBatch = (): void => {
    curSessions = []
    curRecords = []
    curChars = 0
  }
  for (const [sid, msgs] of bySession) {
    const total = msgs.reduce((a, r) => a + lineLen(r), 0)
    if (total > maxChars) {
      flush(curSessions, curRecords)
      openBatch()
      const totalParts = Math.max(1, Math.ceil(total / maxChars))
      let part: QaMessage[] = []
      let partChars = 0
      let partNo = 1
      for (const r of msgs) {
        if (part.length && partChars + lineLen(r) > maxChars) {
          flush([sid], part, { index: partNo, total: totalParts })
          part = []
          partChars = 0
          partNo++
        }
        part.push(r)
        partChars += lineLen(r)
      }
      if (part.length) flush([sid], part, { index: partNo, total: totalParts })
    } else {
      if (curRecords.length && (curSessions.length >= maxSessions || curChars + total > maxChars)) {
        flush(curSessions, curRecords)
        openBatch()
      }
      curSessions.push(sid)
      curRecords.push(...msgs)
      curChars += total
    }
  }
  flush(curSessions, curRecords)
  return batches
}

/** 会话覆盖标签：整批或「会话 X（第 i/total 部分）」 */
function batchLabel(batch: QaBatch): string {
  const names = batch.sessions.join('、')
  if (batch.part) return `会话 ${names}（第 ${batch.part.index}/${batch.part.total} 部分）`
  return `会话 ${names}`
}

function qaStatsLine(stats: { sessions: number; agents: string[]; start: string; end: string }, totalRecords: number): string {
  const agentLine = stats.agents.length ? stats.agents.join('、') : '无'
  return `聊天记录统计：会话数 ${stats.sessions}，客服数 ${stats.agents.length}（${agentLine}），样本数 ${totalRecords}，时间跨度 ${stats.start || '未知'} ~ ${stats.end || '未知'}`
}

/** 分批提示词：第 1 批输出统计+本批逐会话分析；中间/末批只输出本批分析，总结统一最后生成 */
export function buildQaBatchPrompt(
  promptBody: string,
  batch: QaBatch,
  meta: { batchIndex: number; batchCount: number; totalRecords: number; allStats: ReturnType<typeof qaStats> }
): { system: string; user: string; truncated: boolean } {
  const isFirst = meta.batchIndex === 1
  const lines = batch.records.map((r, i) =>
    `[${i + 1}] ${r.timestamp || '无时间'} | ${r.sessionId} | ${r.role} ${r.sender} | ${r.content.replace(/\n/g, ' ').slice(0, 300)}`
  )
  let body = lines.join('\n')
  let truncated = false
  if (body.length > QA_MAX_CHARS) {
    body = body.slice(0, QA_MAX_CHARS) + '\n…（本批超限截断，剩余记录未展示）'
    truncated = true
  }
  const taskNote = isFirst
    ? `共分 ${meta.batchCount} 批生成，本批为第 1/${meta.batchCount} 批，覆盖 ${batchLabel(batch)}。\n先输出报告开头统计：${qaStatsLine(meta.allStats, meta.totalRecords)}，再按会话逐个质检（每个会话：问题点 + 改进建议），markdown 格式。`
    : `继续质检。共分 ${meta.batchCount} 批，本批为第 ${meta.batchIndex}/${meta.batchCount} 批，覆盖 ${batchLabel(batch)}。\n请只输出这些会话的逐会话质检分析（markdown，每个会话：问题点 + 改进建议），不要重复报告开头的统计信息，也不要输出整体总结（整体总结将在最后统一生成）。`
  const system = '你是客服聊天质检专家。请按用户提供的提示词要求，对聊天记录逐会话质检：指出服务态度、响应及时性、问题解决、话术合规等方面的问题，并给出改进建议。只依据给定记录，禁止编造。'
  return { system, user: `【质检提示词】\n${promptBody}\n\n【任务说明】\n${taskNote}\n\n【本批归一化聊天记录】\n${body}`, truncated }
}

/** 总结提示词：基于全部逐会话分析要点，输出整体质检总结段 */
export function buildQaSummaryPrompt(
  promptBody: string,
  analyses: string[],
  meta: { totalRecords: number; allStats: ReturnType<typeof qaStats> }
): { system: string; user: string } {
  const joined = analyses.join('\n\n')
  const body = joined.length > 20_000 ? joined.slice(0, 20_000) + '\n…（分析要点超长，仅展示前 20000 字符）' : joined
  const system = '你是客服聊天质检专家，负责汇总质检结论。'
  const user = `【质检提示词】\n${promptBody}\n\n【任务说明】\n以下是全部 ${meta.allStats.sessions} 个会话的逐会话质检分析要点（${qaStatsLine(meta.allStats, meta.totalRecords)}）。\n请输出「整体质检总结」：总体评价（服务态度/响应及时性/问题解决/话术合规）、共性问题 Top 3、改进建议。以「## 整体质检总结」开头，markdown 格式，只依据给定要点，禁止编造。\n\n【逐会话分析要点】\n${body}`
  return { system, user }
}