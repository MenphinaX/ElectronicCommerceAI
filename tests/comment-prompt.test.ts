// 任务 4P/4Q 评语提示词：system 四段式 300~1000 字（4Q 字数对齐）+ markdown 结构输出 + 9 模块内置分析框架 + skill 只取 500 字补充
// 反向验证：修前 system 含「50~100 字/结论先行」→ 修后不含；user 修前只有 skill 正文+模块+摘要 → 修后含【模块分析框架】与【绑定技能补充】
import { describe, expect, it } from 'vitest'
import { buildPrompt, COMMENT_BLOCKS } from '../src/main/ai/comments'
import type { RuleHit } from '../src/main/ai/comments'

const RULES: RuleHit[] = [{ rule: '退款率高于店铺均值', severity: 'high', evidence: '窗口退款率 35.8% vs 店铺均值 27.8%' }]

describe('任务 4P 评语提示词：system 去字数硬锁、四段式', () => {
  it('system 不含旧文案「50~100」「结论先行」，含四段结构与字数约束', () => {
    const block = COMMENT_BLOCKS[0]
    const p = buildPrompt('SKILL', block, 'SUMMARY', [])
    expect(p.system).not.toContain('50~100')
    expect(p.system).not.toContain('结论先行')
    expect(p.system).toContain('300~1000') // 4R 规格翻转：字数 300~800→300~1000（非放宽非删减）
    expect(p.system).toContain('核心结论')
    expect(p.system).toContain('数据依据')
    expect(p.system).toContain('问题诊断')
    expect(p.system).toContain('可执行建议')
    expect(p.system).toContain('禁止口号式大词')
    expect(p.system).toContain('中文输出')
  })
})

describe('任务 4P 评语提示词：9 模块内置分析框架', () => {
  it('9 模块 framework 均非空且含具体指标词（看什么/达标线/诊断/动作）', () => {
    expect(COMMENT_BLOCKS.length).toBe(9)
    const expectWords: Record<string, string[]> = {
      '摘要': ['支付', '退款率'],
      '指标': ['支付转化率', 'ROI'],
      '趋势': ['环比', '走势'],
      '商品': ['退款', 'ROI'],
      '推广': ['ROI', '保本'],
      '退款': ['退款率', '店铺均值'],
      '客服DSR': ['回复率', 'DSR'],
      '搜索词': ['访客', '转化'],
      '建议': ['对象', '动作']
    }
    for (const b of COMMENT_BLOCKS) {
      expect(b.framework.length).toBeGreaterThan(30)
      for (const w of expectWords[b.module]) expect(b.framework).toContain(w)
    }
  })
})

describe('任务 4P 评语提示词：user 组装顺序与截断', () => {
  it('user 含【模块分析框架】与【绑定技能补充】，技能正文截断至 500 字', () => {
    const block = COMMENT_BLOCKS.find((b) => b.module === '推广')!
    const longBody = '技能正文A'.repeat(300) // 1500 字，远超 500
    const p = buildPrompt(longBody, block, 'SUMMARY', [])
    expect(p.user).toContain('【本模块】推广（推广分析）')
    expect(p.user).toContain('【模块分析框架】')
    expect(p.user).toContain(block.framework)
    expect(p.user).toContain('【窗口数据摘要】')
    expect(p.user).toContain('【绑定技能补充（≤500 字，仅作分析角度参考，不得反客为主）】')
    expect(p.user).toContain('技能正文A'.repeat(100)) // 前 500 字整段在
    expect(p.user).not.toContain('技能正文A'.repeat(101)) // 501 字起被截断
    expect(p.user.indexOf('【模块分析框架】')).toBeLessThan(p.user.indexOf('【绑定技能补充'))
  })

  it('异常清单在规则命中时出现，且排在技能补充之前', () => {
    const p = buildPrompt('SKILL', COMMENT_BLOCKS[0], 'SUMMARY', RULES)
    expect(p.user).toContain('【异常清单（评语可引用，不必全部列举）】')
    expect(p.user).toContain('退款率高于店铺均值')
    expect(p.user.indexOf('【异常清单')).toBeLessThan(p.user.indexOf('【绑定技能补充'))
  })
})

describe('任务 4Q 评语提示词：字数对齐 + markdown 结构输出', () => {
  it('system 含「300~1000」与「以数据为准宁长勿短」，要求 markdown 结构输出', () => {
    const p = buildPrompt('SKILL', COMMENT_BLOCKS[0], 'SUMMARY', [])
    expect(p.system).toContain('300~1000')
    expect(p.system).toContain('以数据为准宁长勿短')
    expect(p.system).toContain('markdown 结构输出')
    expect(p.system).toContain('**核心结论**')
    expect(p.system).toContain('分点用 - 列表')
    expect(p.system).toContain('正文用换行分段')
    expect(p.system).toContain('禁止口号式大词')
    expect(p.system).toContain('中文输出')
  })
})
