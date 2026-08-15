<!-- 任务 4L：全局更新弹窗（App 级挂载，任何页面可弹）——发现新版「立即更新/稍后再说」；稍后后台继续下载；
     下载完成提示「已下载，下次启动自动安装」；启动强制安装中关闭。自绘弹窗，不使用 DialogHost（按钮语义不同） -->
<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'
import AppIcon from './AppIcon.vue'

const visible = ref(false)
const version = ref('')
const progress = ref(0)
const downloading = ref(false)
const downloaded = ref(false)
let unsubscribe: (() => void) | null = null

onMounted(() => {
  unsubscribe = window.api.updater.onEvent((payload) => {
    const type = String(payload.type ?? '')
    if (type === 'available') {
      version.value = String(payload.version ?? '')
      progress.value = 0
      downloading.value = false
      downloaded.value = false
      visible.value = true
    } else if (type === 'progress') {
      progress.value = Number(payload.percent ?? 0)
    } else if (type === 'downloaded') {
      downloading.value = false
      downloaded.value = true
      progress.value = 100
      visible.value = true
    } else if (type === 'installing') {
      visible.value = false
    }
  })
})

onUnmounted(() => unsubscribe?.())

function updateNow(): void {
  downloading.value = true
  void window.api.updater.download()
}

function later(): void {
  visible.value = false
}

function closeDownloaded(): void {
  visible.value = false
}
</script>

<template>
  <Teleport to="body">
    <Transition name="fade">
      <div v-if="visible" class="upd-overlay" data-test="update-prompt">
        <div class="upd-dialog glass-card" role="dialog" aria-label="更新提示">
          <div class="upd-head">
            <span class="upd-icon"><AppIcon name="download" :size="22" /></span>
            <h3 class="upd-title">{{ downloaded ? '更新已就绪' : '发现新版本' }}</h3>
          </div>
          <div class="upd-body">
            <p class="upd-line" data-test="update-version">
              {{ downloaded ? `新版本 v${version} 已下载完成，下次启动将自动安装。` : `发现新版本 v${version}，是否立即下载并安装？` }}
            </p>
            <template v-if="!downloaded && downloading">
              <div class="upd-progress-bar"><span class="upd-progress-fill" :style="{ width: progress + '%' }"></span></div>
              <p class="upd-hint">正在后台下载… {{ progress }}%</p>
            </template>
            <template v-else-if="!downloaded">
              <p class="upd-hint">选「稍后再说」也不影响：新版会在后台静默下载，下载完下次启动自动安装。</p>
            </template>
          </div>
          <div class="upd-actions">
            <template v-if="downloaded">
              <button class="btn btn-primary" type="button" data-test="update-downloaded-ok" @click="closeDownloaded">知道了</button>
            </template>
            <template v-else>
              <button class="btn btn-ghost" type="button" data-test="update-later" :disabled="downloading" @click="later">稍后再说</button>
              <button class="btn btn-primary" type="button" data-test="update-now" :disabled="downloading" @click="updateNow">
                {{ downloading ? '下载中…' : '立即更新' }}
              </button>
            </template>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.upd-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.55);
  backdrop-filter: blur(4px);
  display: grid;
  place-items: center;
  z-index: 120;
}
.upd-dialog {
  width: 420px;
  max-width: calc(100vw - 48px);
  padding: 22px;
}
.upd-head {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 14px;
}
.upd-icon {
  width: 42px;
  height: 42px;
  border-radius: 12px;
  display: grid;
  place-items: center;
  flex-shrink: 0;
  background: var(--accent);
  color: var(--on-accent, #ffffff);
}
.upd-title {
  margin: 0;
  font-size: 16px;
  font-weight: 700;
}
.upd-body {
  margin-bottom: 20px;
}
.upd-line {
  margin: 0 0 8px;
  font-size: 13.5px;
  line-height: 1.6;
  color: var(--text-secondary);
}
.upd-hint {
  margin: 10px 0 0;
  font-size: 12.5px;
  line-height: 1.6;
  color: var(--text-secondary);
  opacity: 0.85;
}
.upd-progress-bar {
  margin-top: 12px;
  height: 6px;
  border-radius: 999px;
  background: var(--bg-hover);
  overflow: hidden;
}
.upd-progress-fill {
  display: block;
  height: 100%;
  background: var(--accent);
  transition: width 0.2s ease;
}
.upd-actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
}
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.18s ease;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
