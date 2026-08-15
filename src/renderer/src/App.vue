<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import TitleBar from './components/TitleBar.vue'
import SidebarNav from './components/SidebarNav.vue'
import TopBar from './components/TopBar.vue'
import DialogHost from './components/DialogHost.vue'
import LicenseGate from './components/LicenseGate.vue'
import LicensePending from './components/LicensePending.vue'
import LockScreen from './components/lock/LockScreen.vue'
import OnboardingWizard from './components/onboarding/OnboardingWizard.vue'
import SplashGreeting from './components/splash/SplashGreeting.vue'
import UpdatePrompt from './components/UpdatePrompt.vue'
import AppIcon from './components/AppIcon.vue'
import { useSettingsStore } from './stores/settings'
import { useAuthStore } from './stores/auth'
import { gatePhase } from './utils/gate'
import { useCommentsStore } from './stores/comments'

const settings = useSettingsStore()
const auth = useAuthStore()
const comments = useCommentsStore()
const router = useRouter()

const lockRequired = computed(() => auth.ok && settings.passwordEnabled && !settings.lockUnlocked)
const gate = computed(() => gatePhase(auth.loaded, auth.ok))
const splashEntered = ref(false)
// 任务 4M：开屏「每次启动显示」，进入由父组件显式状态卸载（不靠日期副作用）；splashEntered 一次性置位
const splashPending = computed(() => settings.loaded && settings.splashPending() && !splashEntered.value)

onMounted(() => {
  // 任务 4H：settings 与 auth 并行加载（wmic 采集已预预热），门禁 pending 态不闪「未授权」
  void Promise.all([settings.load(), auth.load()])
  window.addEventListener('keydown', onKeydown)
})

onUnmounted(() => {
  window.removeEventListener('keydown', onKeydown)
})

function isTypingTarget(el: EventTarget | null): boolean {
  const t = el as HTMLElement | null
  if (!t) return false
  const tag = t.tagName
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || t.isContentEditable
}

// 常用快捷键（界面提示见设置页「帮助与快捷键」与首次引导欢迎页）
function onKeydown(e: KeyboardEvent): void {
  if (!e.ctrlKey || e.altKey || e.metaKey || isTypingTarget(e.target)) return
  const key = e.key.toLowerCase()
  if (key === 'i') {
    e.preventDefault()
    void router.push('/import')
  } else if (key === 'r') {
    e.preventDefault()
    void comments.regenerate().then(() => {
      window.dispatchEvent(new CustomEvent('ecai:comments-refreshed'))
    })
  } else if (key === 'e') {
    e.preventDefault()
    window.dispatchEvent(new CustomEvent('ecai:export-daily'))
  }
}

function onUnlocked(): void {
  settings.lockUnlocked = true
}

function onSplashEnter(): void {
  splashEntered.value = true
}
</script>

<template>
  <div class="app-shell">
    <TitleBar />
    <template v-if="gate === 'pending'">
      <LicensePending />
    </template>
    <template v-else-if="gate === 'denied'">
      <LicenseGate />
    </template>
    <template v-else>
      <LockScreen v-if="lockRequired" @unlocked="onUnlocked" />
      <template v-else>
        <OnboardingWizard v-if="!settings.onboardingDone" @done="() => {}" />
        <template v-else>
          <SplashGreeting v-if="splashPending" @enter="onSplashEnter" />
          <template v-else>
            <div v-if="auth.expiringSoon" class="expiry-banner" role="alert">
              <AppIcon name="warning" :size="15" />
              <span>授权将于 {{ auth.expires }} 到期（剩余 {{ auth.expiresInDays }} 天），请联系管理员续期</span>
            </div>
            <div class="app-body">
              <SidebarNav />
              <div class="app-main">
                <TopBar />
                <main class="app-content">
                  <RouterView v-slot="{ Component }">
                    <!-- 任务 4F ②：质检页保活，切页回来流式输出不丢 -->
                    <KeepAlive include="QaView">
                      <component :is="Component" />
                    </KeepAlive>
                  </RouterView>
                </main>
              </div>
            </div>
          </template>
        </template>
      </template>
    </template>
    <UpdatePrompt />
    <DialogHost />
  </div>
</template>

<style scoped>
.app-shell {
  display: flex;
  flex-direction: column;
  height: 100%;
}
.expiry-banner {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 8px 24px;
  font-size: 12.5px;
  color: var(--warning);
  background: rgba(245, 166, 35, 0.12);
  border-bottom: 1px solid rgba(245, 166, 35, 0.25);
  flex-shrink: 0;
}
.app-body {
  flex: 1;
  display: flex;
  min-height: 0;
}
.app-main {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
}
.app-content {
  flex: 1;
  overflow: auto;
  padding: 24px 28px;
}
</style>