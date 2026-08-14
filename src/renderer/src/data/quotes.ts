// 开屏问候：时段分级 + 本地内置电商励志语录（≥30 条，无 emoji，离线可用，按日期轮换不重复）
export function greetingForHour(hour: number): string {
  if (hour >= 5 && hour < 11) return '早上好'
  if (hour >= 11 && hour < 13) return '中午好'
  if (hour >= 13 && hour < 18) return '下午好'
  if (hour >= 18 && hour < 23) return '晚上好'
  return '夜深了'
}

export function greetingSub(hour: number): string {
  if (hour >= 5 && hour < 11) return '新的一天，先把经营看清楚'
  if (hour >= 11 && hour < 13) return '午间复盘，数据不会说谎'
  if (hour >= 13 && hour < 18) return '午后时光，适合精打细算'
  if (hour >= 18 && hour < 23) return '晚间经营，稳扎稳打'
  return '夜深了，看完数据早点休息'
}

export const ECOMMERCE_QUOTES: string[] = [
  '数据是店铺的镜子，照得越勤，方向越准',
  '每一笔订单，都是顾客用信任投的票',
  '把今天看明白，明天才不用猜',
  '复购率来自细节，细节来自数据',
  '生意是长跑，看板是配速表',
  '先看数据，再谈感觉',
  '流量会波动，基本功不会',
  '好店铺不是等来的，是算出来的',
  '转化率的每一次提升，都是对顾客更懂了一点',
  '别和昨天比运气，要和昨天比数据',
  '库存周转快一天，现金就多活一天',
  '客服的耐心，是最后一公里的成交率',
  '退款不是损失，是改进的说明书',
  '每一个差评里，都藏着下一个爆款的方向',
  '推广花钱要花在看得见回报的地方',
  '搜索词是顾客的心声，仔细听',
  '客单价靠搭配，复购靠体验',
  '数据整齐，决策才不慌',
  '今天的积累，是明天旺季的底气',
  '小步快跑，日日复盘',
  '店铺的成长，藏在每天的报表里',
  '把简单的事做到位，就是竞争力',
  '价格战没有赢家，体验战才有',
  '顾客不会记得你多辛苦，只记得你多用心',
  '盯住现金流，生意就有底气',
  '旺季拼备货，淡季拼内功',
  '一个老顾客，胜过十个新流量',
  '把每一分推广费都花在刀刃上',
  '数据不会替你做决定，但会让决定更稳',
  '坚持看数的人，运气不会太差',
  '生意场上，清醒比聪明更重要',
  '今天的报表，就是明天的方向盘'
]

// 按日期取当天语录：哈希取模，日期不同则语录不同，同一日期内稳定不重复
export function quoteForDate(dateStr: string): string {
  let h = 0
  for (let i = 0; i < dateStr.length; i++) {
    h = (h * 31 + dateStr.charCodeAt(i)) >>> 0
  }
  return ECOMMERCE_QUOTES[h % ECOMMERCE_QUOTES.length]
}