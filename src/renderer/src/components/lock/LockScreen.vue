<!-- 应用密码锁（任务 10）：锁定时启动需输入密码；忘记密码 → 管理员万能解锁上门重置，不删数据 -->
<script setup lang="ts">
import { onMounted, ref } from 'vue'
import AppIcon from '../AppIcon.vue'
import { useAuthStore } from '../../stores/auth'

const emit = defineEmits<{ unlocked: [] }>()

const auth = useAuthStore()
const pwd = ref('')
const error = ref('')
const busy = ref(false)
const showForgot = ref(false)

const pwdInput = ref<HTMLInputElement | null>(null)

onMounted(() => {
  pwdInput.value?.focus()
})

async function unlock(): Promise<void> {
  if (busy.value || !pwd.value) return
  busy.value = true
  error.value = ''
  try {
    const res = await window.api.system.passwordVerify(pwd.value)
    if (res.ok) {
      emit('unlocked')
    } else {
      error.value = '密码不正确。请确认输入无误，或联系管理员重置。'
      pwd.value = ''
      pwdInput.value?.focus()
    }
  } finally {
    busy.value = false
  }
}

async function importUnlock(): Promise<void> {
  if (auth.busy) return
  const r = await auth.pickAndImport()
  if (r.ok && auth.ok && auth.kind === 'unlock') {
    await window.api.system.passwordClear()
    emit('unlocked')
  } else if (!r.canceled) {
    error.value = auth.error || '导入的授权不是万能解锁文件，无法重置密码。'
  }
}
</script>

<template>
  <div class="lock-screen">
    <div class="lock-card glass-card">
      <div class="lock-mark">
        <AppIcon name="lock" :size="26" />
      </div>
      <h1 class="lock-title">已锁定</h1>
      <p class="lock-desc">应用密码锁已开启，输入密码继续</p>
      <input
        ref="pwdInput"
        v-model="pwd"
        class="pwd-input"
        type="password"
        maxlength="64"
        placeholder="输入应用密码"
        :disabled="busy"
        @keydown.enter="unlock"
      />
      <p v-if="error" class="lock-error">{{ error }}</p>
      <button class="btn btn-primary unlock-btn" type="button" :disabled="busy || !pwd" @click="unlock">
        {{ busy ? '校验中…' : '解锁' }}
      </button>
      <div class="forgot">
        <button class="link-btn" type="button" @click="showForgot = !showForgot">
          {{ showForgot ? '收起' : '忘记密码？' }}
        </button>
        <div v-if="showForgot" class="forgot-panel">
          <p>请联系管理员，使用授权工具签发「万能解锁」文件。导入万能解锁后密码将被重置，数据不会删除。</p>
          <button class="btn btn-ghost" type="button" :disabled="auth.busy" @click="importUnlock">
            {{ auth.busy ? '导入中…' : '导入万能解锁授权' }}
          </button>
          <p v-if="auth.message" class="forgot-ok">{{ auth.message }}</p>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.lock-screen {
  position: absolute;
  inset: 0;
  z-index: 50;
  display: grid;
  place-items: center;
  background:
    radial-gradient(ellipse at 25% 20%, var(--accent-soft), transparent 55%),
    var(--bg-base);
}
.lock-card {
  width: min(380px, 90vw);
  padding: 36px 32px;
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
}
.lock-mark {
  width: 60px;
  height: 60px;
  border-radius: 50%;
  background: var(--accent-soft);
  color: var(--accent);
  display: grid;
  place-items: center;
  margin-bottom: 16px;
}
.lock-title {
  margin: 0;
  font-size: 22px;
  font-weight: 800;
}
.lock-desc {
  margin: 6px 0 18px;
  font-size: 12.5px;
  color: var(--text-secondary);
}
.pwd-input {
  width: 100%;
  height: 42px;
  padding: 0 14px;
  border: 1px solid var(--border);
  border-radius: 12px;
  background: var(--bg-elevated);
  color: var(--text-primary);
  font-size: 14px;
  outline: none;
  text-align: center;
}
.pwd-input:focus {
  border-color: var(--accent);
}
.lock-error {
  margin: 10px 0 0;
  font-size: 12px;
  color: var(--danger);
  line-height: 1.6;
}
.unlock-btn {
  margin-top: 16px;
  width: 100%;
  height: 40px;
  font-size: 13.5px;
}
.forgot {
  margin-top: 18px;
  width: 100%;
}
.link-btn {
  border: none;
  background: transparent;
  color: var(--text-secondary);
  font-size: 12px;
  cursor: pointer;
}
.link-btn:hover {
  color: var(--text-primary);
}
.forgot-panel {
  margin-top: 12px;
  padding: 14px;
  border: 1px solid var(--border);
  border-radius: 12px;
  background: var(--bg-elevated);
  text-align: left;
}
.forgot-panel p {
  margin: 0 0 12px;
  font-size: 12px;
  color: var(--text-secondary);
  line-height: 1.7;
}
.forgot-ok {
  margin-top: 10px !important;
  margin-bottom: 0 !important;
  color: var(--accent);
}
</style>