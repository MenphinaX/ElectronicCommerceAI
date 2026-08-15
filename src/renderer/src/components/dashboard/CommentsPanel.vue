<!-- AI 评语汇总区（任务 6）：看板顶部集中展示各模块评语 + 异常清单 + 一键重新生成 -->
<script setup lang="ts">
import AppIcon from '../AppIcon.vue'
import CommentCard from './CommentCard.vue'
import { useCommentsStore } from '../../stores/comments'

const store = useCommentsStore()
</script>

<template>
  <section class="glass-card comments-panel">
    <div class="panel-head">
      <h3 class="block-title">
        <AppIcon name="spark" :size="16" />
        AI 评语汇总
      </h3>
      <div class="head-right">
        <span v-if="!store.configured" class="no-key">未配置模型</span>
        <button class="mini-btn" type="button" :disabled="store.loading" @click="store.regenerate()">
          <AppIcon name="refresh" :size="13" />
          全部重新生成
        </button>
      </div>
    </div>
    <p class="block-desc">按各模块绑定技能自动生成，数字来自真实窗口数据；异常清单不依赖模型，无 key 也照常显示。</p>

    <div v-if="store.rules.length" class="rules-box">
      <div class="rules-title">异常清单（本轮触发）</div>
      <ul class="rules-list">
        <li v-for="(r, i) in store.rules" :key="i" class="rule-item" :class="r.severity">
          <AppIcon :name="r.severity === 'high' ? 'warning' : 'info'" :size="13" />
          <span class="rule-name">{{ r.rule }}</span>
          <span class="rule-evidence">{{ r.evidence }}</span>
        </li>
      </ul>
    </div>
  
    <div v-if="store.items.length" class="panel-grid">
      <div v-for="it in store.items" :key="it.module" class="panel-cell">
        <div class="cell-head">
          <span class="cell-label">{{ it.label }}</span>
          <span v-if="it.skillName" class="skill-tag">{{ it.skillName }}</span>
          <span v-if="it.model && it.content" class="model-tag">{{ it.model }}</span>
        </div>
        <CommentCard :module="it.module" />
      </div>
    </div>
  </section>
</template>

<style scoped>
.comments-panel {
  padding: 18px 20px;
  margin-bottom: 26px;
}
.panel-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}
.block-title {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 0;
  font-size: 15px;
  font-weight: 700;
}
.block-desc {
  margin: 6px 0 0;
  font-size: 12.5px;
  color: var(--text-secondary);
}
.head-right {
  display: flex;
  align-items: center;
  gap: 10px;
}
.no-key {
  font-size: 12px;
  color: var(--danger);
}
.mini-btn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: transparent;
  color: var(--text-secondary);
  font-size: 12px;
  padding: 4px 10px;
  cursor: pointer;
}
.mini-btn:hover:not(:disabled) {
  color: var(--accent);
  border-color: var(--accent);
}
.mini-btn:disabled {
  opacity: 0.5;
  cursor: default;
}
.rules-box {
  margin-top: 14px;
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 12px 14px;
  background: var(--bg-base);
}
.rules-title {
  font-size: 12px;
  font-weight: 700;
  color: var(--text-secondary);
  margin-bottom: 8px;
}
.rules-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.rule-item {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  font-size: 12.5px;
  line-height: 1.5;
}
.rule-item.high {
  color: var(--danger);
}
.rule-item.medium {
  color: var(--warning);
}
.rule-name {
  flex-shrink: 0;
  font-weight: 700;
}
.rule-evidence {
  color: var(--text-secondary);
}
.panel-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(340px, 1fr));
  gap: 10px;
  margin-top: 14px;
}
.panel-cell {
  border: 1px solid var(--border);
  border-radius: 12px;
  background: var(--bg-base);
  padding: 10px 12px 12px;
}
.cell-head {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 2px;
}
.cell-label {
  font-size: 12.5px;
  font-weight: 800;
}
.skill-tag,
.model-tag {
  font-size: 11px;
  color: var(--accent);
  background: var(--accent-soft);
  padding: 1px 8px;
  border-radius: 999px;
}
.model-tag {
  color: var(--text-secondary);
  background: var(--bg-hover);
}
</style>
