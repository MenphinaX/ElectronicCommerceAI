<script setup lang="ts">
import { onMounted, ref } from 'vue'
import AppIcon from '../AppIcon.vue'
import { useShopsStore } from '../../stores/shops'

interface CoverageRow {
  source: string
  label: string
  lastDate: string | null
  delayDays: number | null
  todayImported: boolean
  coverageRange: string | null
  rows: number
  lastSourceFile: string | null
  lastImportedAt: string | null
}

const shops = useShopsStore()
const rows = ref<CoverageRow[]>([])
const loading = ref(false)

async function load(): Promise<void> {
  if (!shops.loaded) await shops.load()
  const shopId = shops.defaultId ?? 0
  if (!shopId) {
    rows.value = []
    return
  }
  loading.value = true
  try {
    rows.value = (await window.api.importData.importCoverage(shopId)) as unknown as CoverageRow[]
  } finally {
    loading.value = false
  }
}

onMounted(() => void load())

defineExpose({ load })

const legend = [
  '来源页面：经营=生意参谋经营数据；商品报表=生意参谋商品_全部；商品总览=生意参谋商品总览；推广=直通车/万相台；退款=售后-退款单；客服=客服绩效；搜索词=选词助手/引流搜索词；DSR=店铺评分页；咨询=咨询明细；图片=商品图片上传',
  '数据延迟：T-n=平台数据延迟 n 天，今日判定按 lastDate 是否达到今天可交的最新日期'
]
</script>

<template>
  <section class="glass-card block">
    <div class="block-head">
      <div>
        <h3 class="block-title">数据覆盖</h3>
        <p class="block-desc">按数据源查看已入库覆盖：最新数据日期 / 数据延迟 / 今天是否已交 / 覆盖范围 / 行数 / 最近来源文件</p>
      </div>
      <button class="btn ghost sm" :disabled="loading" @click="load">
        <AppIcon name="refresh" :size="14" /> 刷新
      </button>
    </div>

    <div class="legend">
      <div>{{ legend[0] }}</div>
      <div class="legend-line">{{ legend[1] }}</div>
    </div>

    <div v-if="rows.length === 0" class="empty">{{ loading ? '加载中…' : '暂无数据' }}</div>
    <div v-else class="table-wrap">
      <table class="tbl">
        <thead>
          <tr>
            <th>数据源</th>
            <th>最新数据日期</th>
            <th>数据延迟</th>
            <th>今天已交</th>
            <th>覆盖 / 行数</th>
            <th>最近来源文件</th>
            <th>最近导入时间</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="r in rows" :key="r.source" :class="{ 'row-empty': r.rows === 0 }">
            <td class="src">{{ r.label }}</td>
            <template v-if="r.rows === 0">
              <td class="dim" colspan="6">未导入</td>
            </template>
            <template v-else>
              <td class="mono">{{ r.lastDate ?? '—' }}</td>
              <td>
                <span v-if="r.delayDays === null" class="dim">-</span>
                <span v-else class="delay-tag">{{ 'T-' + r.delayDays }}</span>
              </td>
              <td>
                <span v-if="r.todayImported" class="flag yes">✓ 已交</span>
                <span v-else class="flag no">✗ 未交</span>
              </td>
              <td class="dim">
                {{ r.coverageRange ?? '—' }}<span v-if="r.rows" class="cnt"> / {{ r.rows }} 行</span>
              </td>
              <td class="fname" :title="r.lastSourceFile ?? ''">{{ r.lastSourceFile ?? '—' }}</td>
              <td class="dim">{{ r.lastImportedAt ?? '—' }}</td>
            </template>
          </tr>
        </tbody>
      </table>
    </div>
  </section>
</template>

<style scoped>
.block {
  padding: 20px;
  margin-bottom: 16px;
}
.block-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  margin-bottom: 12px;
}
.block-title {
  margin: 0 0 4px;
  font-size: 15px;
  font-weight: 700;
}
.block-desc {
  margin: 0;
  font-size: 12.5px;
  color: var(--text-secondary);
}
.legend {
  margin-bottom: 14px;
  padding: 10px 12px;
  border: 1px dashed var(--border);
  border-radius: 10px;
  font-size: 12px;
  line-height: 1.7;
  color: var(--text-secondary);
  background: var(--bg-base);
}
.legend-line {
  margin-top: 6px;
  padding-top: 6px;
  border-top: 1px dashed var(--border);
}
.btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 30px;
  padding: 0 12px;
  border: 1px solid var(--border);
  border-radius: 9px;
  background: transparent;
  color: var(--text-secondary);
  font-size: 12px;
  cursor: pointer;
}
.btn:hover {
  color: var(--text-primary);
  background: var(--bg-hover);
}
.btn:disabled {
  opacity: 0.5;
  cursor: default;
}
.empty {
  padding: 24px;
  text-align: center;
  color: var(--text-tertiary);
  font-size: 13px;
  border: 1.5px dashed var(--border);
  border-radius: 12px;
}
.table-wrap {
  overflow-x: auto;
}
.tbl {
  width: 100%;
  border-collapse: collapse;
  font-size: 12.5px;
}
.tbl th {
  text-align: left;
  padding: 8px 10px;
  color: var(--text-tertiary);
  font-weight: 600;
  border-bottom: 1px solid var(--border);
  white-space: nowrap;
}
.tbl td {
  padding: 8px 10px;
  border-bottom: 1px solid var(--border);
  vertical-align: middle;
}
.row-empty td {
  color: var(--text-tertiary);
}
.src {
  font-weight: 600;
  white-space: nowrap;
}
.mono {
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}
.fname {
  max-width: 240px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.cnt {
  color: var(--text-tertiary);
}
.dim {
  color: var(--text-tertiary);
}
.flag {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 8px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 600;
  white-space: nowrap;
}
.flag.yes {
  background: rgba(46, 204, 113, 0.16);
  color: #2ecc71;
}
.flag.no {
  background: rgba(255, 107, 107, 0.14);
  color: #ff6b6b;
}
.delay-tag {
  display: inline-flex;
  align-items: center;
  padding: 2px 8px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 600;
  white-space: nowrap;
  background: rgba(52, 152, 219, 0.14);
  color: #3498db;
}
</style>
