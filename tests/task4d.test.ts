// 任务 4D 回归测试（TDD）：①技能拉取异步 git + 可取消 + 中文错误分类；②质检流式 finish_reason 截断检测；③按会话分批 + maxTokens 上限
import { describe, expect, it, vi } from 'vitest'
import { classifyGitError, cloneSkillsViaGit, listSkillCandidates } from '../src/main/ai/skills-core'
import { OutputTruncatedError, chatCompleteStream, type ModelConfig } from '../src/main/import/model-client'
import {
  QA_DEFAULT_MAX_TOKENS, buildQaBatchPrompt, buildQaSummaryPrompt, clampQaMaxTokens,
  splitQaBatches, type QaMessage
} from '../src/main/ai/qa-service'

function gitErr(props: Record<string, unknown>, message = 'git 执行失败'): Error {
  return Object.assign(new Error(message), props) as Error
}

describe('任务4D ① 技能拉取：异步 git + 可取消 + 错误分类', () => {
  it('classifyGitError：超时/网络/仓库不存在/取消/未知 分类为可读中文', () => {
    expect(classifyGitError(gitErr({ code: 'ETIMEDOUT' }))).toMatch(/超时/)
    expect(classifyGitError(gitErr({ killed: true, signal: 'SIGTERM' }))).toMatch(/超时/)
    expect(classifyGitError(gitErr({ code: 'ENOTFOUND' }))).toMatch(/网络不可达/)
    expect(classifyGitError(gitErr({ code: 'ECONNREFUSED' }))).toMatch(/网络不可达/)
    expect(classifyGitError(gitErr({ code: 128, gitStderr: "fatal: repository 'https://github.com/x/y.git/' not found" }))).toMatch(/仓库不存在/)
    expect(classifyGitError(gitErr({ name: 'AbortError' }, 'The operation was aborted'))).toMatch(/已取消/)
    expect(classifyGitError(gitErr({ code: 1 }, 'boom'))).toMatch(/git 拉取失败/)
  })

  it('cloneSkillsViaGit：预取消信号立即拒绝「已取消」，不阻塞（<3s）', async () => {
    const ctrl = new AbortController()
    ctrl.abort()
    const t0 = Date.now()
    await expect(cloneSkillsViaGit('jnMetaCode', 'agency-agents-zh', null, null, { signal: ctrl.signal })).rejects.toThrow(/已取消/)
    expect(Date.now() - t0).toBeLessThan(3000)
  })

  it('listSkillCandidates：解析期间取消立即拒绝「已取消」，不卡网络', async () => {
    const ctrl = new AbortController()
    ctrl.abort()
    const t0 = Date.now()
    await expect(listSkillCandidates('https://github.com/jnMetaCode/agency-agents-zh', { signal: ctrl.signal })).rejects.toThrow(/已取消/)
    expect(Date.now() - t0).toBeLessThan(3000)
  })
})

describe('任务4D ② 质检流式：finish_reason 截断检测', () => {
  const cfg: ModelConfig = { baseUrl: 'https://api.deepseek.com', apiKey: 'test-key', model: 'deepseek-chat' }

  function sseResponse(chunks: string[]): Response {
    const body = chunks.map((c) => `data: ${c}\n\n`).join('') + 'data: [DONE]\n\n'
    return new Response(new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(body))
        controller.close()
      }
    }), { status: 200 })
  }

  it('finish_reason=length：抛 OutputTruncatedError、onFinish 收到 length、已生成内容保留', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => sseResponse([
      JSON.stringify({ choices: [{ delta: { content: '报告前半段' }, finish_reason: null }] }),
      JSON.stringify({ choices: [{ delta: {}, finish_reason: 'length' }] })
    ])))
    const onFinish = vi.fn()
    const acc: string[] = []
    await expect((async () => {
      for await (const chunk of chatCompleteStream(cfg, [{ role: 'user', content: 'x' }], { onFinish })) acc.push(chunk)
    })()).rejects.toBeInstanceOf(OutputTruncatedError)
    expect(acc.join('')).toBe('报告前半段')
    expect(onFinish).toHaveBeenCalledWith('length')
    vi.unstubAllGlobals()
  })

  it('finish_reason=stop：正常收尾，onFinish 收到 stop，不抛错', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => sseResponse([
      JSON.stringify({ choices: [{ delta: { content: '完整报告' }, finish_reason: null }] }),
      JSON.stringify({ choices: [{ delta: {}, finish_reason: 'stop' }] })
    ])))
    const onFinish = vi.fn()
    const acc: string[] = []
    for await (const chunk of chatCompleteStream(cfg, [{ role: 'user', content: 'x' }], { onFinish })) acc.push(chunk)
    expect(acc.join('')).toBe('完整报告')
    expect(onFinish).toHaveBeenCalledWith('stop')
    vi.unstubAllGlobals()
  })
})

describe('任务4D ③ 质检分批：按会话分批 + maxTokens 上限', () => {
  function mkSession(sid: string, n: number, contentLen = 40): QaMessage[] {
    return Array.from({ length: n }, (_, i) => ({
      sessionId: sid, customerName: '', sender: '客' + i, role: '客服' as const,
      timestamp: '2026-08-01', type: 'text', content: '内'.repeat(contentLen)
    }))
  }

  it('clampQaMaxTokens：默认 8000，合法值保留，越界钳制到 8192，非法回默认', () => {
    expect(QA_DEFAULT_MAX_TOKENS).toBe(8000)
    expect(clampQaMaxTokens(undefined)).toBe(8000)
    expect(clampQaMaxTokens('4000')).toBe(4000)
    expect(clampQaMaxTokens(99999)).toBe(8192)
    expect(clampQaMaxTokens(100)).toBe(1024)
    expect(clampQaMaxTokens('abc')).toBe(8000)
  })

  it('splitQaBatches：30 会话按 maxSessions 分批，会话全覆盖且不重复、顺序保持', () => {
    const records: QaMessage[] = []
    for (let i = 0; i < 30; i++) records.push(...mkSession('S' + i, 5))
    const batches = splitQaBatches(records, { maxSessions: 6, maxChars: 1_000_000 })
    expect(batches.length).toBe(5)
    for (const b of batches) expect(b.sessions.length).toBeLessThanOrEqual(6)
    const seen = batches.flatMap((b) => b.sessions)
    expect(seen).toEqual(Array.from({ length: 30 }, (_, i) => 'S' + i))
  })

  it('splitQaBatches：超大会话按记录切片（part 标记），不丢记录', () => {
    const big = mkSession('BIG', 2000, 200)
    const small = mkSession('A', 3)
    const batches = splitQaBatches([...small, ...big], { maxChars: 30_000, maxSessions: 6 })
    const total = batches.reduce((a, b) => a + b.records.length, 0)
    expect(total).toBe(2003)
    const bigParts = batches.filter((b) => b.sessions.includes('BIG'))
    expect(bigParts.length).toBeGreaterThan(1)
    for (const p of bigParts) expect(p.part).toBeDefined()
  })

  it('buildQaBatchPrompt：含批次信息、覆盖会话、续写指令', () => {
    const stats = { sessions: 30, agents: ['风铃'], start: 'a', end: 'b' }
    const batch = { sessions: ['S1', 'S2'], records: mkSession('S1', 2).concat(mkSession('S2', 2)), part: undefined }
    const p = buildQaBatchPrompt('请重点检查响应及时性', batch, {
      batchIndex: 2, batchCount: 5, totalRecords: 2351, allStats: stats
    })
    expect(p.system).toContain('质检')
    expect(p.user).toContain('请重点检查响应及时性')
    expect(p.user).toContain('第 2/5 批')
    expect(p.user).toContain('S1')
    expect(p.user).toContain('S2')
    expect(p.user).toContain('不要输出整体总结')
  })

  it('buildQaSummaryPrompt：含统计与「整体质检总结」指令、分析要点', () => {
    const stats = { sessions: 30, agents: ['风铃'], start: 'a', end: 'b' }
    const p = buildQaSummaryPrompt('请重点检查话术合规', ['分析1', '分析2'], { totalRecords: 2351, allStats: stats })
    expect(p.system).toContain('汇总')
    expect(p.user).toContain('整体质检总结')
    expect(p.user).toContain('会话数 30')
    expect(p.user).toContain('分析1')
    expect(p.user).toContain('分析2')
  })
})