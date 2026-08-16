<template>
  <div class="grid2" style="grid-template-columns:1fr;gap:12px;">
    <div class="kf-card" id="search-card">
      <div class="kf-head"><span><span v-html="BP_ICONS.search"></span> 搜索词</span><span class="ghost" style="font-size:11.5px;font-weight:500;">单日快照 {{ bp.lastDay.value }} · 店外无线</span></div>
      <div class="kf-summary" style="max-height:420px;overflow-y:auto;">
        <p class="ghost">搜索词访客/买家 <span class="mono">{{ bpNum(kwSum.vis) }} / {{ bpNum(kwSum.buy) }}</span></p>
        <table class="simple-table" style="margin-top:8px;">
          <thead><tr><th>关键词</th><th>访客</th><th>成交买家</th><th>成交额</th></tr></thead>
          <tbody>
            <tr v-for="(s, i) in bp.keywords.value" :key="s.word">
              <td><span class="rank-sm">{{ i + 1 }}</span> {{ s.word }}</td>
              <td class="num">{{ bpNum(s.vis) }}</td><td class="num">{{ bpNum(s.buy) }}</td><td class="num">{{ bpMoney(s.amt) }}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <div class="kpi-report" style="margin-top:12px;">
        <div class="kpi-report-head"><span v-html="BP_ICONS.pin"></span> 搜索词分析</div>
        <div class="kpi-report-body">{{ searchComment }}</div>
      </div>
    </div>
    <div class="kf-card" id="zx-card">
      <div class="kf-head"><span><span v-html="BP_ICONS.message"></span> 商品咨询量</span><span class="ghost" style="font-size:11.5px;font-weight:500;">单日快照 {{ bp.lastDay.value }}</span></div>
      <div class="kf-summary" style="max-height:420px;overflow-y:auto;">
        <p class="ghost">咨询商品 {{ bp.consult.value.total }} 个 · 合计咨询 {{ bpNum(bp.consult.value.sum) }} 人</p>
        <table class="simple-table" style="margin-top:8px;">
          <thead><tr><th>商品</th><th>咨询数</th></tr></thead>
          <tbody>
            <tr v-for="s in bp.consult.value.rows" :key="s.pid">
              <td style="max-width:480px;"><span class="zx-prod" style="display:flex;align-items:center;gap:8px;"><BpImage :product-id="s.pid" :size="40" /><span class="zx-prod-name" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">{{ s.name }}</span></span></td>
              <td class="num">{{ bpNum(s.consult) }}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <div class="kpi-report" style="margin-top:12px;">
        <div class="kpi-report-head"><span v-html="BP_ICONS.pin"></span> 商品咨询分析</div>
        <div class="kpi-report-body">{{ zxComment }}</div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useBpData, bpMoney, bpNum, bpPct } from './bp-utils'
import BpImage from './BpImage.vue'
import { BP_ICONS } from './BpIcons'

const bp = useBpData()
const kwSum = computed(() => {
  const kw = bp.keywords.value
  return kw.reduce((s, x) => ({ vis: s.vis + x.vis, buy: s.buy + x.buy, amt: s.amt + (x.amt || 0) }), { vis: 0, buy: 0, amt: 0 })
})
const searchComment = computed(() => {
  const t = bp.commentText('搜索词')
  if (t) return t.split('\n').map((x) => '· ' + x).join('\n')
  const kw = bp.keywords.value
  if (!kw.length) return '等待生成评语'
  const lines: string[] = []
  const s = kwSum.value
  lines.push(`全部搜索词合计访客 ${bpNum(s.vis)} / 成交买家 ${bpNum(s.buy)}，成交额 ${bpMoney(s.amt)}，整体转化 ${s.vis ? ((s.buy / s.vis) * 100).toFixed(1) : 0}%。`)
  const convKw = kw.filter((x) => x.buy > 0)
  if (convKw.length) lines.push(`有成交词 ${convKw.length} 个：「${convKw.map((x) => x.word).join('」「')}」，其中「${convKw[0].word}」转化 ${convKw[0].conv != null ? bpPct(convKw[0].conv * 100) : '--'}、成交 ${bpMoney(convKw[0].amt)}。`)
  else lines.push('全部搜索词中暂无成交词，需检查商品标题与搜索词匹配度。')
  lines.push(`访客来源集中：「${kw[0].word}」${kw[0].vis} 人占全部的 ${s.vis ? ((kw[0].vis / s.vis) * 100).toFixed(0) : 0}%，可围绕该词强化主图与标题。`)
  return lines.map((x) => '· ' + x).join('\n')
})
const zxComment = computed(() => {
  const c = bp.consult.value
  if (!c.total) return '暂无咨询数据'
  const top = c.rows.slice().sort((a, b) => b.consult - a.consult).slice(0, 5)
  const lines: string[] = []
  lines.push(`全店咨询商品 ${c.total} 个，合计咨询 ${bpNum(c.sum)} 人。`)
  if (top.length) {
    lines.push(`咨询 TOP5：「${top.map((x) => x.name.slice(0, 12) + '…' + x.consult + '人').join('；')}」。TOP1「${top[0].name.slice(0, 16)}…」咨询 ${top[0].consult} 人，占全店 ${c.sum ? ((top[0].consult / c.sum) * 100).toFixed(0) : 0}%，是核心转化入口。`)
  }
  lines.push('建议：将高咨询商品的问题前置到详情页与主图，降低客服重复接待成本。')
  return lines.map((x) => '· ' + x).join('\n')
})
</script>
