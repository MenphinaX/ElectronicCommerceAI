<template>
  <div class="data-gap-banner" :class="{ ok }">
    <div style="flex:1">
      <div class="title"><span v-html="ok ? BP_ICONS.check : BP_ICONS.megaphone"></span>{{ ok ? '数据覆盖完整' : '数据覆盖缺口' }}</div>
      <div class="subtitle">{{ ok ? '当前窗口经营数据完整，以下所有店铺级数字均为该窗口真实聚合。' : gapText }}</div>
    </div>
    <div class="chips">
      <span class="chip">窗口 {{ bp.winStart.value }} ~ {{ bp.winEnd.value }}</span>
      <span class="chip">实际覆盖 {{ covered }} 天 / 期望 {{ bp.winDays.value }} 天</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useBpData } from './bp-utils'
import { BP_ICONS } from './BpIcons'

const bp = useBpData()
const covered = computed(() => bp.days.value.length)
const ok = computed(() => covered.value >= bp.winDays.value)
const gapText = computed(() => `窗口 ${bp.winStart.value} ~ ${bp.winEnd.value} 实际覆盖 ${covered.value}/${bp.winDays.value} 天，缺失 ${Math.max(0, bp.winDays.value - covered.value)} 天，涉及模块已如实标注。`)
</script>
