// 任务 3 LLM 兜底测试：本地失败→列映射兜底正确识别落库；无 key 不崩且有提示
import { describe, expect, it } from 'vitest'
import { existsSync, mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import * as XLSX from 'xlsx'
import { AppDatabase } from '../src/main/db/database'
import { importFiles } from '../src/main/import/import-service'
import { runFallback } from '../src/main/import/fallback'
import { resolveModelConfig, type ModelConfig } from '../src/main/import/model-client'
import { parseSourceFile } from '../src/main/import/parsers'
import { readSourceFile } from '../src/main/import/reader'
import { detectType } from '../src/main/import/validate'
import { upsertShop } from '../src/main/db/repo'
import { KEYWORD_FILE, REFUND_FILE, SHOP_NAME, TEMPLATE_DIR } from './helpers/load-fixtures'

XLSX.set_fs(await import('node:fs'))

const F = (name: string): string => join(TEMPLATE_DIR, name)

/** 读取本机 Codex auth 里的 key（不打印），搭真实 OpenAI 兼容端点（本地中转） */
function envModel(): ModelConfig | null {
  const baseUrl = process.env.EC_AI_LLM_BASE_URL
  const apiKey = process.env.EC_AI_LLM_API_KEY
  const model = process.env.EC_AI_LLM_MODEL
  if (baseUrl && apiKey && model) return { baseUrl, apiKey, model }
  const auth = join(process.env.USERPROFILE ?? '', '.codex', 'auth.json')
  if (existsSync(auth)) {
    try {
      const j = JSON.parse(readFileSync(auth, 'utf8')) as { OPENAI_API_KEY?: string }
      if (j.OPENAI_API_KEY) {
        return { baseUrl: 'http://127.0.0.1:57321/v1', apiKey: j.OPENAI_API_KEY, model: 'deepseek-v4-flash' }
      }
    } catch {
      return null
    }
  }
  return null
}

const hasLlm = envModel() !== null

/** 本地中转可达性探测（坑记录：LLM 服务慢/断网时自动 skip，不许把套件挂死 30s） */
async function probeLlm(cfg: ModelConfig): Promise<boolean> {
  try {
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), 4000)
    const res = await fetch(`${cfg.baseUrl.replace(/\/+$/, '')}/models`, {
      headers: { Authorization: `Bearer ${cfg.apiKey}` },
      signal: ctrl.signal
    })
    clearTimeout(timer)
    return res.ok
  } catch {
    return false
  }
}

const llmReady = hasLlm ? await probeLlm(envModel() as ModelConfig) : false

function freshDb(): { db: AppDatabase; shopId: number; archiveDir: string } {
  const dir = mkdtempSync(join(tmpdir(), 'ecai-fallback-'))
  const db = new AppDatabase(join(dir, 'fallback.db'))
  db.init()
  const shopId = upsertShop(db, { name: SHOP_NAME })
  return { db, shopId, archiveDir: join(dir, 'archives') }
}

/** 搜索词表头挪到第 8 行，写成真 xls */
function makeKeywordShifted(): string {
  const base = readSourceFile(F(KEYWORD_FILE)).rows
  const header = base[5]
  const shifted = [...base.slice(0, 5), [], [], header, ...base.slice(6)]
  const ws = XLSX.utils.aoa_to_sheet(shifted)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Sheet1')
  const dir = mkdtempSync(join(tmpdir(), 'ecai-shifted-'))
  const p = join(dir, '【生意参谋】选词助手-引流搜索词-店外-无线-改版.xls')
  XLSX.writeFile(wb, p, { bookType: 'biff8' })
  return p
}

/** 退款单 2 列改名，写成真 xlsx */
function makeRefundRenamed(): string {
  const base = readSourceFile(F(REFUND_FILE)).rows
  const header = (base[0] ?? []).map((cell) => {
    const s = String(cell)
    if (s === '订单编号') return '订单号'
    if (s === '退款总额') return '退款金额'
    return cell
  })
  const ws = XLSX.utils.aoa_to_sheet([header, ...base.slice(1)])
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Sheet1')
  const dir = mkdtempSync(join(tmpdir(), 'ecai-renamed-'))
  const p = join(dir, '退款单-改版.xlsx')
  XLSX.writeFile(wb, p)
  return p
}

describe('模型配置解析', () => {
  it('无任何配置 → null（UI 据此提示不发送数据）', () => {
    const before = { ...process.env }
    delete process.env.EC_AI_LLM_BASE_URL
    delete process.env.EC_AI_LLM_API_KEY
    delete process.env.EC_AI_LLM_MODEL
    try {
      expect(resolveModelConfig(null, null)).toBeNull()
    } finally {
      process.env = before
    }
  })

  it('env 配置 → 返回配置', () => {
    const before = { ...process.env }
    process.env.EC_AI_LLM_BASE_URL = 'http://x/v1'
    process.env.EC_AI_LLM_API_KEY = 'k'
    process.env.EC_AI_LLM_MODEL = 'm'
    try {
      const cfg = resolveModelConfig(null, null)
      expect(cfg).toEqual({ baseUrl: 'http://x/v1', apiKey: 'k', model: 'm' })
    } finally {
      process.env = before
    }
  })
})

describe('无 key 兜底不崩且有提示', () => {
  it('runFallback 无配置 → ok=false + 明确原因，不调用模型', async () => {
    const { db } = freshDb()
    const saved = { ...process.env }
    delete process.env.EC_AI_LLM_BASE_URL
    delete process.env.EC_AI_LLM_API_KEY
    delete process.env.EC_AI_LLM_MODEL
    try {
      const file = makeKeywordShifted()
      const raw = readSourceFile(file)
      const d = detectType(file, raw)
      expect(d?.reason).toBe('keyword_only')
      const local = parseSourceFile(file, raw, d!.type)
      expect(local.ok).toBe(false)
      const res = await runFallback(db, file, raw, d!.type, null, local.issues)
      expect(res.ok).toBe(false)
      expect(res.reason).toContain('未配置 AI 模型')
      expect(db.rowCounts().search_keywords).toBe(0)
    } finally {
      process.env = saved
    }
    db.close()
  })
})

describe.skipIf(!llmReady)('LLM 兜底（真实模型，本地中转）', () => {
  it('搜索词表头挪到第 8 行：本地失败 → 列映射兜底正确识别并落库', async () => {
    const { db, shopId, archiveDir } = freshDb()
    const file = makeKeywordShifted()
    const [r] = await importFiles(db, [file], { shopId, archiveDir, allowFallback: true, modelConfig: envModel() })
    expect(r.status).toBe('ok')
    expect(r.fallbackUsed).toBe(true)
    expect(r.rows).toBe(133)
    expect(db.rowCounts().search_keywords).toBe(133)
    const first = db.raw.prepare('SELECT keyword, visitors FROM search_keywords LIMIT 1').get() as { keyword: string; visitors: number }
    expect(first.visitors).toBeGreaterThan(0)
    db.close()
  })

  it('退款单 2 列改名：本地失败 → 列映射兜底正确识别并落库 2096 行', async () => {
    const { db, shopId, archiveDir } = freshDb()
    const file = makeRefundRenamed()
    const [r] = await importFiles(db, [file], { shopId, archiveDir, allowFallback: true, modelConfig: envModel() })
    expect(r.status).toBe('ok')
    expect(r.fallbackUsed).toBe(true)
    expect(r.rows).toBe(2096)
    expect(db.rowCounts().refund_orders).toBe(2096)
    const sum = db.raw.prepare('SELECT SUM(refund_amount_fen) s FROM refund_orders').get() as { s: number }
    expect(sum.s).toBe(40219806)
    db.close()
  })
})