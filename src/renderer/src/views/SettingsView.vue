<script setup lang="ts">
import { onMounted, ref } from 'vue'
import PageShell from '../components/PageShell.vue'
import AppIcon from '../components/AppIcon.vue'
import ModelManager from '../components/models/ModelManager.vue'
import ProfileSection from '../components/settings/ProfileSection.vue'
import SecuritySection from '../components/settings/SecuritySection.vue'
import DataSection from '../components/settings/DataSection.vue'
import UpdateSection from '../components/settings/UpdateSection.vue'
import LogsSection from '../components/settings/LogsSection.vue'
import HelpSection from '../components/settings/HelpSection.vue'
import { useSettingsStore } from '../stores/settings'
import { THEMES, themeFileUrl } from '../data/themes'
import { useCommentsStore } from '../stores/comments'
import { useAuthStore } from '../stores/auth'

const settings = useSettingsStore()
const comments = useCommentsStore()
const auth = useAuthStore()
const targetInput = ref('')
const targetSaved = ref(false)
const exportDir = ref('')

onMounted(async () => {
  await comments.loadEnabled()
  const v = await window.api.setting.get('monthly_target_fen')
  if (v && Number(v) > 0) targetInput.value = String(Number(v) / 100)
  const dir = await window.api.setting.get('default_report_dir')
  if (dir) exportDir.value = dir
})

async function saveTarget(): Promise<void> {
  const y = Number(targetInput.value)
  if (!Number.isFinite(y) || y < 0) {
    targetInput.value = String(Number((await window.api.setting.get('monthly_target_fen')) || 0) / 100)
    return
  }
  await window.api.setting.set('monthly_target_fen', String(Math.round(y * 100)))
  targetSaved.value = true
  setTimeout(() => (targetSaved.value = false), 2000)
}

async function pickExportDir(): Promise<void> {
  const res = await window.api.report.pickDir()
  if (res.ok && res.dir) {
    exportDir.value = res.dir
    await window.api.setting.set('default_report_dir', res.dir)
  }
}

async function clearExportDir(): Promise<void> {
  exportDir.value = ''
  await window.api.setting.set('default_report_dir', '')
}

// 任务 4J ④：主题清单来自共享 data/themes（≥7 个，全部走 CSS 变量 data-theme，无 emoji）
const themes = THEMES
// 任务 4J ①：开屏停留时长选项（秒），0 = 永不自动进入
const splashOptions = [
  { value: 2, label: '2 秒' },
  { value: 4, label: '4 秒' },
  { value: 6, label: '6 秒' },
  { value: 0, label: '永不自动' }
]
const bgMessage = ref('')
async function uploadBackground(): Promise<void> {
  bgMessage.value = ''
  const res = await window.api.theme.pickBackground()
  if (!res.ok) {
    bgMessage.value = res.error ?? '上传失败'
    return
  }
  await settings.setBackgroundImage(res.file ?? '')
  bgMessage.value = '背景图已生效，重启后仍保留'
}
async function removeBackground(): Promise<void> {
  await window.api.theme.removeBackground()
  await settings.setBackgroundImage('')
  bgMessage.value = '已恢复纯色背景'
}
</script>

<template>
  <PageShell title="设置" desc="个人资料、主题、安全、数据维护、更新、日志与帮助">
    <ProfileSection />
    <SecuritySection />
    <section class="glass-card setting-block">
      <h3 class="block-title">外观主题</h3>
      <div class="theme-grid">
        <button
          v-for="t in themes"
          :key="t.id"
          class="theme-card" :data-test="`theme-${t.id}`"
          :class="{ active: settings.theme === t.id }"
          @click="settings.setTheme(t.id)"
        >
          <span class="theme-swatch" :class="`swatch-${t.id}`">
            <AppIcon v-if="settings.theme === t.id" name="check" :size="15" />
          </span>
          <span class="theme-label">{{ t.label }}</span>
          <span class="theme-desc">{{ t.desc }}</span>
        </button>
      </div>
    </section>

    <section class="glass-card setting-block">
      <h3 class="block-title">背景图</h3>
      <p class="block-desc">上传 jpg/png/webp（≤8MB）作为主界面背景；深色主题下半透明叠加保证文字可读；性能模式下静态显示不动效</p>
      <div class="bg-row">
        <div class="bg-preview" :class="{ empty: !settings.backgroundImage }">
          <img v-if="settings.backgroundImage" class="bg-preview-img" :src="themeFileUrl(settings.backgroundImage)" alt="背景图预览" />
          <span v-else class="bg-preview-empty">未设置</span>
        </div>
        <div class="bg-actions">
          <button class="btn btn-ghost upload-btn" data-test="bg-upload" type="button" @click="uploadBackground">上传背景图</button>
          <button class="btn btn-ghost" type="button" :disabled="!settings.backgroundImage" data-test="bg-remove" @click="removeBackground">移除背景图</button>
          <p v-if="bgMessage" class="bg-tip">{{ bgMessage }}</p>
        </div>
      </div>
    </section>

    <section class="glass-card setting-block">
      <div class="setting-row">
        <div class="setting-text">
          <h3 class="block-title">性能模式</h3>
          <p class="block-desc">关闭毛玻璃、动画与过渡效果，低配机器更流畅</p>
        </div>
        <button
          class="switch"
          :class="{ on: settings.performanceMode }"
          role="switch"
          :aria-checked="settings.performanceMode"
          aria-label="性能模式"
          @click="settings.setPerformanceMode(!settings.performanceMode)"
        >
          <span class="knob"></span>
        </button>
      </div>
    </section>

    <section class="glass-card setting-block">
      <div class="setting-row">
        <div class="setting-text">
          <h3 class="block-title">开屏欢迎页</h3>
          <p class="block-desc">每天首次启动显示问候页（头像/用户名/时段问候/电商语录）；关闭后直接进入主界面</p>
        </div>
        <button
          class="switch"
          :class="{ on: settings.splashEnabled }"
          role="switch"
          :aria-checked="settings.splashEnabled"
          aria-label="开屏欢迎页"
          @click="settings.setSplashEnabled(!settings.splashEnabled)"
        >
          <span class="knob"></span>
        </button>
      </div>
      <div v-if="settings.splashEnabled" class="setting-row">
        <div class="setting-text">
          <h3 class="block-title">开屏停留时长</h3>
          <p class="block-desc">自动进入工作台前的停留秒数；选择「永不自动」后需点击页面或按钮进入</p>
        </div>
        <div class="seg" role="group" aria-label="开屏停留时长">
          <button
            v-for="opt in splashOptions"
            :key="opt.value"
            class="seg-btn" :data-test="`splash-duration-${opt.value}`"
            :class="{ on: settings.splashDuration === opt.value }"
            :aria-pressed="settings.splashDuration === opt.value"
            @click="settings.setSplashDuration(opt.value)"
          >
            {{ opt.label }}
          </button>
        </div>
      </div>
    </section>

    <section class="glass-card setting-block">
      <div class="setting-row">
        <div class="setting-text">
          <h3 class="block-title">AI 评语自动生成</h3>
          <p class="block-desc">数据导入完成或切换窗口后自动为各模块生成评语；关闭后仅保留手动「重新生成」</p>
        </div>
        <button
          class="switch"
          :class="{ on: comments.enabled }"
          role="switch"
          :aria-checked="comments.enabled"
          aria-label="AI 评语自动生成"
          @click="comments.setEnabled(!comments.enabled)"
        >
          <span class="knob"></span>
        </button>
      </div>
    </section>

    <section class="glass-card setting-block">
      <h3 class="block-title">月度销售额目标</h3>
      <p class="block-desc">在看板顶部显示本月完成进度条（按经营数据的支付金额统计）</p>
      <div class="target-row">
        <input v-model="targetInput" class="target-input" type="number" min="0" step="0.01" placeholder="每月销售额目标（元）" />
        <button class="btn btn-primary" @click="saveTarget">{{ targetSaved ? '已保存' : '保存目标' }}</button>
      </div>
    </section>

    <section class="glass-card setting-block">
      <h3 class="block-title">日报默认导出目录</h3>
      <p class="block-desc">设置后「一键日报/周报、PDF、明细导出」直接保存到该目录并自动打开，不再弹窗选择位置</p>
      <div class="dir-row">
        <span class="dir-value">{{ exportDir || '未设置（导出时弹窗选择保存位置）' }}</span>
        <button class="btn btn-ghost" type="button" @click="pickExportDir()">选择目录</button>
        <button v-if="exportDir" class="btn btn-ghost" type="button" @click="clearExportDir()">清除</button>
      </div>
    </section>

    <section class="glass-card setting-block">
      <h3 class="block-title">授权与激活</h3>
      <p class="block-desc">授权绑定本机（CPU + 主板标识哈希），换硬盘不影响授权；把机器码发给管理员即可签发授权文件</p>
      <div class="lic-row">
        <span class="lic-status" :class="{ warn: auth.expiringSoon }">
          已授权（{{ auth.kind === 'unlock' ? '万能解锁' : '机器绑定' }}）至 {{ auth.expires }}<template v-if="auth.expiresInDays !== null">，剩余 {{ auth.expiresInDays }} 天</template>
        </span>
        <span v-if="auth.expiringSoon" class="lic-remind">授权即将到期，请联系管理员续期</span>
      </div>
      <div class="machine-row">
        <span class="dir-value">{{ auth.machineCode }}</span>
        <button class="btn btn-ghost" type="button" @click="auth.copyMachineCode()">复制机器码</button>
      </div>
      <div class="lic-actions">
        <button class="btn btn-ghost" type="button" :disabled="auth.busy" @click="auth.pickAndImport()">{{ auth.busy ? '导入中…' : '重新导入授权文件' }}</button>
        <span class="lic-fp">应用内置公钥指纹：{{ auth.fingerprint }}</span>
      </div>
      <p v-if="auth.message" class="lic-msg ok">{{ auth.message }}</p>
      <p v-else-if="auth.error" class="lic-msg err">{{ auth.error }}</p>
    </section>

    <ModelManager />

    <DataSection />
    <UpdateSection />
    <LogsSection />
    <HelpSection />

    <section class="glass-card setting-block">
      <h3 class="block-title">关于</h3>
      <p class="block-desc">Electronic Commerce AI（EC AI）· Windows 桌面版 v{{ settings.appInfo?.version ?? '…' }}（Electron {{ settings.appInfo?.electron ?? '…' }} / Node {{ settings.appInfo?.node ?? '…' }}）· 数据仅存本机</p>
      <p class="about-sub">更新请求仅发送版本号；经营数据绝不外发（除主动配置的 AI 服务商）</p>
    </section>
  </PageShell>
</template>

<style scoped>
.setting-block {
  padding: 20px;
  margin-bottom: 16px;
  max-width: 760px;
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
.dir-row {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-top: 12px;
  flex-wrap: wrap;
}
.dir-value {
  flex: 1;
  min-width: 200px;
  font-size: 12px;
  color: var(--text-secondary);
  font-family: Consolas, monospace;
  word-break: break-all;
}
.theme-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 12px;
  margin-top: 14px;
}
.theme-card {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 6px;
  padding: 14px;
  border: 1.5px solid var(--border);
  border-radius: 14px;
  background: transparent;
  color: var(--text-primary);
  cursor: pointer;
  text-align: left;
  transition: border-color 0.15s ease, background 0.15s ease;
}
.theme-card:hover {
  background: var(--bg-hover);
}
.theme-card.active {
  border-color: var(--accent);
}
.theme-swatch {
  width: 34px;
  height: 34px;
  border-radius: 10px;
  display: grid;
  place-items: center;
  color: #000000;
  margin-bottom: 6px;
}
.swatch-dark {
  background: #121212;
  border: 1px solid #1db954;
}
.swatch-light {
  background: #f5f5f5;
  border: 1px solid #1db954;
}
.swatch-high-contrast {
  background: #000000;
  border: 1px solid #00ff66;
}
.swatch-midnight {
  background: #0b1026;
  border: 1px solid #7aa2ff;
}
.swatch-forest {
  background: #0d1f14;
  border: 1px solid #3ddc84;
}
.swatch-warm-sun {
  background: #fdf6ec;
  border: 1px solid #e8833a;
}
.swatch-sakura {
  background: #fdf2f6;
  border: 1px solid #e05d8f;
}
.theme-label {
  font-size: 13.5px;
  font-weight: 600;
}
.theme-desc {
  font-size: 12px;
  color: var(--text-tertiary);
}
.lic-row {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-top: 12px;
  flex-wrap: wrap;
}
.lic-status {
  font-size: 13px;
  font-weight: 600;
  color: var(--accent);
}
.lic-status.warn {
  color: var(--warning);
}
.lic-remind {
  font-size: 12px;
  color: var(--warning);
}
.machine-row {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-top: 10px;
  flex-wrap: wrap;
}
.lic-actions {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-top: 10px;
  flex-wrap: wrap;
}
.lic-fp {
  font-size: 11px;
  color: var(--text-tertiary);
  font-family: Consolas, monospace;
}
.lic-msg {
  margin: 10px 0 0;
  font-size: 12.5px;
}
.lic-msg.ok {
  color: var(--accent);
}
.lic-msg.err {
  color: var(--danger);
}
.target-row {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-top: 12px;
}
.target-input {
  width: 240px;
  padding: 9px 14px;
  border: 1px solid var(--border);
  border-radius: 999px;
  background: var(--bg-elevated);
  color: var(--text-primary);
  font-size: 13px;
  outline: none;
}
.target-input:focus {
  border-color: var(--accent);
}
.setting-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}
.setting-text {
  flex: 1;
}
.switch {
  width: 44px;
  height: 26px;
  border: none;
  border-radius: 999px;
  background: var(--bg-hover);
  position: relative;
  cursor: pointer;
  transition: background 0.18s ease;
  flex-shrink: 0;
}
.switch .knob {
  position: absolute;
  top: 3px;
  left: 3px;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  background: var(--text-secondary);
  transition: transform 0.18s ease, background 0.18s ease;
}
.switch.on {
  background: var(--accent);
}
.switch.on .knob {
  transform: translateX(18px);
  background: #ffffff;
}
.about-sub {
  margin: 6px 0 0;
  font-size: 11.5px;
  color: var(--text-tertiary);
}

.seg {
  display: inline-flex;
  gap: 6px;
  background: var(--bg-elevated);
  border: 1px solid var(--border);
  border-radius: 999px;
  padding: 3px;
}
.seg-btn {
  height: 30px;
  padding: 0 13px;
  border: none;
  border-radius: 999px;
  background: transparent;
  color: var(--text-secondary);
  font-size: 12.5px;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.15s ease, color 0.15s ease;
}
.seg-btn:hover {
  color: var(--text-primary);
}
.seg-btn.on {
  background: var(--accent);
  color: #000000;
}
.bg-row {
  display: flex;
  align-items: flex-start;
  gap: 16px;
  margin-top: 14px;
  flex-wrap: wrap;
}
.bg-preview {
  width: 220px;
  height: 124px;
  border-radius: 14px;
  border: 1px solid var(--border);
  overflow: hidden;
  background: var(--bg-elevated);
  display: grid;
  place-items: center;
  flex-shrink: 0;
}
.bg-preview-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.bg-preview-empty {
  font-size: 12px;
  color: var(--text-tertiary);
}
.bg-actions {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 10px;
}
.bg-tip {
  margin: 0;
  font-size: 12px;
  color: var(--accent);
}
</style>
