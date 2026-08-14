<template>
  <div class="pimg-box" :style="{ width: size + 'px', height: size + 'px' }" :title="'点击上传商品主图'" @click="pick">
    <img v-if="url && !failed" :src="url" alt="" :data-pid="productId" loading="lazy" @error="failed = true" />
    <div v-else class="img-placeholder" :title="'点击上传商品主图'">
      <span v-html="BP_ICONS.camera"></span>
      <span>点击上传</span>
    </div>
    <input ref="inputRef" type="file" accept="image/png,image/jpeg,image/webp" style="display:none" @change="onFile" />
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { BP_ICONS } from './BpIcons'
import { useDialogStore } from '../../../stores/dialog'
import { useProductImagesStore } from '../../../stores/productImages'
import { useShopsStore } from '../../../stores/shops'

const props = withDefaults(defineProps<{ productId: string; size?: number }>(), { size: 76 })
const shops = useShopsStore()
const images = useProductImagesStore()
const dialog = useDialogStore()
const shopId = computed(() => shops.defaultId ?? 0)
const rec = computed(() => (shopId.value > 0 ? images.byShop[shopId.value]?.[props.productId] : null) ?? null)
const url = computed(() => rec.value?.url ?? '')
const failed = ref(false)
const inputRef = ref<HTMLInputElement | null>(null)

onMounted(() => {
  if (shopId.value > 0) void images.ensure(shopId.value)
})
onBeforeUnmount(() => undefined)

function pick(): void {
  inputRef.value?.click()
}
async function onFile(e: Event): Promise<void> {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file || shopId.value <= 0) return
  const ext = (file.name.split('.').pop() ?? '').toLowerCase()
  if (!['png', 'jpg', 'jpeg', 'webp'].includes(ext)) {
    dialog.error('图片格式不支持', '仅支持 png/jpg/jpeg/webp 图片。')
    return
  }
  if (file.size > 5 * 1024 * 1024) {
    dialog.error('图片过大', '图片不能超过 5MB，请压缩后再试。')
    return
  }
  try {
    const bytes = new Uint8Array(await file.arrayBuffer())
    await images.save(shopId.value, props.productId, bytes, file.name)
    failed.value = false
  } catch (err) {
    dialog.error('上传失败', err instanceof Error ? err.message : String(err))
  }
}
</script>
