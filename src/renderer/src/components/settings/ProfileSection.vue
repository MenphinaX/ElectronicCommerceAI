<!-- 个人资料（任务 10）：改用户名/换头像，与首次引导同一套选择器，保存后开屏问候立即生效 -->
<script setup lang="ts">
import { ref } from 'vue'
import AvatarPicker from '../profile/AvatarPicker.vue'
import { avatarSvg, avatarFileUrl, isBrandAvatar } from '../../data/avatars'
import BrandIcon from '../BrandIcon.vue'
import { useSettingsStore } from '../../stores/settings'
import { useDialogStore } from '../../stores/dialog'

const settings = useSettingsStore()
const dialog = useDialogStore()

const username = ref(settings.profile.username || '')
const avatar = ref(settings.profile.avatar || 'brand')
const saved = ref(false)
const busy = ref(false)

const isFileAvatar = () => avatar.value.startsWith('file:')
const avatarUrl = () => avatarFileUrl(avatar.value)

async function save(): Promise<void> {
  if (busy.value) return
  busy.value = true
  try {
    await settings.setProfile({ username: username.value.trim() || '店主', avatar: avatar.value })
    saved.value = true
    dialog.info('已保存', '用户名与头像已更新，下次开屏问候即生效')
    setTimeout(() => (saved.value = false), 2000)
  } finally {
    busy.value = false
  }
}

async function reset(): Promise<void> {
  username.value = settings.profile.username || ''
  avatar.value = settings.profile.avatar || 'brand'
}
</script>

<template>
  <section class="glass-card setting-block">
    <h3 class="block-title">个人资料</h3>
    <p class="block-desc">修改用户名与头像，将同步显示在开屏问候页</p>
    <div class="profile-row">
      <div class="profile-avatar">
        <BrandIcon v-if="!isFileAvatar() && isBrandAvatar(avatar)" :size="44" />
        <svg v-else-if="!isFileAvatar()" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" v-html="avatarSvg(avatar)"></svg>
        <img v-else :src="avatarUrl()" alt="头像" />
      </div>
      <div class="profile-fields">
        <label class="field-label" for="profile-username">用户名</label>
        <input id="profile-username" v-model="username" class="input" type="text" maxlength="24" placeholder="店主" />
      </div>
    </div>
    <p class="field-label">选择头像</p>
    <AvatarPicker v-model="avatar" />
    <div class="profile-actions">
      <button class="btn btn-primary" type="button" :disabled="busy" @click="save">{{ saved ? '已保存' : '保存资料' }}</button>
      <button class="btn btn-ghost" type="button" @click="reset">还原</button>
    </div>
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
}
.profile-row {
  display: flex;
  align-items: center;
  gap: 16px;
  margin-top: 14px;
}
.profile-avatar {
  width: 64px;
  height: 64px;
  border-radius: 50%;
  background: var(--accent-soft);
  color: var(--accent);
  display: grid;
  place-items: center;
  flex-shrink: 0;
}
.profile-avatar svg {
  width: 44px;
  height: 44px;
}
.profile-avatar img {
  width: 64px;
  height: 64px;
  border-radius: 50%;
  object-fit: cover;
}
.profile-fields {
  flex: 1;
}
.field-label {
  display: block;
  margin: 14px 0 8px;
  font-size: 12.5px;
  font-weight: 700;
}
.input {
  width: 100%;
  max-width: 320px;
  height: 38px;
  padding: 0 14px;
  border: 1px solid var(--border);
  border-radius: 11px;
  background: var(--bg-elevated);
  color: var(--text-primary);
  font-size: 13.5px;
  outline: none;
}
.input:focus {
  border-color: var(--accent);
}
.profile-actions {
  display: flex;
  gap: 10px;
  margin-top: 16px;
}
</style>