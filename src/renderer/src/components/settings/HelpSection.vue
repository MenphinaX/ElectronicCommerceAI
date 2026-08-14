<!-- 帮助 / FAQ（任务 10）：常见问题 + 使用说明 + 数据包/授权/备份说明 + 快捷键提示 -->
<script setup lang="ts">
import { ref } from 'vue'

const open = ref<string | null>(null)

const FAQS = [
  {
    id: 'start',
    q: '第一次使用怎么开始？',
    a: '按首次引导完成「用户名头像 → 创建店铺 → 导入经营数据 → 生成首批评语」即可进入看板；任何一步都可以跳过，跳过后可在导入中心补做。'
  },
  {
    id: 'import',
    q: '数据怎么导入？',
    a: '在「导入中心」拖入或选择生意参谋导出的报表文件（csv/xls/xlsx，支持咨询/搜索词/商品/推广/经营/DSR/客服/退款共 9 类）。每个文件会被自动识别并校验，失败文件会进入修复中心。数据只存本机。'
  },
  {
    id: 'data-package',
    q: '同事之间怎么共享数据？',
    a: '使用「数据包」导出：按店铺和日期范围导出为一个文件（可选密码），对方在导入中心选择数据包导入即可。导入会校验完整性并按业务主键合并，重复导入不会产生重复数据。'
  },
  {
    id: 'license',
    q: '授权怎么获取/续期？',
    a: '本机未授权时进入授权页，把显示的机器码发给管理员，管理员用授权工具签发授权文件，导入即可。授权到期前 14 天会提醒；机器码换了硬盘不失效，重装系统需重新授权。'
  },
  {
    id: 'backup',
    q: '数据怎么备份？',
    a: '在「设置 → 数据与备份」可手动备份（保留最近 5 份）、从备份恢复、完整性体检与数据库瘦身。卸载/重装应用不会删除数据目录，数据始终在 %APPDATA%\\EC AI 下。'
  },
  {
    id: 'password',
    q: '忘记应用密码锁的密码怎么办？',
    a: '锁屏页有「忘记密码」入口：联系管理员用授权工具签发「万能解锁」文件并导入，密码即被重置，数据不会删除。'
  },
  {
    id: 'update',
    q: '怎么更新到新版本？',
    a: '在「设置 → 检查更新」点击检查，检测到新版本会自动下载，重启完成覆盖安装；也可点「手动下载安装包」获取安装包覆盖升级。更新只替换程序文件，不碰数据目录。'
  },
  {
    id: 'shortcuts',
    q: '有哪些快捷键？',
    a: 'Ctrl+I 打开导入中心；Ctrl+R 重新生成 AI 评语；Ctrl+E 一键导出日报。'
  },
  {
    id: 'privacy',
    q: '经营数据会外发吗？',
    a: '不会。除你主动配置的 AI 服务商（生成评语/兜底解析时需要发送对应内容，界面有提示）与 GitHub 技能文本下载外，经营数据绝不外发。更新请求只发送版本号。'
  }
]
</script>

<template>
  <section class="glass-card setting-block">
    <h3 class="block-title">帮助与 FAQ</h3>
    <p class="block-desc">常见问题与使用说明；数据包 / 授权 / 备份说明见下</p>
    <div class="faq-list">
      <div v-for="f in FAQS" :key="f.id" class="faq-item">
        <button class="faq-q" type="button" @click="open = open === f.id ? null : f.id">
          <span>{{ f.q }}</span>
          <span class="faq-arrow" :class="{ open: open === f.id }">▾</span>
        </button>
        <p v-if="open === f.id" class="faq-a">{{ f.a }}</p>
      </div>
    </div>
    <div class="shortcut-row">
      <span class="shortcut-title">常用快捷键</span>
      <span class="shortcut"><kbd>Ctrl</kbd>+<kbd>I</kbd> 导入</span>
      <span class="shortcut"><kbd>Ctrl</kbd>+<kbd>R</kbd> 重新生成评语</span>
      <span class="shortcut"><kbd>Ctrl</kbd>+<kbd>E</kbd> 导出日报</span>
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
.faq-list {
  margin-top: 14px;
  border-top: 1px solid var(--border);
}
.faq-item {
  border-bottom: 1px solid var(--border);
}
.faq-q {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 12px 2px;
  border: none;
  background: transparent;
  color: var(--text-primary);
  font-size: 13px;
  font-weight: 600;
  text-align: left;
  cursor: pointer;
}
.faq-q:hover {
  color: var(--accent);
}
.faq-arrow {
  font-size: 11px;
  color: var(--text-tertiary);
  transition: transform 0.15s ease;
}
.faq-arrow.open {
  transform: rotate(180deg);
}
.faq-a {
  margin: 0 0 12px;
  font-size: 12.5px;
  color: var(--text-secondary);
  line-height: 1.8;
}
.shortcut-row {
  display: flex;
  align-items: center;
  gap: 14px;
  margin-top: 16px;
  padding: 12px 14px;
  border-radius: 12px;
  background: var(--bg-elevated);
  flex-wrap: wrap;
}
.shortcut-title {
  font-size: 12px;
  font-weight: 700;
  color: var(--text-secondary);
}
.shortcut {
  font-size: 12px;
  color: var(--text-primary);
}
kbd {
  font-family: Consolas, monospace;
  font-size: 11px;
  padding: 2px 6px;
  border-radius: 6px;
  border: 1px solid var(--border);
  background: var(--bg-base);
}
</style>