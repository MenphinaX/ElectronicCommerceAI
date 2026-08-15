// 评语卡片轻量 Markdown 渲染（纯函数，无第三方依赖）：先整体 HTML 转义，再做行级结构化
// 输出白名单标签：p/br/strong/ul/ol/li/h4/h5；不产生任何属性，杜绝 script/事件属性/javascript:
function escapeHtmlLite(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

// 行内解析（输入已转义）：**xxx** -> <strong>xxx</strong>
function inlineLite(escaped: string): string {
  return escaped.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
}

export function renderMarkdownLite(text: string): string {
  if (!text || text.trim() === '') return ''
  const escaped = escapeHtmlLite(text.replace(/\r\n/g, '\n'))
  const lines = escaped.split('\n')
  const out: string[] = []
  let listTag: 'ul' | 'ol' | null = null
  let para: string[] = []

  const flushPara = (): void => {
    if (para.length) {
      out.push('<p>' + para.join('<br>') + '</p>')
      para = []
    }
  }
  const flushList = (): void => {
    if (listTag) {
      out.push('</' + listTag + '>')
      listTag = null
    }
  }
  const flushAll = (): void => {
    flushPara()
    flushList()
  }

  for (const raw of lines) {
    const line = raw.trimEnd()
    const trimmed = line.trim()
    if (trimmed === '') {
      flushAll()
      continue
    }
    const ul = trimmed.match(/^-\s+(.*)$/)
    const ol = trimmed.match(/^\d+\.\s+(.*)$/)
    if (ul || ol) {
      flushPara()
      const tag = ul ? 'ul' : 'ol'
      if (listTag !== tag) {
        flushList()
        out.push('<' + tag + '>')
        listTag = tag
      }
      out.push('<li>' + inlineLite((ul ?? ol)![1]) + '</li>')
      continue
    }
    flushList()
    const h = trimmed.match(/^(#{2,3})\s+(.*)$/)
    if (h) {
      flushPara()
      const level = h[1].length === 2 ? 4 : 5
      out.push('<h' + level + '>' + inlineLite(h[2]) + '</h' + level + '>')
      continue
    }
    para.push(inlineLite(line))
  }
  flushAll()
  return out.join('\n')
}