import { describe, expect, it } from 'vitest'
import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { AppDatabase } from '../src/main/db/database'
import { ALL_TABLES, EXTRA_TABLES, REQUIRED_TABLES, SCHEMA_VERSION } from '../src/main/db/schema'

function tempDb(): { db: AppDatabase; dir: string } {
  const dir = mkdtempSync(join(tmpdir(), 'ecai-schema-'))
  const db = new AppDatabase(join(dir, 'test.db'))
  db.init()
  return { db, dir }
}

describe('schema：16 张必备表 + DSR 新增表', () => {
  it('任务书 16 张表名齐全（14 业务 + skills/module_skills）', () => {
    expect(REQUIRED_TABLES).toHaveLength(16)
    expect(REQUIRED_TABLES).toContain('settings')
    expect(REQUIRED_TABLES).toContain('shops')
    expect(REQUIRED_TABLES).toContain('imports')
    expect(REQUIRED_TABLES).toContain('daily_metrics')
    expect(REQUIRED_TABLES).toContain('product_daily')
    expect(REQUIRED_TABLES).toContain('promo_daily')
    expect(REQUIRED_TABLES).toContain('refund_orders')
    expect(REQUIRED_TABLES).toContain('cs_daily')
    expect(REQUIRED_TABLES).toContain('search_keywords')
    expect(REQUIRED_TABLES).toContain('models')
    expect(REQUIRED_TABLES).toContain('conversations')
    expect(REQUIRED_TABLES).toContain('messages')
    expect(REQUIRED_TABLES).toContain('reports')
    expect(REQUIRED_TABLES).toContain('ai_analyses')
    expect(REQUIRED_TABLES).toContain('skills')
    expect(REQUIRED_TABLES).toContain('module_skills')
  })

  it('落盘库实际表清单 = ALL_TABLES（16 + dsr_daily/dsr_180d/product_images/qa_runs，共 20）', () => {
    const { db, dir } = tempDb()
    const rows = db.raw
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name")
      .all() as Array<{ name: string }>
    const names = rows.map((r) => r.name).sort()
    expect(names).toEqual([...ALL_TABLES].sort())
    expect(names).toHaveLength(21)
    expect(EXTRA_TABLES).toEqual(['dsr_daily', 'dsr_180d', 'product_images', 'qa_runs', 'calculator_runs'])
    db.close()
  })

  it('关键表列/类型/约束符合口径（金额=分 INTEGER、日期 TEXT、唯一约束）', () => {
    const { db, dir } = tempDb()
    const cols = (t: string): Array<{ name: string; type: string; notnull: number; pk: number }> =>
      db.raw.prepare(`PRAGMA table_info(${t})`).all() as Array<{ name: string; type: string; notnull: number; pk: number }>

    const dm = cols('daily_metrics')
    expect(dm.find((c) => c.name === 'pay_amount_fen')?.type).toBe('INTEGER')
    expect(dm.find((c) => c.name === 'date')?.type).toBe('TEXT')
    expect(dm.filter((c) => c.pk).map((c) => c.name).sort()).toEqual(['date', 'shop_id'])

    const ro = cols('refund_orders')
    expect(ro.find((c) => c.name === 'refund_amount_fen')?.type).toBe('INTEGER')
    expect(ro.find((c) => c.name === 'payment_time')?.type).toBe('TEXT')
    expect(ro.find((c) => c.name === 'refund_no')?.notnull).toBe(1)

    const sk = cols('search_keywords')
    expect(sk.find((c) => c.name === 'pay_rate')?.type).toBe('REAL')

    const cs = cols('cs_daily')
    expect(cs.find((c) => c.name === 'avg_response_seconds')?.type).toBe('REAL')
    expect(cs.find((c) => c.name === 'inquiry_final_pay_amount_fen')?.type).toBe('INTEGER')
    db.close()
  })

  it('索引齐备（退款 10 万行查询路径：店铺+时间/商品/订单）', () => {
    const { db, dir } = tempDb()
    const idx = db.raw
      .prepare("SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='refund_orders'")
      .all() as Array<{ name: string }>
    const names = idx.map((i) => i.name)
    expect(names).toContain('idx_refund_orders_shop_time')
    expect(names).toContain('idx_refund_orders_product')
    expect(names).toContain('idx_refund_orders_order')
    db.close()
  })

  it('WAL 模式 + 外键开启 + 完整性 ok + user_version = SCHEMA_VERSION', () => {
    const { db, dir } = tempDb()
    expect(db.raw.pragma('journal_mode', { simple: true })).toBe('wal')
    expect(db.raw.pragma('foreign_keys', { simple: true })).toBe(1)
    expect(db.integrityCheck()).toBe('ok')
    expect(db.userVersion()).toBe(SCHEMA_VERSION)
    db.close()
  })

  it('docs/schema.md 数据字典覆盖全部 21 张表', () => {
    const doc = readFileSync(join(__dirname, '../docs/schema.md'), 'utf-8')
    for (const t of ALL_TABLES) {
      expect(doc).toContain(`## ${t}`)
    }
  })
})
