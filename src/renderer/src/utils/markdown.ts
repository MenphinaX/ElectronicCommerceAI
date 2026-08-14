// 轻量 Markdown 渲染（对话/质检报告用）：代码块/表格/列表/粗斜体/行内码/链接；先转义 HTML 防注入
export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function splitRow(line: string): string[] {
  let s = line.trim()
  if (s.startsWith('|')) s = s.slice(1)
  if (s.endsWith('|')) s = s.slice(0, -1)
  return s.split('|').map((c) => c.trim())
}

function inline(raw: string): string {
  let text = escapeHtml(raw)
  text = text.replace(/`([^`]+)`/g, '<code>$1</code>')
  text = text.replace(/[*][*]([^*]+)[*][*]/g, '<strong>$1</strong>')
  text = text.replace(/[*]([^*]+)[*]/g, '<em>$1</em>')
  const out: string[] = []
  let j = 0
  while (j < text.length) {
    const ls = text.indexOf('[', j)
    if (ls < 0) {
      out.push(text.slice(j))
      break
    }
    const le = text.indexOf(']', ls)
    const ps = le > 0 ? text.indexOf('(', le) : -1
    const pe = ps > 0 ? text.indexOf(')', ps) : -1
    if (ps === le + 1 && pe > ps && /^https?:\/\//.test(text.slice(ps + 1, pe))) {
      out.push(text.slice(j, ls))
      out.push(`<a href="${text.slice(ps + 1, pe)}" target="_blank" rel="noopener">${text.slice(ls + 1, le)}</a>`)
      j = pe + 1
    } else {
      out.push(text.slice(j, ls + 1))
      j = ls + 1
    }
  }
  return out.join('')
}

export function renderMarkdown(src: string): string {
  const lines = src.replace(/\r\n/g, '\n').split('\n')
  const out: string[] = []
  let codeBuf: string[] | null = null
  let tableBuf: string[] | null = null
  let listMode: 'ul' | 'ol' | null = null

  const flushTable = (): void => {
    if (!tableBuf) return
    if (tableBuf.length < 2) {
      for (const l of tableBuf) out.push('<p>' + inline(l) + '</p>')
    } else {
      const head = splitRow(tableBuf[0])
      let h = '<table><thead><tr>' + head.map((c) => '<th>' + inline(c) + '</th>').join('') + '</tr></thead><tbody>'
      for (const r of tableBuf.slice(2)) h += '<tr>' + splitRow(r).map((c) => '<td>' + inline(c) + '</td>').join('') + '</tr>'
      out.push(h + '</tbody></table>')
    }
    tableBuf = null
  }
  const flushCode = (): void => {
    if (codeBuf) {
      out.push('<pre><code>' + escapeHtml(codeBuf.join('\n')) + '</code></pre>')
      codeBuf = null
    }
  }
  const flushList = (): void => {
    listMode = null
  }

  for (const line of lines) {
    const t = line.trimEnd()
    if (t.startsWith('```')) {
      flushTable()
      flushList()
      if (codeBuf) flushCode()
      else codeBuf = []
      continue
    }
    if (codeBuf) {
      codeBuf.push(line)
      continue
    }
    if (t.startsWith('|') && t.endsWith('|') && t.includes('|')) {
      flushCode()
      flushList()
      if (tableBuf) tableBuf.push(t)
      else tableBuf = [t]
      continue
    }
    if (tableBuf) flushTable()
    flushCode()
    const ul = t.match(/^[-*]\s+(.*)$/)
    const ol = t.match(/^\d+[.]\s+(.*)$/)
    if (ul || ol) {
      if (listMode !== (ul ? 'ul' : 'ol')) {
        flushList()
        out.push(ul ? '<ul>' : '<ol>')
        listMode = ul ? 'ul' : 'ol'
      }
      out.push('<li>' + inline((ul ?? ol)![1]) + '</li>')
      continue
    }
    if (listMode) {
      out.push(listMode === 'ul' ? '</ul>' : '</ol>')
      listMode = null
    }
    if (!t) {
      out.push('')
      continue
    }
    const h = t.match(/^(#{1,6})\s+(.*)$/)
    if (h) {
      const n = h[1].length
      out.push(`<h${n}>${inline(h[2])}</h${n}>`)
    } else if (/^>\s?/.test(t)) {
      out.push('<blockquote>' + inline(t.replace(/^>\s?/, '')) + '</blockquote>')
    } else {
      out.push('<p>' + inline(t) + '</p>')
    }
  }
  flushTable()
  flushCode()
  if (listMode) out.push(listMode === 'ul' ? '</ul>' : '</ol>')
  return out.join('\n')
}
