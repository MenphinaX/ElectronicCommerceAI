// 任务 4W：咨询量图片横排布局 + DSR 覆盖快照兼容 + DSR 内容驱动解析（三种结构/标题日期优先/日维度缺失不阻断）
import { describe, expect, it } from 'vitest'
import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { AppDatabase } from '../src/main/db/database'
import { getImportCoverage, upsertDsr180d, upsertDsrDaily, upsertShop, type Dsr180dRow, type DsrDailyRow } from '../src/main/db/repo'
import { parseSourceFile } from '../src/main/import/parsers'
import { readSourceFile, type RawRow, type RawSheet } from '../src/main/import/reader'
import { DSR_FILE, TEMPLATE_DIR } from './helpers/load-fixtures'

const F = (name: string): string => join(TEMPLATE_DIR, name)
const BP_SEARCH_ZX = join(process.cwd(), 'src/renderer/src/components/dashboard/bp/BpSearchZx.vue')

function sheet(rows: RawRow[]): RawSheet {
  return { rows, encoding: 'xlsx' }
}

/** AI 生成 5 行结构（真实文件 12/13/14 同构）：标题+表头+3 数据行，无日维度 */
function aiFiveRows(): RawRow[] {
  return [
    ['店铺180天DSR（统计日期：2026-08-14）', '', '', '', '', '', ''],
    ['指标名称', '得分', '趋势提示', '行业均值', '与行业对比', '目标值', '距目标值相差（笔5分评价订单）'],
    ['近180天宝贝与描述相符DSR', 4.78, '↓ 表现下降，积极提升', 4.79, '低于行业0.22%', 4.79, 48],
    ['近180天服务态度DSR', 4.81, '↓ 表现下降，积极提升', 4.83, '低于行业0.49%', 4.83, 133],
    ['近180天物流质量DSR', 4.85, '↓ 表现下降，重点关注', 4.85, '高于行业0.19%', 4.92, 733]
  ]
}

/** 自造「标题 2 行 + 表头第 3 行 + 数据多行 + 无日维度」 */
function shiftedMultiRows(): RawRow[] {
  return [
    ['店铺180天 DSR 报表'],
    ['导出说明：数据来自平台后台'],
    ['指标', '得分', '行业均值', '趋势'],
    ['近180天宝贝与描述相符DSR', 4.7, 4.75, '↑'],
    ['近180天服务态度DSR', 4.8, 4.82, '→'],
    ['近180天物流质量DSR', 4.9, 4.88, '↑'],
    ['近180天宝贝与描述相符DSR（复检）', 4.71, 4.75, '→']
  ]
}

function freshDb(): AppDatabase {
  const dir = mkdtempSync(join(tmpdir(), 'ecai-4w-'))
  const db = new AppDatabase(join(dir, '4w.db'))
  db.init()
  return db
}

function dsrRows(p: ReturnType<typeof parseSourceFile>): { daily: DsrDailyRow[]; d180: Dsr180dRow[] } {
  if (p.rows.target !== 'dsr') throw new Error('unexpected rows target: ' + p.rows.target)
  return p.rows.rows
}

// ---------- parseDsr 内容驱动：三种结构 ----------
describe('4W parseDsr 内容驱动：三种结构均解析且 180 天三指标入库', () => {
  it('标准 08-11 模板（180 天+日维度+商品维度）：ok、d180=3、daily=1、快照 08-11', () => {
    const p = parseSourceFile(F(DSR_FILE), readSourceFile(F(DSR_FILE)), 'dsr')
    expect(p.ok).toBe(true)
    const { daily, d180 } = dsrRows(p)
    expect(d180).toHaveLength(3)
    expect(d180.map((r) => r.indicator)).toEqual([
      '近180天宝贝与描述相符DSR', '近180天服务态度DSR', '近180天物流质量DSR'
    ])
    expect(d180.every((r) => r.snapshotDate === '2026-08-11')).toBe(true)
    expect(d180.map((r) => r.score)).toEqual([4.78, 4.81, 4.85])
    expect(daily).toHaveLength(1)
    expect((daily[0] as { date: string }).date).toBe('2026-08-11')
    expect(p.warnings ?? []).toHaveLength(0)
  })

  it('AI 5 行结构（12/13/14 同构）：ok、d180=3、快照 08-14 标题优先、日维度缺失仅警告不阻断', () => {
    const p = parseSourceFile('C:/tmp/店铺DSR数据_2026-08-12.xlsx', sheet(aiFiveRows()), 'dsr')
    expect(p.ok).toBe(true)
    const { daily, d180 } = dsrRows(p)
    expect(d180).toHaveLength(3)
    expect(d180.map((r) => r.score)).toEqual([4.78, 4.81, 4.85])
    expect(d180.every((r) => r.snapshotDate === '2026-08-14')).toBe(true)
    expect(daily).toHaveLength(0)
    expect(p.dateStart).toBe('2026-08-14')
    expect(p.dateEnd).toBe('2026-08-14')
    expect((p.warnings ?? []).some((w) => w.message.includes('仅导入 180 天数据'))).toBe(true)
  })

  it('自造「标题 2 行+表头第 3 行+数据多行+无日维度」：ok、d180=4、快照取文件名', () => {
    const p = parseSourceFile('C:/tmp/店铺DSR数据_2026-08-13.xlsx', sheet(shiftedMultiRows()), 'dsr')
    expect(p.ok).toBe(true)
    const { d180 } = dsrRows(p)
    expect(d180).toHaveLength(4)
    expect(d180.every((r) => r.snapshotDate === '2026-08-13')).toBe(true)
  })

  it('标准模板商品维度区块不误入库：daily 仍只 1 行', () => {
    const p = parseSourceFile(F(DSR_FILE), readSourceFile(F(DSR_FILE)), 'dsr')
    const { daily } = dsrRows(p)
    expect(daily).toHaveLength(1)
  })
})

// ---------- 快照日期：标题优先 ----------
describe('4W 快照日期：表内标题优先，其次文件名', () => {
  it('标题「数据日期：2026-08-11」优先于文件名 08-12', () => {
    const rows = aiFiveRows()
    rows[0] = ['店铺180天 DSR（数据日期：2026-08-11）', '', '', '', '', '', '']
    const p = parseSourceFile('C:/tmp/店铺DSR数据_2026-08-12.xlsx', sheet(rows), 'dsr')
    expect(p.ok).toBe(true)
    const { d180 } = dsrRows(p)
    expect(d180.every((r) => r.snapshotDate === '2026-08-11')).toBe(true)
    expect(p.dateStart).toBe('2026-08-11')
  })

  it('无标题日期 → 回落文件名日期', () => {
    const rows = aiFiveRows()
    rows[0] = ['店铺180天 DSR 报表', '', '', '', '', '', '']
    const p = parseSourceFile('C:/tmp/店铺DSR数据_2026-08-12.xlsx', sheet(rows), 'dsr')
    expect(p.ok).toBe(true)
    const { d180 } = dsrRows(p)
    expect(d180.every((r) => r.snapshotDate === '2026-08-12')).toBe(true)
  })
})

// ---------- 日维度表头别名 ----------
describe('4W 日维度区块：表头别名与缺失语义', () => {
  it('日维度表头用「描述得分/物流得分/服务得分」别名（无较上日后缀）也能入库', () => {
    const rows: RawRow[] = [
      ['店铺180天DSR（统计日期：2026-08-14）'],
      ['指标', '得分', '行业均值'],
      ['近180天宝贝与描述相符DSR', 4.78, 4.79],
      ['近180天服务态度DSR', 4.81, 4.83],
      ['近180天物流质量DSR', 4.85, 4.85],
      ['店铺新增 DSR（日维度）'],
      ['日期', '描述得分', '物流得分', '服务得分'],
      ['2026-08-14', '5.00 (0.00%)', '5.00 (0.00%)', '5.00 (0.00%)']
    ]
    const p = parseSourceFile('C:/tmp/店铺DSR数据_2026-08-14.xlsx', sheet(rows), 'dsr')
    expect(p.ok).toBe(true)
    const { daily, d180 } = dsrRows(p)
    expect(d180).toHaveLength(3)
    expect(daily).toHaveLength(1)
    expect(daily[0]).toMatchObject({ date: '2026-08-14', descriptionScore: 5, logisticsScore: 5, serviceScore: 5 })
    expect((p.warnings ?? []).some((w) => w.message.includes('仅导入 180 天数据'))).toBe(false)
  })

  it('180 天表头缺失 → ok=false + header_row 问题（保留 AI 兜底链路）', () => {
    const rows: RawRow[] = [['只有标题'], ['没有任何表头'], ['一行数据']]
    const p = parseSourceFile('C:/tmp/店铺DSR数据_2026-08-14.xlsx', sheet(rows), 'dsr')
    expect(p.ok).toBe(false)
    expect(p.issues.some((i) => i.code === 'header_row' && i.message.includes('180 天区块表头'))).toBe(true)
  })
})

// ---------- 覆盖：DSR 快照兼容 ----------
describe('4W getImportCoverage：DSR 源兼容 dsr_180d 快照', () => {
  it('仅 dsr_180d 无 dsr_daily → lastDate=快照日期、rows=3、todayImported=false（T-1）', () => {
    const db = freshDb()
    const shopId = upsertShop(db, { name: 'DSR快照店' })
    for (const ind of ['描述', '服务', '物流']) {
      upsertDsr180d(db, { shopId, snapshotDate: '2026-08-14', indicator: `近180天${ind}DSR`, score: 4.8 })
    }
    const cov = getImportCoverage(db, shopId, '2026-08-16')
    const by = Object.fromEntries(cov.map((r) => [r.source, r]))
    expect(by.dsr).toMatchObject({ lastDate: '2026-08-14', rows: 3, todayImported: false, coverageRange: '2026-08-14' })
    db.close()
  })

  it('仅 dsr_180d + today=08-15 → lastDate=08-14 判定已交（T-1 延迟内）', () => {
    const db = freshDb()
    const shopId = upsertShop(db, { name: 'DSR快照店2' })
    upsertDsr180d(db, { shopId, snapshotDate: '2026-08-14', indicator: '近180天服务态度DSR', score: 4.8 })
    const cov = getImportCoverage(db, shopId, '2026-08-15')
    const by = Object.fromEntries(cov.map((r) => [r.source, r]))
    expect(by.dsr).toMatchObject({ lastDate: '2026-08-14', rows: 1, todayImported: true })
    db.close()
  })

  it('dsr_daily 08-11 + dsr_180d 08-14 → lastDate=08-14、rows=两表和、区间 08-11~08-14', () => {
    const db = freshDb()
    const shopId = upsertShop(db, { name: 'DSR合店' })
    upsertDsrDaily(db, { shopId, date: '2026-08-11', descriptionScore: 5 })
    upsertDsr180d(db, { shopId, snapshotDate: '2026-08-14', indicator: '近180天物流质量DSR', score: 4.85 })
    const cov = getImportCoverage(db, shopId, '2026-08-16')
    const by = Object.fromEntries(cov.map((r) => [r.source, r]))
    expect(by.dsr).toMatchObject({ lastDate: '2026-08-14', rows: 2, coverageRange: '2026-08-11~2026-08-14' })
    db.close()
  })
})

// ---------- 咨询量布局（模板断言） ----------
describe('4W 咨询量「商品」单元格 flex 横排（图片前标题后）', () => {
  const template = readFileSync(BP_SEARCH_ZX, 'utf8')

  it('商品单元格为 flex 横排容器且 BpImage 在名称前', () => {
    const td = template.match(/<td style="max-width:480px;">[\s\S]*?<\/td>/)
    expect(td).not.toBeNull()
    const cell = td![0]
    expect(cell).toContain('display:flex;align-items:center;gap:8px')
    expect(cell).toContain('<BpImage :product-id="s.pid" :size="40" />')
    const imgAt = cell.indexOf('<BpImage')
    const nameAt = cell.indexOf('{{ s.name }}')
    expect(imgAt).toBeGreaterThanOrEqual(0)
    expect(nameAt).toBeGreaterThan(imgAt)
  })

  it('省略号样式移到名称 span（td 不再承担截断）', () => {
    const td = template.match(/<td style="max-width:480px;">[\s\S]*?<\/td>/)
    expect(td).not.toBeNull()
    const cell = td![0]
    expect(cell).toContain('<span class="zx-prod-name" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">{{ s.name }}</span>')
    expect(cell.startsWith('<td style="max-width:480px;">')).toBe(true)
  })

  it('搜索词表格不动（关键词行无 BpImage）', () => {
    const kwRow = template.match(/<tr v-for="\(s, i\) in bp\.keywords\.value"[\s\S]*?<\/tr>/)
    expect(kwRow).not.toBeNull()
    expect(kwRow![0]).not.toContain('BpImage')
  })
})
