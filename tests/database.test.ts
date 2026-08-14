import { describe, expect, it } from 'vitest'
import { existsSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { AppDatabase } from '../src/main/db/database'
import { SCHEMA_VERSION } from '../src/main/db/schema'

describe('建库幂等 + 可迁移', () => {
  it('同一路径连续 init 两次：第二次不报错、版本不变、表结构不变', () => {
    const dir = mkdtempSync(join(tmpdir(), 'ecai-init-'))
    const p = join(dir, 'idem.db')

    const db1 = new AppDatabase(p)
    expect(() => db1.init()).not.toThrow()
    expect(db1.userVersion()).toBe(SCHEMA_VERSION)
    const counts1 = db1.rowCounts()
    db1.close()

    const db2 = new AppDatabase(p)
    expect(() => db2.init()).not.toThrow()
    expect(db2.userVersion()).toBe(SCHEMA_VERSION)
    expect(db2.rowCounts()).toEqual(counts1)
    expect(db2.integrityCheck()).toBe('ok')
    db2.close()
  })

  it('迁移到最新版本并落盘真实文件（非内存库）', () => {
    const dir = mkdtempSync(join(tmpdir(), 'ecai-file-'))
    const p = join(dir, 'real.db')
    const db = new AppDatabase(p)
    db.init()
    expect(existsSync(p)).toBe(true)
    expect(join(dir, 'real.db').length).toBeGreaterThan(0)
    db.close()
  })
})
