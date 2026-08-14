<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import AppIcon from './AppIcon.vue'
import { useShopsStore } from '../stores/shops'
import { useSettingsStore } from '../stores/settings'

const shops = useShopsStore()
const settings = useSettingsStore()
const router = useRouter()
const open = ref(false)
const root = ref<HTMLElement | null>(null)

const current = computed(() => shops.defaultShop)

onMounted(() => {
  void shops.load()
  document.addEventListener('mousedown', onClickOutside)
})
onUnmounted(() => document.removeEventListener('mousedown', onClickOutside))

function toggle(): void {
  open.value = !open.value
}
async function pick(shopId: number): Promise<void> {
  await shops.setDefault(shopId)
  await settings.selectShop(String(shopId))
  open.value = false
}
function goManage(): void {
  open.value = false
  void router.push('/import')
}
function onClickOutside(event: MouseEvent): void {
  if (root.value && !root.value.contains(event.target as Node)) open.value = false
}
</script>

<template>
  <div ref="root" class="shop-switcher">
    <button class="shop-btn" aria-label="切换店铺" @click="toggle">
      <span class="shop-icon"><AppIcon name="store" :size="15" /></span>
      <span class="shop-name">{{ current?.name ?? '选择店铺' }}</span>
      <AppIcon name="chevron-down" :size="13" class="chev" :class="{ flip: open }" />
    </button>
    <Transition name="drop">
      <div v-if="open" class="shop-menu glass-card">
        <div class="shop-menu-title">切换店铺</div>
        <button
          v-for="shop in shops.shops"
          :key="shop.id"
          class="shop-option"
          :class="{ active: shop.id === shops.defaultId }"
          @click="pick(shop.id)"
        >
          <AppIcon name="store" :size="15" />
          <span class="opt-name">{{ shop.name }}</span>
          <AppIcon v-if="shop.id === shops.defaultId" name="check" :size="14" class="check" />
        </button>
        <div v-if="shops.shops.length === 0" class="shop-empty">还没有店铺，去导入中心新建</div>
        <button class="manage-btn" @click="goManage">
          <AppIcon name="settings" :size="14" />
          <span>管理店铺</span>
        </button>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.shop-switcher {
  position: relative;
}
.shop-btn {
  display: flex;
  align-items: center;
  gap: 8px;
  height: 34px;
  padding: 0 12px;
  border: 1px solid var(--border);
  border-radius: 999px;
  background: var(--bg-hover);
  color: var(--text-primary);
  font-size: 13px;
  cursor: pointer;
  transition: background 0.15s ease;
}
.shop-btn:hover {
  background: var(--bg-hover);
  filter: brightness(1.1);
}
.shop-icon {
  color: var(--accent);
  display: grid;
  place-items: center;
}
.shop-name {
  max-width: 220px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.chev {
  color: var(--text-tertiary);
  transition: transform 0.2s ease;
}
.chev.flip {
  transform: rotate(180deg);
}
.shop-menu {
  position: absolute;
  top: 42px;
  left: 0;
  min-width: 280px;
  padding: 8px;
  z-index: 40;
}
.shop-menu-title {
  font-size: 11px;
  color: var(--text-tertiary);
  padding: 6px 10px 8px;
}
.shop-option {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 9px 10px;
  border: none;
  border-radius: 10px;
  background: transparent;
  color: var(--text-secondary);
  font-size: 13px;
  cursor: pointer;
  text-align: left;
}
.shop-option:hover {
  background: var(--bg-hover);
  color: var(--text-primary);
}
.shop-option.active {
  color: var(--accent);
}
.opt-name {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.shop-empty {
  padding: 12px 10px;
  font-size: 12px;
  color: var(--text-tertiary);
}
.manage-btn {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  margin-top: 6px;
  padding: 9px 10px;
  border: none;
  border-radius: 10px;
  background: var(--bg-hover);
  color: var(--text-secondary);
  font-size: 12.5px;
  cursor: pointer;
  text-align: left;
}
.manage-btn:hover {
  color: var(--text-primary);
}
.drop-enter-active,
.drop-leave-active {
  transition: opacity 0.15s ease, transform 0.15s ease;
}
.drop-enter-from,
.drop-leave-to {
  opacity: 0;
  transform: translateY(-4px);
}
</style>