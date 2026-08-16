// 9 类数据源规格（任务 0 实测口径，来源 docs/数据源清单.md；列名按名称匹配不按位置）
// 表头行/列数/必填列均为实测值；本地解析从严，任一项不过 → LLM 兜底/人工

export type SourceType =
  | 'consult' | 'keyword' | 'product_report' | 'product_detail'
  | 'promo' | 'daily' | 'dsr' | 'cs' | 'refund'

export interface SourceSpec {
  type: SourceType
  label: string
  filePatterns: RegExp[]
  expectedHeaderRow: number
  expectedCols: number
  requiredHeader: string[]
  requiredCols: Record<string, string | string[]>
  encoding?: 'utf8' | 'gbk'
  dateSource: 'column' | 'filename'
  dateColumn?: string
  filenameDate?: RegExp
  headerDuplicated?: boolean
  stripTailSummary?: number
  summaryCheck?: string[]
  idPrefix?: 'ID：' | 'ID:'
  targetTable: 'daily_metrics' | 'product_daily' | 'promo_daily' | 'refund_orders' | 'cs_daily' | 'search_keywords' | 'dsr'
}

export const SOURCE_LABEL: Record<SourceType, string> = {
  consult: '咨询',
  keyword: '搜索词',
  product_report: '商品报表',
  product_detail: '商品明细',
  promo: '推广',
  daily: '经营',
  dsr: 'DSR',
  cs: '客服',
  refund: '退款'
}

export const SPECS: SourceSpec[] = [
  {
    type: 'consult',
    label: '咨询',
    filePatterns: [/^\d{4}-\d{2}-\d{2}\.csv$/i],
    expectedHeaderRow: 1,
    expectedCols: 8,
    requiredHeader: ['商品id', '商品名称', '总咨询人数', '移动端咨询人数', 'PC端咨询人数'],
    requiredCols: { productId: '商品id', productName: '商品名称', consultCount: '总咨询人数' },
    encoding: 'utf8',
    dateSource: 'filename',
    filenameDate: /(\d{4})-(\d{2})-(\d{2})/,
    idPrefix: 'ID：',
    targetTable: 'product_daily'
  },
  {
    type: 'keyword',
    label: '搜索词',
    filePatterns: [/选词助手/, /引流搜索词/],
    expectedHeaderRow: 6,
    expectedCols: 10,
    requiredHeader: ['统计日期', '搜索词', '访客数', '支付转化率', '支付金额'],
    requiredCols: {
      date: '统计日期', keyword: '搜索词', visitors: '访客数', cartAddCount: '加购人数',
      favoriteCount: '商品收藏人数', payBuyerCount: '支付买家数', payRate: '支付转化率',
      payAmountFen: '支付金额', unitPriceFen: '客单价', uvValueFen: 'UV价值'
    },
    dateSource: 'column',
    dateColumn: '统计日期',
    targetTable: 'search_keywords'
  },
  {
    type: 'product_report',
    label: '商品报表',
    filePatterns: [/商品_全部/],
    expectedHeaderRow: 5,
    expectedCols: 38,
    requiredHeader: ['统计日期', '商品ID', '商品名称', '支付金额', '成功退款金额'],
    requiredCols: {
      date: '统计日期', productId: '商品ID', productName: '商品名称', visitors: '商品访客数', searchGuideVisitors: '搜索引导访客数',
      pageViews: '商品浏览量', payAmountFen: '支付金额', refundAmountFen: '成功退款金额', payRate: '商品支付转化率'
    },
    dateSource: 'column',
    dateColumn: '统计日期',
    targetTable: 'product_daily'
  },
  {
    type: 'product_detail',
    label: '商品明细',
    filePatterns: [/商品总览/],
    expectedHeaderRow: 1,
    expectedCols: 402,
    requiredHeader: ['商品id', '支付金额(支付)', '净销售额(支付)', '退款金额', '推广花费(支付预估)', '利润(支付预估)'],
    requiredCols: {
      productId: '商品id', productName: '商品', payAmountFen: '支付金额(支付)', netSalesFen: '净销售额(支付)',
      refundAmountFen: '退款金额', promoCostFen: '推广花费(支付预估)', profitFen: '利润(支付预估)', salesCount: '销售件数(支付)'
    },
    dateSource: 'filename',
    filenameDate: /(\d{4})-(\d{2})-(\d{2})/,
    headerDuplicated: true,
    targetTable: 'product_daily'
  },
  {
    type: 'promo',
    label: '推广',
    filePatterns: [/商品报表.*\.csv$/i],
    expectedHeaderRow: 1,
    expectedCols: 75,
    requiredHeader: ['日期', '主体ID', '花费', '投入产出比'],
    requiredCols: {
      date: '日期', adEntityId: '主体ID', adEntityName: '主体名称', impressions: '展现量',
      clicks: '点击量', costFen: '花费', ctr: '点击率', roas: '投入产出比',
      payAmountFen: '直接成交金额', salesCount: '直接成交笔数', payRate: '点击转化率'
    },
    encoding: 'gbk',
    dateSource: 'column',
    dateColumn: '日期',
    targetTable: 'promo_daily'
  },
  {
    type: 'daily',
    label: '经营',
    filePatterns: [/经营数据/],
    expectedHeaderRow: 1,
    expectedCols: 320,
    requiredHeader: ['日期', '支付金额(支付)', '净销售额(支付)', '利润(支付预估)', '访客数', '退款金额', '推广花费(支付预估)'],
    requiredCols: {
      date: '日期', payAmountFen: '支付金额(支付)', netSalesFen: '净销售额(支付)', profitFen: '利润(支付预估)',
      visitors: '访客数', salesCount: '销售单数(支付)', refundAmountFen: '退款金额', promoCostFen: '推广花费(支付预估)', payRate: '支付转化率'
    },
    dateSource: 'column',
    dateColumn: '日期',
    headerDuplicated: true,
    targetTable: 'daily_metrics'
  },
  {
    type: 'dsr',
    label: 'DSR',
    filePatterns: [/DSR/],
    expectedHeaderRow: 2,
    expectedCols: 7,
    requiredHeader: ['指标', '得分', '行业均值'],
    requiredCols: {
      indicator: ['指标', '指标名称'], score: ['得分', '评分'], trend: ['趋势', '趋势提示'], industryAvg: '行业均值',
      compareText: '与行业对比', target: '目标值', gapText: ['距目标值差距', '距目标值相差（笔5分评价订单）'],
      date: '日期',
      descriptionScore: ['描述得分（较上日）', '描述得分', '描述评分（较上日）', '描述评分'],
      logisticsScore: ['物流得分（较上日）', '物流得分', '物流评分（较上日）', '物流评分'],
      serviceScore: ['服务得分（较上日）', '服务得分', '服务评分（较上日）', '服务评分']
    },
    dateSource: 'filename',
    filenameDate: /(\d{4})-(\d{2})-(\d{2})/,
    targetTable: 'dsr'
  },
  {
    type: 'cs',
    label: '客服',
    filePatterns: [/客服绩效/],
    expectedHeaderRow: 1,
    expectedCols: 10,
    requiredHeader: ['旺旺昵称', '询单人数', '询单最终付款转化率', '平均响应时长（秒)'],
    requiredCols: {
      staffName: '旺旺昵称', inquiryFinalPayCount: '询单最终付款人数', inquiryCount: '询单人数',
      inquiryFinalPayRate: '询单最终付款转化率', firstResponseSeconds: '首次响应时长（秒)',
      avgResponseSeconds: '平均响应时长（秒)', satisfactionRate: '客户满意率', replyRate: '旺旺回复率',
      inquiryFinalPayAmountFen: '询单最终付款金额', refundAmountFen: '成功退款金额'
    },
    dateSource: 'filename',
    filenameDate: /(\d{4})(\d{2})(\d{2})/,
    stripTailSummary: 6,
    summaryCheck: ['汇总值', '平均值', '全店汇总值', '全店平均值', '同行同层优秀', '同行同层均值'],
    targetTable: 'cs_daily'
  },
  {
    type: 'refund',
    label: '退款',
    filePatterns: [/退款单/],
    expectedHeaderRow: 1,
    expectedCols: 53,
    requiredHeader: ['订单编号', '退款编号', '退款总额', '货物状态', '售后类型', '商品id'],
    requiredCols: {
      orderNo: '订单编号', refundNo: '退款编号', productId: '商品id', productTitle: '宝贝标题',
      refundAmountFen: '退款总额', buyerPayAmountFen: '买家实际支付金额', refundStatus: '退款状态',
      goodsStatus: '货物状态', afterSaleType: '售后类型', paymentTime: '订单付款时间',
      refundFinishTime: '退款完结时间', refundApplyTime: '退款申请时间', refundReason: '买家退款原因'
    },
    dateSource: 'column',
    dateColumn: '订单付款时间',
    targetTable: 'refund_orders'
  }
]

export function specOf(type: SourceType): SourceSpec {
  const spec = SPECS.find((s) => s.type === type)
  if (!spec) throw new Error(`未知数据源类型：${type}`)
  return spec
}
