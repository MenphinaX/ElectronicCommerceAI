<!-- 检查更新（任务 10）：electron-updater + GitHub Releases（可私有仓库）；失败不阻塞使用；手动下载安装包兜底 -->
<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'
import AppIcon from '../AppIcon.vue'
import { useDialogStore } from '../../stores/dialog'
import { useSettingsStore } from '../../stores/settings'

const dialog = useDialogStore()
const settings = useSettingsStore()

const feed = ref('GitHub Releases')
const repo = ref('')
const source = ref('')
const status = ref('')
const checking = ref(false)
const available = ref<string | null>(null)
const progress = ref(0)
const downloaded = ref(false)
const downloadedVersion = ref('')
let unsubscribe: (() => void) | null = null

onMounted(async () => {
  const f = await window.api.updater.feed()
  feed.value = f.feed
  repo.value = f.repo
  source.value = String(f.source ?? '')
  unsubscribe = window.api.updater.onEvent((payload) => {
    const type = String(payload.type ?? '')
    if (type === 'checking') {
      checking.value = true
      status.value = '正在检查更新…'
    } else if (type === 'available') {
      checking.value = false
      available.value = String(payload.version ?? '')
      status.value = `发现新版本 ${available.value}，正在下载…`
    } else if (type === 'not-available') {
      checking.value = false
      status.value = `已是最新版本（v${settings.appInfo?.version ?? ''}）`
    } else if (type === 'progress') {
      progress.value = Number(payload.percent ?? 0)
      status.value = `下载中… ${progress.value}%`
    } else if (type === 'downloaded') {
      checking.value = false
      downloaded.value = true
      downloadedVersion.value = String(payload.version ?? '')
      progress.value = 100
      status.value = `新版本 ${downloadedVersion.value} 已下载，重启即可完成安装`
    } else if (type === 'error') {
      checking.value = false
      status.value = `检查失败：${String(payload.message ?? '未知错误')}（不影响正常使用）`
    } else if (type === 'installing') {
      status.value = '正在安装更新…'
    }
  })
})

onUnmounted(() => unsubscribe?.())

async function check(): Promise<void> {
  status.value = ''
  progress.value = 0
  downloaded.value = false
  available.value = null
  const ok = await window.api.updater.check()
  if (!ok) status.value = '检查失败：无法连接更新源（不影响正常使用）'
}

async function install(): Promise<void> {
  await window.api.updater.install()
}

function manualDownload(): void {
  if (repo.value) {
    void window.api.system.openExternal(`https://github.com/${repo.value}/releases/latest`)
  } else {
    dialog.info('未配置更新仓库', '请联系管理员提供 GitHub Releases 仓库地址（owner/repo），或直接获取安装包手动覆盖安装')
  }
}
</script>

<template>
  <section class="glass-card setting-block">
    <h3 class="block-title">检查更新</h3>
    <p class="block-desc">更新源：{{ feed }}<template v-if="source">（{{ source }}）</template><template v-if="repo">（{{ repo }}）</template>。更新只替换程序文件，不会改动你的数据目录；检查失败不影响使用</p>
    <div class="update-row">
      <span class="ver-chip">当前版本 v{{ settings.appInfo?.version ?? '…' }}</span>
      <button class="btn btn-ghost" type="button" :disabled="checking" @click="check">
        <AppIcon name="refresh" :size="15" />{{ checking ? '检查中…' : '检查更新' }}
      </button>
      <button class="btn btn-ghost" type="button" @click="manualDownload">
        <AppIcon name="download" :size="15" />手动下载安装包
      </button>
    </div>
    <div v-if="progress > 0 && !downloaded" class="progress-bar"><span class="progress-fill" :style="{ width: progress + '%' }"></span></div>
    <p v-if="status" class="update-status" :class="{ ok: downloaded, err: status.includes('失败') }">{{ status }}</p>
    <button v-if="downloaded" class="btn btn-primary install-btn" type="button" @click="install">
      重启并安装 v{{ downloadedVersion }}
    </button>
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
.update-row {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-top: 14px;
  flex-wrap: wrap;
}
.ver-chip {
  font-size: 12px;
  padding: 5px 12px;
  border-radius: 999px;
  background: var(--accent-soft);
  color: var(--accent);
  font-weight: 600;
}
.progress-bar {
  margin-top: 14px;
  height: 6px;
  border-radius: 999px;
  background: var(--bg-hover);
  overflow: hidden;
}
.progress-fill {
  display: block;
  height: 100%;
  background: var(--accent);
  transition: width 0.2s ease;
}
.update-status {
  margin: 12px 0 0;
  font-size: 12.5px;
  color: var(--text-secondary);
  line-height: 1.6;
}
.update-status.ok {
  color: var(--accent);
}
.update-status.err {
  color: var(--warning);
}
.install-btn {
  margin-top: 12px;
}
</style>