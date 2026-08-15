<!-- 首次启动引导（任务 10）：品牌首屏 + 步骤式引导，可随时跳过，跳过不丢已做内容 -->
<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import AppIcon from '../AppIcon.vue'
import BrandIcon from '../BrandIcon.vue'
import AvatarPicker from '../profile/AvatarPicker.vue'
import OnboardingImport from './OnboardingImport.vue'
import { useSettingsStore } from '../../stores/settings'
import { useShopsStore } from '../../stores/shops'
import { useCommentsStore } from '../../stores/comments'
import { useModelsStore } from '../../stores/models'
import { MODEL_PRESETS } from '../../data/model-presets'
import { useDialogStore } from '../../stores/dialog'

const emit = defineEmits<{ done: [] }>()

const settings = useSettingsStore()
const shops = useShopsStore()
const comments = useCommentsStore()
const dialog = useDialogStore()
const router = useRouter()

const step = ref(0)
const username = ref(settings.profile.username || '')
const avatar = ref(settings.profile.avatar || 'brand')
const shopName = ref('')
const platform = ref('天猫')
const shopId = ref(0)
const creatingShop = ref(false)
const importSummary = ref<{ files: number; rows: number }>({ files: 0, rows: 0 })
const commentsRunning = ref(false)
const commentsError = ref('')
const commentCount = ref(0)
const models = useModelsStore()
const modelProvider = ref('deepseek')
const modelName = ref('')
const modelBase = ref('')
const modelKey = ref('')
const modelSaving = ref(false)
const modelTesting = ref(false)
const modelTestResult = ref<{ ok: boolean; text: string } | null>(null)

const STEPS = ['欢迎', '认识你', '创建店铺', '导入数据', '配置 AI 模型', '首批评语', '完成']
const stepLabel = computed(() => STEPS[step.value])
const isFirst = computed(() => step.value === 0)
const isLast = computed(() => step.value === 6)
const canNext = computed(() => {
  if (step.value === 1) return username.value.trim().length > 0
  if (step.value === 2) return shopName.value.trim().length > 0
  return true
})

const PLATFORMS = ['天猫', '淘宝', '京东', '拼多多', '抖音', '快手', '其他']

async function saveProfile(): Promise<void> {
  await settings.setProfile({ username: username.value.trim() || '店主', avatar: avatar.value })
}

async function createShop(): Promise<void> {
  if (creatingShop.value || shopId.value) return
  creatingShop.value = true
  try {
    const id = await shops.create(shopName.value.trim() || '我的店铺', platform.value)
    await shops.refresh()
    shopId.value = id
    await settings.selectShop(String(id))
  } finally {
    creatingShop.value = false
  }
}

async function next(): Promise<void> {
  if (step.value === 1) await saveProfile()
  if (step.value === 2) await createShop()
  if (step.value === 4) {
    await saveModelIfFilled()
    step.value += 1
    return
  }
  if (step.value === 5) {
    await runComments()
    return
  }
  if (step.value < 6) step.value += 1
}

function back(): void {
  if (step.value > 0) step.value -= 1
}

function onImported(results: Array<{ status: string; rows: number; detectedLabel: string }>): void {
  const ok = results.filter((r) => r.status === 'ok')
  importSummary.value = {
    files: ok.length,
    rows: ok.reduce((s, r) => s + (Number(r.rows) || 0), 0)
  }
}

async function runComments(): Promise<void> {
  if (commentsRunning.value) return
  commentsRunning.value = true
  commentsError.value = ''
  try {
    await comments.regenerate()
    commentCount.value = comments.items.filter((i) => i.content).length
    step.value = 6
  } catch (e) {
    commentsError.value = e instanceof Error ? e.message : String(e)
    dialog.error('生成失败', commentsError.value + '（可跳过此步，稍后在看板重试）')
    step.value = 6
  } finally {
    commentsRunning.value = false
  }
}

function pickModelPreset(): void {
  const preset = MODEL_PRESETS.find((x) => x.id === modelProvider.value)
  modelName.value = preset?.model ?? ''
  modelBase.value = preset?.baseUrl ?? ''
}

const modelConfigured = computed(() => {
  if (!models.loaded || models.defaultId === null) return null
  const m = models.models.find((x) => x.id === models.defaultId)
  return m ? { name: m.name, keySet: m.apiKeySet } : null
})

async function ensureModelsLoaded(): Promise<void> {
  if (!models.loaded) await models.load()
  const d = models.defaultId
  const m = d !== null ? models.models.find((x) => x.id === d) : undefined
  if (m) {
    const presetId = MODEL_PRESETS.some((x) => x.id === m.provider) ? m.provider : 'deepseek'
    modelProvider.value = presetId
    modelName.value = m.name
    modelBase.value = m.baseUrl ?? ''
  } else {
    pickModelPreset()
  }
}

async function saveModelIfFilled(): Promise<void> {
  if (!modelName.value.trim() || !modelBase.value.trim()) return
  if (models.defaultId !== null) {
    await models.update(models.defaultId, { name: modelName.value, provider: modelProvider.value, baseUrl: modelBase.value, apiKey: modelKey.value || undefined })
  } else {
    const id = await models.create({ name: modelName.value, provider: modelProvider.value, baseUrl: modelBase.value, apiKey: modelKey.value || undefined })
    await models.setDefault(id)
  }
  modelKey.value = ''
}

async function saveAndTestModel(): Promise<void> {
  if (!modelName.value.trim() || !modelBase.value.trim()) {
    dialog.error('信息不完整', '请填写模型名与 base_url')
    return
  }
  modelSaving.value = true
  modelTestResult.value = null
  try {
    let id = models.defaultId
    if (id !== null) {
      await models.update(id, { name: modelName.value, provider: modelProvider.value, baseUrl: modelBase.value, apiKey: modelKey.value || undefined })
    } else {
      id = await models.create({ name: modelName.value, provider: modelProvider.value, baseUrl: modelBase.value, apiKey: modelKey.value || undefined })
      await models.setDefault(id)
    }
    modelKey.value = ''
    modelSaving.value = false
    modelTesting.value = true
    const r = await models.test(id)
    modelTestResult.value = {
      ok: r.ok,
      text: r.ok ? `连通正常（${r.elapsedMs} ms）` : `连通失败（${r.elapsedMs} ms）：${r.message ?? '未知错误'}`
    }
  } catch (e) {
    dialog.error('保存失败', e instanceof Error ? e.message : String(e))
  } finally {
    modelSaving.value = false
    modelTesting.value = false
  }
}

watch(step, (v) => {
  if (v === 4) void ensureModelsLoaded()
  if (v === 5) void comments.load()
})

async function finish(): Promise<void> {
  await saveProfile()
  await settings.setOnboardingDone(true)
  emit('done')
  void router.push('/dashboard')
}

async function skip(): Promise<void> {
  await saveProfile()
  await settings.setOnboardingDone(true)
  emit('done')
  void router.push('/dashboard')
}
</script>

<template>
  <div class="ob-shell">
    <div class="ob-card glass-card">
      <!-- 品牌首屏 -->
      <div v-if="isFirst" class="ob-welcome">
        <div class="welcome-mark">
          <BrandIcon :size="52" class="welcome-logo" />
        </div>
        <h1 class="welcome-title">EC AI</h1>
        <p class="welcome-sub">Electronic Commerce AI</p>
        <p class="welcome-line">欢迎，先把今天的经营看清楚</p>
        <p class="welcome-desc">数据导入、看板分析、AI 评语、日报导出，一个工作台全部搞定。数据只存本机。</p>
        <div class="welcome-feats">
          <span>本地存储</span>
          <span>AI 评语</span>
          <span>一键日报</span>
        </div>
        <button class="btn btn-primary welcome-btn" type="button" @click="step = 1">开始使用</button>
        <p class="shortcut-tip">常用快捷键：Ctrl+I 导入 · Ctrl+R 重新生成评语 · Ctrl+E 导出日报</p>
      </div>

      <!-- 步骤式引导 -->
      <template v-else-if="!isLast">
        <div class="ob-head">
          <div class="ob-progress">
            <span v-for="(label, i) in STEPS.slice(1, 6)" :key="label" class="dot" :class="{ on: i + 1 === step, done: i + 1 < step }"></span>
          </div>
          <span class="ob-step-label">{{ stepLabel }}</span>
          <span class="ob-step-count">{{ step }} / 5</span>
        </div>

        <div class="ob-body">
          <!-- 认识你 -->
          <div v-if="step === 1" class="step-pane">
            <h2 class="step-title">先认识你</h2>
            <p class="step-desc">取一个用户名，选一个顺眼的头像，之后会出现在开屏问候里</p>
            <label class="field-label" for="ob-username">用户名</label>
            <input id="ob-username" v-model="username" class="input" type="text" maxlength="24" placeholder="例如：店长小张" />
            <p class="field-label avatar-label">选择头像</p>
            <AvatarPicker v-model="avatar" />
          </div>

          <!-- 创建店铺 -->
          <div v-else-if="step === 2" class="step-pane">
            <h2 class="step-title">创建你的店铺</h2>
            <p class="step-desc">导入的数据会归属到这个店铺；之后可在顶栏切换多店铺</p>
            <label class="field-label" for="ob-shop">店铺名称</label>
            <input id="ob-shop" v-model="shopName" class="input" type="text" maxlength="40" placeholder="例如：XX旗舰店" />
            <p class="field-label">店铺平台</p>
            <div class="platform-row">
              <button v-for="pl in PLATFORMS" :key="pl" type="button" class="chip" :class="{ on: platform === pl }" @click="platform = pl">{{ pl }}</button>
            </div>
            <p class="ob-tip">创建后会自动设为当前店铺</p>
          </div>

          <!-- 导入数据 -->
          <div v-else-if="step === 3" class="step-pane">
            <h2 class="step-title">导入经营数据</h2>
            <p class="step-desc">把生意参谋导出的报表拖进来，每个文件识别成功会有打勾提示；可稍后在导入中心补导</p>
            <OnboardingImport :shop-id="shopId" @imported="onImported" />
          </div>

          <!-- 配置 AI 模型 -->
          <div v-else-if="step === 4" class="step-pane">
            <h2 class="step-title">配置 AI 模型</h2>
            <p class="step-desc">评语与 AI 对话需要模型：选预设、填 base_url 与 API key 后可测连通性；也可先跳过，稍后在「设置 → AI 模型」配置</p>
            <div v-if="modelConfigured" class="model-set-banner">
              <span class="badge ok">已设置</span>
              <span class="model-set-name">{{ modelConfigured.name }}</span>
              <span class="model-set-key">{{ modelConfigured.keySet ? 'key：已设置' : 'key：未设置' }}</span>
            </div>
            <template v-else>
              <p v-if="!models.loaded" class="ob-tip">正在读取模型配置…</p>
              <template v-else>
                <label class="field-label" for="ob-model-provider">服务商预设</label>
                <select id="ob-model-provider" v-model="modelProvider" class="input" @change="pickModelPreset">
                  <option v-for="preset in MODEL_PRESETS" :key="preset.id" :value="preset.id">{{ preset.label }}</option>
                  <option value="openai-compatible">通用 OpenAI 兼容</option>
                </select>
                <label class="field-label" for="ob-model-name">模型名</label>
                <input id="ob-model-name" v-model="modelName" class="input" type="text" maxlength="80" placeholder="如 deepseek-chat / gpt-4o-mini" />
                <label class="field-label" for="ob-model-base">base_url</label>
                <input id="ob-model-base" v-model="modelBase" class="input" type="text" maxlength="200" placeholder="OpenAI 兼容接口地址，如 https://api.deepseek.com/v1" />
                <label class="field-label" for="ob-model-key">API key（Ollama 本地可留空）</label>
                <input id="ob-model-key" v-model="modelKey" class="input" type="password" maxlength="300" placeholder="输入 API key（Ollama 本地可留空）" autocomplete="off" />
                <div class="model-actions">
                  <button class="btn btn-primary" type="button" :disabled="modelSaving || modelTesting" @click="saveAndTestModel">
                    {{ modelTesting ? '测试中…' : modelSaving ? '保存中…' : '保存并测试' }}
                  </button>
                  <span v-if="modelTestResult" class="test-line" :class="{ fail: !modelTestResult.ok }">{{ modelTestResult.text }}</span>
                </div>
                <p class="ob-tip">key 用系统加密保存，界面只显示「已设置/未设置」，绝不显示明文</p>
              </template>
            </template>
          </div>

          <!-- 首批评语 -->
          <div v-else-if="step === 5" class="step-pane">
            <h2 class="step-title">生成首批评语</h2>
            <p class="step-desc">让 AI 按模块给你写一份经营点评；已配置模型则直接生成，未配置可跳过</p>
            <div class="comments-pane">
              <p v-if="commentsRunning" class="ob-status">正在生成评语，请稍候…</p>
              <template v-else>
                <p v-if="comments.items.length" class="ob-status ok">已生成 {{ commentCount }} 条模块评语</p>
                <p v-else-if="comments.configured === false" class="ob-status warn">当前未配置 AI 模型，评语生成将在配置模型后进行</p>
                <button class="btn btn-primary" type="button" :disabled="commentsRunning" @click="runComments">生成首批评语</button>
              </template>
            </div>
          </div>
        </div>

        <div class="ob-foot">
          <button class="btn btn-ghost" type="button" :disabled="step === 1" @click="back">上一步</button>
          <button class="btn btn-ghost skip-btn" type="button" @click="skip">跳过引导</button>
          <button class="btn btn-primary" type="button" :disabled="!canNext || creatingShop" @click="next">
            {{ creatingShop ? '创建中…' : step === 5 ? '生成评语' : '下一步' }}
          </button>
        </div>
      </template>

      <!-- 完成页 -->
      <div v-else class="ob-done">
        <div class="done-burst"><span class="done-check"><AppIcon name="check" :size="40" /></span></div>
        <h1 class="done-title">看板已就绪</h1>
        <p class="done-desc">数据入口已经打通，接下来每天打开就能看清经营</p>
        <div class="done-stats">
          <div class="stat"><span class="stat-num">{{ importSummary.files }}</span><span class="stat-label">导入文件</span></div>
          <div class="stat"><span class="stat-num">{{ importSummary.rows }}</span><span class="stat-label">入库行数</span></div>
          <div class="stat"><span class="stat-num">{{ commentCount }}</span><span class="stat-label">AI 评语</span></div>
        </div>
        <button class="btn btn-primary done-btn" type="button" @click="finish">进入看板</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.ob-shell {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  padding: 40px;
  z-index: 20;
  background:
    radial-gradient(ellipse at 20% 10%, var(--accent-soft), transparent 55%),
    radial-gradient(ellipse at 90% 90%, rgba(77, 159, 255, 0.1), transparent 50%),
    var(--bg-base);
  overflow: auto;
}
.ob-card {
  width: min(620px, 94vw);
  min-height: 520px;
  padding: 36px 40px;
  display: flex;
  flex-direction: column;
  animation: rise 0.45s ease;
}
.ob-welcome {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
}
.welcome-mark {
  width: 96px;
  height: 96px;
  border-radius: 28px;
  display: grid;
  place-items: center;
  background: linear-gradient(135deg, var(--accent), #17a347);
  box-shadow: 0 16px 40px rgba(29, 185, 84, 0.35);
  margin-bottom: 22px;
}
.welcome-logo {
  color: #ffffff;
}
.welcome-title {
  margin: 0;
  font-size: 34px;
  font-weight: 800;
  letter-spacing: 1px;
}
.welcome-sub {
  margin: 4px 0 0;
  font-size: 12px;
  color: var(--text-tertiary);
  letter-spacing: 0.5px;
}
.welcome-line {
  margin: 26px 0 0;
  font-size: 17px;
  font-weight: 600;
}
.welcome-desc {
  margin: 10px 0 0;
  font-size: 13px;
  color: var(--text-secondary);
  line-height: 1.7;
  max-width: 420px;
}
.welcome-feats {
  display: flex;
  gap: 10px;
  margin-top: 22px;
}
.welcome-feats span {
  font-size: 11.5px;
  padding: 5px 12px;
  border-radius: 999px;
  background: var(--accent-soft);
  color: var(--accent);
  font-weight: 600;
}
.welcome-btn {
  margin-top: 30px;
  height: 42px;
  padding: 0 34px;
  font-size: 14px;
}
.shortcut-tip {
  margin: 18px 0 0;
  font-size: 11.5px;
  color: var(--text-tertiary);
}
.ob-head {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 26px;
}
.ob-progress {
  display: flex;
  gap: 6px;
}
.dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--bg-hover);
  transition: background 0.2s ease, transform 0.2s ease;
}
.dot.on {
  background: var(--accent);
  transform: scale(1.25);
}
.dot.done {
  background: var(--accent-soft);
}
.ob-step-label {
  font-size: 13px;
  font-weight: 700;
}
.ob-step-count {
  margin-left: auto;
  font-size: 12px;
  color: var(--text-tertiary);
}
.ob-body {
  flex: 1;
}
.step-pane {
  max-width: 480px;
}
.step-title {
  margin: 0 0 6px;
  font-size: 21px;
  font-weight: 800;
}
.step-desc {
  margin: 0 0 20px;
  font-size: 12.5px;
  color: var(--text-secondary);
  line-height: 1.7;
}
.field-label {
  display: block;
  margin: 16px 0 8px;
  font-size: 12.5px;
  font-weight: 700;
}
.avatar-label {
  margin-top: 24px;
}
.input {
  width: 100%;
  height: 40px;
  padding: 0 14px;
  border: 1px solid var(--border);
  border-radius: 12px;
  background: var(--bg-elevated);
  color: var(--text-primary);
  font-size: 13.5px;
  outline: none;
}
.input:focus {
  border-color: var(--accent);
}
.platform-row {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.chip {
  height: 32px;
  padding: 0 14px;
  border: 1px solid var(--border);
  border-radius: 999px;
  background: transparent;
  color: var(--text-secondary);
  font-size: 12.5px;
  cursor: pointer;
  transition: all 0.15s ease;
}
.chip.on {
  border-color: var(--accent);
  background: var(--accent-soft);
  color: var(--accent);
  font-weight: 600;
}
.ob-tip {
  margin: 14px 0 0;
  font-size: 11.5px;
  color: var(--text-tertiary);
}
.model-set-banner {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
  padding: 12px 14px;
  border: 1px solid var(--border);
  border-radius: 12px;
  background: var(--bg-elevated);
}
.model-set-name {
  font-size: 13px;
  font-weight: 600;
}
.model-set-key {
  font-size: 12px;
  color: var(--text-tertiary);
}
.badge {
  padding: 2px 10px;
  border-radius: 999px;
  font-size: 11.5px;
  font-weight: 600;
}
.badge.ok {
  background: var(--accent-soft);
  color: var(--accent);
}
.model-actions {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-top: 16px;
  flex-wrap: wrap;
}
.test-line {
  font-size: 12.5px;
  color: var(--accent);
}
.test-line.fail {
  color: var(--danger);
}
.comments-pane {
  padding: 18px;
  border: 1px solid var(--border);
  border-radius: 14px;
  background: var(--bg-elevated);
}
.ob-status {
  margin: 0 0 14px;
  font-size: 13px;
}
.ob-status.ok {
  color: var(--accent);
  font-weight: 600;
}
.ob-status.warn {
  color: var(--warning);
}
.ob-foot {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-top: 26px;
  border-top: 1px solid var(--border);
  padding-top: 18px;
}
.skip-btn {
  margin-left: auto;
  color: var(--text-tertiary);
}
.ob-done {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
}
.done-burst {
  position: relative;
  width: 96px;
  height: 96px;
  display: grid;
  place-items: center;
  border-radius: 50%;
  background: var(--accent-soft);
  margin-bottom: 20px;
}
.done-burst::before,
.done-burst::after {
  content: '';
  position: absolute;
  inset: -8px;
  border-radius: 50%;
  border: 2px solid var(--accent-soft);
  animation: ring 1.6s ease-out infinite;
}
.done-burst::after {
  animation-delay: 0.6s;
}
.done-check {
  width: 64px;
  height: 64px;
  border-radius: 50%;
  background: var(--accent);
  color: #000000;
  display: grid;
  place-items: center;
}
.done-title {
  margin: 0 0 8px;
  font-size: 26px;
  font-weight: 800;
}
.done-desc {
  margin: 0;
  font-size: 13px;
  color: var(--text-secondary);
}
.done-stats {
  display: flex;
  gap: 26px;
  margin: 26px 0 30px;
}
.stat {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
}
.stat-num {
  font-size: 24px;
  font-weight: 800;
  color: var(--accent);
}
.stat-label {
  font-size: 11.5px;
  color: var(--text-tertiary);
}
.done-btn {
  height: 42px;
  padding: 0 34px;
  font-size: 14px;
}
@keyframes rise {
  from {
    transform: translateY(18px);
    opacity: 0;
  }
  to {
    transform: translateY(0);
    opacity: 1;
  }
}
@keyframes ring {
  0% {
    transform: scale(0.9);
    opacity: 1;
  }
  100% {
    transform: scale(1.35);
    opacity: 0;
  }
}
</style>
