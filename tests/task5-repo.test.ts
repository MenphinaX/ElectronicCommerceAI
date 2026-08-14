// 任务 5 仓库层测试：models 默认标记/CRUD、模块绑定替换语义、技能删除级联（TDD 先写测试）
import { describe, expect, it } from 'vitest'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { AppDatabase } from '../src/main/db/database'
import {
  bindModuleSkill, createModel, deleteModel, deleteSkill, getDefaultModelId, listModels,
  listModuleBindings, setDefaultModel, setModuleSkill, unbindModuleSkill, updateModel,
  upsertSkill
} from '../src/main/db/repo'
import { SCHEMA_VERSION } from '../src/main/db/schema'

function freshDb(): AppDatabase {
  const dir = mkdtempSync(join(tmpdir(), 'ecai-task5-'))
  const db = new AppDatabase(join(dir, 'repo.db'))
  db.init()
  return db
}

describe('任务 5：models 默认标记与 CRUD', () => {
  it('schema v5：models 表含 is_default 列且版本号=SCHEMA_VERSION', () => {
    const db = freshDb()
    expect(db.userVersion()).toBe(SCHEMA_VERSION)
    const cols = db.raw.prepare('PRAGMA table_info(models)').all() as Array<{ name: string }>
    expect(cols.some((c) => c.name === 'is_default')).toBe(true)
    db.close()
  })

  it('createModel/listModels/updateModel/deleteModel 闭环', () => {
    const db = freshDb()
    const id = createModel(db, { name: 'deepseek-chat', provider: 'deepseek', baseUrl: 'https://api.deepseek.com/v1', apiKeyEnc: 'ZW5jOjEyMzQ=', enabled: true })
    expect(id).toBeGreaterThan(0)
    let rows = listModels(db) as Array<Record<string, unknown>>
    expect(rows).toHaveLength(1)
    expect(rows[0].name).toBe('deepseek-chat')
    expect(rows[0].apiKeyEnc).toBe('ZW5jOjEyMzQ=')
    expect(rows[0].isDefault).toBe(0)

    updateModel(db, id, { name: 'deepseek-v4', baseUrl: 'https://api.deepseek.com/v2' })
    rows = listModels(db)
    expect(rows[0].name).toBe('deepseek-v4')
    expect(rows[0].baseUrl).toBe('https://api.deepseek.com/v2')

    expect(deleteModel(db, id)).toBe(true)
    expect(listModels(db)).toHaveLength(0)
    expect(deleteModel(db, id)).toBe(false)
    db.close()
  })

  it('setDefaultModel 互斥：设 B 后 A 自动清除，设 null 全清', () => {
    const db = freshDb()
    const a = createModel(db, { name: 'A', baseUrl: 'http://a', apiKeyEnc: 'x' })
    const b = createModel(db, { name: 'B', baseUrl: 'http://b', apiKeyEnc: 'y' })
    setDefaultModel(db, a)
    expect(getDefaultModelId(db)).toBe(a)
    setDefaultModel(db, b)
    expect(getDefaultModelId(db)).toBe(b)
    const rows = listModels(db) as Array<{ id: number; isDefault: number }>
    expect(rows.find((r) => r.id === a)?.isDefault).toBe(0)
    expect(rows.find((r) => r.id === b)?.isDefault).toBe(1)
    setDefaultModel(db, null)
    expect(getDefaultModelId(db)).toBe(null)
    db.close()
  })
})

describe('任务 5：模块绑定替换语义与技能删除级联', () => {
  it('setModuleSkill 一个模块只保留一个绑定，支持解除', () => {
    const db = freshDb()
    const s1 = upsertSkill(db, { name: '全店A', description: 'd1', path: 'skills/全店A/SKILL.md' })
    const s2 = upsertSkill(db, { name: '全店B', description: 'd2', path: 'skills/全店B/SKILL.md' })
    bindModuleSkill(db, '全店', s1)
    setModuleSkill(db, '全店', s2)
    const rows = listModuleBindings(db)
    expect(rows.filter((r) => r.module === '全店')).toHaveLength(1)
    expect(rows[0].skillId).toBe(s2)
    setModuleSkill(db, '全店', null)
    expect(listModuleBindings(db).filter((r) => r.module === '全店')).toHaveLength(0)
    db.close()
  })

  it('deleteSkill 级联删除 module_skills 绑定', () => {
    const db = freshDb()
    const s1 = upsertSkill(db, { name: '单品A', path: 'skills/单品A/SKILL.md' })
    bindModuleSkill(db, '单品', s1)
    expect(deleteSkill(db, s1)).toBe(true)
    expect(listModuleBindings(db)).toHaveLength(0)
    expect(deleteSkill(db, s1)).toBe(false)
    db.close()
  })

  it('unbindModuleSkill 清空某模块全部绑定', () => {
    const db = freshDb()
    const s1 = upsertSkill(db, { name: 'S1', path: 'skills/S1/SKILL.md' })
    const s2 = upsertSkill(db, { name: 'S2', path: 'skills/S2/SKILL.md' })
    bindModuleSkill(db, '推广', s1)
    bindModuleSkill(db, '推广', s2)
    unbindModuleSkill(db, '推广')
    expect(listModuleBindings(db).filter((r) => r.module === '推广')).toHaveLength(0)
    db.close()
  })
})
