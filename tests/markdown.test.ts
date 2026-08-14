import { describe, expect, it } from 'vitest'
import { renderMarkdown, escapeHtml } from '../src/renderer/src/utils/markdown'

describe('markdown 渲染（对话/质检报告）', () => {
  it('代码块保留原样并转义', () => {
    const html = renderMarkdown('```sql\nSELECT * FROM a WHERE x < 1\n```')
    expect(html).toContain('<pre><code>')
    expect(html).toContain('&lt;')
    expect(html).not.toContain('<script>')
  })

  it('表格渲染出 thead/tbody', () => {
    const md = '| 日期 | 支付 |\n| --- | --- |\n| 08-11 | 100 |'
    const html = renderMarkdown(md)
    expect(html).toContain('<table><thead><tr><th>日期</th><th>支付</th></tr></thead><tbody>')
    expect(html).toContain('<td>08-11</td>')
  })

  it('列表分组渲染', () => {
    const html = renderMarkdown('- 第一条\n- 第二条\n\n正文')
    expect(html).toContain('<ul>')
    expect(html).toContain('<li>第一条</li>')
    expect(html).toContain('</ul>')
  })

  it('粗体/斜体/行内码/链接', () => {
    const html = renderMarkdown('**加粗** *斜体* `code` [链接](https://example.com)')
    expect(html).toContain('<strong>加粗</strong>')
    expect(html).toContain('<em>斜体</em>')
    expect(html).toContain('<code>code</code>')
    expect(html).toContain('<a href="https://example.com"')
  })

  it('HTML 注入被转义（防 XSS）', () => {
    const html = renderMarkdown('<img src=x onerror=alert(1)>')
    expect(html).not.toContain('<img')
    expect(html).toContain('&lt;img')
    expect(escapeHtml('<b>&"')).toBe('&lt;b&gt;&amp;&quot;')
  })
})
