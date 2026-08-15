<!-- 投产比计算页（任务 4G）：计算器 + 红线设置 + 一键带入 + 达标仪表 + 公式说明 + AI 建议 + 历史记录（子组件） -->
<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import PageShell from '../components/PageShell.vue'
import AppIcon from '../components/AppIcon.vue'
import RoiHistory, { type RoiSnapshot } from '../components/roi/RoiHistory.vue'
import { useShopsStore } from '../stores/shops'
import { computeRoi, fmtNum, fmtPct, fmtYuan, toNumberOrNull } from '../utils/roi'

defineOptions({ name: 'RoIView' })

const shops = useShopsStore()
const shopName = computed(() => {
  const s = shops.shops.find((x) => Number(x.id) === shops.defaultId)
  return s ? String(s.name) : ''
})

// ---------- 输入（字符串态，改动即实时联动） ----------
const name = ref('')
const spendStr = ref('')
const salesStr = ref('')
const refundAmountStr = ref('')
const refundRateStr = ref('')
const grossMarginStr = ref('0.3')
const targetStr = ref('0.16')
const importMode = ref<'7' | '15' | '30'>('7')
const importInfo = ref('')
const importing = ref(false)

const spend = computed(() => toNumberOrNull(spendStr.value))
const sales = computed(() => toNumberOrNull(salesStr.value))
const grossMargin = computed(() => toNumberOrNull(grossMarginStr.value) ?? 0)
const target = computed(() => toNumberOrNull(targetStr.value) ?? 0)

// 退款金额 / 退款率互推：改哪边哪边为准，另一边联动
function onRefundAmountInput(): void {
  const a = toNumberOrNull(refundAmountStr.value)
  const s = sales.value
  refundRateStr.value = a != null && s != null && s > 0 ? String((a / s).toFixed(4)) : ''
}
function onRefundRateInput(): void {
  const r = toNumberOrNull(refundRateStr.value)
  const s = sales.value
  refundAmountStr.value = r != null && s != null && s > 0 ? String((s * r).toFixed(2)) : ''
}

const result = computed(() =>
  computeRoi({
    spend: spend.value ?? 0,
    sales: sales.value ?? 0,
    refundAmount: toNumberOrNull(refundAmountStr.value),
    refundRate: toNumberOrNull(refundRateStr.value),
    grossMargin: grossMargin.value,
    targetMarketingRatio: target.value
  })
)

// 历史快照（保存/导出由子组件负责）
const snapshot = computed<RoiSnapshot>(() => {
  const r = result.value
  return {
    name: name.value,
    paramsJson: JSON.stringify({
      spend: r.spend, sales: r.sales, refundRate: r.refundRate,
      grossMargin: r.grossMargin, targetMarketingRatio: r.targetMarketingRatio
    }),
    resultJson: JSON.stringify({
      roi: r.roi, netSalesRate: r.netSalesRate, netSales: r.netSales,
      marketingRatio: r.marketingRatio, minRoi: r.minRoi, maxSpend: r.maxSpend,
      breakEvenRoi: r.breakEvenRoi, passed: r.passed
    }),
    passed: r.passed
  }
})

function loadRun(params: Record<string, unknown>): void {
  spendStr.value = params.spend != null ? String(params.spend) : ''
  salesStr.value = params.sales != null ? String(params.sales) : ''
  refundRateStr.value = params.refundRate != null ? String(params.refundRate) : ''
  grossMarginStr.value = params.grossMargin != null ? String(params.grossMargin) : ''
  targetStr.value = params.targetMarketingRatio != null ? String(params.targetMarketingRatio) : ''
  onRefundRateInput()
}

// ---------- 达标仪表（营销占比 vs 红线进度环） ----------
const RING_R = 54
const RING_C = 2 * Math.PI * RING_R
const ringPct = computed(() => {
  const m = result.value.marketingRatio
  if (m == null || target.value <= 0) return 0
  return Math.max(0, Math.min(1, m / target.value))
})
const ringOffset = computed(() => RING_C * (1 - ringPct.value))
const ringColor = computed(() => (result.value.passed ? 'var(--accent)' : 'var(--danger)'))

// ---------- 一键带入（复用看板 dailyKpi 聚合，口径一致） ----------
async function importFromDashboard(): Promise<void> {
  const shopId = shops.defaultId ?? 0
  if (!shopId) {
    importInfo.value = '请先在导入中心创建店铺并导入数据'
    return
  }
  importing.value = true
  importInfo.value = ''
  try {
    const res = (await window.api.roi.windowData({ shopId, mode: importMode.value })) as Record<string, unknown> | null
    if (!res) {
      importInfo.value = '该窗口没有经营数据'
      return
    }
    const w = res.window as { label: string; start: string; end: string }
    spendStr.value = ((Number(res.promoFen) || 0) / 100).toFixed(2)
    salesStr.value = ((Number(res.salesFen) || 0) / 100).toFixed(2)
    refundAmountStr.value = ((Number(res.refundFen) || 0) / 100).toFixed(2)
    onRefundAmountInput()
    importInfo.value = `${shopName.value} · ${w.label}（${w.start} ~ ${w.end}）：花费 ${fmtYuan((Number(res.promoFen) || 0) / 100)} 元 / 成交 ${fmtYuan((Number(res.salesFen) || 0) / 100)} 元 / 退款 ${fmtYuan((Number(res.refundFen) || 0) / 100)} 元`
  } catch (e) {
    importInfo.value = '带入失败：' + (e as Error).message
  } finally {
    importing.value = false
  }
}

// ---------- AI 建议（加分项：绑定「付费推广优化师」技能，无 key 提示不崩） ----------
const adviceLoading = ref(false)
const adviceText = ref('')
const adviceSkill = ref('')
const adviceError = ref('')
async function askAdvice(): Promise<void> {
  const r = result.value
  adviceLoading.value = true
  adviceError.value = ''
  adviceText.value = ''
  try {
    const res = (await window.api.roi.advice({
      spend: r.spend, sales: r.sales, refundRate: r.refundRate, netSales: r.netSales,
      marketingRatio: r.marketingRatio, roi: r.roi, grossMargin: r.grossMargin,
      targetMarketingRatio: r.targetMarketingRatio, minRoi: r.minRoi, maxSpend: r.maxSpend,
      passed: r.passed, shopName: shopName.value || null
    })) as { ok: boolean; configured: boolean; skillName?: string | null; content?: string | null; error?: string | null }
    if (res.ok && res.content) {
      adviceText.value = res.content
      adviceSkill.value = res.skillName ?? ''
    } else {
      adviceError.value = res.error ?? '建议生成失败'
    }
  } catch (e) {
    adviceError.value = (e as Error).message
  } finally {
    adviceLoading.value = false
  }
}

onMounted(() => {
  void shops.load()
})
</script>

<template>
  <PageShell title="投产比计算" desc="实际投产比 / 营销占比 / 红线告警 · 口径=任务书模板（天猫投产比公式.xls）">
    <div class="roi-layout">
      <div class="roi-left">
        <section class="card">
          <h3 class="card-title"><AppIcon name="roi" :size="15" /> 计算器</h3>
          <label class="field">
            <span class="label">计算名称</span>
            <input v-model="name" class="input" data-k="name" placeholder="如：近7天投产比核算" />
          </label>
          <div class="grid2">
            <label class="field">
              <span class="label">推广花费（元）</span>
              <input v-model="spendStr" class="input" data-k="spend" type="number" min="0" step="0.01" placeholder="10" />
            </label>
            <label class="field">
              <span class="label">成交金额（元）</span>
              <input v-model="salesStr" class="input" data-k="sales" type="number" min="0" step="0.01" placeholder="130" />
            </label>
            <label class="field">
              <span class="label">退款金额（元）</span>
              <input v-model="refundAmountStr" class="input" data-k="refundAmount" type="number" min="0" step="0.01" @input="onRefundAmountInput" />
            </label>
            <label class="field">
              <span class="label">退款率（%）</span>
              <input v-model="refundRateStr" class="input" data-k="refundRate" type="number" min="0" max="100" step="0.1" @input="onRefundRateInput" />
            </label>
          </div>
          <p class="hint">退款金额与退款率二选一填写，自动互推（退款率 = 退款金额 ÷ 成交金额）。</p>
        </section>

        <section class="card">
          <h3 class="card-title"><AppIcon name="target" :size="15" /> 红线设置</h3>
          <div class="grid2">
            <label class="field">
              <span class="label">目标营销占比（%）</span>
              <input v-model="targetStr" class="input" data-k="target" type="number" min="0" max="100" step="0.1" />
            </label>
            <label class="field">
              <span class="label">毛利率（%）</span>
              <input v-model="grossMarginStr" class="input" data-k="margin" type="number" min="0" max="100" step="0.1" />
            </label>
          </div>
          <div class="redline">
            <div>达标需最低投产比 <b>{{ fmtNum(result.minRoi) }}</b></div>
            <div>可承受花费上限 <b>{{ fmtYuan(result.maxSpend) }} 元</b></div>
          </div>
        </section>

        <section class="card">
          <h3 class="card-title"><AppIcon name="download" :size="15" /> 一键带入看板数据</h3>
          <div class="import-row">
            <select v-model="importMode" class="input select">
              <option value="7">近7天</option>
              <option value="15">近15天</option>
              <option value="30">近30天</option>
            </select>
            <button class="btn btn-primary" :disabled="importing" @click="importFromDashboard">
              {{ importing ? '带入中…' : '一键带入' }}
            </button>
          </div>
          <p class="hint">口径与数据看板 KPI 一致（复用 dailyKpi 聚合）。</p>
          <p v-if="importInfo" class="import-info">{{ importInfo }}</p>
        </section>
      </div>

      <div class="roi-right">
        <section class="card gauge-card">
          <h3 class="card-title"><AppIcon name="trend" :size="15" /> 达标仪表</h3>
          <div class="gauge-wrap">
            <svg class="gauge" width="150" height="150" viewBox="0 0 150 150">
              <circle class="gauge-track" cx="75" cy="75" :r="RING_R" />
              <circle class="gauge-bar" cx="75" cy="75" :r="RING_R"
                :stroke="ringColor" :stroke-dasharray="RING_C" :stroke-dashoffset="ringOffset" />
              <text x="75" y="70" class="gauge-val" text-anchor="middle">{{ fmtPct(result.marketingRatio) }}</text>
              <text x="75" y="92" class="gauge-label" text-anchor="middle">营销占比</text>
            </svg>
            <div class="gauge-status" :class="result.passed ? 'ok' : 'over'">
              <AppIcon :name="result.passed ? 'check' : 'warning'" :size="15" />
              {{ result.passed ? '达标' : '未达标' }}
            </div>
          </div>
          <div v-if="!result.passed && result.marketingRatio != null" class="alarm">
            <div>营销占比 {{ fmtPct(result.marketingRatio) }} 已超红线 {{ fmtPct(result.targetMarketingRatio) }}</div>
            <div v-if="result.maxSpend != null">需压低花费至 {{ fmtYuan(result.maxSpend) }} 元以内（再降 {{ fmtYuan(result.spend - result.maxSpend) }} 元）</div>
            <div v-if="result.minRoi != null">或把投产比从 {{ fmtNum(result.roi) }} 提升到 {{ fmtNum(result.minRoi) }} 以上</div>
          </div>
        </section>

        <section class="card">
          <h3 class="card-title"><AppIcon name="target" :size="15" /> 计算结果</h3>
          <div class="metrics">
            <div class="metric"><span class="m-label">实际投产比</span><span class="m-value">{{ fmtNum(result.roi) }}</span></div>
            <div class="metric"><span class="m-label">净成交率</span><span class="m-value">{{ fmtPct(result.netSalesRate) }}</span></div>
            <div class="metric"><span class="m-label">净成交额</span><span class="m-value">{{ fmtYuan(result.netSales) }} 元</span></div>
            <div class="metric"><span class="m-label">营销占比</span><span class="m-value">{{ fmtPct(result.marketingRatio) }}</span></div>
            <div class="metric"><span class="m-label">保本投产比</span><span class="m-value">{{ fmtNum(result.breakEvenRoi) }}</span></div>
            <div class="metric"><span class="m-label">最低投产比红线</span><span class="m-value">{{ fmtNum(result.minRoi) }}</span></div>
          </div>
        </section>

        <section class="card">
          <h3 class="card-title"><AppIcon name="ask" :size="15" /> AI 投放建议 <span v-if="adviceSkill" class="advice-skill">{{ adviceSkill }}</span></h3>
          <button class="btn" :disabled="adviceLoading" @click="askAdvice">
            {{ adviceLoading ? '生成中…' : '生成建议' }}
          </button>
          <p v-if="adviceError" class="advice-error">{{ adviceError }}</p>
          <pre v-if="adviceText" class="advice-text">{{ adviceText }}</pre>
        </section>

        <section class="card">
          <details class="formula">
            <summary class="card-title formula-summary"><AppIcon name="info" :size="15" /> 公式说明（点击展开）</summary>
            <ul class="formula-list">
              <li>实际投产比 = 成交金额 ÷ 推广花费（模板例 130÷10=13）</li>
              <li>退款率 = 退款金额 ÷ 成交金额；净成交率 = 1 − 退款率（模板 0.4 → 0.6）</li>
              <li>净成交额 = 成交金额 × 净成交率（模板 130×0.6=78）</li>
              <li>营销占比 = 推广花费 ÷ 净成交额（模板 10÷78=12.82%）</li>
              <li>达标判定：营销占比 ≤ 目标营销占比（默认 16%，可改）</li>
              <li>最低投产比红线 = 1 ÷ (目标营销占比 × 净成交率)（模板 1÷(0.16×0.6)=10.42）</li>
              <li>可承受花费上限 = 成交金额 × 净成交率 × 目标营销占比（模板 78×16%=12.48）</li>
              <li>保本投产比 = 1 ÷ 毛利率（30% → 3.33）</li>
            </ul>
          </details>
        </section>

        <RoiHistory :snapshot="snapshot" @load="loadRun" />
      </div>
    </div>
  </PageShell>
</template>

<style scoped>
.roi-layout {
  display: grid;
  grid-template-columns: 360px 1fr;
  gap: 16px;
  align-items: start;
}
.roi-left,
.roi-right {
  display: flex;
  flex-direction: column;
  gap: 16px;
  min-width: 0;
}
.card {
  padding: 16px;
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  background: var(--bg-card);
}
.card-title {
  display: flex;
  align-items: center;
  gap: 7px;
  margin: 0 0 12px;
  font-size: 14.5px;
  font-weight: 700;
}
.field {
  display: flex;
  flex-direction: column;
  gap: 5px;
  margin-bottom: 10px;
}
.label {
  font-size: 12px;
  color: var(--text-secondary);
}
.input {
  width: 100%;
  height: 34px;
  padding: 0 10px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--bg-base);
  color: var(--text-primary);
  font-size: 13px;
  outline: none;
}
.input:focus {
  border-color: var(--accent);
}
.select {
  width: auto;
}
.grid2 {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
}
.grid2 .field {
  margin-bottom: 0;
}
.hint {
  margin: 8px 0 0;
  font-size: 11.5px;
  color: var(--text-tertiary);
  line-height: 1.6;
}
.redline {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin-top: 12px;
  padding: 10px 12px;
  border-radius: 8px;
  background: var(--accent-soft);
  font-size: 12.5px;
  color: var(--text-secondary);
}
.redline b {
  color: var(--accent);
}
.import-row {
  display: flex;
  gap: 8px;
}
.import-info {
  margin: 8px 0 0;
  font-size: 11.5px;
  color: var(--text-secondary);
  line-height: 1.6;
}
.gauge-wrap {
  display: flex;
  align-items: center;
  gap: 18px;
}
.gauge-track {
  fill: none;
  stroke: var(--bg-hover);
  stroke-width: 12;
}
.gauge-bar {
  fill: none;
  stroke-width: 12;
  stroke-linecap: round;
  transform: rotate(-90deg);
  transform-origin: 75px 75px;
  transition: stroke-dashoffset 0.4s ease, stroke 0.2s ease;
}
.gauge-val {
  fill: var(--text-primary);
  font-size: 20px;
  font-weight: 700;
}
.gauge-label {
  fill: var(--text-tertiary);
  font-size: 11px;
}
.gauge-status {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 12px;
  border-radius: 999px;
  font-size: 13px;
  font-weight: 700;
}
.gauge-status.ok {
  background: var(--accent-soft);
  color: var(--accent);
}
.gauge-status.over {
  background: rgba(229, 72, 77, 0.16);
  color: var(--danger);
}
.alarm {
  margin-top: 12px;
  padding: 10px 12px;
  border: 1px solid rgba(229, 72, 77, 0.55);
  border-radius: 8px;
  background: rgba(229, 72, 77, 0.14);
  color: var(--danger);
  font-size: 12.5px;
  line-height: 1.8;
}
.metrics {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  gap: 10px;
}
.metric {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 12px;
  border-radius: 10px;
  background: var(--bg-elevated);
}
.m-label {
  font-size: 11.5px;
  color: var(--text-tertiary);
}
.m-value {
  font-size: 19px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}
.advice-skill {
  margin-left: auto;
  font-size: 11px;
  font-weight: 600;
  color: var(--info);
}
.advice-error {
  margin: 10px 0 0;
  padding: 8px 10px;
  border-radius: 8px;
  background: rgba(229, 72, 77, 0.14);
  color: var(--danger);
  font-size: 12px;
}
.advice-text {
  margin: 10px 0 0;
  padding: 10px 12px;
  border-radius: 8px;
  background: var(--bg-elevated);
  font-size: 12.5px;
  line-height: 1.7;
  white-space: pre-wrap;
  word-break: break-word;
  font-family: inherit;
  color: var(--text-primary);
}
.formula-summary {
  cursor: pointer;
  list-style: none;
}
.formula-list {
  margin: 0;
  padding-left: 18px;
  font-size: 12px;
  color: var(--text-secondary);
  line-height: 2;
}
</style>
