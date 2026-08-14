<script setup lang="ts">
import { computed } from 'vue'
import BrandIcon from './BrandIcon.vue'
import { useAuthStore } from '../stores/auth'

const auth = useAuthStore()

const reasonText = computed(() => {
  switch (auth.reason) {
    case 'no-license':
      return '本机尚未授权：把下方机器码发给管理员，导入管理员签发的授权文件后即可使用'
    case 'machine-mismatch':
      return '机器不匹配：授权文件绑定的是其他电脑，无法在本机使用'
    case 'expired':
      return '授权已过期：请联系管理员续期并重新签发授权文件'
    case 'invalid-signature':
      return '授权文件校验失败：文件可能被篡改，请联系管理员重新签发'
    case 'corrupt':
      return '授权文件无法解析：请重新导入完整的授权文件'
    default:
      return '授权状态异常，请联系管理员'
  }
})
</script>

<template>
  <div class="gate-body">
    <div class="gate-card">
      <div class="gate-logo">
        <BrandIcon :size="40" />
      </div>
      <h1 class="gate-title">未授权</h1>
      <p class="gate-desc">{{ reasonText }}</p>

      <div class="machine-box">
        <div class="machine-label">本机机器码（CPU + 主板 + 硬盘标识哈希）</div>
        <div class="machine-value">{{ auth.machineCode }}</div>
        <div class="machine-actions">
          <button class="btn btn-ghost" type="button" @click="auth.copyMachineCode()">复制机器码</button>
          <span class="machine-hint">把这段发给管理员即可授权</span>
        </div>
      </div>

      <div class="gate-actions">
        <button class="btn btn-primary" type="button" :disabled="auth.busy" @click="auth.pickAndImport()">
          {{ auth.busy ? '导入中…' : '导入授权文件' }}
        </button>
      </div>

      <p v-if="auth.message" class="gate-msg ok">{{ auth.message }}</p>
      <p v-else-if="auth.error" class="gate-msg err">{{ auth.error }}</p>

      <p class="gate-tip">授权文件与机器码一一绑定：即使拿到别人的授权文件，本机也无法打开主界面。</p>
      <p class="gate-fp">应用内置公钥指纹：{{ auth.fingerprint }}</p>
    </div>
  </div>
</template>

<style scoped>
.gate-body {
  flex: 1;
  min-height: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background:
    radial-gradient(1000px 500px at 50% -10%, var(--accent-soft), transparent 60%),
    var(--bg-base);
  padding: 24px;
  overflow: auto;
}
.gate-card {
  width: min(560px, 100%);
  background: var(--bg-elevated);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow);
  padding: 36px 40px 30px;
  text-align: center;
}
.gate-logo {
  width: 64px;
  height: 64px;
  margin: 0 auto 14px;
  border-radius: 18px;
  display: grid;
  place-items: center;
  color: var(--accent);
  background: var(--accent-soft);
}
.gate-title {
  margin: 0 0 8px;
  font-size: 22px;
  font-weight: 800;
}
.gate-desc {
  margin: 0 auto 22px;
  max-width: 440px;
  font-size: 13px;
  line-height: 1.6;
  color: var(--text-secondary);
}
.machine-box {
  text-align: left;
  background: var(--bg-base);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  padding: 14px 16px;
  margin-bottom: 20px;
}
.machine-label {
  font-size: 12px;
  color: var(--text-tertiary);
  margin-bottom: 8px;
}
.machine-value {
  font-family: Consolas, Menlo, monospace;
  font-size: 12px;
  line-height: 1.55;
  color: var(--text-primary);
  word-break: break-all;
  user-select: all;
}
.machine-actions {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-top: 10px;
  flex-wrap: wrap;
}
.machine-hint {
  font-size: 12px;
  color: var(--text-tertiary);
}
.gate-actions {
  display: flex;
  justify-content: center;
  gap: 10px;
}
.gate-msg {
  margin: 12px 0 0;
  font-size: 12.5px;
}
.gate-msg.ok {
  color: var(--accent);
}
.gate-msg.err {
  color: var(--danger);
}
.gate-tip {
  margin: 18px 0 0;
  font-size: 12px;
  color: var(--text-tertiary);
}
.gate-fp {
  margin: 8px 0 0;
  font-size: 11px;
  color: var(--text-tertiary);
  opacity: 0.75;
  font-family: Consolas, Menlo, monospace;
  word-break: break-all;
}
</style>