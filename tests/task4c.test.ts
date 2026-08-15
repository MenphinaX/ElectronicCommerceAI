// 任务 4C：看板验收缺陷回归（商品卡每日数据字面 HTML + 客服绩效子行过滤根因）
import { describe, expect, it } from 'vitest'
import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { AppDatabase } from '../src/main/db/database'
import { upsertShop } from '../src/main/db/repo'
import { csBlock, csDates } from '../src/main/db/dashboard'
import { loadFixtures } from './helpers/load-fixtures'
import { csGroups } from '../src/renderer/src/utils/cs-utils'

function freshDb(): AppDatabase {
  const dir = mkdtempSync(join(tmpdir(), 'ecai-4c-'))
  const db = new AppDatabase(join(dir, 'dash.db'))
  db.init()
  return db
}

function loadCs(db: AppDatabase, shopId: number): void {
  const fx = loadFixtures(shopId)
  for (const r of fx.csDaily) db.raw.prepare('INSERT INTO cs_daily VALUES (@shopId,@date,@staffName,@inquiryFinalPayCount,@inquiryCount,@inquiryFinalPayRate,@firstResponseSeconds,@avgResponseSeconds,@satisfactionRate,@replyRate,@inquiryFinalPayAmountFen,@refundAmountFen)').run({ ...r })
}

const CS_FROM = '2026-08-07'
const CS_TO = '2026-08-13'

describe('任务4C：客服绩效父行子行', () => {
  it('csBlock 每行带 date 列（真实库 cs_daily 8 条，前端按日期过滤的根因）', () => {
    const db = freshDb()
    const shopId = upsertShop(db, { name: '佰泰康车品旗舰店' })
    loadCs(db, shopId)
    const rows = csBlock(db, shopId, CS_FROM, CS_TO)
    expect(rows).toHaveLength(8)
    for (const r of rows) expect(String(r.date ?? '')).toBe('2026-08-09')
    expect(csDates(db, shopId, CS_FROM, CS_TO)).toEqual(['2026-08-09'])
    db.close()
  })

  it('csGroups：带 date 的行按日期归组，父行展开得 8 明细 + 全店合计（真实 fixture 形状）', () => {
    const db = freshDb()
    const shopId = upsertShop(db, { name: '佰泰康车品旗舰店' })
    loadCs(db, shopId)
    const staff = csBlock(db, shopId, CS_FROM, CS_TO)
    const groups = csGroups(['2026-08-09'], staff)
    expect(groups).toHaveLength(1)
    const g = groups[0]
    expect(g.date).toBe('2026-08-09')
    expect(g.list).toHaveLength(8)
    expect(g.list[0].name).toBe('孙春莲')
    expect(g.list[0].pay).toBe(12)
    expect(g.list[0].date).toBe('2026-08-09')
    expect(g.tot.ask).toBe(84)
    expect(g.tot.pay).toBe(25)
    expect(g.tot.amt).toBe(8560)
    expect(g.tot.refund).toBe(3462.75)
    db.close()
  })

  it('csGroups：缺 date 列的行（修复前形状）归组后子行为空——印证用户症状', () => {
    const db = freshDb()
    const shopId = upsertShop(db, { name: '佰泰康车品旗舰店' })
    loadCs(db, shopId)
    const staff = csBlock(db, shopId, CS_FROM, CS_TO).map((r) => {
      const copy = { ...r }
      delete copy.date
      return copy
    })
    const groups = csGroups(['2026-08-09'], staff)
    expect(groups[0].list).toHaveLength(0)
    expect(groups[0].bench).toHaveLength(0)
    db.close()
  })

  it('csGroups：同行行进 bench 不进 list（蓝本同行对比行逻辑，数据存在时渲染）', () => {
    const rows = [
      { date: '2026-08-09', staffName: '孙春莲', inquiryCount: 21, inquiryFinalPayCount: 12, inquiryFinalPayAmountFen: 516900, refundAmountFen: 184100 },
      { date: '2026-08-09', staffName: '同行同层均值', inquiryCount: 100, inquiryFinalPayCount: 50, inquiryFinalPayAmountFen: 2000000, refundAmountFen: 0 }
    ]
    const groups = csGroups(['2026-08-09'], rows)
    expect(groups[0].list).toHaveLength(1)
    expect(groups[0].bench).toHaveLength(1)
    expect(groups[0].bench[0].name).toBe('同行同层均值')
    expect(groups[0].bench[0].date).toBe('2026-08-09')
  })
})

describe('任务4C：商品卡每日数据空白格', () => {
  it('BpProducts.vue 不再含字面 HTML 片段（<span class="na">）', () => {
    const src = readFileSync(join(__dirname, '..', 'src', 'renderer', 'src', 'components', 'dashboard', 'bp', 'BpProducts.vue'), 'utf8')
    expect(src).not.toContain('<span class="na">')
  })
})