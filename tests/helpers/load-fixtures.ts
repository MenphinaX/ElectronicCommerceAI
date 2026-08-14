// 任务 2 夹具：用 9 个真实模板文件解析出插入行（真实数据，禁止造假）
import fs from 'node:fs'
import path from 'node:path'
import * as XLSX from 'xlsx'
import { fenFromYuan, intValue, leadingNumber, normalizeDate, percentToDecimal } from '../../src/main/db/units'
import type {
  CsDailyRow, DailyMetricRow, Dsr180dRow, DsrDailyRow, ProductDailyRow,
  PromoDailyRow, RefundOrderRow, SearchKeywordRow
} from '../../src/main/db/repo'

XLSX.set_fs(fs)

export const TEMPLATE_DIR: string = process.env.EC_AI_TEMPLATE_DIR ?? ''

// 含店名的模板文件名不确定（平台导出按店铺命名），按前缀在模板目录动态查找；无模板目录时给占位名（读取时报错提示需设置 EC_AI_TEMPLATE_DIR）
export function findTemplateFile(prefix: string, suffix: string): string {
  if (!TEMPLATE_DIR) return `${prefix}${suffix}`
  for (const f of fs.readdirSync(TEMPLATE_DIR)) {
    if (f.startsWith(prefix) && f.endsWith(suffix)) return f
  }
  throw new Error(`模板目录 ${TEMPLATE_DIR} 中找不到 ${prefix}*${suffix}，请确认 EC_AI_TEMPLATE_DIR 指向真实模板目录`)
}

export const CONSULT_FILE = '2026-08-11.csv'
export const KEYWORD_FILE = '【生意参谋】选词助手-引流搜索词-店外-无线-20260811.xls'
export const PRODUCT_REPORT_FILE = '【生意参谋平台】商品_全部_2026-08-11_2026-08-11.xls'
export const PRODUCT_DETAIL_FILE = findTemplateFile('商品总览_天猫_', '.xlsx')
export const PROMO_FILE = '商品报表_8月11.csv'
export const DAILY_FILE = findTemplateFile('经营数据_天猫_', '.xlsx')
export const DSR_FILE = '店铺DSR数据_2026-08-11.xlsx'
export const CS_FILE = '自制报表-报表查看-客服绩效_20260809_20260809_全部.xlsx'
export const REFUND_FILE = '退款单.xlsx'

export const SHOP_NAME = 'XX旗舰店'
export const CS_DATE = '2026-08-09' // 客服文件名为 20260809
export const DSR_DATE = '2026-08-11'

export interface Fixtures {
  shopName: string
  platform: string
  dailyMetrics: DailyMetricRow[]
  refundOrders: RefundOrderRow[]
  promoDaily: PromoDailyRow[]
  productDaily: ProductDailyRow[]
  csDaily: CsDailyRow[]
  searchKeywords: SearchKeywordRow[]
  dsrDaily: DsrDailyRow[]
  dsr180d: Dsr180dRow[]
}

function rowsFromCsv(file: string, encoding: string): Array<Array<string | number | null>> {
  const buf = fs.readFileSync(file)
  const dec = new TextDecoder(encoding, { fatal: true })
  const text = dec.decode(buf)
  const ws = XLSX.read(text, { type: 'string' }).Sheets.Sheet1
  return XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: '' }) as Array<Array<string | number | null>>
}

function rowsFromBook(file: string): Array<Array<string | number | null>> {
  const wb = XLSX.readFile(file)
  const ws = wb.Sheets[wb.SheetNames[0]]
  return XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: '' }) as Array<Array<string | number | null>>
}

function pick(header: string[], need: Record<string, string>): Record<string, number> {
  const out: Record<string, number> = {}
  for (const [key, name] of Object.entries(need)) {
    const i = header.indexOf(name)
    if (i < 0) throw new Error(`缺列：${name}（实际表头 ${header.length} 列）`)
    out[key] = i
  }
  return out
}

export function loadFixtures(shopId = 1, tpl = TEMPLATE_DIR): Fixtures {
  // ---------- 经营 xlsx → daily_metrics（31 天） ----------
  const dailyRows = rowsFromBook(path.join(tpl, DAILY_FILE))
  const dH = pick(dailyRows[0] as string[], {
    date: '日期', pay: '支付金额(支付)', net: '净销售额(支付)', profit: '利润(支付预估)',
    visitors: '访客数', sales: '销售单数(支付)', refund: '退款金额', promo: '推广花费(支付预估)', rate: '支付转化率'
  })
  const dailyMetrics: DailyMetricRow[] = []
  for (const r of dailyRows.slice(2)) {
    const date = normalizeDate(r[dH.date])
    if (!date) continue
    dailyMetrics.push({
      shopId, date,
      payAmountFen: fenFromYuan(r[dH.pay]),
      netSalesFen: fenFromYuan(r[dH.net]),
      profitFen: fenFromYuan(r[dH.profit]),
      visitors: intValue(r[dH.visitors]), salesCount: intValue(r[dH.sales]),
      refundAmountFen: fenFromYuan(r[dH.refund]),
      promoCostFen: fenFromYuan(r[dH.promo]),
      payRate: percentToDecimal(r[dH.rate])
    })
  }

  // ---------- 退款单 xlsx → refund_orders（2096 行） ----------
  const refundRows = rowsFromBook(path.join(tpl, REFUND_FILE))
  const rH = pick(refundRows[0] as string[], {
    order: '订单编号', refund: '退款编号', amount: '退款总额', buyerPay: '买家实际支付金额',
    status: '退款状态', goods: '货物状态', afterSale: '售后类型', product: '商品id',
    title: '宝贝标题', payTime: '订单付款时间', finishTime: '退款完结时间',
    applyTime: '退款申请时间', reason: '买家退款原因'
  })
  const refundOrders: RefundOrderRow[] = []
  for (const r of refundRows.slice(1)) {
    if (!String(r[rH.order] ?? '').trim()) continue
    refundOrders.push({
      shopId, orderNo: String(r[rH.order]).trim(), refundNo: String(r[rH.refund]).trim(),
      productId: r[rH.product] ? String(r[rH.product]).trim() : null,
      productTitle: r[rH.title] ? String(r[rH.title]).trim() : null,
      refundAmountFen: fenFromYuan(r[rH.amount]),
      buyerPayAmountFen: fenFromYuan(r[rH.buyerPay]),
      refundStatus: r[rH.status] ? String(r[rH.status]).trim() : null,
      goodsStatus: r[rH.goods] ? String(r[rH.goods]).trim() : null,
      afterSaleType: r[rH.afterSale] ? String(r[rH.afterSale]).trim() : null,
      paymentTime: r[rH.payTime] ? String(r[rH.payTime]).trim() : null,
      refundFinishTime: r[rH.finishTime] ? String(r[rH.finishTime]).trim() : null,
      refundApplyTime: r[rH.applyTime] ? String(r[rH.applyTime]).trim() : null,
      refundReason: r[rH.reason] ? String(r[rH.reason]).trim() : null
    })
  }

  // ---------- 推广 csv(gbk) → promo_daily（113 行，日期序列号转 YYYY-MM-DD） ----------
  const promoRows = rowsFromCsv(path.join(tpl, PROMO_FILE), 'gbk')
  const pH = pick(promoRows[0] as string[], {
    date: '日期', id: '主体ID', name: '主体名称', imp: '展现量', click: '点击量',
    cost: '花费', ctr: '点击率', roas: '投入产出比',
    pay: '总成交金额', sales: '总成交笔数', payRate: '点击转化率'
  })
  const promoDaily: PromoDailyRow[] = []
  for (const r of promoRows.slice(1)) {
    const date = normalizeDate(r[pH.date])
    if (!date) continue
    promoDaily.push({
      shopId, date, adEntityId: String(r[pH.id]).trim(),
      adEntityName: r[pH.name] ? String(r[pH.name]).trim() : null,
      impressions: intValue(r[pH.imp]), clicks: intValue(r[pH.click]),
      costFen: fenFromYuan(r[pH.cost]),
      ctr: percentToDecimal(r[pH.ctr]),
      roas: (() => { const c = r[pH.roas]; return typeof c === 'number' ? c : percentToDecimal(c) })(),
      payAmountFen: fenFromYuan(r[pH.pay]), salesCount: intValue(r[pH.sales]), payRate: percentToDecimal(r[pH.payRate])
    })
  }

  // ---------- 商品报表 xls + 商品明细 xlsx + 咨询 csv → product_daily（三源合一） ----------
  const prRows = rowsFromBook(path.join(tpl, PRODUCT_REPORT_FILE))
  const prH = pick(prRows[4] as string[], {
    date: '统计日期', id: '商品ID', name: '商品名称', visitors: '商品访客数',
    views: '商品浏览量', pay: '支付金额', rate: '商品支付转化率', refund: '成功退款金额'
  })
  const merged = new Map<string, ProductDailyRow>()
  for (const r of prRows.slice(5)) {
    const date = normalizeDate(r[prH.date])
    if (!date) continue
    const pid = String(r[prH.id]).trim()
    if (!pid) continue
    merged.set(pid, {
      shopId, productId: pid, date, productName: r[prH.name] ? String(r[prH.name]).trim() : null,
      visitors: intValue(r[prH.visitors]), pageViews: intValue(r[prH.views]),
      payAmountFen: fenFromYuan(r[prH.pay]), refundAmountFen: fenFromYuan(r[prH.refund]),
      promoCostFen: 0, profitFen: 0, netSalesFen: 0, salesCount: 0, consultCount: 0,
      payRate: percentToDecimal(r[prH.rate])
    })
  }
  // 商品明细：补 净销售额/销售件数/推广花费/利润/退款金额/支付金额/商品名
  const pdRows = rowsFromBook(path.join(tpl, PRODUCT_DETAIL_FILE))
  const pdH = pick(pdRows[0] as string[], {
    id: '商品id', name: '商品', pay: '支付金额(支付)', net: '净销售额(支付)', sales: '销售件数(支付)',
    refund: '退款金额', promo: '推广花费(支付预估)', profit: '利润(支付预估)'
  })
  for (const r of pdRows.slice(2)) {
    const pid = String(r[pdH.id]).trim()
    if (!pid) continue
    const row: ProductDailyRow = merged.get(pid) ?? {
      shopId, productId: pid, date: '2026-08-11', productName: null,
      visitors: 0, pageViews: 0, payAmountFen: 0, refundAmountFen: 0,
      promoCostFen: 0, profitFen: 0, netSalesFen: 0, salesCount: 0, consultCount: 0, payRate: null
    }
    row.payAmountFen = fenFromYuan(r[pdH.pay])
    row.refundAmountFen = fenFromYuan(r[pdH.refund])
    row.promoCostFen = fenFromYuan(r[pdH.promo])
    row.profitFen = fenFromYuan(r[pdH.profit])
    row.netSalesFen = fenFromYuan(r[pdH.net])
    row.salesCount = intValue(r[pdH.sales])
    if (r[pdH.name]) row.productName = String(r[pdH.name]).trim()
    merged.set(pid, row)
  }
  // 咨询 csv：补 总咨询人数（商品id 去「ID：」前缀）
  const cRows = rowsFromCsv(path.join(tpl, CONSULT_FILE), 'utf-8')
  const cH = pick(cRows[0] as string[], { id: '商品id', name: '商品名称', consult: '总咨询人数' })
  for (const r of cRows.slice(1)) {
    const raw = String(r[cH.id] ?? '').trim()
    const m = /^ID[:：](\d+)$/.exec(raw)
    if (!m) continue
    const pid = m[1]
    const row: ProductDailyRow = merged.get(pid) ?? {
      shopId, productId: pid, date: '2026-08-11', productName: null,
      visitors: 0, pageViews: 0, payAmountFen: 0, refundAmountFen: 0,
      promoCostFen: 0, profitFen: 0, netSalesFen: 0, salesCount: 0, consultCount: 0, payRate: null
    }
    row.consultCount = intValue(r[cH.consult])
    if (!row.productName && r[cH.name]) row.productName = String(r[cH.name]).trim()
    merged.set(pid, row)
  }
  const productDaily = [...merged.values()]

  // ---------- 客服 xlsx → cs_daily（剔除末 6 行汇总/对比） ----------
  const csRows = rowsFromBook(path.join(tpl, CS_FILE))
  const cH2 = pick(csRows[0] as string[], {
    staff: '旺旺昵称', fp: '询单最终付款人数', ic: '询单人数', ir: '询单最终付款转化率',
    fs: '首次响应时长（秒)', as: '平均响应时长（秒)', sat: '客户满意率', rep: '旺旺回复率',
    fa: '询单最终付款金额', ra: '成功退款金额'
  })
  const SUMMARY_NAMES = new Set(['汇总值', '平均值', '全店汇总值', '全店平均值', '同行同层优秀', '同行同层均值'])
  const csDaily: CsDailyRow[] = []
  for (const r of csRows.slice(1)) {
    const name = String(r[cH2.staff] ?? '').trim()
    if (!name || SUMMARY_NAMES.has(name)) continue
    csDaily.push({
      shopId, date: CS_DATE, staffName: name,
      inquiryFinalPayCount: intValue(r[cH2.fp]), inquiryCount: intValue(r[cH2.ic]),
      inquiryFinalPayRate: percentToDecimal(r[cH2.ir]),
      firstResponseSeconds: leadingNumber(r[cH2.fs]), avgResponseSeconds: leadingNumber(r[cH2.as]),
      satisfactionRate: percentToDecimal(r[cH2.sat]), replyRate: percentToDecimal(r[cH2.rep]),
      inquiryFinalPayAmountFen: fenFromYuan(r[cH2.fa]), refundAmountFen: fenFromYuan(r[cH2.ra])
    })
  }

  // ---------- 搜索词 xls → search_keywords（表头第 6 行） ----------
  const kwRows = rowsFromBook(path.join(tpl, KEYWORD_FILE))
  const kH = pick(kwRows[5] as string[], {
    date: '统计日期', kw: '搜索词', visitors: '访客数', cart: '加购人数', fav: '商品收藏人数',
    buyers: '支付买家数', rate: '支付转化率', pay: '支付金额', price: '客单价', uv: 'UV价值'
  })
  const searchKeywords: SearchKeywordRow[] = []
  for (const r of kwRows.slice(6)) {
    const date = normalizeDate(r[kH.date])
    const kw = String(r[kH.kw] ?? '').trim()
    if (!date || !kw) continue
    searchKeywords.push({
      shopId, date, keyword: kw, visitors: intValue(r[kH.visitors]),
      cartAddCount: intValue(r[kH.cart]), favoriteCount: intValue(r[kH.fav]),
      payBuyerCount: intValue(r[kH.buyers]), payRate: percentToDecimal(r[kH.rate]),
      payAmountFen: fenFromYuan(r[kH.pay]), unitPriceFen: fenFromYuan(r[kH.price]),
      uvValueFen: fenFromYuan(r[kH.uv])
    })
  }

  // ---------- DSR xlsx → dsr_daily（日区块）+ dsr_180d（180 天区块） ----------
  const dsrRows = rowsFromBook(path.join(tpl, DSR_FILE))
  const dsrDaily: DsrDailyRow[] = []
  for (const r of dsrRows.slice(7)) {
    const date = normalizeDate(r[0])
    if (!date) continue
    dsrDaily.push({
      shopId, date,
      descriptionScore: leadingNumber(r[1]), logisticsScore: leadingNumber(r[2]), serviceScore: leadingNumber(r[3])
    })
  }
  const dsr180d: Dsr180dRow[] = []
  for (const r of dsrRows.slice(2, 5)) {
    const indicator = String(r[0] ?? '').trim()
    if (!indicator) continue
    dsr180d.push({
      shopId, snapshotDate: DSR_DATE, indicator,
      score: leadingNumber(r[1]), trend: r[2] ? String(r[2]).trim() : null,
      industryAvg: leadingNumber(r[3]), compareText: r[4] ? String(r[4]).trim() : null,
      target: leadingNumber(r[5]), gapText: r[6] ? String(r[6]).trim() : null
    })
  }

  return {
    shopName: SHOP_NAME, platform: '天猫', dailyMetrics, refundOrders, promoDaily,
    productDaily, csDaily, searchKeywords, dsrDaily, dsr180d
  }
}
