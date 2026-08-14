<!-- 安全与窗口行为（任务 10）：应用密码锁（可选）+ 关闭窗口行为（托盘/退出） -->
<script setup lang="ts">
import { ref } from 'vue'
import { useSettingsStore } from '../../stores/settings'
import { useDialogStore } from '../../stores/dialog'

const settings = useSettingsStore()
const dialog = useDialogStore()

const enabling = ref(false)
const newPwd = ref('')
const confirmPwd = ref('')
const busy = ref(false)

const disabling = ref(false)
const curPwd = ref('')

async function enable(): Promise<void> {
  if (busy.value) return
  if (newPwd.value.length < 4) {
    dialog.error('密码太短', '密码长度需在 4-64 位之间')
    return
  }
  if (newPwd.value !== confirmPwd.value) {
    dialog.error('两次输入不一致', '请重新输入确认密码')
    return
  }
  busy.value = true
  try {
    const res = await settings.setPasswordEnabled(true, newPwd.value)
    if (res.ok) {
      enabling.value = false
      newPwd.value = ''
      confirmPwd.value = ''
      dialog.info('密码锁已开启', '下次启动需输入密码；忘记密码可联系管理员用万能解锁重置')
    } else {
      dialog.error('设置失败', res.message || '无法设置密码')
    }
  } finally {
    busy.value = false
  }
}

async function disable(): Promise<void> {
  if (busy.value) return
  const verify = await window.api.system.passwordVerify(curPwd.value)
  if (!verify.ok) {
    dialog.error('密码不正确', '请输入当前应用密码后再关闭密码锁')
    return
  }
  busy.value = true
  try {
    await settings.setPasswordEnabled(false)
    disabling.value = false
    curPwd.value = ''
    dialog.info('密码锁已关闭', '下次启动将直接进入主界面')
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <section class="glass-card setting-block">
    <div class="setting-row">
      <div class="setting-text">
        <h3 class="block-title">应用密码锁</h3>
        <p class="block-desc">开启后每次启动需输入密码；忘记密码可联系管理员用授权工具「万能解锁」上门重置，数据不会删除</p>
      </div>
      <button
        class="switch"
        :class="{ on: settings.passwordEnabled }"
        role="switch"
        :aria-checked="settings.passwordEnabled"
        aria-label="应用密码锁"
        @click="settings.passwordEnabled ? (disabling = true) : (enabling = true)"
      >
        <span class="knob"></span>
      </button>
    </div>

    <div v-if="enabling" class="pwd-panel">
      <div class="pwd-field">
        <label class="field-label" for="new-pwd">新密码（4-64 位）</label>
        <input id="new-pwd" v-model="newPwd" class="input" type="password" maxlength="64" placeholder="设置新密码" />
      </div>
      <div class="pwd-field">
        <label class="field-label" for="confirm-pwd">确认密码</label>
        <input id="confirm-pwd" v-model="confirmPwd" class="input" type="password" maxlength="64" placeholder="再次输入密码" />
      </div>
      <div class="pwd-actions">
        <button class="btn btn-primary" type="button" :disabled="busy" @click="enable">开启密码锁</button>
        <button class="btn btn-ghost" type="button" @click="enabling = false">取消</button>
      </div>
    </div>

    <div v-if="disabling" class="pwd-panel">
      <div class="pwd-field">
        <label class="field-label" for="cur-pwd">当前密码</label>
        <input id="cur-pwd" v-model="curPwd" class="input" type="password" maxlength="64" placeholder="输入当前密码" @keydown.enter="disable" />
      </div>
      <div class="pwd-actions">
        <button class="btn btn-primary" type="button" :disabled="busy" @click="disable">关闭密码锁</button>
        <button class="btn btn-ghost" type="button" @click="disabling = false">取消</button>
      </div>
    </div>

    <div class="setting-row tray-row">
      <div class="setting-text">
        <h3 class="block-title">关闭窗口行为</h3>
        <p class="block-desc">默认最小化到系统托盘（后台常驻，可随时恢复）；改为直接退出则关闭即结束进程</p>
      </div>
      <button
        class="switch"
        :class="{ on: settings.trayOnClose }"
        role="switch"
        :aria-checked="settings.trayOnClose"
        aria-label="关闭窗口最小化到托盘"
        @click="settings.setTrayOnClose(!settings.trayOnClose)"
      >
        <span class="knob"></span>
      </button>
    </div>
    <p class="tray-hint">{{ settings.trayOnClose ? '当前：关闭窗口最小化到托盘（托盘菜单可退出）' : '当前：关闭窗口直接退出' }}</p>
  </section>
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
  line-height: 1.7;
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
.pwd-panel {
  margin-top: 14px;
  padding: 16px;
  border: 1px solid var(--border);
  border-radius: 12px;
  background: var(--bg-elevated);
  display: flex;
  gap: 14px;
  flex-wrap: wrap;
  align-items: flex-end;
}
.pwd-field {
  flex: 1;
  min-width: 180px;
}
.field-label {
  display: block;
  margin-bottom: 6px;
  font-size: 12px;
  font-weight: 700;
}
.input {
  width: 100%;
  height: 36px;
  padding: 0 12px;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: var(--bg-base);
  color: var(--text-primary);
  font-size: 13px;
  outline: none;
}
.input:focus {
  border-color: var(--accent);
}
.pwd-actions {
  display: flex;
  gap: 8px;
}
.tray-row {
  margin-top: 22px;
  padding-top: 18px;
  border-top: 1px solid var(--border);
}
.tray-hint {
  margin: 10px 0 0;
  font-size: 11.5px;
  color: var(--text-tertiary);
}
</style>