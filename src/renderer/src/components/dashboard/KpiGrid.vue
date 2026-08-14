<!-- 核心指标 KPI 卡（任务 4）：8 项指标 + 环比 + 点击弹趋势小图 -->
<script setup lang="ts">
import { computed } from 'vue'
import AppIcon from '../AppIcon.vue'
import { useDashboardStore } from '../../stores/dashboard'
import { num, pct, pctSigned, roi, yuan, yuanShort } from '../../utils/format'

const emit = defineEmits<{ (e: 'open-kpi', key: string): void }>()
const store = useDashboardStore()

const kpi = computed(() => store.data?.kpi as Record<string, unknown> | null | undefined)

interface KpiDef {
  key: string
  label: string
  icon: string
  fmt: 'yuan' | 'num' | 'pct' | 'roi'
  goodUp: boolean
}

const cards: KpiDef[] = [
  { key: 'payAmountFen', label: '支付金额', icon: 'trend', fmt: 'yuan', goodUp: true },
  { key: 'netSalesFen', label: '净销售额', icon: 'store', fmt: 'yuan', goodUp: true },
  { key: 'profitFen', label: '利润', icon: 'action', fmt: 'yuan', goodUp: true },
  { key: 'visitors', label: '访客数', icon: 'search', fmt: 'num', goodUp: true },
  { key: 'refundAmountFen', label: '退款金额', icon: 'refund', fmt: 'yuan', goodUp: false },
  { key: 'promoCostFen', label: '推广花费', icon: 'promo', fmt: 'yuan', goodUp: false },
  { key: 'roi', label: '投入产出比', icon: 'target', fmt: 'roi', goodUp: true },
  { key: 'payRate', label: '支付转化率', icon: 'dsr', fmt: 'pct', goodUp: true }
]

function valueOf(card: KpiDef): string {
  if (!kpi.value) return '--'
  const v = kpi.value[card.key]
  if (card.fmt === 'yuan') return `¥${yuan(v as number)}`
  if (card.fmt === 'num') return num(v as number)
  if (card.fmt === 'pct') return pct(v as number | null)
  return roi(v as number | null)
}

function changeOf(card: KpiDef): { text: string; up: boolean; has: boolean } {
  if (!kpi.value) return { text: '--', up: true, has: false }
  const change = kpi.value.change as Record<string, number | null>
  const v = change[card.key + 'Pct'] as number | null
  if (v == null) return { text: '--', up: true, has: false }
  const up = card.goodUp ? v > 0 : v < 0
  return { text: `环比 ${pctSigned(v)}`, up, has: true }
}
</script>

<template>
  <div class="kpi-grid">
    <button v-for="card in cards" :key="card.key" class="kpi-card glass-card" @click="emit('open-kpi', card.key)">
      <div class="kpi-top">
        <span class="kpi-label">{{ card.label }}</span>
        <AppIcon :name="card.icon" :size="16" class="kpi-icon" />
      </div>
      <div class="kpi-value">{{ valueOf(card) }}</div>
      <div class="kpi-foot">
        <span class="chg" :class="{ up: changeOf(card).up, down: !changeOf(card).up, na: !changeOf(card).has }">
          {{ changeOf(card).text }}
        </span>
        <span class="kpi-tip">点击看趋势</span>
      </div>
    </button>
  </div>
</template>

<style scoped>
.kpi-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(210px, 1fr));
  gap: 14px;
}
.kpi-card {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 16px 18px;
  text-align: left;
  cursor: pointer;
  transition: transform 0.15s ease, border-color 0.15s ease;
}
.kpi-card:hover {
  transform: translateY(-2px);
  border-color: var(--accent);
}
.kpi-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.kpi-label {
  font-size: 12px;
  color: var(--text-secondary);
  font-weight: 600;
}
.kpi-icon {
  color: var(--text-tertiary);
}
.kpi-value {
  font-size: 24px;
  font-weight: 700;
  letter-spacing: 0.2px;
  font-variant-numeric: tabular-nums;
}
.kpi-foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 11.5px;
}
.chg {
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}
.chg.up {
  color: var(--accent);
}
.chg.down {
  color: var(--danger);
}
.chg.na {
  color: var(--text-tertiary);
}
.kpi-tip {
  color: var(--text-tertiary);
}
</style>
