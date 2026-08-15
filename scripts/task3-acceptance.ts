// 任务 3 店铺+导入 验收脚本：9 文件全量导入/去重/性能/改版 LLM 兜底/无 key/人工列映射修复
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
import { listFailedImports, manualColumnRepair } from '../src/main/import/manual'
import { dailyKpi, getImport, listImportsWithShop, upsertShop } from '../src/main/db/repo'
import { CONSULT_FILE, CS_FILE, DAILY_FILE, DSR_FILE, KEYWORD_FILE, PRODUCT_DETAIL_FILE, PRODUCT_REPORT_FILE, PROMO_FILE, REFUND_FILE, SHOP_NAME, TEMPLATE_DIR } from '../tests/helpers/load-fixtures'

XLSX.set_fs(await import('node:fs'))

const F = (name: string): string => join(TEMPLATE_DIR, name)
const NINE = [CONSULT_FILE, KEYWORD_FILE, PRODUCT_REPORT_FILE, PRODUCT_DETAIL_FILE, PROMO_FILE, DAILY_FILE, DSR_FILE, CS_FILE, REFUND_FILE]

function freshEnv(): { db: AppDatabase; shopId: number; archiveDir: string } {
  const dir = mkdtempSync(join(tmpdir(), 'ecai-task3-'))
  const db = new AppDatabase(join(dir, 'task3.db'))
  db.init()
  const shopId = upsertShop(db, { name: SHOP_NAME, platform: '天猫' })
  return { db, shopId, archiveDir: join(dir, 'archives') }
}

/** 读本机 Codex auth 的 key，搭真实 OpenAI 兼容端点（本地中转 127.0.0.1:57321） */
function envModel(): ModelConfig | null {
  const baseUrl = process.env.EC_AI_LLM_BASE_URL
  const apiKey = process.env.EC_AI_LLM_API_KEY
  const model = process.env.EC_AI_LLM_MODEL
  if (baseUrl && apiKey && model) return { baseUrl, apiKey, model }
  const auth = join(process.env.USERPROFILE ?? '', '.codex', 'auth.json')
  if (existsSync(auth)) {
    try {
      const j = JSON.parse(readFileSync(auth, 'utf8')) as { OPENAI_API_KEY?: string }
      if (j.OPENAI_API_KEY) return { baseUrl: 'http://127.0.0.1:57321/v1', apiKey: j.OPENAI_API_KEY, model: 'deepseek-v4-flash' }
    } catch { return null }
  }
  return null
}

function makeKeywordShifted(): string {
  const base = readSourceFile(F(KEYWORD_FILE)).rows
  const header = base[5]
  const shifted = [...base.slice(0, 5), [], [], header, ...base.slice(6)]
  const ws = XLSX.utils.aoa_to_sheet(shifted)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Sheet1')
  const dir = mkdtempSync(join(tmpdir(), 'ecai-shift-'))
  const p = join(dir, '【生意参谋】选词助手-引流搜索词-店外-无线-改版.xls')
  XLSX.writeFile(wb, p, { bookType: 'biff8' })
  return p
}

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
  const dir = mkdtempSync(join(tmpdir(), 'ecai-ren-'))
  const p = join(dir, '退款单-改版.xlsx')
  XLSX.writeFile(wb, p)
  return p
}

function makeHeaderless(): string {
  const base = readSourceFile(F(REFUND_FILE)).rows
  const cols = base[0] ?? []
  const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('')
  const header = cols.map((_, i) => (i < letters.length ? letters[i] : `C${i}`))
  const ws = XLSX.utils.aoa_to_sheet([header, ...base.slice(1)])
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Sheet1')
  const dir = mkdtempSync(join(tmpdir(), 'ecai-hl-'))
  const p = join(dir, 'garbage.xlsx')
  XLSX.writeFile(wb, p)
  return p
}

async function main(): Promise<void> {
  console.log('=== 任务 3 店铺+导入 验收 ===')
  console.log('')

  // [1] 9 个真实模板文件逐一导入
  const { db, shopId, archiveDir } = freshEnv()
  const startedAll = Date.now()
  const results = await importFiles(db, NINE.map(F), { shopId, archiveDir })
  const totalMs = Date.now() - startedAll
  console.log(`[1] 9 个真实模板文件逐一导入（模板目录 ${TEMPLATE_DIR}）：`)
  for (const r of results) {
    console.log(`    ${r.file.padEnd(50)} 识别=${r.detectedLabel.padEnd(4)} 行数=${String(r.rows).padStart(5)} 耗时=${String(r.elapsedMs).padStart(5)}ms 状态=${r.status}`)
  }
  const okCount = results.filter((r) => r.status === 'ok').length
  const kpi = dailyKpi(db, shopId)
  console.log(`    全部 9 文件成功=${okCount === 9 ? 'PASS' : 'FAIL'}  合计耗时=${totalMs}ms  KPI 支付金额合计=${kpi.payAmountFen}分（期望 41220836 分=412,208.36 元）= ${kpi.payAmountFen === 41220836 ? 'PASS' : 'FAIL'}`)
  const counts1 = db.rowCounts()
  console.log(`    落库行数：daily_metrics=${counts1.daily_metrics} refund_orders=${counts1.refund_orders} promo_daily=${counts1.promo_daily} product_daily=${counts1.product_daily} cs_daily=${counts1.cs_daily} search_keywords=${counts1.search_keywords} dsr_180d=${counts1.dsr_180d} dsr_daily=${counts1.dsr_daily}`)
  console.log('')

  // [2] 同一文件重复导入 → 去重
  const second = await importFiles(db, NINE.map(F), { shopId, archiveDir })
  const allSkipped = second.every((r) => r.status === 'skipped')
  const counts2 = db.rowCounts()
  const rowsSame = JSON.stringify(counts1) === JSON.stringify(counts2)
  const okRows = listImportsWithShop(db).filter((h) => h.status === 'ok')
  console.log(`[2] 同一批 9 文件再次导入：全部 skipped=${allSkipped ? 'PASS' : 'FAIL'}  各表行数与首次一致=${rowsSame ? 'PASS' : 'FAIL'}（imports 表 ok 记录仍为 ${okRows.length} 条，不翻倍）`)
  console.log('')

  // [3] 性能：退款单 2096 行
  const refundStart = Date.now()
  const refundRows = db.raw.prepare('SELECT COUNT(*) n FROM refund_orders').get() as { n: number }
  const refundMs = Date.now() - refundStart
  const r2096 = results.find((r) => r.detectedLabel === '退款')
  console.log(`[3] 退款单导入行数=${refundRows.n}，单文件耗时=${r2096?.elapsedMs ?? '-'}ms（要求 1000 行 < 3 秒，2096 行=${r2096 && r2096.elapsedMs < 3000 ? 'PASS' : 'FAIL'}）`)
  console.log('')

  // [4] 改版文件：本地失败 → LLM 兜底落库（真实模型）
  const model = envModel()
  if (model) {
    const kw = makeKeywordShifted()
    const kwRaw = readSourceFile(kw)
    const kwDet = detectType(kw, kwRaw)
    const kwLocal = parseSourceFile(kw, kwRaw, kwDet!.type)
    console.log(`[4a] 搜索词表头挪到第 8 行：本地识别=${kwDet?.reason ?? '?'}，本地解析=${kwLocal.ok ? '成功' : '失败'}`)
    const kwBefore = db.rowCounts().search_keywords
    const [kwRes] = await importFiles(db, [kw], { shopId, archiveDir, allowFallback: true, modelConfig: model })
    const kwAfter = db.rowCounts().search_keywords
    console.log(`      LLM 兜底导入：状态=${kwRes.status} 兜底=${kwRes.fallbackUsed ? '列映射' : '未用'} 行数=${kwRes.rows} 耗时=${kwRes.elapsedMs}ms  库内 search_keywords ${kwBefore} → ${kwAfter} = ${!kwLocal.ok && kwRes.status === 'ok' && kwAfter === 133 ? 'PASS' : 'FAIL'}`)

    const rf = makeRefundRenamed()
    const rfRaw = readSourceFile(rf)
    const rfDet = detectType(rf, rfRaw)
    const rfLocal = parseSourceFile(rf, rfRaw, rfDet!.type)
    console.log(`[4b] 退款单 2 列改名（订单编号→订单号、退款总额→退款金额）：本地识别=${rfDet?.reason ?? '?'}，本地解析=${rfLocal.ok ? '成功' : '失败'}`)
    const rfBefore = db.rowCounts().refund_orders
    const [rfRes] = await importFiles(db, [rf], { shopId, archiveDir, allowFallback: true, modelConfig: model })
    const rfAfter = db.rowCounts().refund_orders
    const sum = db.raw.prepare('SELECT SUM(refund_amount_fen) s FROM refund_orders').get() as { s: number }
    console.log(`      LLM 兜底导入：状态=${rfRes.status} 兜底=${rfRes.fallbackUsed ? '列映射' : '未用'} 行数=${rfRes.rows} 耗时=${rfRes.elapsedMs}ms  库内 refund_orders ${rfBefore} → ${rfAfter} = ${!rfLocal.ok && rfRes.status === 'ok' && rfAfter === 2096 && sum.s === 40219806 ? 'PASS' : 'FAIL'}（退款总额合计 ${sum.s} 分，期望 40219806）`)
  } else {
    console.log('[4] 未读取到模型配置，跳过 LLM 兜底实测（验收脚本建议设 EC_AI_LLM_BASE_URL/API_KEY/MODEL）')
  }
  console.log('')

  // [5] 无 key：兜底不崩且有明确提示
  const kw2 = makeKeywordShifted()
  const kw2Raw = readSourceFile(kw2)
  const kw2Det = detectType(kw2, kw2Raw)
  const kw2Local = parseSourceFile(kw2, kw2Raw, kw2Det!.type)
  const noKeyRes = await runFallback(db, kw2, kw2Raw, kw2Det!.type, null, kw2Local.issues)
  console.log(`[5] 无 key 时 runFallback：ok=${noKeyRes.ok} 原因=${noKeyRes.reason ?? '-'}（不崩且明确提示 = ${!noKeyRes.ok && (noKeyRes.reason ?? '').includes('未配置') ? 'PASS' : 'FAIL'}），search_keywords 未变化=${db.rowCounts().search_keywords === 133 ? 'PASS' : 'FAIL'}`)
  console.log('')

  // [6] 人工处理中心：表头彻底找不到 → 列映射修复 → 状态=人工修正 + fix_log
  const hl = makeHeaderless()
  const [hlRes] = await importFiles(db, [hl], { shopId, archiveDir })
  console.log(`[6] 表头彻底找不到文件：导入状态=${hlRes.status} 识别类型=${hlRes.detectedType ?? 'null'}（预期 failed + 无法识别）`)
  const failed = listFailedImports(db)
  const failedRec = failed[0]
  console.log(`      failed 清单：${failedRec ? `id=${failedRec.id} ${failedRec.sourceFile} note=${failedRec.note ?? '-'}` : '空'}`)
  const realHeader = readSourceFile(F(REFUND_FILE)).rows[0] ?? []
  const fieldByName: Record<string, string> = {
    订单编号: 'orderNo', 退款编号: 'refundNo', 订单付款时间: 'paymentTime', 退款完结时间: 'refundFinishTime',
    买家实际支付金额: 'buyerPayAmountFen', 退款总额: 'refundAmountFen', 退款状态: 'refundStatus',
    货物状态: 'goodsStatus', 售后类型: 'afterSaleType', 商品id: 'productId', 宝贝标题: 'productTitle',
    退款申请时间: 'refundApplyTime', 买家退款原因: 'refundReason'
  }
  const mapping: Record<string, string> = {}
  realHeader.forEach((h, i) => {
    const field = fieldByName[String(h).trim()]
    if (field) mapping[i < 26 ? String.fromCharCode(65 + i) : `C${i}`] = field
  })
  const repair = manualColumnRepair(db, failedRec!.id, { headerRow: 1, mapping, type: 'refund' })
  const rec = getImport(db, failedRec!.id)
  console.log(`      列映射修复：${repair.ok ? 'PASS' : 'FAIL'} message=${repair.message}`)
  console.log(`      imports 记录：状态=${rec?.status}（期望 manual=人工修正） fix_log=${rec?.fixLog ?? '-'}`)
  const refundAfterFix = db.raw.prepare('SELECT COUNT(*) n FROM refund_orders').get() as { n: number }
  console.log(`      修复后 refund_orders=${refundAfterFix.n} = ${repair.ok && rec?.status === 'manual' && refundAfterFix.n === 2096 ? 'PASS' : 'FAIL'}`)
  console.log('')

  console.log('=== 验收结束 ===')
  db.close()
}

void main()