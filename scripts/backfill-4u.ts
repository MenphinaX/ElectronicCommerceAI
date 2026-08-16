// 任务 4U 数据回填：promo_daily 存量三列按领导口径改直接成交（直接成交金额/直接成交笔数/点击转化率）
// 模板：C:\Users\Administrator\Desktop\模板\商品报表_8月11.csv（GBK，75 列）；按 日期+主体ID 匹配 promo_daily 已有行
// 跑前自动备份 %APPDATA%\EC AI\backups\pre-4u-backfill；幂等（重复跑结果一致）
import Database from 'better-sqlite3'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import * as XLSX from 'xlsx'
import { fenFromYuan, intValue, normalizeDate, percentToDecimal } from '../src/main/db/units'

export interface PromoDirectRow {
  date: string
  adEntityId: string
  payAmountFen: number
  salesCount: number
  payRate: number | null
}

/** 解析模板 商品报表 CSV（GBK 已解码文本）：只取 日期/主体ID/直接成交金额/直接成交笔数/点击转化率 */
export function parsePromoDirectCsv(csvText: string): PromoDirectRow[] {
  const ws = XLSX.read(csvText, { type: 'string' }).Sheets.Sheet1
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: '' }) as Array<Array<string | number>>
  const header = (rows[0] ?? []).map((h) => String(h).trim())
  const pick = (name: string): number => {
    const i = header.indexOf(name)
    if (i < 0) throw new Error('缺列：' + name)
    return i
  }
  const col = { date: pick('日期'), id: pick('主体ID'), pay: pick('直接成交金额'), sales: pick('直接成交笔数'), rate: pick('点击转化率') }
  const out: PromoDirectRow[] = []
  for (const r of rows.slice(1)) {
    const date = normalizeDate(r[col.date])
    const id = String(r[col.id] ?? '').trim()
    if (!date || !id) continue
    out.push({ date, adEntityId: id, payAmountFen: fenFromYuan(r[col.pay]), salesCount: intValue(r[col.sales]), payRate: percentToDecimal(r[col.rate]) })
  }
  return out
}

/** 回填（幂等）：按 日期+主体ID 匹配 promo_daily 已有行，UPDATE 直接口径三列 */
export function applyPromoBackfill(db: Database.Database, rows: PromoDirectRow[]): { updated: number; missing: number } {
  const upd = db.prepare('UPDATE promo_daily SET pay_amount_fen=@pay, sales_count=@sc, pay_rate=@rate WHERE date=@d AND ad_entity_id=@id')
  let updated = 0
  let missing = 0
  for (const r of rows) {
    const res = upd.run({ d: r.date, id: r.adEntityId, pay: r.payAmountFen, sc: r.salesCount, rate: r.payRate })
    if (res.changes > 0) updated++
    else missing++
  }
  return { updated, missing }
}

export function backfillDbPath(): string {
  return path.join(process.env.APPDATA || '', 'EC AI', 'ecai.db')
}

function main(): void {
  const dbPath = backfillDbPath()
  const backupDir = path.join(process.env.APPDATA || '', 'EC AI', 'backups', 'pre-4u-backfill')
  fs.mkdirSync(backupDir, { recursive: true })
  for (const suffix of ['', '-wal', '-shm']) {
    const f = dbPath + suffix
    if (fs.existsSync(f)) fs.copyFileSync(f, path.join(backupDir, 'ecai.db' + suffix))
  }
  console.log('backup ->', backupDir)

  const tplPath = process.env.EC_AI_TEMPLATE_DIR
    ? path.join(process.env.EC_AI_TEMPLATE_DIR, '商品报表_8月11.csv')
    : 'C:\\Users\\Administrator\\Desktop\\模板\\商品报表_8月11.csv'
  const csvText = new TextDecoder('gbk').decode(fs.readFileSync(tplPath))
  const rows = parsePromoDirectCsv(csvText)
  console.log('模板直接口径行数:', rows.length)

  const db = new Database(dbPath)
  db.pragma('journal_mode = WAL')
  const { updated, missing } = applyPromoBackfill(db, rows)
  console.log('updated:', updated, 'missing:', missing)

  // 逐行比对：promo_daily 三列 vs 模板直接口径
  let matched = 0
  let mismatch = 0
  const st = db.prepare('SELECT date, ad_entity_id, pay_amount_fen, sales_count, pay_rate FROM promo_daily WHERE date=@d AND ad_entity_id=@id')
  for (const r of rows) {
    const row = st.get({ d: r.date, id: r.adEntityId }) as { pay_amount_fen: number; sales_count: number; pay_rate: number | null } | undefined
    if (row && row.pay_amount_fen === r.payAmountFen && row.sales_count === r.salesCount && row.pay_rate === r.payRate) matched++
    else mismatch++
  }
  console.log('逐行比对 matched:', matched, 'mismatch:', mismatch)
  db.close()
}

const isMain = typeof process.argv[1] === 'string' && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (isMain) main()