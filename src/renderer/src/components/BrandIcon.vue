<!-- 任务 4H 品牌图标（应用内统一 logo）：顶栏/门禁/开屏/引导/头像默认等所有品牌位共用；素材图经去底裁圆后打包为透明 PNG -->
<script setup lang="ts">
import brandUrl from '../assets/brand.png'

withDefaults(defineProps<{ size?: number; rounded?: boolean }>(), { size: 24, rounded: true })
</script>

<template>
  <img class="brand-icon" :class="{ rounded }" :src="brandUrl" :width="size" :height="size" :alt="'EC AI'" draggable="false" />
</template>

<style scoped>
.brand-icon {
  display: block;
  object-fit: contain;
  user-select: none;
  flex-shrink: 0;
}
.rounded {
  border-radius: 50%;
}
</style>
