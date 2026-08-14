<template>
  <div id="action-analysis" class="kpi-report">
    <div class="kpi-report-head"><span v-html="BP_ICONS.megaphone"></span> 建议动作（按优先级）<span class="ghost" style="font-weight:500;font-size:11px;margin-left:6px;">（原型内置规则引擎 · 数字可回溯）</span></div>
    <div v-for="a in actions" :key="a.t" class="rec">
      <span class="tag" :class="a.c === 'red' ? 'tag-red' : a.c === 'amber' ? 'tag-amber' : 'tag-green'">{{ a.k }}</span>
      <strong>{{ a.t }}</strong><em>{{ a.d }}</em>
    </div>
    <div v-if="!actions.length" class="rec">
      <span class="tag tag-amber">P1</span><strong>等待生成</strong><em>当前窗口无显著预警项，保持监控并优化利润率。</em>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useBpData, bpActions } from './bp-utils'
import { BP_ICONS } from './BpIcons'

const bp = useBpData()
const actions = computed(() =>
  bpActions({
    a: bp.agg.value,
    promoTop: bp.promoTop.value,
    dsr: bp.dsr.value,
    keywords: bp.keywords.value.map((x) => ({ word: x.word, vis: x.vis, buy: x.buy }))
  })
)
</script>
