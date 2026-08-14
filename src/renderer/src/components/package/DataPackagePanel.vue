<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import AppIcon from '../AppIcon.vue'
import { useShopsStore } from '../../stores/shops'
import { useDialogStore } from '../../stores/dialog'

interface PackagePreview {
  ok: boolean
  encrypted: boolean
  manifest?: {
    shop?: { name: string; platform: string }
    dateRange?: { start: string | null; end: string | null }
    exportedAt?: string
    tables?: Record<string, { table: string; label: string; rows: number; sha256: string }>
    images?: { enabled: boolean; files: Array<{ path: string; size: number; sha256: string }> }
  }
  message?: string
}

interface TableResult {
  table: string
  label: string
  rows: number
  imported: number
  skipped: number
}

interface ImportResult {
  ok: boolean
  message?: string
  shopId?: number
  shopName?: string
  shopCreated?: boolean
  dateRange?: { start: string | null; end: string | null }
  tables?: TableResult[]
  images?: { files: number; restored: number }
  exportedAt?: string
  appVersion?: string
}

const shops = useShopsStore()
const dialog = useDialogStore()

// 导出表单
const shopId = ref<number | null>(null)
const dateStart = ref('')
const dateEnd = ref('')
const exportPassword = ref('')
const exporting = ref(false)

// 导入表单
const filePath = ref('')
const importPassword = ref('')
const importing = ref(false)
const preview = ref<PackagePreview | null>(null)
const result = ref<ImportResult | null>(null)

const shopOptions = computed(() => shops.shops)

onMounted(async () => {
  await shops.refresh()
  shopId.value = shops.defaultId
})

function fullRangeHint(): string {
  return dateStart.value || dateEnd.value ? `按日期范围：${dateStart.value || '最早'} ~ ${dateEnd.value || '最新'}` : '全部日期'
}

async function doExport(): Promise<void> {
  if (!shopId.value) {
    dialog.error('请先选择店铺', '导出数据包必须指定归属店铺')
    return
  }
  exporting.value = true
  try {
    const r = (await window.api.dataPackage.export({
      shopId: shopId.value,
      dateStart: dateStart.value || null,
      dateEnd: dateEnd.value || null,
      password: exportPassword.value || null
    })) as Record<string, unknown>
    if (!r.ok) {
      dialog.error('导出失败', r.canceled ? '已取消选择保存位置' : String(r.message ?? '未知错误'))
      return
    }
    const m = (r.manifest ?? {}) as PackagePreview['manifest']
    const totalRows = Object.values(m?.tables ?? {}).reduce((s, t) => s + t.rows, 0)
    const imgCount = m?.images?.files.length ?? 0
    dialog.info(
      '数据包已导出',
      `已导出 ${String(r.filePath ?? '')}\n${totalRows} 条记录、${imgCount} 张商品图片${exportPassword.value ? '，已加密' : ''}`
    )
  } catch (e) {
    dialog.error('导出失败', (e as Error).message)
  } finally {
    exporting.value = false
  }
}

async function pickFile(): Promise<void> {
  const r = await window.api.dataPackage.pickFile()
  if (!r.ok || !r.filePath) return
  filePath.value = r.filePath
  result.value = null
  await inspect()
}

async function inspect(): Promise<void> {
  if (!filePath.value) return
  preview.value = (await window.api.dataPackage.inspect({ filePath: filePath.value, password: importPassword.value || null })) as unknown as PackagePreview
}

async function doImport(): Promise<void> {
  if (!filePath.value) {
    dialog.error('请先选择数据包文件', '点击「选择数据包」挑选 .zip 数据包')
    return
  }
  if (preview.value && !preview.value.ok && preview.value.encrypted && !importPassword.value) {
    dialog.error('该数据包已加密', '请输入导出时设置的密码后再导入')
    return
  }
  importing.value = true
  try {
    const r = (await window.api.dataPackage.import({
      filePath: filePath.value,
      password: importPassword.value || null
    })) as unknown as ImportResult
    result.value = r
    if (!r.ok) {
      dialog.error('导入失败', String(r.message ?? '未知错误'))
      return
    }
    const total = (r.tables ?? []).reduce((s, t) => s + t.imported, 0)
    const skipped = (r.tables ?? []).reduce((s, t) => s + t.skipped, 0)
    dialog.info(
      r.shopCreated ? '数据包导入完成' : '数据包已合并',
      `${r.shopName ?? ''}：新增 ${total} 条、跳过 ${skipped} 条${(r.images?.restored ?? 0) > 0 ? `，还原图片 ${r.images?.restored} 张` : ''}`
    )
    await shops.refresh()
  } catch (e) {
    dialog.error('导入失败', (e as Error).message)
  } finally {
    importing.value = false
  }
}

function previewRows(): Array<{ table: string; label: string; rows: number }> {
  const m = preview.value?.manifest
  if (!m?.tables) return []
  return Object.values(m.tables).filter((t) => t.table !== 'shops')
}
</script>

<template>
  <div class="pkg-wrap">
    <!-- 导出 -->
    <section class="glass-card block">
      <div class="block-head">
        <div>
          <h3 class="block-title">导出数据包</h3>
          <p class="block-desc">选店铺 + 日期范围 → 独立 SQLite 副本 + manifest 校验清单，打包 .zip（可设密码）</p>
        </div>
      </div>
      <div class="form-row">
        <select v-model="shopId" class="input select">
          <option v-for="s in shopOptions" :key="s.id" :value="s.id">{{ s.name }}（{{ s.platform }}）</option>
        </select>
        <input v-model="dateStart" class="input date" type="date" title="开始日期（留空=最早）" />
        <span class="range-sep">至</span>
        <input v-model="dateEnd" class="input date" type="date" title="结束日期（留空=最新）" />
      </div>
      <div class="form-row">
        <input v-model="exportPassword" class="input" type="password" placeholder="可选：设置数据包密码（导入端须输入）" />
        <button class="btn primary" :disabled="exporting" @click="doExport">
          <AppIcon name="export" :size="15" /> {{ exporting ? '导出中…' : '导出数据包' }}
        </button>
      </div>
      <p class="hint">{{ fullRangeHint() }}；数据包含经营/商品/推广/退款/客服/搜索词/DSR/AI 评语/商品图片绑定</p>
    </section>

    <!-- 导入 -->
    <section class="glass-card block">
      <div class="block-head">
        <div>
          <h3 class="block-title">导入数据包</h3>
          <p class="block-desc">校验 manifest（行数 + 校验和）后合并入库；重复导入不重复；含图片自动还原</p>
        </div>
      </div>
      <div class="form-row">
        <input :value="filePath" class="input" readonly placeholder="未选择数据包文件" />
        <button class="btn ghost" @click="pickFile"><AppIcon name="folder" :size="15" /> 选择数据包</button>
      </div>
      <div v-if="filePath" class="form-row">
        <input v-model="importPassword" class="input" type="password" placeholder="数据包密码（未加密可留空）" @input="inspect" />
        <button class="btn primary" :disabled="importing" @click="doImport">
          <AppIcon name="download" :size="15" /> {{ importing ? '导入中…' : '导入数据包' }}
        </button>
      </div>

      <!-- 包预览 -->
      <div v-if="preview && preview.ok && preview.manifest" class="preview">
        <div class="preview-line">
          <span class="muted">店铺：</span>{{ preview.manifest.shop?.name ?? '?' }}
          <span class="muted">｜导出：</span>{{ preview.manifest.exportedAt ?? '?' }}
          <span class="muted">｜日期：</span>{{ preview.manifest.dateRange?.start ?? '全部' }} ~ {{ preview.manifest.dateRange?.end ?? '全部' }}
          <span v-if="preview.encrypted" class="tag">已加密</span>
        </div>
        <div class="preview-grid">
          <div v-for="t in previewRows()" :key="t.table" class="preview-cell">
            <span class="muted">{{ t.label }}</span>
            <b>{{ t.rows.toLocaleString() }}</b>
          </div>
          <div class="preview-cell">
            <span class="muted">商品图片</span>
            <b>{{ preview.manifest.images?.files.length ?? 0 }}</b>
          </div>
        </div>
      </div>
      <div v-else-if="preview && !preview.ok" class="preview error-line">
        {{ preview.encrypted ? '该数据包已加密，请输入密码查看内容' : preview.message }}
      </div>

      <!-- 导入结果 -->
      <div v-if="result && result.ok" class="result">
        <div class="result-head">
          <AppIcon name="check" :size="16" class="ok-icon" />
          <b>{{ result.shopName }}</b>
          <span class="tag" :class="result.shopCreated ? 'tag-new' : ''">{{ result.shopCreated ? '店铺自动创建' : '店铺已存在（合并）' }}</span>
          <span class="muted">新增 {{ (result.tables ?? []).reduce((s, t) => s + t.imported, 0) }} 条 / 跳过 {{ (result.tables ?? []).reduce((s, t) => s + t.skipped, 0) }} 条</span>
        </div>
        <table class="tbl">
          <thead>
            <tr><th>数据表</th><th>包内行数</th><th>本次导入</th><th>跳过（已存在）</th></tr>
          </thead>
          <tbody>
            <tr v-for="t in result.tables ?? []" :key="t.table">
              <td>{{ t.label }}</td>
              <td>{{ t.rows.toLocaleString() }}</td>
              <td>{{ t.imported.toLocaleString() }}</td>
              <td>{{ t.skipped.toLocaleString() }}</td>
            </tr>
            <tr>
              <td>商品图片文件</td>
              <td>{{ result.images?.files ?? 0 }}</td>
              <td>{{ result.images?.restored ?? 0 }}</td>
              <td>0</td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  </div>
</template>

<style scoped>
.pkg-wrap {
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.block {
  padding: 20px;
}
.block-head {
  display: flex;
  align-items: center;
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
.form-row {
  display: flex;
  gap: 10px;
  margin-bottom: 12px;
  align-items: center;
}
.input {
  height: 34px;
  padding: 0 12px;
  border-radius: 10px;
  border: 1px solid var(--border);
  background: var(--bg-hover);
  color: var(--text-primary);
  font-size: 13px;
  outline: none;
  flex: 1;
}
.select {
  flex: 0 0 240px;
}
.date {
  flex: 0 0 150px;
}
.range-sep {
  color: var(--text-tertiary);
  font-size: 12px;
}
.btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 34px;
  padding: 0 14px;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: var(--bg-hover);
  color: var(--text-primary);
  font-size: 13px;
  cursor: pointer;
  white-space: nowrap;
}
.btn:hover {
  filter: brightness(1.12);
}
.btn.primary {
  background: var(--accent);
  border-color: var(--accent);
  color: #000;
  font-weight: 600;
}
.btn.ghost {
  background: transparent;
  border-color: transparent;
  color: var(--text-secondary);
}
.btn:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}
.hint {
  margin: 0;
  font-size: 12px;
  color: var(--text-tertiary);
}
.preview {
  margin-top: 12px;
  padding: 12px 14px;
  border: 1px solid var(--border);
  border-radius: 12px;
  background: var(--bg-base);
  font-size: 13px;
}
.preview-line {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
  margin-bottom: 10px;
}
.preview-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
  gap: 8px;
}
.preview-cell {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 8px 10px;
  border-radius: 10px;
  background: var(--bg-hover);
}
.preview-cell b {
  font-size: 14px;
}
.muted {
  color: var(--text-tertiary);
}
.error-line {
  color: #ff6b6b;
}
.tag {
  border-radius: 999px;
  padding: 2px 10px;
  font-size: 11px;
  font-weight: 600;
  background: var(--bg-hover);
  color: var(--text-secondary);
}
.tag-new {
  background: var(--accent-soft);
  color: var(--accent);
}
.result {
  margin-top: 12px;
}
.result-head {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  margin-bottom: 10px;
  font-size: 13.5px;
}
.ok-icon {
  color: var(--accent);
}
.tbl {
  width: 100%;
  border-collapse: collapse;
  font-size: 12.5px;
}
.tbl th,
.tbl td {
  text-align: left;
  padding: 8px 10px;
  border-bottom: 1px solid var(--border);
}
.tbl th {
  color: var(--text-secondary);
  font-weight: 600;
}
</style>