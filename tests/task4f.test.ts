// 任务 4F 回归测试（TDD）：③质检历史导出 CSV 汇总 ④头像超大图 1:1 裁切+压缩≤512px ⑤开屏默认开启/每次启动 ⑥qa_runs 客服数列 + schema v8 迁移
import { describe, expect, it } from 'vitest'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { AppDatabase } from '../src/main/db/database'
import { SCHEMA_VERSION } from '../src/main/db/schema'
import { insertQaRun, listQaRuns } from '../src/main/db/repo'
import { assertAvatarSize, fitAvatarSquare, MAX_AVATAR_BYTES, MAX_AVATAR_EDGE } from '../src/main/system/avatar'
import { buildQaHistoryCsv } from '../src/renderer/src/utils/qa-export'
import { splitQaBatches, withQaTruncationNote, type QaMessage } from '../src/main/ai/qa-service'
import { shouldShowSplash } from '../src/renderer/src/utils/splash'
import { reportDomMatchesStored } from '../src/renderer/src/utils/qa-compare'

function freshDb(): AppDatabase {
  const dir = mkdtempSync(join(tmpdir(), 'ecai-4f-'))
  const db = new AppDatabase(join(dir, '4f.db'))
  db.init()
  return db
}

describe('任务4F ④ 头像：超大图 1:1 居中裁切 + 压缩到 ≤512px', () => {
  it('fitAvatarSquare：≤512px 不处理（原样保留）', () => {
    expect(fitAvatarSquare({ width: 400, height: 300 })).toEqual({ crop: null, resize: null })
    expect(fitAvatarSquare({ width: 512, height: 512 })).toEqual({ crop: null, resize: null })
  })

  it('fitAvatarSquare：横图 800×400 → 居中裁 1:1 正方形（400×400），不超限不再缩放', () => {
    expect(fitAvatarSquare({ width: 800, height: 400 })).toEqual({ crop: { x: 200, y: 0, width: 400, height: 400 }, resize: null })
  })

  it('fitAvatarSquare：超大横图 2000×1000 → 居中裁 1000×1000 后缩到 512×512', () => {
    expect(fitAvatarSquare({ width: 2000, height: 1000 })).toEqual({ crop: { x: 500, y: 0, width: 1000, height: 1000 }, resize: { width: 512, height: 512 } })
  })

  it('fitAvatarSquare：竖图 600×800 → 居中裁 600×600 后缩到 512×512', () => {
    expect(fitAvatarSquare({ width: 600, height: 800 })).toEqual({ crop: { x: 0, y: 100, width: 600, height: 600 }, resize: { width: 512, height: 512 } })
  })

  it('fitAvatarSquare：宽高上限常量=512，居中裁切坐标取整不越界', () => {
    expect(MAX_AVATAR_EDGE).toBe(512)
    const r = fitAvatarSquare({ width: 1025, height: 601 })
    expect(r.crop).toEqual({ x: 212, y: 0, width: 601, height: 601 })
    expect(r.resize).toEqual({ width: 512, height: 512 })
  })

  it('assertAvatarSize：20MB 内通过，超限抛中文错误', () => {
    expect(MAX_AVATAR_BYTES).toBe(20 * 1024 * 1024)
    expect(() => assertAvatarSize(Buffer.alloc(20 * 1024 * 1024 - 1))).not.toThrow()
    expect(() => assertAvatarSize(Buffer.alloc(20 * 1024 * 1024 + 1))).toThrow(/上限/)
  })
})

describe('任务4F ③ 质检历史导出：批量汇总 CSV', () => {
  it('CSV 表头与状态/耗时/摘要映射符合验收口径', () => {
    const csv = buildQaHistoryCsv([
      {
        id: 3, fileCount: 3, sessionCount: 30, agentCount: 5, model: 'deepseek-chat',
        elapsedMs: 207024, status: 'ok', report: '## 整体质检总结\n总体良好', createdAt: '2026-08-14 16:13:11'
      }
    ])
    const lines = csv.split('\r\n').filter(Boolean)
    expect(lines[0]).toBe('时间,文件数,会话数,客服数,模型,耗时(秒),状态,报告摘要')
    expect(lines[1]).toContain('2026-08-14 16:13:11,3,30,5,deepseek-chat,207,成功,')
    expect(lines[1]).toContain('## 整体质检总结 总体良好')
  })

  it('CSV 单元格转义：逗号/引号/换行不破坏列结构', () => {
    const csv = buildQaHistoryCsv([
      {
        id: 9, fileCount: 1, sessionCount: 2, agentCount: 1, model: 'm,o"d',
        elapsedMs: 1500, status: 'error', report: '含,逗号 "引号" 与\n换行', createdAt: '2026-08-01 09:00:00'
      }
    ])
    const line = csv.split('\r\n').filter(Boolean)[1]
    expect(line).toContain('"m,o""d"')
    expect(line).toContain('"含,逗号 ""引号"" 与 换行"')
  })

  it('报告摘要截断 120 字符并带省略号；空报告摘要为空', () => {
    const long = '评'.repeat(200)
    const csv = buildQaHistoryCsv([
      { id: 1, fileCount: 1, sessionCount: 1, agentCount: 0, model: 'x', elapsedMs: 100, status: 'ok', report: long, createdAt: '2026-08-02 10:00:00' }
    ])
    expect(csv).toContain('评'.repeat(120) + '…')
    const csv2 = buildQaHistoryCsv([
      { id: 2, fileCount: 1, sessionCount: 1, agentCount: 0, model: 'x', elapsedMs: 100, status: 'ok', report: '', createdAt: '2026-08-02 10:00:01' }
    ])
    expect(csv2).toContain('2026-08-02 10:00:01,1,1,0,x,0,成功,')
  })
})

describe('任务4F ⑤ 开屏欢迎页：默认开启、每次启动、设置可关', () => {
  it('shouldShowSplash：默认开启且当日未看 → true', () => {
    expect(shouldShowSplash({ splashEnabled: true, onboardingDone: true, nowDate: '2026-08-14', lastSplashDate: '' })).toBe(true)
  })

  it('shouldShowSplash：同日已看 → false（每次启动）', () => {
    expect(shouldShowSplash({ splashEnabled: true, onboardingDone: true, nowDate: '2026-08-14', lastSplashDate: '2026-08-14' })).toBe(true)
    expect(shouldShowSplash({ splashEnabled: true, onboardingDone: true, nowDate: '2026-08-15', lastSplashDate: '2026-08-14' })).toBe(true)
  })

  it('shouldShowSplash：设置关闭或引导未完成 → false', () => {
    expect(shouldShowSplash({ splashEnabled: false, onboardingDone: true, nowDate: '2026-08-14', lastSplashDate: '' })).toBe(false)
    expect(shouldShowSplash({ splashEnabled: true, onboardingDone: false, nowDate: '2026-08-14', lastSplashDate: '' })).toBe(false)
  })
})

describe('任务4F ②③ qa_runs：客服数列 agent_count 落库与返回', () => {
  it('insertQaRun 带 agentCount，listQaRuns 原样返回', () => {
    const db = freshDb()
    insertQaRun(db, { fileCount: 3, sessionCount: 30, agentCount: 5, model: 'deepseek-chat', elapsedMs: 1000, status: 'ok', report: '报告' })
    const rows = listQaRuns(db, 10) as Array<{ agentCount: number; sessionCount: number }>
    expect(rows).toHaveLength(1)
    expect(rows[0].agentCount).toBe(5)
    expect(rows[0].sessionCount).toBe(30)
    db.close()
  })

  it('旧行 agent_count 默认 0（历史数据不炸）', () => {
    const db = freshDb()
    db.raw.prepare('INSERT INTO qa_runs (file_count, session_count, model, elapsed_ms, status, report) VALUES (1, 2, ?, 10, ?, ?)').run('m', 'ok', 'r')
    const rows = listQaRuns(db, 10) as Array<{ agentCount: number }>
    expect(rows[0].agentCount).toBe(0)
    db.close()
  })
})

describe('任务4F schema v8：qa_runs 新增 agent_count 列', () => {
  it('SCHEMA_VERSION>=8 且新库有 agent_count 列', () => {
    expect(SCHEMA_VERSION).toBeGreaterThanOrEqual(8)
    const db = freshDb()
    const cols = db.raw.prepare('PRAGMA table_info(qa_runs)').all() as Array<{ name: string }>
    expect(cols.map((c) => c.name)).toContain('agent_count')
    expect(db.userVersion()).toBe(SCHEMA_VERSION)
    db.close()
  })

  it('v7 旧库升级到 v8：ALTER 补列且保留既有数据', () => {
    const dir = mkdtempSync(join(tmpdir(), 'ecai-4f-v7-'))
    const db = new AppDatabase(join(dir, 'v7.db'))
    // 手动构造 v7 结构（qa_runs 无 agent_count），插 1 行旧数据
    db.raw.exec(`
      CREATE TABLE qa_runs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        shop_id INTEGER,
        file_count INTEGER NOT NULL DEFAULT 0,
        session_count INTEGER NOT NULL DEFAULT 0,
        model TEXT,
        elapsed_ms INTEGER NOT NULL DEFAULT 0,
        status TEXT NOT NULL DEFAULT 'ok',
        report TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
      )`)
    db.raw.pragma('user_version = 7')
    db.raw.prepare('INSERT INTO qa_runs (file_count, session_count, model, elapsed_ms, status, report) VALUES (1, 5, ?, 100, ?, ?)').run('deepseek-chat', 'ok', '旧报告')
    db.init()
    const cols = db.raw.prepare('PRAGMA table_info(qa_runs)').all() as Array<{ name: string }>
    expect(cols.map((c) => c.name)).toContain('agent_count')
    const row = db.raw.prepare('SELECT file_count AS fileCount, session_count AS sessionCount, report FROM qa_runs').get() as { fileCount: number; sessionCount: number; report: string }
    expect(row.sessionCount).toBe(5)
    expect(row.report).toBe('旧报告')
    expect(db.userVersion()).toBe(SCHEMA_VERSION)
    db.close()
  })
})

describe('任务4F ② 质检报告一致性：DOM 渲染文本 vs 库中原始 markdown', () => {
  // 模拟 renderMarkdown：去掉 markdown 语法符号后取文本
  const renderToText = (md: string): string =>
    md.replace(/\r\n/g, '\n').replace(/^#{1,6}\s*/gm, '').replace(/\*\*/g, '').replace(/^---+$/gm, '').trim()

  it('完整报告：渲染后 DOM 文本与原始 markdown 归一化一致 → true', () => {
    const raw = '### 报告开头统计\n\n**会话数：** 30\n\n---\n\n## 总结\n总体良好'
    const dom = '报告开头统计\n会话数： 30\n总结\n总体良好'
    expect(reportDomMatchesStored(dom, raw, renderToText)).toBe(true)
  })

  it('DOM 是库中报告前缀（流式未结束/切页保留）→ true', () => {
    const raw = '### 报告开头统计\n\n**会话数：** 30\n\n## 总结\n总体良好'
    const dom = '报告开头统计\n会话数： 30'
    expect(reportDomMatchesStored(dom, raw, renderToText)).toBe(true)
  })

  it('DOM 为空或库为空 → false', () => {
    expect(reportDomMatchesStored('', '报告', renderToText)).toBe(false)
    expect(reportDomMatchesStored('报告', '', renderToText)).toBe(false)
  })

  it('内容不一致 → false（防误报）', () => {
    expect(reportDomMatchesStored('完全不同的内容', '### 报告开头统计\n总体良好', renderToText)).toBe(false)
  })
})
describe('任务4F ② 质检分批与截断续跑：默认分批更小、截断保留已生成内容不中止', () => {
  function mkSession(sid: string, n: number): QaMessage[] {
    return Array.from({ length: n }, (_, i) => ({
      sessionId: sid, sender: '客服', role: '客服' as const, ts: '', type: 'text', content: '内容' + i,
      customerName: '客户', timestamp: ''
    }))
  }

  it('splitQaBatches 默认每批 ≤4 会话，30 会话全覆盖且不重复', () => {
    const records = Array.from({ length: 30 }, (_, i) => mkSession('S' + i, 3)).flat()
    const batches = splitQaBatches(records)
    expect(batches.length).toBeGreaterThanOrEqual(7)
    for (const b of batches) expect(b.sessions.length).toBeLessThanOrEqual(4)
    const seen = batches.flatMap((b) => b.sessions)
    expect(seen).toEqual(Array.from({ length: 30 }, (_, i) => 'S' + i))
  })

  it('withQaTruncationNote：未截断原样返回，截断追加中文说明', () => {
    expect(withQaTruncationNote('报告', false)).toBe('报告')
    const out = withQaTruncationNote('报告', true)
    expect(out).toContain('报告')
    expect(out).toContain('截断')
    expect(out).toContain('已保留全部已生成内容')
  })
})