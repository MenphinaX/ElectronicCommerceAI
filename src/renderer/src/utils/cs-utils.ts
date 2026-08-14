// 客服绩效归组纯函数（任务 4C 抽出：不依赖 store/DOM，node 测试可直接引用）
// 口径：父行=日期，子行=员工明细 + 同行对比行；date 列由主进程 csBlock SQL 提供
export interface CsStaffRow { name: string; date: string; ask: number; pay: number; amt: number; refund: number }
export interface CsGroup { date: string; tot: CsStaffRow; list: CsStaffRow[]; bench: CsStaffRow[] }

export function csGroups(dates: string[], staff: Array<Record<string, unknown>>): CsGroup[] {
  const isMeta = (name: string) => /汇总|平均|同行/.test(name)
  const toRow = (r: Record<string, unknown>): CsStaffRow => ({
    name: String(r.staffName ?? ''), date: String(r.date ?? ''),
    ask: Number(r.inquiryCount) || 0, pay: Number(r.inquiryFinalPayCount) || 0,
    amt: (Number(r.inquiryFinalPayAmountFen) || 0) / 100, refund: (Number(r.refundAmountFen) || 0) / 100
  })
  return dates.map((date) => {
    const rows = staff.filter((r) => String(r.date ?? '') === date)
    const list = rows.filter((r) => !isMeta(String(r.staffName ?? '')))
    const bench = rows.filter((r) => String(r.staffName ?? '').includes('同行'))
    const tot: CsStaffRow = { name: '全店汇总', date, ask: 0, pay: 0, amt: 0, refund: 0 }
    for (const r of list) {
      tot.ask += Number(r.inquiryCount) || 0
      tot.pay += Number(r.inquiryFinalPayCount) || 0
      tot.amt += (Number(r.inquiryFinalPayAmountFen) || 0) / 100
      tot.refund += (Number(r.refundAmountFen) || 0) / 100
    }
    return { date, tot, list: list.map(toRow), bench: bench.map(toRow) }
  })
}