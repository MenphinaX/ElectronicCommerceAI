<!-- 建议动作区块（任务 4）：基于窗口真实数据的规则引擎（无 AI 也可用，数字可回溯） -->
<script setup lang="ts">
import { computed } from 'vue'
import AppIcon from '../AppIcon.vue'
import { useDashboardStore } from '../../stores/dashboard'
import { pct, yuan } from '../../utils/format'

const store = useDashboardStore()

interface Action {
  level: string
  color: string
  title: string
  detail: string
}

const actions = computed<Action[]>(() => {
  const out: Action[] = []
  const d = store.data
  if (!d || !d.hasData) return out
  const kpi = d.kpi as Record<string, unknown> | null
  const refund = d.refund as Record<string, unknown> | null

  // P0 退款率警戒
  if (kpi && Number(kpi.payAmountFen) > 0) {
    const rr = (Number(kpi.refundAmountFen) || 0) / Number(kpi.payAmountFen)
    if (rr > 0.25) {
      out.push({
        level: 'P0', color: 'red',
        title: `退款率 ${pct(rr)} 高于警戒线 25%`,
        detail: `近 ${d.window.label} 退款 ¥${yuan(kpi.refundAmountFen)}，优先排查高频退款原因与售后履约，目标压回 20% 以内。`
      })
    }
  }

  // P0 整体亏损
  if (kpi && Number(kpi.profitFen) < 0) {
    out.push({
      level: 'P0', color: 'red',
      title: '窗口内整体亏损',
      detail: `近 ${d.window.label} 利润 ${yuan(kpi.profitFen)}（负），需核查成本、退款与推广费对利润的侵蚀。`
    })
  }

  // P1 DSR 低于行业
  const snapshot = (d.dsr?.snapshot ?? []) as Array<Record<string, unknown>>
  const lowDsr = snapshot.filter((s) => s.score != null && s.industryAvg != null && Number(s.score) < Number(s.industryAvg))
  if (lowDsr.length) {
    out.push({
      level: 'P1', color: 'amber',
      title: 'DSR 低于行业均值',
      detail: lowDsr.map((s) => `${s.indicator} ${Number(s.score).toFixed(2)} vs 行业 ${Number(s.industryAvg).toFixed(2)}`).join('；') + '，按目标补齐评价订单。'
    })
  }

  // P1 推广 ROI 偏低
  const promo = d.promo as Record<string, unknown> | undefined
  const promoTotal = promo?.totals as Record<string, unknown> | null | undefined
  if (promoTotal && Number(promoTotal.costFen) > 0 && Number(promoTotal.roas) < 2) {
    out.push({
      level: 'P1', color: 'amber',
      title: `推广整体 ROI ${Number(promoTotal.roas).toFixed(2)} 偏低`,
      detail: `近 ${d.window.label} 推广花费 ¥${yuan(promoTotal.costFen)}，投入产出比低于 2，建议调整出价与人群。`
    })
  }
  const badEntities = ((promo?.entities ?? []) as Array<Record<string, unknown>>).filter((e) => Number(e.costFen) > 0 && Number(e.roas) < 1)
  if (badEntities.length) {
    out.push({
      level: 'P1', color: 'amber',
      title: `${badEntities.length} 个推广主体 ROI 低于 1`,
      detail: badEntities.slice(0, 3).map((e) => `${e.adEntityName || e.adEntityId}（ROI ${Number(e.roas).toFixed(2)}）`).join('、') + (badEntities.length > 3 ? ` 等 ${badEntities.length} 个` : '') + '，建议暂停或优化。'
    })
  }

  // P1 低利润商品
  const products = d.product as Array<Record<string, unknown>>
  const lowProfit = products.filter((p) => Number(p.payAmountFen) > 0 && Number(p.profitFen) / Number(p.payAmountFen) < 0.1)
  if (lowProfit.length) {
    out.push({
      level: 'P1', color: 'amber',
      title: `${lowProfit.length} 个单品利润率低于 10%`,
      detail: lowProfit.slice(0, 3).map((p) => `${p.productName || p.productId}（${pct(Number(p.profitFen) / Number(p.payAmountFen))}）`).join('、') + (lowProfit.length > 3 ? ` 等 ${lowProfit.length} 个` : '') + '，关注成本与退款对利润的侵蚀。'
    })
  }

  // P2 数据缺口
  const coverage = d.coverage as Array<Record<string, unknown>>
  const partial = coverage.filter((c) => Number(c.coveredDays) < Number(c.expectedDays))
  if (partial.length) {
    out.push({
      level: 'P2', color: 'blue',
      title: `${partial.length} 类数据未覆盖完整窗口`,
      detail: partial.map((c) => `${c.label} ${c.coveredDays}/${c.expectedDays} 天`).join('、') + '，请及时导入最新导出，确保看板与决策基于完整数据。'
    })
  }

  // P2 无成交搜索词占比
  const kw = d.keywords as Record<string, unknown> | undefined
  const kwTop = (kw?.top ?? []) as Array<Record<string, unknown>>
  if (kwTop.length) {
    const zero = kwTop.filter((k) => Number(k.payBuyerCount) === 0)
    if (zero.length >= 3) {
      out.push({
        level: 'P2', color: 'blue',
        title: `${zero.length} 个高访客搜索词无成交`,
        detail: zero.slice(0, 5).map((k) => `${k.keyword}（访客 ${k.visitors}）`).join('、') + '，需检查商品标题与搜索词匹配度。'
      })
    }
  }

  if (!out.length) {
    out.push({ level: 'OK', color: 'green', title: '当前窗口未见明显异常', detail: '退款率、利润、DSR、推广 ROI 与数据覆盖均在可接受范围。' })
  }
  return out
})
</script>

<template>
  <div class="actions">
    <div v-for="(a, i) in actions" :key="i" class="action" :class="'lv-' + a.color">
      <span class="tag" :class="'tag-' + a.color">{{ a.level }}</span>
      <div class="a-body">
        <div class="a-title">{{ a.title }}</div>
        <div class="a-detail">{{ a.detail }}</div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.actions {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.action {
  display: flex;
  gap: 12px;
  padding: 13px 16px;
  border-radius: 14px;
  background: var(--bg-elevated);
  border: 1px solid var(--border);
  border-left-width: 3px;
}
.lv-red {
  border-left-color: var(--danger);
}
.lv-amber {
  border-left-color: var(--warning);
}
.lv-blue {
  border-left-color: var(--info);
}
.lv-green {
  border-left-color: var(--accent);
}
.tag {
  flex-shrink: 0;
  height: 22px;
  min-width: 38px;
  padding: 0 8px;
  border-radius: 6px;
  display: grid;
  place-items: center;
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 0.04em;
}
.tag-red {
  background: rgba(229, 72, 77, 0.18);
  color: var(--danger);
}
.tag-amber {
  background: rgba(245, 166, 35, 0.18);
  color: var(--warning);
}
.tag-blue {
  background: rgba(77, 159, 255, 0.18);
  color: var(--info);
}
.tag-green {
  background: rgba(29, 185, 84, 0.18);
  color: var(--accent);
}
.a-body {
  display: flex;
  flex-direction: column;
  gap: 3px;
}
.a-title {
  font-size: 13px;
  font-weight: 700;
}
.a-detail {
  font-size: 12px;
  color: var(--text-secondary);
  line-height: 1.5;
}
</style>
