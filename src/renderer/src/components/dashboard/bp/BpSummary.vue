<template>
  <div id="summary-analysis" class="kpi-report">
    <div class="bento-hero">
      <div class="bento name-card">
        <div class="ghost" style="font-size:11px;letter-spacing:.06em;">{{ shopName }} · 运营日报（{{ bp.winLbl.value }}）</div>
        <div class="score">{{ bp.dsrScore.value }}</div>
        <div class="short">DSR 三项均值（描述 {{ dsr.desc.score ?? '--' }} / 服务 {{ dsr.service.score ?? '--' }} / 物流 {{ dsr.logistics.score ?? '--' }}，数据 {{ dsr.date ?? '--' }}）</div>
        <div style="font-size:13px;color:var(--text2);line-height:1.8;margin-top:10px;">{{ texts.short }}</div>
        <div class="ghost" style="font-size:12px;margin-top:6px;">{{ texts.weakness }}</div>
        <div class="ghost" style="font-size:10.5px;margin-top:8px;display:flex;gap:6px;align-items:center;"><span v-html="BP_ICONS.pin"></span> {{ texts.note }}</div>
      </div>
      <div class="bento score-card">
        <div>
          <div class="cap">本月经营（净销售额）</div>
          <div class="big">{{ bpMoney(m.agg.net) }}</div>
          <div style="font-size:12px;color:var(--text2);margin-top:3px;">{{ m.ym }} 月实际覆盖 {{ m.covered }}/{{ m.total }} 天 · 缺 {{ m.missing }} 天</div>
        </div>
        <div>
          <div class="cap">窗口流水</div>
          <div class="big" style="color:var(--text);">{{ bpMoney(a.pay) }}</div>
          <div style="font-size:12px;color:var(--text2);margin-top:3px;">{{ bp.winLbl.value }}（{{ bp.winStart.value }} ~ {{ bp.winEnd.value }}）</div>
        </div>
        <div class="safety-card">
          <div>
            <div class="t">{{ refundCount }} 笔退款 / {{ bpMoney(a.refund) }}</div>
            <div class="s">窗口退款率 {{ a.rr.toFixed(1) }}%{{ a.rr > 25 ? ' · 高于警戒线，需重点关注' : '' }}</div>
          </div>
        </div>
      </div>
    </div>
    <div class="kpi-report" style="margin-top:14px;">
      <div class="kpi-report-head"><span v-html="BP_ICONS.pin"></span> 高管摘要评语<template v-if="stamp"><span class="ghost" style="font-weight:500;font-size:11px;margin-left:6px;">（{{ stamp }}）</span></template></div>
      <div class="kpi-report-body">{{ summaryComment }}</div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useBpData, summaryTexts, bpMoney } from './bp-utils'
import { BP_ICONS } from './BpIcons'
import { useShopsStore } from '../../../stores/shops'

const bp = useBpData()
const shops = useShopsStore()
const a = computed(() => bp.agg.value)
const p = computed(() => bp.prevAgg.value)
const m = computed(() => bp.month.value)
const dsr = computed(() => bp.dsr.value)
const texts = computed(() => summaryTexts(a.value, p.value, bp.winDays.value))
const shopName = computed(() => shops.defaultShop?.name ?? '')
const stamp = computed(() => (bp.comments.items.some((x) => x.content) ? 'AI 自动生成' : null))
const summaryComment = computed(() => {
  const t = bp.commentText('摘要')
  return t ? t.split('\n').map((x) => '· ' + x).join('\n') : '等待生成评语（窗口切换/数据导入后自动生成）'
})
const refundCount = computed(() => bp.refundWin.value.wfN + bp.refundWin.value.jrN + bp.refundWin.value.rtN)
</script>
