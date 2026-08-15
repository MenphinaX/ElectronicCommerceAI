<!-- 高管摘要区块（任务 4）：基于窗口真实数据的文本摘要 + 风险提示 -->
<script setup lang="ts">
import { computed } from 'vue'
import AppIcon from '../AppIcon.vue'
import { useDashboardStore } from '../../stores/dashboard'
import { num, pct, pctSigned, yuan } from '../../utils/format'

const store = useDashboardStore()
const kpi = computed(() => store.data?.kpi as Record<string, unknown> | null | undefined)
const w = computed(() => store.data?.window)

const summary = computed(() => {
  if (!kpi.value || !w.value) return []
  const k = kpi.value
  const pay = Number(k.payAmountFen) || 0
  const refund = Number(k.refundAmountFen) || 0
  const profit = Number(k.profitFen) || 0
  const promo = Number(k.promoCostFen) || 0
  const change = k.change as Record<string, number | null>
  const lines: string[] = []
  lines.push(`${w.value.label}（${w.value.start} ~ ${w.value.end}）支付金额 ¥${yuan(pay)}，环比 ${pctSigned(change.payAmountPct)}；净销售额 ¥${yuan(k.netSalesFen)}（占流水 ${pay ? ((Number(k.netSalesFen) / pay) * 100).toFixed(0) : 0}%）。`)
  lines.push(`利润 ${profit >= 0 ? '' : '亏损 '}¥${yuan(profit)}（利润率 ${pay ? pct(profit / pay) : '--'}），退款 ¥${yuan(refund)}（退款率 ${pct(refund / pay)}），推广花费 ¥${yuan(promo)}（占流水 ${pay ? ((promo / pay) * 100).toFixed(1) : 0}%）。`)
  const lossDays = ((k.trend ?? []) as Array<Record<string, unknown>>).filter((p) => Number(p.profitFen) < 0).length
  if (lossDays > 0) lines.push(`窗口内 ${lossDays}/${(k.trend as Array<Record<string, unknown>>).length} 个有数据日亏损，需关注成本与退款对利润的侵蚀。`)
  return lines
})

const risks = computed(() => {
  const out: Array<{ text: string; tone: string }> = []
  if (!kpi.value) return out
  const rr = (Number(kpi.value.refundAmountFen) || 0) / (Number(kpi.value.payAmountFen) || 1)
  if (rr > 0.25) out.push({ text: `退款率 ${pct(rr)} 高于警戒线 25%`, tone: 'red' })
  if (Number(kpi.value.roi) != null && Number(kpi.value.roi) < 2) out.push({ text: `整体 ROI ${Number(kpi.value.roi).toFixed(2)} 低于 2`, tone: 'amber' })
  const dsr = store.data?.dsr as Record<string, unknown> | undefined
  const snap = (dsr?.snapshot ?? []) as Array<Record<string, unknown>>
  const lowDsr = snap.filter((s) => s.score != null && s.industryAvg != null && Number(s.score) < Number(s.industryAvg))
  if (lowDsr.length) out.push({ text: `${lowDsr.length} 项 DSR 低于行业均值`, tone: 'amber' })
  if ((store.data?.gaps ?? []).length) out.push({ text: `昨日缺 ${store.data?.gaps?.length} 类数据源`, tone: 'amber' })
  return out
})
</script>

<template>
  <div class="summary glass-card">
    <div class="sum-head">
      <AppIcon name="pin" :size="16" class="sum-icon" />
      <span class="sum-title">高管摘要</span>
      <span class="sum-sub">全部数字来自窗口内已导入数据（可回溯到源文件）</span>
    </div>
    <div class="sum-body">
      <p v-for="(line, i) in summary" :key="i" class="sum-line">{{ line }}</p>
      <div v-if="risks.length" class="risk-row">
        <span class="risk-tag">风险</span>
        <span v-for="(r, i) in risks" :key="i" class="risk-item" :class="'tone-' + r.tone">{{ r.text }}</span>
      </div>
      <p v-if="!summary.length" class="sum-line muted">暂无窗口内数据。</p>
    </div>
  </div>
</template>

<style scoped>
.summary {
  padding: 18px 20px;
}
.sum-head {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 10px;
}
.sum-icon {
  color: var(--accent);
}
.sum-title {
  font-size: 14px;
  font-weight: 800;
}
.sum-sub {
  font-size: 11px;
  color: var(--text-tertiary);
}
.sum-body {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.sum-line {
  margin: 0;
  font-size: 12.5px;
  line-height: 1.7;
  color: var(--text-secondary);
}
.muted {
  color: var(--text-tertiary);
}
.risk-row {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  margin-top: 6px;
}
.risk-tag {
  font-size: 10.5px;
  font-weight: 800;
  color: var(--text-tertiary);
  letter-spacing: 0.06em;
}
.risk-item {
  font-size: 11.5px;
  font-weight: 600;
  padding: 3px 10px;
  border-radius: 999px;
}
.tone-red {
  background: rgba(229, 72, 77, 0.14);
  color: var(--danger);
}
.tone-amber {
  background: rgba(245, 166, 35, 0.14);
  color: var(--warning);
}
</style>
