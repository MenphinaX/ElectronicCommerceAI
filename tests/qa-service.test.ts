import { describe, expect, it } from 'vitest'
import { buildQaPrompt, parseQaCsv, parseQaJson, parseQaTxt, qaStats } from '../src/main/ai/qa-service'

describe('聊天质检：三格式解析归一化', () => {
  it('CSV：列头归一化，senderRole=agent 记客服，其余记客户', () => {
    const csv = `customerId,customerName,sender,senderRole,timestamp,type,content
C1,王先生,客服小美,agent,2026-08-01 10:00,text,您好请问有什么可以帮您
C1,王先生,王先生,customer,2026-08-01 10:01,text,我想问下物流
`
    const rows = parseQaCsv(csv)
    expect(rows).toHaveLength(2)
    expect(rows[0].role).toBe('客服')
    expect(rows[1].role).toBe('客户')
    expect(rows[0].sessionId).toBe('C1')
    expect(rows[0].customerName).toBe('王先生')
  })

  it('TXT：[时间] 发送者 (角色): 内容，角色 客户/客服', () => {
    const txt = '[2026-08-01 10:00] 小明 (客户): 你好\n[2026-08-01 10:01] 客服小美 (客服): 您好'
    const rows = parseQaTxt(txt)
    expect(rows).toHaveLength(2)
    expect(rows[0].role).toBe('客户')
    expect(rows[0].sender).toBe('小明')
    expect(rows[1].role).toBe('客服')
    expect(rows[0].timestamp).toBe('2026-08-01 10:00')
  })

  it('JSON：dict{会话ID:{messages[]}}，type=image 保留并标注', () => {
    const json = JSON.stringify({
      S1: {
        customerName: '李女士',
        messageCount: 2,
        messages: [
          { sender: '李女士', senderRole: 'customer', timestamp: '2026-08-01 09:00', type: 'text', content: '在吗' },
          { sender: '客服小刚', senderRole: 'agent', timestamp: '2026-08-01 09:01', type: 'image', content: 'https://example.com/a.png' }
        ]
      }
    })
    const rows = parseQaJson(json)
    expect(rows).toHaveLength(2)
    expect(rows[0].role).toBe('客户')
    expect(rows[1].role).toBe('客服')
    expect(rows[1].content).toContain('[图片URL]')
    expect(rows[1].content).toContain('https://example.com/a.png')
  })

  it('统计：会话数/客服数/时间跨度', () => {
    const rows = [
      { sessionId: 'A', customerName: '', sender: '客1', role: '客服' as const, timestamp: '2026-08-01 10:00', type: 'text', content: 'a' },
      { sessionId: 'A', customerName: '', sender: '张', role: '客户' as const, timestamp: '2026-08-01 10:01', type: 'text', content: 'b' },
      { sessionId: 'B', customerName: '', sender: '客2', role: '客服' as const, timestamp: '2026-08-02 11:00', type: 'text', content: 'c' }
    ]
    const s = qaStats(rows)
    expect(s.sessions).toBe(2)
    expect(s.agents).toEqual(['客1', '客2'])
    expect(s.start).toBe('2026-08-01 10:00')
    expect(s.end).toBe('2026-08-02 11:00')
  })

  it('提示词 = 面板全文 + 统计 + 记录；超限截断并提示', () => {
    const rows = Array.from({ length: 5 }, (_, i) => ({
      sessionId: 'S' + i, customerName: '', sender: '客' + i, role: '客服' as const,
      timestamp: '2026-08-01', type: 'text', content: '内容' + i
    }))
    const p = buildQaPrompt('请重点检查响应及时性', rows)
    expect(p.system).toContain('质检')
    expect(p.user).toContain('请重点检查响应及时性')
    expect(p.user).toContain('会话数 5')
    expect(p.truncated).toBe(false)
    const many = Array.from({ length: 300 }, (_, i) => ({
      sessionId: 'S' + i, customerName: '', sender: '客' + i, role: '客服' as const,
      timestamp: '2026-08-01', type: 'text', content: '长'.repeat(300)
    }))
    const huge = buildQaPrompt('x', many)
    expect(huge.truncated).toBe(true)
    expect(huge.user).toContain('超限截断')
  })
})
