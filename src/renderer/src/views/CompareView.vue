<!-- 店铺对比（任务 4）：选 2+ 店铺，同窗口对比 KPI，差异高亮 -->
<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import PageShell from '../components/PageShell.vue'
import AppIcon from '../components/AppIcon.vue'
import { useShopsStore } from '../stores/shops'
import { useSettingsStore } from '../stores/settings'
import type { WindowMode } from '../stores/dashboard'

const shops = useShopsStore()
const settings = useSettingsStore()
const router = useRouter()

const mode = ref<WindowMode>('7')
const selected = ref<number[]>([])
const rows = ref<Array<Record<string, unknown>>>([])
const shopMeta = ref<Array<{ id: number; name: string }>>([])
const loading = ref(false)
const err = ref('')

const modes = [
  { mode: 'yesterday', label: '昨日' },
  { mode: '7', label: '近 7 天' },
  { mode: '15', label: '近 15 天' },
  { mode: '30', label: '近 30 天' }
] as const

onMounted(async () => {
  await shops.load()
  // 默认勾选当前店铺 + 第一家其他店铺
  const cur = shops.defaultId
  selected.value = shops.shops.map((s) => s.id).filter((id) => id !== cur).slice(0, 1)
  if (cur) selected.value = [cur, ...selected.value]
  await loadCompare()
})

watch(mode, () => void loadCompare())
watch(selected, () => void loadCompare())

function toggle(id: number): void {
  if (selected.value.includes(id)) selected.value = selected.value.filter((x) => x !== id)
  else selected.value = [...selected.value, id]
}

async function loadCompare(): Promise<void> {
  if (selected.value.length < 2) {
    rows.value = []
    shopMeta.value = []
    return
  }
  loading.value = true
  err.value = ''
  try {
    const res = (await window.api.dashboard.compare({ shopIds: selected.value, mode: mode.value })) as Record<string, unknown>
    shopMeta.value = (res.shops ?? []) as Array<{ id: number; name: string }>
    rows.value = (res.rows ?? []) as Array<Record<string, unknown>>
  } catch (e) {
    err.value = e instanceof Error ? e.message : String(e)
  } finally {
    loading.value = false
  }
}

const fmt = computed(() => {
  const map: Record<string, (v: number | null) => string> = {
    payAmountFen: (v) => (v == null ? '--' : `¥${(v / 100).toLocaleString('zh-CN', { minimumFractionDigits: 2 })}`),
    netSalesFen: (v) => (v == null ? '--' : `¥${(v / 100).toLocaleString('zh-CN', { minimumFractionDigits: 2 })}`),
    profitFen: (v) => (v == null ? '--' : `¥${(v / 100).toLocaleString('zh-CN', { minimumFractionDigits: 2 })}`),
    refundAmountFen: (v) => (v == null ? '--' : `¥${(v / 100).toLocaleString('zh-CN', { minimumFractionDigits: 2 })}`),
    promoCostFen: (v) => (v == null ? '--' : `¥${(v / 100).toLocaleString('zh-CN', { minimumFractionDigits: 2 })}`),
    roi: (v) => (v == null ? '--' : Number(v).toFixed(2)),
    payRate: (v) => (v == null ? '--' : `${(Number(v) * 100).toFixed(2)}%`),
    visitors: (v) => (v == null ? '--' : Number(v).toLocaleString('zh-CN'))
  }
  return map
})

function cellClass(row: Record<string, unknown>, shopId: number): string {
  const values = (row.values as Array<{ shopId: number; value: number | null }>)
  const nums = values.filter((v) => v.value != null).map((v) => v.value as number)
  if (!nums.length) return ''
  const max = Math.max(...nums)
  const min = Math.min(...nums)
  const self = values.find((v) => v.shopId === shopId)?.value as number | null
  if (self == null) return 'muted'
  if (self === max && max !== min) return 'best'
  if (self === min) return 'worst'
  return ''
}
</script>

<template>
  <PageShell title="店铺对比" desc="选 2 个以上店铺，同一时间窗口对比核心 KPI，差异自动高亮">
    <div class="cmp-bar">
      <div class="seg">
        <button v-for="m in modes" :key="m.mode" class="seg-btn" :class="{ active: mode === m.mode }" @click="mode = m.mode">
          {{ m.label }}
        </button>
      </div>
    </div>

    <div v-if="shops.shops.length < 2" class="empty glass-card">
      <AppIcon name="compare" :size="40" class="empty-icon" />
      <div class="empty-title">需要至少两家店铺</div>
      <div class="empty-desc">当前只有 {{ shops.shops.length }} 家店铺。在导入中心新建第二家店铺并导入数据后即可对比。</div>
      <button class="btn btn-primary" @click="router.push('/import')">去导入中心</button>
    </div>

    <template v-else>
      <div class="shop-pick glass-card">
        <span class="pick-label">参与对比的店铺</span>
        <button
          v-for="s in shops.shops"
          :key="s.id"
          class="pick-btn"
          :class="{ on: selected.includes(s.id) }"
          @click="toggle(s.id)"
        >
          <AppIcon name="store" :size="15" />
          <span>{{ s.name }}</span>
          <AppIcon v-if="selected.includes(s.id)" name="check" :size="14" />
        </button>
        <span class="pick-hint">至少勾选 2 家；绿色=该行最优，红色=该行最差</span>
      </div>

      <div v-if="err" class="err-box">{{ err }}</div>

      <div v-if="selected.length < 2" class="hint-box">请再勾选一家店铺开始对比。</div>

      <div v-else-if="loading" class="loading-box">加载中…</div>

      <div v-else class="cmp-table glass-card">
        <table class="data-table">
          <thead>
            <tr>
              <th class="row-label">指标</th>
              <th v-for="s in shopMeta" :key="s.id" class="shop-head">
                <span class="shop-name">{{ s.name }}</span>
              </th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in rows" :key="String(row.key)">
              <td class="row-label">{{ row.label }}</td>
              <td
                v-for="v in (row.values as Array<{ shopId: number; display: string }>)"
                :key="v.shopId"
                class="cell"
                :class="cellClass(row, v.shopId)"
              >{{ v.display }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </template>
  </PageShell>
</template>

<style scoped>
.cmp-bar {
  margin-bottom: 14px;
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
}
.seg-btn.active {
  background: var(--accent);
  color: #000000;
}
.shop-pick {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  padding: 14px 16px;
  margin-bottom: 14px;
}
.pick-label {
  font-size: 12px;
  color: var(--text-secondary);
  font-weight: 600;
}
.pick-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 7px 14px;
  border: 1px solid var(--border);
  border-radius: 999px;
  background: var(--bg-elevated);
  color: var(--text-secondary);
  font-size: 12.5px;
  cursor: pointer;
}
.pick-btn.on {
  border-color: var(--accent);
  color: var(--accent);
  background: var(--accent-soft);
}
.pick-hint {
  font-size: 11px;
  color: var(--text-tertiary);
  margin-left: auto;
}
.cmp-table {
  padding: 6px 0;
  overflow: auto;
}
.data-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
  font-variant-numeric: tabular-nums;
}
.data-table th,
.data-table td {
  padding: 12px 16px;
  border-bottom: 1px solid var(--border);
  text-align: right;
}
.data-table thead th {
  position: sticky;
  top: 0;
  background: var(--bg-elevated);
  color: var(--text-secondary);
  font-weight: 700;
  font-size: 12px;
  z-index: 2;
}
.row-label {
  text-align: left;
  color: var(--text-secondary);
}
.shop-head {
  text-align: center !important;
}
.shop-name {
  font-size: 12.5px;
}
.cell {
  text-align: center;
}
.cell.best {
  color: var(--accent);
  font-weight: 800;
  background: var(--accent-soft);
}
.cell.worst {
  color: var(--danger);
  font-weight: 600;
}
.cell.muted {
  color: var(--text-tertiary);
}
.err-box {
  padding: 12px 16px;
  border: 1px solid rgba(229, 72, 77, 0.4);
  background: rgba(229, 72, 77, 0.1);
  border-radius: 12px;
  color: var(--danger);
  font-size: 13px;
  margin-bottom: 14px;
}
.hint-box,
.loading-box {
  padding: 20px;
  color: var(--text-tertiary);
  font-size: 13px;
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
