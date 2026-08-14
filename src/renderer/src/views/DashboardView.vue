<!-- 数据看板（任务 4B 1:1 复刻）：顶部保留 5 项（一键日报/异常清单+重新生成/锚点导航/月度目标进度/覆盖天数标注），下方为蓝本 01-09 复刻区块 -->
<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import PageShell from '../components/PageShell.vue'
import AppIcon from '../components/AppIcon.vue'
import WindowBar from '../components/dashboard/WindowBar.vue'
import ReportToolbar from '../components/report/ReportToolbar.vue'
import CommentsPanel from '../components/dashboard/CommentsPanel.vue'
import BpReplica from '../components/dashboard/bp/BpReplica.vue'
import { useDashboardStore } from '../stores/dashboard'
import { useCommentsStore } from '../stores/comments'
import { yuan, pct } from '../utils/format'

const store = useDashboardStore()
const comments = useCommentsStore()
const router = useRouter()

const anchors = [
  { id: 'sec-summary', label: '摘要', icon: 'pin' },
  { id: 'sec-kpi', label: '指标', icon: 'target' },
  { id: 'sec-trend', label: '趋势', icon: 'trend' },
  { id: 'sec-product', label: '商品', icon: 'product' },
  { id: 'sec-ad', label: '推广', icon: 'promo' },
  { id: 'sec-refund', label: '退款', icon: 'refund' },
  { id: 'sec-dsr', label: 'DSR+客服', icon: 'cs' },
  { id: 'sec-search', label: '搜索词', icon: 'search' },
  { id: 'sec-action', label: '建议', icon: 'action' }
]

const active = ref('sec-summary')
let observer: IntersectionObserver | null = null
let scrollRoot: HTMLElement | null = null

onMounted(async () => {
  await store.init()
  await comments.loadEnabled()
  await comments.auto()
  scrollRoot = document.querySelector('.app-content')
  observer = new IntersectionObserver(
    (entries) => {
      for (const en of entries) {
        if (en.isIntersecting) active.value = en.target.id
      }
    },
    { root: scrollRoot, rootMargin: '-120px 0px -65% 0px', threshold: 0 }
  )
  for (const a of anchors) {
    const el = document.getElementById(a.id)
    if (el) observer.observe(el)
  }
})

onBeforeUnmount(() => observer?.disconnect())

watch(
  () => store.shopId,
  () => {
    void store.load()
    void comments.auto()
  }
)
watch(
  () => store.data?.window?.end,
  () => {
    if (store.data?.hasData) void comments.auto()
  }
)

function jump(id: string): void {
  const el = document.getElementById(id)
  if (el && scrollRoot) {
    const top = el.getBoundingClientRect().top + scrollRoot.scrollTop - scrollRoot.getBoundingClientRect().top - 96
    scrollRoot.scrollTo({ top: Math.max(0, top), behavior: 'smooth' })
  }
}

// 月度目标进度（设置项 monthly_target_fen）
const monthly = () => store.data?.monthly as Record<string, unknown> | null | undefined
const mpPct = () => {
  const m = monthly()
  if (!m) return 0
  const p = Number(m.pct)
  return Number.isFinite(p) ? Math.min(100, Math.max(0, p * 100)) : 0
}
</script>

<template>
  <PageShell title="数据看板" desc="单页 9 大区块 · 蓝本 1:1 复刻 · 窗口全局联动 · 覆盖天数如实标注">
    <div v-if="store.loading && !store.loaded" class="skeleton">
      <div class="sk-row">
        <div v-for="n in 4" :key="n" class="sk-card"></div>
      </div>
      <div class="sk-chart"></div>
    </div>

    <div v-else-if="store.error" class="empty glass-card">
      <AppIcon name="error" :size="40" class="empty-icon" />
      <div class="empty-title">数据加载失败</div>
      <div class="empty-desc">{{ store.error }}</div>
      <button class="btn btn-primary" @click="store.load()">重试</button>
    </div>

    <div v-else-if="!store.data?.hasShop" class="empty glass-card">
      <AppIcon name="store" :size="40" class="empty-icon" />
      <div class="empty-title">还没有店铺和数据</div>
      <div class="empty-desc">先去导入中心新建店铺并导入生意参谋导出的数据文件。</div>
      <button class="btn btn-primary" @click="router.push('/import')">去导入数据</button>
    </div>

    <div v-else-if="!store.data?.hasData" class="empty glass-card">
      <AppIcon name="upload" :size="40" class="empty-icon" />
      <div class="empty-title">当前店铺还没有数据</div>
      <div class="empty-desc">导入经营数据/商品/推广/退款等文件后，这里会显示 9 大分析区块。</div>
      <button class="btn btn-primary" @click="router.push('/import')">去导入数据</button>
    </div>

    <template v-else>
      <WindowBar />
      <ReportToolbar />
      <CommentsPanel />

      <section v-if="monthly()" class="glass-card monthly-progress">
        <div class="mp-head">
          <span class="mp-title"><AppIcon name="target" :size="14" />月度目标进度（{{ monthly()?.month }}）</span>
          <span class="mp-nums">{{ yuan(monthly()?.payFen) }} / {{ Number(monthly()?.targetFen) > 0 ? yuan(monthly()?.targetFen) : '未设置目标' }}</span>
        </div>
        <div class="mp-track"><div class="mp-fill" :style="{ width: mpPct() + '%' }"></div></div>
        <div class="mp-sub ghost">{{ monthly()?.coveredDays }} 天 / {{ monthly()?.monthDays }} 天 · 达成 {{ Number(monthly()?.pct) > 0 ? pct(monthly()?.pct) : '--' }}</div>
      </section>

      <nav class="anchor-nav glass-card">
        <button
          v-for="a in anchors"
          :key="a.id"
          class="anchor-btn"
          :class="{ active: active === a.id }"
          @click="jump(a.id)"
        >
          <AppIcon :name="a.icon" :size="14" />
          <span>{{ a.label }}</span>
        </button>
      </nav>

      <BpReplica />
    </template>
  </PageShell>
</template>

<style scoped>
.anchor-nav {
  position: sticky;
  top: 0;
  z-index: 20;
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 6px;
  margin-bottom: 22px;
  overflow-x: auto;
}
.anchor-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 7px 12px;
  border: none;
  border-radius: 999px;
  background: transparent;
  color: var(--text-secondary);
  font-size: 12px;
  font-weight: 600;
  white-space: nowrap;
  cursor: pointer;
  transition: background 0.15s ease, color 0.15s ease;
}
.anchor-btn:hover {
  color: var(--text-primary);
}
.anchor-btn.active {
  background: var(--accent);
  color: var(--bp-on-accent);
}
:deep(.bp-replica h2) {
  scroll-margin-top: 110px;
}
.monthly-progress {
  padding: 14px 18px;
  margin-bottom: 16px;
}
.mp-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  font-size: 13px;
  font-weight: 700;
}
.mp-title {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}
.mp-nums {
  font-family: var(--font-mono, monospace);
  color: var(--text-secondary);
  font-weight: 600;
}
.mp-track {
  height: 8px;
  border-radius: 6px;
  background: var(--bg-hover, rgba(255, 255, 255, 0.08));
  margin-top: 10px;
  overflow: hidden;
}
.mp-fill {
  height: 100%;
  border-radius: 6px;
  background: var(--accent);
  transition: width 0.4s ease;
}
.mp-sub {
  margin-top: 7px;
  font-size: 12px;
}
.skeleton {
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.sk-row {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 14px;
}
.sk-card,
.sk-chart {
  border-radius: 20px;
  background: linear-gradient(90deg, var(--bg-elevated), var(--bg-hover), var(--bg-elevated));
  background-size: 200% 100%;
  animation: shimmer 1.2s infinite;
}
.sk-card {
  height: 110px;
}
.sk-chart {
  height: 300px;
}
@keyframes shimmer {
  from { background-position: 200% 0; }
  to { background-position: -200% 0; }
}
.empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  padding: 48px 24px;
  text-align: center;
}
.empty-icon {
  color: var(--text-tertiary);
}
.empty-title {
  font-size: 16px;
  font-weight: 700;
}
.empty-desc {
  font-size: 13px;
  color: var(--text-secondary);
  max-width: 420px;
  line-height: 1.6;
}
</style>
