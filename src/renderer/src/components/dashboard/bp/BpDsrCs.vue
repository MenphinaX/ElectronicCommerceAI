<template>
  <div class="grid2">
    <div class="dsr-box" id="dsr-box">
      <h3><span v-html="BP_ICONS.store"></span> DSR（{{ dsr.date ?? '--' }} · 数据覆盖 180 天）</h3>
      <table>
        <thead><tr><th>维度</th><th>店铺</th><th>行业</th><th>差距</th></tr></thead>
        <tbody>
          <tr v-for="row in dsrRows" :key="row.label">
            <td>{{ row.label }}</td>
            <td class="num">{{ row.score }}</td>
            <td class="num ghost">{{ row.ind }}</td>
            <td class="num" :class="row.score >= row.ind ? 'bull' : 'bear'">{{ row.score >= row.ind ? '高于' : '低于' }} {{ Math.abs(row.ind - row.score).toFixed(2) }}</td>
          </tr>
        </tbody>
      </table>
      <div class="dsr-score-row">
        <div class="dsr-mini"><div class="k">行业对比</div><div class="v" :class="dsr.desc.score != null && dsr.desc.industryAvg != null && dsr.desc.score < dsr.desc.industryAvg ? 'bear' : 'bull'">{{ dsr.desc.score != null && dsr.desc.industryAvg != null && dsr.desc.score < dsr.desc.industryAvg ? '描述低于行业' : '整体达标' }}</div></div>
        <div class="dsr-mini"><div class="k">目标补齐</div><div class="v" style="font-size:13px;line-height:1.6;">{{ dsr.desc.gapText || '--' }}<br>{{ dsr.logistics.gapText || '--' }}</div></div>
      </div>
      <div class="kpi-report" style="margin-top:12px;">
        <div class="kpi-report-head"><span v-html="BP_ICONS.pin"></span> DSR 分析</div>
        <div class="kpi-report-body">{{ dsrComment }}</div>
      </div>
    </div>
    <div class="kf-card" id="cs-card">
      <div class="kf-head"><span><span v-html="BP_ICONS.user"></span> 客服绩效</span><span class="ghost" style="font-size:11.5px;font-weight:500;">点击日期行展开当日客服明细</span></div>
      <div class="kf-summary"><p class="ghost" style="margin-bottom:6px;">数据日期 {{ firstDate }} · 全店询单 {{ bpNum(csTot.ask) }} 人 / 付款 {{ bpNum(csTot.pay) }} 人 / 金额 {{ bpMoney(csTot.amt) }}</p></div>
      <div style="margin-top:10px;">
        <table class="rg-grid cs-tree">
          <thead><tr><th>日期</th><th>接待</th><th>成交</th><th>转化</th><th>金额</th><th>退款</th></tr></thead>
          <tbody>
            <template v-for="g in bp.cs.value" :key="g.date">
              <tr class="cs-parent" :class="{ open: csOpen.has(g.date) }" @click="toggleCs(g.date)">
                <td><span class="cs-arrow" v-html="BP_ICONS.chevronRight"></span>{{ g.date }}</td>
                <td class="mono">{{ bpNum(g.tot.ask) }}</td><td class="mono">{{ bpNum(g.tot.pay) }}</td>
                <td class="mono">{{ g.tot.ask ? bpPct((g.tot.pay / g.tot.ask) * 100, 0) : '--' }}</td>
                <td class="mono">{{ bpMoney(g.tot.amt) }}</td><td class="mono">{{ bpMoney(g.tot.refund) }}</td>
              </tr>
              <tr v-for="st in g.list" :key="g.date + st.name" class="cs-child" :class="{ open: csOpen.has(g.date) }">
                <td style="color:var(--text2);">{{ st.name }}</td>
                <td class="mono">{{ bpNum(st.ask) }}</td><td class="mono">{{ bpNum(st.pay) }}</td>
                <td class="mono">{{ st.ask ? bpPct((st.pay / st.ask) * 100, 0) : '--' }}</td>
                <td class="mono">{{ bpMoney(st.amt) }}</td><td class="mono">{{ bpMoney(st.refund) }}</td>
              </tr>
              <tr v-for="st in g.bench" :key="g.date + st.name" class="cs-child" :class="{ open: csOpen.has(g.date) }">
                <td>{{ st.name }}</td>
                <td class="mono">{{ bpNum(st.ask) }}</td><td class="mono">{{ bpNum(st.pay) }}</td>
                <td class="mono">{{ st.ask ? bpPct((st.pay / st.ask) * 100, 0) : '--' }}</td>
                <td class="mono">{{ bpMoney(st.amt) }}</td><td class="mono">{{ bpMoney(st.refund) }}</td>
              </tr>
            </template>
          </tbody>
        </table>
      </div>
      <div class="kpi-report" style="margin-top:12px;">
        <div class="kpi-report-head"><span v-html="BP_ICONS.pin"></span> 客服绩效分析</div>
        <div class="kpi-report-body">{{ csComment }}</div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, reactive } from 'vue'
import { useBpData, bpMoney, bpNum, bpPct } from './bp-utils'
import { BP_ICONS } from './BpIcons'

const bp = useBpData()
const dsr = computed(() => bp.dsr.value)
const csOpen = reactive(new Set<string>())

const dsrRows = computed(() => {
  const d = dsr.value
  return [
    { label: '描述相符', score: d.desc.score ?? 0, ind: d.desc.industryAvg ?? 0 },
    { label: '服务态度', score: d.service.score ?? 0, ind: d.service.industryAvg ?? 0 },
    { label: '物流质量', score: d.logistics.score ?? 0, ind: d.logistics.industryAvg ?? 0 }
  ]
})
const firstDate = computed(() => bp.cs.value[0]?.date ?? '')
const csTot = computed(() => {
  const g = bp.cs.value[0]
  return g ? g.tot : { ask: 0, pay: 0, amt: 0, refund: 0 }
})
function toggleCs(date: string): void {
  csOpen.has(date) ? csOpen.delete(date) : csOpen.add(date)
}
const dsrComment = computed(() => {
  const t = bp.commentText('客服DSR')
  return t ? t.split('\n').map((x) => '· ' + x).join('\n') : '等待生成评语'
})
const csComment = computed(() => {
  const g = bp.cs.value[0]
  if (!g) return '暂无客服数据'
  const tot = g.tot
  const best = g.list.slice().sort((a, b) => b.amt - a.amt)[0]
  const lines: string[] = []
  lines.push(`客服数据日期 ${g.date}：有效接待客服 ${g.list.length} 人，合计询单 ${bpNum(tot.ask)} 人 / 付款 ${bpNum(tot.pay)} 人，整体转化 ${tot.ask ? ((tot.pay / tot.ask) * 100).toFixed(0) : 0}%。`)
  if (best) lines.push(`TOP 客服 ${best.name}：询单 ${best.ask} · 付款 ${best.pay} · 金额 ${bpMoney(best.amt)} · 退款 ${bpMoney(best.refund)}。`)
  if (g.bench.length) {
    const b = g.bench[0]
    lines.push(`对照同行同层均值（询单 ${b.ask} / 付款 ${b.pay} / 金额 ${bpMoney(b.amt)}）：${tot.ask >= b.ask ? '询单量高于同行均值' : '询单量低于同行均值'}。`)
  }
  return lines.map((x) => '· ' + x).join('\n')
})
</script>
