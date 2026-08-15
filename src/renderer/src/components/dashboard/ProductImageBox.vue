<!-- 商品图上传框（任务 4A）：懒加载显示已绑定图片；未绑定显示「点击上传」占位；支持替换/删除；上传后即时刷新 -->
<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import AppIcon from '../AppIcon.vue'
import { useDialogStore } from '../../stores/dialog'
import { useProductImagesStore } from '../../stores/productImages'
import { useShopsStore } from '../../stores/shops'

const props = withDefaults(
  defineProps<{ productId: string; size?: number; radius?: number }>(),
  { size: 64, radius: 10 }
)
const emit = defineEmits<{ (e: 'changed'): void }>()

const shops = useShopsStore()
const images = useProductImagesStore()
const dialog = useDialogStore()

const shopId = computed(() => shops.defaultId ?? 0)
const rec = computed(() => (shopId.value > 0 ? images.byShop[shopId.value]?.[props.productId] : null) ?? null)

const visible = ref(false)
const failed = ref(false)
const hover = ref(false)
const elRef = ref<HTMLElement | null>(null)
const inputRef = ref<HTMLInputElement | null>(null)
let observer: IntersectionObserver | null = null

const ALLOWED = ['png', 'jpg', 'jpeg', 'webp']

onMounted(() => {
  // 懒加载：进入视口附近才开始渲染 <img>，图片多时不阻塞滚动
  observer = new IntersectionObserver(
    (entries) => {
      for (const en of entries) {
        if (en.isIntersecting) {
          visible.value = true
          observer?.disconnect()
        }
      }
    },
    { rootMargin: '160px 0px' }
  )
  if (elRef.value) observer.observe(elRef.value)
})
onBeforeUnmount(() => observer?.disconnect())

// 切换店铺后加载该店绑定（保证 A/B 不串图）
watch(
  shopId,
  (id) => {
    failed.value = false
    if (id > 0) void images.ensure(id)
  },
  { immediate: true }
)

function pick(): void {
  inputRef.value?.click()
}

async function onFile(e: Event): Promise<void> {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file || shopId.value <= 0) return
  const ext = (file.name.split('.').pop() ?? '').toLowerCase()
  if (!ALLOWED.includes(ext)) {
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
    emit('changed')
  } catch (err) {
    dialog.error('图片上传失败', err instanceof Error ? err.message : String(err))
  }
}

async function remove(): Promise<void> {
  const ok = await dialog.confirmAsync('删除商品图片？', '删除后该商品将不再显示图片，可重新上传。')
  if (!ok) return
  try {
    await images.remove(shopId.value, props.productId)
    failed.value = false
    emit('changed')
  } catch (err) {
    dialog.error('删除失败', err instanceof Error ? err.message : String(err))
  }
}
</script>

<template>
  <div
    ref="elRef"
    class="pimg"
    :style="{ width: size + 'px', height: size + 'px', borderRadius: radius + 'px' }"
    :class="{ has: !!rec, hovered: hover }"
    role="button"
    tabindex="0"
    :title="rec ? '点击替换商品主图' : '点击上传商品主图'"
    @click.stop="pick()"
    @keydown.enter.stop="pick()"
    @mouseenter="hover = true"
    @mouseleave="hover = false"
  >
    <img v-if="rec && visible && !failed" :src="rec.url" :alt="props.productId" loading="lazy" draggable="false" @error="failed = true" />
    <button v-else-if="visible" class="pimg-placeholder" @click.stop="pick()">
      <AppIcon name="image" :size="Math.round(size * 0.3)" />
      <span>点击上传</span>
    </button>
    <div v-else class="pimg-skeleton"></div>

    <div v-if="rec && hover" class="pimg-actions" @click.stop>
      <button class="act" title="替换图片" aria-label="替换图片" @click.stop="pick()">
        <AppIcon name="refresh" :size="13" />
      </button>
      <button class="act danger" title="删除图片" aria-label="删除图片" @click.stop="remove()">
        <AppIcon name="trash" :size="13" />
      </button>
    </div>

    <input ref="inputRef" type="file" class="pimg-input" accept="image/png,image/jpeg,image/webp" @change="onFile" />
  </div>
</template>

<style scoped>
.pimg {
  position: relative;
  flex: none;
  overflow: hidden;
  background: var(--bg-hover);
  border: 1px solid var(--border);
  cursor: pointer;
  display: grid;
  place-items: center;
}
.pimg img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}
.pimg-placeholder {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 3px;
  width: 100%;
  height: 100%;
  border: none;
  background: transparent;
  color: var(--text-tertiary);
  font-size: 9.5px;
  cursor: pointer;
  padding: 0;
}
.pimg-placeholder:hover {
  color: var(--accent);
}
.pimg-skeleton {
  width: 100%;
  height: 100%;
  background: var(--bg-hover);
}
.pimg-actions {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  background: rgba(0, 0, 0, 0.55);
}
.act {
  width: 26px;
  height: 26px;
  border: none;
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.14);
  color: #ffffff;
  display: grid;
  place-items: center;
  cursor: pointer;
}
.act:hover {
  background: rgba(255, 255, 255, 0.28);
}
.act.danger:hover {
  background: var(--danger);
}
.pimg-input {
  display: none;
}
</style>

