<!-- ECharts 封装：初始化/自适应/主题（任务 4 图表统一走这里） -->
<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import * as echarts from 'echarts'

const props = withDefaults(defineProps<{ options: echarts.EChartsOption; height?: number; autoresize?: boolean; onClick?: (params: echarts.ECElementEvent) => void }>(), {
  height: 260,
  autoresize: true
})

const el = ref<HTMLElement | null>(null)
let chart: echarts.ECharts | null = null
let ro: ResizeObserver | null = null

function render(): void {
  if (chart && props.options) chart.setOption(props.options, true)
}

onMounted(() => {
  if (!el.value) return
  chart = echarts.init(el.value)
  chart.on('click', (params: echarts.ECElementEvent) => props.onClick?.(params))
  render()
  if (props.autoresize) {
    ro = new ResizeObserver(() => chart?.resize())
    ro.observe(el.value)
  }
})

watch(() => props.options, render, { deep: true })

onBeforeUnmount(() => {
  ro?.disconnect()
  chart?.dispose()
  chart = null
})
</script>

<template>
  <div ref="el" class="echart" :style="{ height: height + 'px' }"></div>
</template>

<style scoped>
.echart {
  width: 100%;
}
</style>
