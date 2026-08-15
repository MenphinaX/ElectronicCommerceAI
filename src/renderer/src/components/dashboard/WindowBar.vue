<!-- 看板顶部：窗口切换 + 数据覆盖标注 + 昨日缺口提示 + 月度目标进度（任务 4） -->
<script setup lang="ts">
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import AppIcon from '../AppIcon.vue'
import { useDashboardStore } from '../../stores/dashboard'
import { pct, yuan, num } from '../../utils/format'

const store = useDashboardStore()
const router = useRouter()

const modes = [
  { mode: 'yesterday', label: '昨日' },
  { mode: '7', label: '近 7 天' },
  { mode: '15', label: '近 15 天' },
  { mode: '30', label: '近 30 天' }
] as const

const data = computed(() => store.data)
const coverage = computed(() => (data.value?.coverage ?? []) as Array<Record<string, unknown>>)
const gaps = computed(() => data.value?.gaps ?? [])
const monthly = computed(() => data.value?.monthly as Record<string, unknown> | null | undefined)

const coveredText = computed(() => {
  const daily = coverage.value.find((c) => c.key === 'daily')
  if (!daily) return ''
  const n = Number(daily.coveredDays) || 0
  const total = Number(daily.expectedDays) || 0
  const missing = (daily.dates as string[]).length ? '' : ''
  return `经营覆盖 ${n}/${total} 天${missing}`
})

const missingDates = computed(() => {
  const daily = coverage.value.find((c) => c.key === 'daily')
  if (!daily) return []
  const expected: string[] = []
  const start = data.value?.window.start
  const end = data.value?.window.end
  if (!start || !end) return []
  const cur = new Date(start + 'T00:00:00')
  const last = new Date(end + 'T00:00:00')
  const present = new Set((daily.dates as string[]).map((d) => String(d)))
  while (cur <= last) {
    const ds = cur.toISOString().slice(0, 10)
    if (!present.has(ds)) expected.push(ds)
    cur.setDate(cur.getDate() + 1)
  }
  return expected
})

const yesterdayText = computed(() => {
  const t = data.value?.today
  if (!t) return ''
  const d = new Date(t + 'T00:00:00')
  d.setDate(d.getDate() - 1)
  return d.toISOString().slice(0, 10)
})

const targetPct = computed(() => {
  if (!monthly.value || !monthly.value.pct) return null
  return Math.min(1, Number(monthly.value.pct))
})
</script>

<template>
  <div class="winbar">
    <div class="row1">
      <div class="seg">
        <button
          v-for="m in modes"
          :key="m.mode"
          class="seg-btn"
          :class="{ active: store.mode === m.mode }"
          @click="store.setMode(m.mode)"
        >
          {{ m.label }}
        </button>
      </div>
      <div class="win-hint" v-if="data">
        窗口 {{ data.window.start }} ~ {{ data.window.end }}（基准日 {{ data.today }}，环比上一周期）
      </div>
    </div>

    <div v-if="gaps.length" class="gap-alert">
      <AppIcon name="warning" :size="16" />
      <span class="gap-text">
        昨日（{{ yesterdayText }}）缺：{{ gaps.map((g) => g.label + (g.lastDate ? '（截至 ' + g.lastDate + '）' : '')).join('、') }}
      </span>
      <button class="gap-btn" @click="router.push('/import')">去导入</button>
    </div>

    <div class="row2">
      <div class="cov" v-if="coverage.length">
        <span class="cov-label">覆盖标注</span>
        <span class="cov-item" v-for="c in coverage" :key="String(c.key)">
          <span class="dot" :class="{ ok: Number(c.coveredDays) >= Number(c.expectedDays), partial: Number(c.coveredDays) > 0 && Number(c.coveredDays) < Number(c.expectedDays) }"></span>
          {{ c.label }} {{ c.coveredDays }}/{{ c.expectedDays }} 天
        </span>
        <span v-if="missingDates.length" class="cov-miss">缺 {{ missingDates.join('、') }}</span>
      </div>
      <div v-if="monthly && monthly.targetFen" class="mgoal">
        <AppIcon name="target" :size="14" />
        <span class="mgoal-label">{{ monthly.month }} 目标 {{ yuan(monthly.targetFen) }} 元</span>
        <div class="mgoal-bar">
          <div class="mgoal-fill" :style="{ width: (targetPct ?? 0) * 100 + '%' }"></div>
        </div>
        <span class="mgoal-val">已完成 {{ yuan(monthly.payFen) }}（{{ pct(monthly.pct) }}）· 覆盖 {{ monthly.coveredDays }}/{{ monthly.monthDays }} 天</span>
      </div>
      <div v-else-if="monthly" class="mgoal mgoal-empty">
        <AppIcon name="target" :size="14" />
        <span>未设置月度目标</span>
        <button class="gap-btn" @click="router.push('/settings')">去设置</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.winbar {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-bottom: 18px;
}
.row1 {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
}
.seg {
  display: inline-flex;
  background: var(--bg-elevated);
  border: 1px solid var(--border);
  border-radius: 999px;
  padding: 3px;
}
.seg-btn {
  border: none;
  background: transparent;
  color: var(--text-secondary);
  font-size: 12.5px;
  font-weight: 600;
  padding: 6px 16px;
  border-radius: 999px;
  cursor: pointer;
  transition: background 0.15s ease, color 0.15s ease;
}
.seg-btn:hover {
  color: var(--text-primary);
}
.seg-btn.active {
  background: var(--accent);
  color: #000000;
}
.win-hint {
  font-size: 12px;
  color: var(--text-tertiary);
}
.gap-alert {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 14px;
  border-radius: 12px;
  background: rgba(245, 166, 35, 0.12);
  border: 1px solid rgba(245, 166, 35, 0.35);
  color: var(--text-primary);
  font-size: 12.5px;
}
.gap-text {
  flex: 1;
}
.gap-btn {
  border: none;
  border-radius: 999px;
  padding: 5px 14px;
  background: var(--accent);
  color: #000000;
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
}
.gap-btn:hover {
  filter: brightness(1.1);
}
.row2 {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
}
.cov {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
  font-size: 12px;
  color: var(--text-secondary);
}
.cov-label {
  color: var(--text-tertiary);
}
.cov-item {
  display: inline-flex;
  align-items: center;
  gap: 5px;
}
.dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--text-tertiary);
}
.dot.ok {
  background: var(--accent);
}
.dot.partial {
  background: var(--warning);
}
.cov-miss {
  color: var(--warning);
}
.mgoal {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  color: var(--text-secondary);
}
.mgoal-bar {
  width: 120px;
  height: 6px;
  border-radius: 4px;
  background: var(--bg-hover);
  overflow: hidden;
}
.mgoal-fill {
  height: 100%;
  background: var(--accent);
  border-radius: 4px;
}
.mgoal-val {
  color: var(--text-tertiary);
}
.mgoal-empty {
  color: var(--text-tertiary);
}
</style>
