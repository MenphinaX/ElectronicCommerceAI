<script setup lang="ts">
import { onMounted, ref } from 'vue'
import AppIcon from '../AppIcon.vue'
import { useDialogStore } from '../../stores/dialog'

interface FailedRow {
  id: number
  shopId: number
  shopName: string
  sourceType: string
  sourceFile: string
  status: string
  note: string | null
  archivePath: string | null
}

interface PreviewData {
  id: number
  sourceType: string
  sourceFile: string
  status: string
  issues: string[]
  rows: string[][]
  typeKnown: boolean
}

interface ParsePreview {
  ok: boolean
  records: Array<Record<string, unknown>>
  issues: string[]
  rows: number
}

const dialog = useDialogStore()
const list = ref<FailedRow[]>([])
const expanded = ref<number | null>(null)
const preview = ref<PreviewData | null>(null)
const loadingPreview = ref(false)

// 列映射修复表单
const typeOptions = ['咨询', '搜索词', '商品报表', '商品明细', '推广', '经营', 'DSR', '客服', '退款']
const typeKeys: Record<string, string> = {
  咨询: 'consult', 搜索词: 'keyword', 商品报表: 'product_report', 商品明细: 'product_detail',
  推广: 'promo', 经营: 'daily', DSR: 'dsr', 客服: 'cs', 退款: 'refund'
}
const selType = ref('refund')
const selHeaderRow = ref(1)
const fieldOptions = [
  'date', 'keyword', 'visitors', 'pageViews', 'cartAddCount', 'favoriteCount', 'payBuyerCount',
  'payRate', 'payAmountFen', 'unitPriceFen', 'uvValueFen', 'productId', 'productName', 'salesCount',
  'consultCount', 'refundAmountFen', 'promoCostFen', 'profitFen', 'netSalesFen', 'adEntityId',
  'adEntityName', 'impressions', 'clicks', 'costFen', 'ctr', 'roas', 'orderNo', 'refundNo',
  'productTitle', 'buyerPayAmountFen', 'refundStatus', 'goodsStatus', 'afterSaleType', 'paymentTime',
  'refundFinishTime', 'refundApplyTime', 'refundReason', 'staffName', 'inquiryFinalPayCount',
  'inquiryCount', 'inquiryFinalPayRate', 'firstResponseSeconds', 'avgResponseSeconds',
  'satisfactionRate', 'replyRate', 'inquiryFinalPayAmountFen', 'indicator', 'score', 'trend',
  'industryAvg', 'compareText', 'target', 'gapText', 'descriptionScore', 'logisticsScore', 'serviceScore'
]
const mappingRows = ref<Array<{ field: string; col: string }>>([])
const mappingResult = ref('')

// 单元格修正/手动录入
const records = ref<Array<Record<string, string | number | null>>>([])
const recordFields = ref<string[]>([])
const editReason = ref('')
const submitting = ref(false)

onMounted(() => void load())

async function load(): Promise<void> {
  list.value = (await window.api.importData.failedList()) as unknown as FailedRow[]
}

defineExpose({ load })

async function toggle(id: number): Promise<void> {
  expanded.value = expanded.value === id ? null : id
  if (expanded.value === id) {
    loadingPreview.value = true
    try {
      preview.value = (await window.api.importData.manualPreview(id)) as unknown as PreviewData
      selType.value = preview.value.typeKnown ? preview.value.sourceType : 'refund'
      selHeaderRow.value = 1
      buildMappingDefault()
      mappingResult.value = ''
      records.value = []
    } finally {
      loadingPreview.value = false
    }
  }
}

function buildMappingDefault(): void {
  const p = preview.value
  if (!p || p.rows.length === 0) return
  const header = p.rows[selHeaderRow.value - 1] ?? []
  const fields = unique(header.map((c) => guessField(String(c))).filter((f): f is string => Boolean(f)))
  mappingRows.value = fields.map((f) => {
    const idx = header.findIndex((c) => guessField(String(c)) === f)
    return { field: f, col: String(idx >= 0 ? idx : 0) }
  })
}

function guessField(colName: string): string | null {
  const map: Array<[RegExp, string]> = [
    [/^日期$|^统计日期$/, 'date'], [/^搜索词$/, 'keyword'], [/^访客数$/, 'visitors'], [/^浏览量$/, 'pageViews'],
    [/^加购人数$/, 'cartAddCount'], [/^收藏人数$|^商品收藏人数$/, 'favoriteCount'], [/^支付买家数$/, 'payBuyerCount'],
    [/^支付转化率$/, 'payRate'], [/^支付金额/, 'payAmountFen'], [/^客单价$/, 'unitPriceFen'], [/^UV价值$/, 'uvValueFen'],
    [/^商品id$|^商品ID$/, 'productId'], [/^商品名称$|^商品$/, 'productName'], [/^销售件数/, 'salesCount'],
    [/^总咨询人数$/, 'consultCount'], [/^退款金额$|^退款总额$|^成功退款金额$/, 'refundAmountFen'],
    [/^推广花费/, 'promoCostFen'], [/^利润/, 'profitFen'], [/^净销售额/, 'netSalesFen'],
    [/^主体ID$/, 'adEntityId'], [/^主体名称$/, 'adEntityName'], [/^展现量$/, 'impressions'], [/^点击量$/, 'clicks'],
    [/^花费$/, 'costFen'], [/^点击率$/, 'ctr'], [/^投入产出比$|^ROI$/, 'roas'], [/^订单编号$|^订单号$/, 'orderNo'],
    [/^退款编号$/, 'refundNo'], [/^宝贝标题$/, 'productTitle'], [/^买家实际支付金额$/, 'buyerPayAmountFen'],
    [/^退款状态$/, 'refundStatus'], [/^货物状态$/, 'goodsStatus'], [/^售后类型$/, 'afterSaleType'],
    [/^订单付款时间$/, 'paymentTime'], [/^退款完结时间$/, 'refundFinishTime'], [/^退款申请时间$/, 'refundApplyTime'],
    [/^买家退款原因$/, 'refundReason'], [/^旺旺昵称$/, 'staffName'], [/^询单最终付款人数$/, 'inquiryFinalPayCount'],
    [/^询单人数$/, 'inquiryCount'], [/^询单最终付款转化率$/, 'inquiryFinalPayRate'], [/^首次响应时长/, 'firstResponseSeconds'],
    [/^平均响应时长/, 'avgResponseSeconds'], [/^客户满意率$/, 'satisfactionRate'], [/^旺旺回复率$/, 'replyRate'],
    [/^询单最终付款金额$/, 'inquiryFinalPayAmountFen'], [/^指标$/, 'indicator'], [/^得分$/, 'score'], [/^趋势$/, 'trend'],
    [/^行业均值$/, 'industryAvg'], [/^与行业对比$/, 'compareText'], [/^目标值$/, 'target'], [/^距目标值差距$/, 'gapText'],
    [/^描述得分/, 'descriptionScore'], [/^物流得分/, 'logisticsScore'], [/^服务得分/, 'serviceScore']
  ]
  for (const [re, f] of map) if (re.test(colName)) return f
  return null
}

function unique<T>(arr: T[]): T[] {
  return [...new Set(arr)]
}

function addMappingRow(): void {
  mappingRows.value.push({ field: 'date', col: '0' })
}

function removeMappingRow(i: number): void {
  mappingRows.value.splice(i, 1)
}

async function submitColumnMapping(): Promise<void> {
  if (!expanded.value) return
  const mapping: Record<string, string> = {}
  for (const m of mappingRows.value) {
    if (m.field && m.col !== '') mapping[String(selHeaderRow.value > 0 ? m.col : m.col)] = m.field
  }
  submitting.value = true
  try {
    const res = (await window.api.importData.manualMap({
      importId: expanded.value,
      type: preview.value?.typeKnown ? undefined : typeKeys[selType.value],
      headerRow: selHeaderRow.value,
      mapping
    })) as { ok: boolean; rows: number; message: string }
    mappingResult.value = res.ok ? `成功：${res.message}` : `失败：${res.message}`
    if (res.ok) {
      dialog.info('列映射修复成功', res.message)
      await load()
    } else {
      dialog.error('校验未过', res.message)
    }
  } catch (e) {
    dialog.error('修复失败', (e as Error).message)
  } finally {
    submitting.value = false
  }
}

async function loadParsePreview(): Promise<void> {
  if (!expanded.value) return
  const mapping: Record<string, string> = {}
  for (const m of mappingRows.value) if (m.field && m.col !== '') mapping[m.col] = m.field
  const res = (await window.api.importData.manualParsePreview({
    importId: expanded.value,
    type: preview.value?.typeKnown ? undefined : typeKeys[selType.value],
    headerRow: selHeaderRow.value,
    mapping
  })) as unknown as ParsePreview
  if (!res.ok) {
    dialog.error('解析预览失败', res.issues.join('；'))
    return
  }
  records.value = res.records.map((r) => ({ ...(r as Record<string, string | number | null>) }))
  recordFields.value = res.records.length > 0 ? Object.keys(res.records[0]) : []
}

async function submitCellFix(): Promise<void> {
  if (!expanded.value || records.value.length === 0) return
  submitting.value = true
  try {
    const res = (await window.api.importData.manualSubmit({
      importId: expanded.value,
      records: records.value,
      method: 'cell-fix',
      reason: editReason.value || '人工处理中心单元格修正',
      type: preview.value?.typeKnown ? undefined : typeKeys[selType.value]
    })) as { ok: boolean; rows: number; message: string }
    if (res.ok) {
      dialog.info('单元格修正成功', res.message)
      await load()
      records.value = []
    } else {
      dialog.error('校验未过', res.message)
    }
  } catch (e) {
    dialog.error('修正失败', (e as Error).message)
  } finally {
    submitting.value = false
  }
}

function headerRows(): string[][] {
  return preview.value?.rows ?? []
}

function headerCandidates(): number[] {
  const n = headerRows().length
  return Array.from({ length: Math.min(n, 20) }, (_, i) => i + 1)
}

function cellAt(row: string[], i: number): string {
  return row[i] ?? ''
}
</script>

<template>
  <section class="glass-card block">
    <div class="block-head">
      <div>
        <h3 class="block-title">人工处理中心</h3>
        <p class="block-desc">本地解析与 LLM 兜底都失败的文件在此三级修复：①列映射修复 ②单元格修正 ③手动录入（全部在软件界面内完成）</p>
      </div>
      <button class="btn ghost sm" @click="load">
        <AppIcon name="refresh" :size="14" /> 刷新
      </button>
    </div>

    <div v-if="list.length === 0" class="empty">
      没有待处理的失败文件。导入失败的文件会出现在这里。
    </div>

    <div v-for="row in list" :key="row.id" class="fail-card">
      <button class="fail-head" @click="toggle(row.id)">
        <AppIcon name="warning" :size="16" class="warn" />
        <span class="fname">{{ row.sourceFile }}</span>
        <span class="fstatus">{{ row.sourceType === 'unknown' ? '未识别类型' : row.sourceType }}</span>
        <AppIcon name="chevron-down" :size="14" class="chev" :class="{ flip: expanded === row.id }" />
      </button>
      <div v-if="expanded === row.id" class="fail-body">
        <div v-if="loadingPreview" class="loading">读取归档文件…</div>
        <template v-else-if="preview">
          <div class="issues">
            <h4 class="sec-title">失败原因</h4>
            <ul>
              <li v-for="(issue, i) in preview.issues" :key="i">{{ issue }}</li>
              <li v-if="preview.issues.length === 0">（无本地校验问题，可能为识别失败）</li>
            </ul>
          </div>

          <h4 class="sec-title">① 列映射修复</h4>
          <div class="map-bar">
            <label>类型
              <select v-model="selType" class="input select" :disabled="preview.typeKnown">
                <option v-for="t in typeOptions" :key="t" :value="typeKeys[t]">{{ t }}</option>
              </select>
            </label>
            <label>表头行
              <select v-model.number="selHeaderRow" class="input select">
                <option v-for="n in headerCandidates()" :key="n" :value="n">第 {{ n }} 行</option>
              </select>
            </label>
          </div>
          <div class="raw-table">
            <table class="tbl">
              <tbody>
                <tr v-for="(row, ri) in headerRows().slice(0, 10)" :key="ri">
                  <td class="rownum">{{ ri + 1 }}</td>
                  <td v-for="(cell, ci) in row.slice(0, 12)" :key="ci" class="cell" :title="cell">{{ cell }}</td>
                </tr>
              </tbody>
            </table>
          </div>
          <div class="map-rows">
            <div v-for="(m, i) in mappingRows" :key="i" class="map-row">
              <select v-model="m.field" class="input select wide">
                <option v-for="f in fieldOptions" :key="f" :value="f">{{ f }}</option>
              </select>
              <span class="arrow">→</span>
              <select v-model="m.col" class="input select">
                <option v-for="(cell, ci) in headerRows()[selHeaderRow - 1] ?? []" :key="ci" :value="String(ci)">
                  {{ ci }}: {{ cell || '空列' }}
                </option>
              </select>
              <button class="icon-sm" @click="removeMappingRow(i)"><AppIcon name="trash" :size="13" /></button>
            </div>
            <button class="btn ghost sm" @click="addMappingRow">
              <AppIcon name="plus-square" :size="13" /> 添加映射
            </button>
          </div>
          <div class="act-row">
            <button class="btn primary sm" :disabled="submitting" @click="submitColumnMapping">
              <AppIcon name="tool" :size="14" /> 按此映射重解析并入库
            </button>
            <button class="btn sm" @click="loadParsePreview">
              <AppIcon name="file" :size="14" /> 预览解析结果
            </button>
          </div>
          <p v-if="mappingResult" class="map-result">{{ mappingResult }}</p>

          <h4 class="sec-title">② 单元格修正</h4>
          <div v-if="records.length > 0" class="records">
            <div class="records-scroll">
              <table class="tbl">
                <thead>
                  <tr>
                    <th v-for="f in recordFields" :key="f" class="rf">{{ f }}</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="(rec, ri) in records.slice(0, 50)" :key="ri">
                    <td v-for="f in recordFields" :key="f">
                      <input class="cell-input" :value="String(rec[f] ?? '')" @input="rec[f] = ($event.target as HTMLInputElement).value" />
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p class="hint">仅展示前 50 行；大文件请用 ① 列映射修复</p>
            <div class="act-row">
              <input v-model="editReason" class="input" placeholder="修正说明（写入 fix_log，保证可回溯）" />
              <button class="btn primary sm" :disabled="submitting" @click="submitCellFix">
                <AppIcon name="check" :size="14" /> 提交修正
              </button>
            </div>
          </div>
          <p v-else class="hint">先用上方映射「预览解析结果」加载可编辑记录</p>
        </template>
      </div>
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
  margin-bottom: 14px;
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
.btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 32px;
  padding: 0 12px;
  border: 1px solid var(--border);
  border-radius: 9px;
  background: var(--bg-hover);
  color: var(--text-primary);
  font-size: 12.5px;
  cursor: pointer;
  white-space: nowrap;
}
.btn:hover:not(:disabled) {
  filter: brightness(1.12);
}
.btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.btn.primary {
  background: var(--accent);
  border-color: var(--accent);
  color: #000;
  font-weight: 600;
}
.btn.sm {
  height: 30px;
  font-size: 12px;
}
.btn.ghost {
  background: transparent;
  border-color: transparent;
  color: var(--text-secondary);
}
.empty {
  padding: 24px;
  text-align: center;
  color: var(--text-tertiary);
  font-size: 13px;
  border: 1.5px dashed var(--border);
  border-radius: 12px;
}
.fail-card {
  border: 1px solid var(--border);
  border-radius: 12px;
  margin-bottom: 10px;
  background: var(--bg-base);
  overflow: hidden;
}
.fail-head {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 12px 14px;
  border: none;
  background: transparent;
  color: var(--text-primary);
  cursor: pointer;
  text-align: left;
  font-size: 13.5px;
}
.fail-head:hover {
  background: var(--bg-hover);
}
.warn {
  color: #ffc107;
  flex-shrink: 0;
}
.fname {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.fstatus {
  font-size: 11px;
  padding: 2px 8px;
  border-radius: 999px;
  background: rgba(255, 107, 107, 0.14);
  color: #ff6b6b;
}
.chev {
  transition: transform 0.2s ease;
  color: var(--text-tertiary);
}
.chev.flip {
  transform: rotate(180deg);
}
.fail-body {
  padding: 14px;
  border-top: 1px solid var(--border);
}
.loading {
  color: var(--text-tertiary);
  font-size: 13px;
  padding: 12px;
}
.issues {
  margin-bottom: 12px;
}
.issues ul {
  margin: 6px 0 0;
  padding-left: 18px;
  color: #ff6b6b;
  font-size: 12.5px;
}
.sec-title {
  margin: 16px 0 8px;
  font-size: 13px;
  font-weight: 700;
}
.map-bar {
  display: flex;
  gap: 14px;
  margin-bottom: 10px;
  font-size: 12.5px;
  color: var(--text-secondary);
}
.input {
  height: 30px;
  padding: 0 10px;
  border-radius: 8px;
  border: 1px solid var(--border);
  background: var(--bg-hover);
  color: var(--text-primary);
  font-size: 12.5px;
  outline: none;
}
.select {
  min-width: 110px;
}
.raw-table {
  overflow-x: auto;
  border: 1px solid var(--border);
  border-radius: 10px;
  margin-bottom: 10px;
  max-height: 180px;
  overflow-y: auto;
}
.tbl {
  border-collapse: collapse;
  font-size: 11.5px;
  width: 100%;
}
.rownum {
  color: var(--text-tertiary);
  padding: 4px 8px;
  white-space: nowrap;
}
.cell {
  padding: 4px 8px;
  border-left: 1px solid var(--border);
  max-width: 160px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.map-rows {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-bottom: 10px;
}
.map-row {
  display: flex;
  align-items: center;
  gap: 8px;
}
.map-row .wide {
  min-width: 200px;
}
.arrow {
  color: var(--text-tertiary);
}
.icon-sm {
  width: 26px;
  height: 26px;
  border: none;
  border-radius: 7px;
  background: transparent;
  color: var(--text-tertiary);
  display: grid;
  place-items: center;
  cursor: pointer;
}
.icon-sm:hover {
  background: var(--bg-hover);
  color: #ff6b6b;
}
.act-row {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}
.map-result {
  margin: 8px 0 0;
  font-size: 12.5px;
  color: var(--text-secondary);
}
.records-scroll {
  overflow-x: auto;
  max-height: 320px;
  overflow-y: auto;
  border: 1px solid var(--border);
  border-radius: 10px;
}
.rf {
  padding: 6px 8px;
  font-size: 11px;
  color: var(--text-tertiary);
  border-bottom: 1px solid var(--border);
  white-space: nowrap;
}
.cell-input {
  width: 110px;
  height: 24px;
  border: 1px solid transparent;
  border-radius: 6px;
  background: transparent;
  color: var(--text-primary);
  font-size: 11.5px;
  padding: 0 6px;
}
.cell-input:focus {
  border-color: var(--accent);
  background: var(--bg-hover);
  outline: none;
}
.hint {
  font-size: 12px;
  color: var(--text-tertiary);
  margin: 8px 0;
}
</style>