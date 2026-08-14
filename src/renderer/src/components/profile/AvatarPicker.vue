<!-- 头像选择器（任务 10）：8 个自绘线性头像 + 本地上传（圆形裁切展示），首次引导与设置页共用 -->
<script setup lang="ts">
import { computed } from 'vue'
import AppIcon from '../AppIcon.vue'
import BrandIcon from '../BrandIcon.vue'
import { AVATARS, avatarFileUrl, isBrandAvatar } from '../../data/avatars'
import { useDialogStore } from '../../stores/dialog'

const props = withDefaults(defineProps<{ modelValue: string; disabled?: boolean }>(), { disabled: false })
const emit = defineEmits<{ 'update:modelValue': [value: string] }>()
const dialog = useDialogStore()

const isFile = computed(() => props.modelValue.startsWith('file:'))
const fileUrl = computed(() => avatarFileUrl(props.modelValue))

function select(id: string): void {
  if (props.disabled) return
  emit('update:modelValue', id)
}

async function upload(): Promise<void> {
  if (props.disabled) return
  const res = await window.api.profile.pickAvatar()
  if (res.ok && res.avatar) emit('update:modelValue', res.avatar)
  else if (!res.ok) dialog.error('头像上传失败', res.error ?? '未知错误')
}
</script>

<template>
  <div class="avatar-picker">
    <div class="avatar-grid">
      <button
        v-for="a in AVATARS"
        :key="a.id"
        class="avatar-cell"
        :class="{ active: modelValue === a.id }"
        type="button"
        :title="a.title"
        :disabled="disabled"
        @click="select(a.id)"
      >
        <BrandIcon v-if="isBrandAvatar(a.id)" :size="30" />
        <svg v-else viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" v-html="a.svg"></svg>
      </button>
    </div>
    <div class="avatar-file-row">
      <div v-if="isFile" class="avatar-file-preview">
        <img :src="fileUrl" alt="自定义头像" />
        <span class="file-tag">自定义</span>
      </div>
      <button class="btn btn-ghost upload-btn" type="button" :disabled="disabled" @click="upload">
        <AppIcon name="upload" :size="15" />
        上传本地图片
      </button>
      <span class="upload-hint">支持 PNG / JPG / WebP，展示时圆形裁切</span>
    </div>
  </div>
</template>

<style scoped>
.avatar-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}
.avatar-cell {
  width: 46px;
  height: 46px;
  border-radius: 50%;
  border: 1.5px solid var(--border);
  background: var(--bg-elevated);
  color: var(--text-secondary);
  display: grid;
  place-items: center;
  cursor: pointer;
  transition: border-color 0.15s ease, color 0.15s ease, transform 0.15s ease;
}
.avatar-cell svg {
  width: 30px;
  height: 30px;
}
.avatar-cell:hover:not(:disabled) {
  border-color: var(--accent);
  color: var(--text-primary);
}
.avatar-cell.active {
  border-color: var(--accent);
  color: var(--accent);
  background: var(--accent-soft);
  box-shadow: 0 0 0 2px var(--accent-soft);
}
.avatar-cell:disabled {
  opacity: 0.6;
  cursor: default;
}
.avatar-file-row {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-top: 12px;
  flex-wrap: wrap;
}
.avatar-file-preview {
  position: relative;
  width: 42px;
  height: 42px;
}
.avatar-file-preview img {
  width: 42px;
  height: 42px;
  border-radius: 50%;
  object-fit: cover;
  border: 1.5px solid var(--accent);
}
.file-tag {
  position: absolute;
  bottom: -6px;
  right: -8px;
  font-size: 9px;
  padding: 1px 5px;
  border-radius: 999px;
  background: var(--accent);
  color: #000000;
  font-weight: 700;
}
.upload-btn {
  height: 34px;
  padding: 0 14px;
}
.upload-hint {
  font-size: 11.5px;
  color: var(--text-tertiary);
}
</style>