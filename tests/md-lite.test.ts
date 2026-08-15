// 任务 4Q 评语卡片轻量 Markdown 渲染：先转义后结构化，输出白名单标签，防 XSS
import { describe, expect, it } from 'vitest'
import { renderMarkdownLite } from '../src/renderer/src/utils/md-lite'

describe('md-lite：加粗与正文', () => {
  it('**xxx** 渲染为 <strong>，不留字面 **', () => {
    const html = renderMarkdownLite('**核心结论**')
    expect(html).toContain('<strong>核心结论</strong>')
    expect(html).not.toContain('**')
  })

  it('行内加粗与普通文字混合', () => {
    const html = renderMarkdownLite('支付 **50129.64 元**，环比上升')
    expect(html).toContain('<strong>50129.64 元</strong>')
    expect(html).not.toContain('**')
  })

  it('连续正文行用 <br> 分段，空行生成独立 <p>', () => {
    const html = renderMarkdownLite('第一行\n第二行\n\n新段落')
    expect(html).toContain('<p>第一行<br>第二行</p>')
    expect(html).toContain('<p>新段落</p>')
  })

  it('空串与纯空白返回空串', () => {
    expect(renderMarkdownLite('')).toBe('')
    expect(renderMarkdownLite('   \n  ')).toBe('')
  })
})

describe('md-lite：列表', () => {
  it('连续 - 行合并为单个 <ul>', () => {
    const html = renderMarkdownLite('- 甲\n- 乙\n- 丙')
    expect(html).toContain('<ul>')
    expect(html).toContain('<li>甲</li>')
    expect(html).toContain('<li>乙</li>')
    expect(html).toContain('<li>丙</li>')
    expect(html).toContain('</ul>')
    expect(html.match(/<ul>/g)).toHaveLength(1)
  })

  it('1. 有序列表渲染为 <ol>', () => {
    const html = renderMarkdownLite('1. 第一步\n2. 第二步')
    expect(html).toContain('<ol>')
    expect(html).toContain('<li>第一步</li>')
    expect(html).toContain('<li>第二步</li>')
    expect(html).toContain('</ol>')
  })

  it('列表项内文字可含加粗', () => {
    const html = renderMarkdownLite('- **退款率** 35.8%')
    expect(html).toContain('<li><strong>退款率</strong> 35.8%</li>')
  })
})

describe('md-lite：标题', () => {
  it('## 渲染为 <h4>，### 渲染为 <h5>', () => {
    const html = renderMarkdownLite('## 数据依据\n\n### 子项')
    expect(html).toContain('<h4>数据依据</h4>')
    expect(html).toContain('<h5>子项</h5>')
  })

  it('单个 # 不是标题，按正文渲染', () => {
    const html = renderMarkdownLite('# 不是标题')
    expect(html).not.toContain('<h')
    expect(html).toContain('<p># 不是标题</p>')
  })
})

describe('md-lite：转义与 XSS 安全', () => {
  it('& < > 双引号 单引号 全部转义', () => {
    const html = renderMarkdownLite('a & b < c > d "e" \'f\'')
    expect(html).toContain('a &amp; b &lt; c &gt; d &quot;e&quot; &#39;f&#39;')
    expect(html).not.toContain('<c >')
  })

  it('script 注入被转义为纯文本，不产生 script 标签', () => {
    const html = renderMarkdownLite('<script>alert(1)</script>')
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;')
    expect(html).not.toContain('<script')
  })

  it('img onerror 注入被整体转义，不产生事件属性', () => {
    const html = renderMarkdownLite('<img src=x onerror=alert(1)>')
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;')
    expect(html).not.toContain('<img')
    expect(html).not.toContain('<img src=')
  })

  it('javascript: 链接不产生任何链接标签与 javascript: 属性', () => {
    const html = renderMarkdownLite('[点我](javascript:alert(1))')
    expect(html).not.toContain('<a ')
    expect(html).not.toContain('href=')
    expect(html).toContain('[点我](javascript:alert(1))') // 纯文本保留，无链接解析
  })

  it('加粗内容中的尖括号先转义再解析', () => {
    const html = renderMarkdownLite('**<b>x</b>**')
    expect(html).toContain('<strong>&lt;b&gt;x&lt;/b&gt;</strong>')
    expect(html).not.toContain('<b>')
  })
})

describe('md-lite：真实评语样张（4P 输出结构）', () => {
  it('四段式评语渲染后含 strong/ul/ol，无字面 **、无 script', () => {
    const sample = [
      '**核心结论**',
      '窗口支付 50129.64 元，退款率 35.8% 高于均值，需优先处理高退款商品。',
      '',
      '**数据依据**',
      '- 支付金额 50129.64 元（环比 +12.3%）',
      '- 退款率 35.8% vs 店铺均值 27.8%',
      '- 推广 ROI 10.92',
      '',
      '**问题诊断**',
      '1. 退款率超均值 8 个百分点',
      '2. 推广花费占比 15.3% 偏高',
      '',
      '**可执行建议**',
      '先核查退款 TOP 商品，再压降低效计划花费。'
    ].join('\n')
    const html = renderMarkdownLite(sample)
    expect(html).toContain('<strong>核心结论</strong>')
    expect(html).toContain('<ul>')
    expect(html).toContain('<ol>')
    expect(html).toContain('先核查退款 TOP 商品，再压降低效计划花费。')
    expect(html).not.toContain('**')
    expect(html).not.toContain('<script')
  })
})