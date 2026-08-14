<!-- 开屏问候页（任务 10）：每天首次启动显示（设置可关），按设置停留后自动进入，点击任意处立即进入 -->
<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import AppIcon from '../AppIcon.vue'
import BrandIcon from '../BrandIcon.vue'
import { avatarSvg, avatarFileUrl, isBrandAvatar } from '../../data/avatars'
import { greetingForHour, greetingSub, quoteForDate } from '../../data/quotes'
import { splashDelayMs, splashHintText } from '../../utils/splash'
import { useSettingsStore } from '../../stores/settings'
import { useShopsStore } from '../../stores/shops'
import { yuan, num } from '../../utils/format'

const emit = defineEmits<{ enter: [] }>()

const settings = useSettingsStore()
const shops = useShopsStore()

const quote = ref('')
const yesterday = ref<{ pay: string; visitors: string; refund: string } | null>(null)
const entering = ref(false)

const isFileAvatar = computed(() => settings.profile.avatar.startsWith('file:'))
const avatarUrl = computed(() => avatarFileUrl(settings.profile.avatar))
// 任务 4J ①：提示文案与停留时长一致（永不自动进入时只提示点击）
const hintText = computed(() => splashHintText(settings.splashDuration))

onMounted(async () => {
  quote.value = quoteForDate(settings.now.dateStr)
  if (!shops.loaded) await shops.load()
  const shopId = shops.defaultId ?? 0
  if (shopId > 0) {
    try {
      const d = (await window.api.dashboard.get({ shopId, mode: 'yesterday' })) as {
        hasData: boolean
        kpi: { payAmountFen: number; visitors: number; refundAmountFen: number } | null
      }
      if (d.hasData && d.kpi && Number(d.kpi.payAmountFen) > 0) {
        yesterday.value = {
          pay: yuan(d.kpi.payAmountFen),
          visitors: num(d.kpi.visitors),
          refund: yuan(d.kpi.refundAmountFen)
        }
      }
    } catch {
      yesterday.value = null
    }
  }
  if (entering.value) return
  // 任务 4J ①：默认 4 秒自动进入（性能模式不播动画，停留缩短为 600ms）；时长 0 = 永不自动进入
  const delay = splashDelayMs(settings.splashDuration, settings.performanceMode)
  if (delay !== null) setTimeout(() => enter(), delay)
})

function enter(): void {
  if (entering.value) return
  entering.value = true
  void settings.setLastSplashDate(settings.now.dateStr)
  emit('enter')
}
</script>

<template>
  <div class="splash" :class="{ perf: settings.performanceMode }" @click="enter">
    <div class="splash-card glass-card">
      <div class="splash-avatar">
        <BrandIcon v-if="!isFileAvatar && isBrandAvatar(settings.profile.avatar)" :size="56" />
        <svg v-else-if="!isFileAvatar" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" v-html="avatarSvg(settings.profile.avatar)"></svg>
        <img v-else :src="avatarUrl" alt="头像" />
      </div>
      <p class="splash-name">{{ settings.profile.username || '店主' }}</p>
      <p class="splash-greet">{{ greetingForHour(settings.now.hour) }}</p>
      <p class="splash-sub">{{ greetingSub(settings.now.hour) }}</p>
      <p class="splash-quote">「{{ quote }}」</p>
      <p v-if="yesterday" class="splash-kpi">
        昨日：支付 {{ yesterday.pay }} 元 · 访客 {{ yesterday.visitors }} · 退款 {{ yesterday.refund }} 元
      </p>
      <button class="btn btn-primary splash-btn" type="button" @click.stop="enter">进入工作台</button>
      <p class="splash-hint">{{ hintText }}</p>
    </div>
    <BrandIcon :size="26" class="splash-logo" />
  </div>
</template>


<style scoped>
.splash {
  position: absolute;
  inset: 0;
  z-index: 40;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 26px;
  background:
    radial-gradient(ellipse at 30% 20%, var(--accent-soft), transparent 50%),
    radial-gradient(ellipse at 80% 85%, rgba(77, 159, 255, 0.12), transparent 55%),
    var(--bg-base);
  cursor: pointer;
}
.splash-card {
  width: min(460px, 90vw);
  padding: 44px 40px;
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  animation: fade-in 0.5s ease;
}
.splash.perf .splash-card {
  animation: none;
}
.splash-avatar {
  width: 84px;
  height: 84px;
  border-radius: 50%;
  background: var(--accent-soft);
  color: var(--accent);
  display: grid;
  place-items: center;
  margin-bottom: 16px;
}
.splash-avatar svg {
  width: 56px;
  height: 56px;
}
.splash-avatar img {
  width: 84px;
  height: 84px;
  border-radius: 50%;
  object-fit: cover;
}
.splash-name {
  margin: 0;
  font-size: 13px;
  font-weight: 700;
  color: var(--text-secondary);
}
.splash-greet {
  margin: 8px 0 0;
  font-size: 30px;
  font-weight: 800;
}
.splash-sub {
  margin: 6px 0 0;
  font-size: 13px;
  color: var(--text-secondary);
}
.splash-quote {
  margin: 26px 0 0;
  font-size: 14.5px;
  line-height: 1.8;
  color: var(--text-primary);
  max-width: 360px;
}
.splash-kpi {
  margin: 18px 0 0;
  font-size: 12.5px;
  color: var(--accent);
  background: var(--accent-soft);
  padding: 8px 16px;
  border-radius: 999px;
}
.splash-btn {
  margin-top: 28px;
  height: 42px;
  padding: 0 32px;
  font-size: 14px;
}
.splash-hint {
  margin: 14px 0 0;
  font-size: 11px;
  color: var(--text-tertiary);
}
.splash-logo {
  color: var(--accent);
}
@keyframes fade-in {
  from {
    opacity: 0;
    transform: translateY(10px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
</style>
