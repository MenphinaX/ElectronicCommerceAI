<script setup lang="ts">
import { onMounted, ref } from 'vue'
import AppIcon from '../AppIcon.vue'
import { useShopsStore, type ShopItem } from '../../stores/shops'
import { useDialogStore } from '../../stores/dialog'

const shops = useShopsStore()
const dialog = useDialogStore()

const name = ref('')
const platform = ref('天猫')
const editing = ref<ShopItem | null>(null)
const editName = ref('')
const editPlatform = ref('')

onMounted(() => void shops.refresh())

async function addShop(): Promise<void> {
  const n = name.value.trim()
  if (!n) {
    dialog.error('店铺名不能为空', '请输入店铺名称')
    return
  }
  if (shops.shops.some((s) => s.name === n)) {
    dialog.error('店铺已存在', `已有同名店铺「${n}」，店铺按名称去重`)
    return
  }
  try {
    const id = await shops.create(n, platform.value)
    await shops.setDefault(id)
    name.value = ''
    dialog.info('店铺已创建', `「${n}」已创建并设为默认店铺`)
  } catch (e) {
    dialog.error('创建失败', (e as Error).message)
  }
}

function startEdit(shop: ShopItem): void {
  editing.value = shop
  editName.value = shop.name
  editPlatform.value = shop.platform
}

async function saveEdit(): Promise<void> {
  if (!editing.value) return
  const n = editName.value.trim()
  if (!n) {
    dialog.error('店铺名不能为空', '请输入店铺名称')
    return
  }
  try {
    await shops.update(editing.value.id, { name: n, platform: editPlatform.value })
    dialog.info('已保存', `店铺已更新为「${n}」`)
    editing.value = null
  } catch (e) {
    dialog.error('保存失败', (e as Error).message)
  }
}

function confirmRemove(shop: ShopItem): void {
  dialog.confirm(
    '删除店铺',
    `确定删除「${shop.name}」？已有数据的店铺会被拒绝删除（防止误删经营数据）。`,
    () => void remove(shop)
  )
}

async function remove(shop: ShopItem): Promise<void> {
  try {
    await shops.remove(shop.id)
    dialog.info('已删除', `店铺「${shop.name}」已删除`)
  } catch (e) {
    dialog.error('删除失败', (e as Error).message)
  }
}

async function setDefault(shop: ShopItem): Promise<void> {
  await shops.setDefault(shop.id)
}
</script>

<template>
  <section class="glass-card block">
    <div class="block-head">
      <div>
        <h3 class="block-title">店铺管理</h3>
        <p class="block-desc">增删改店铺、设默认店铺；导入数据归属导入时选定的店铺</p>
      </div>
    </div>

    <div class="add-row">
      <input v-model="name" class="input" placeholder="店铺名称（如 XX旗舰店）" @keyup.enter="addShop" />
      <select v-model="platform" class="input select">
        <option>天猫</option>
        <option>淘宝</option>
        <option>京东</option>
        <option>拼多多</option>
      </select>
      <button class="btn primary" @click="addShop">
        <AppIcon name="plus-square" :size="15" /> 新建店铺
      </button>
    </div>

    <div v-if="shops.shops.length === 0" class="empty">
      还没有店铺，先新建一个（导入时会自动归属）
    </div>
    <div v-else class="shop-list">
      <div v-for="shop in shops.shops" :key="shop.id" class="shop-item">
        <template v-if="editing?.id === shop.id">
          <input v-model="editName" class="input" placeholder="店铺名" />
          <select v-model="editPlatform" class="input select">
            <option>天猫</option><option>淘宝</option><option>京东</option><option>拼多多</option>
          </select>
          <button class="btn primary sm" @click="saveEdit"><AppIcon name="check" :size="14" /> 保存</button>
          <button class="btn sm" @click="editing = null">取消</button>
        </template>
        <template v-else>
          <AppIcon name="store" :size="16" class="item-icon" />
          <span class="item-name">{{ shop.name }}</span>
          <span class="item-platform">{{ shop.platform }}</span>
          <button v-if="shop.id === shops.defaultId" class="tag-default">默认</button>
          <button v-else class="btn sm ghost" @click="setDefault(shop)">设为默认</button>
          <button class="icon-sm" title="重命名" aria-label="重命名" @click="startEdit(shop)">
            <AppIcon name="edit" :size="14" />
          </button>
          <button class="icon-sm danger" title="删除" aria-label="删除" @click="confirmRemove(shop)">
            <AppIcon name="trash" :size="14" />
          </button>
        </template>
      </div>
    </div>
  </section>
</template>

<style scoped>
.block {
  padding: 20px;
  margin-bottom: 16px;
}
.block-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 14px;
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
.add-row {
  display: flex;
  gap: 10px;
  margin-bottom: 14px;
}
.input {
  height: 34px;
  padding: 0 12px;
  border-radius: 10px;
  border: 1px solid var(--border);
  background: var(--bg-hover);
  color: var(--text-primary);
  font-size: 13px;
  outline: none;
  flex: 1;
}
.select {
  flex: 0 0 110px;
}
.btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 34px;
  padding: 0 14px;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: var(--bg-hover);
  color: var(--text-primary);
  font-size: 13px;
  cursor: pointer;
  white-space: nowrap;
}
.btn:hover {
  filter: brightness(1.12);
}
.btn.primary {
  background: var(--accent);
  border-color: var(--accent);
  color: #000;
  font-weight: 600;
}
.btn.sm {
  height: 28px;
  padding: 0 10px;
  font-size: 12px;
}
.btn.ghost {
  background: transparent;
  border-color: transparent;
  color: var(--text-secondary);
}
.empty {
  padding: 20px;
  text-align: center;
  color: var(--text-tertiary);
  font-size: 13px;
  border: 1.5px dashed var(--border);
  border-radius: 12px;
}
.shop-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.shop-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  border: 1px solid var(--border);
  border-radius: 12px;
  background: var(--bg-base);
}
.item-icon {
  color: var(--accent);
  flex-shrink: 0;
}
.item-name {
  flex: 1;
  font-size: 13.5px;
  font-weight: 600;
}
.item-platform {
  font-size: 12px;
  color: var(--text-tertiary);
}
.tag-default {
  border: none;
  border-radius: 999px;
  padding: 3px 10px;
  font-size: 11px;
  font-weight: 600;
  background: var(--accent-soft);
  color: var(--accent);
  cursor: default;
}
.icon-sm {
  width: 30px;
  height: 30px;
  border: none;
  border-radius: 8px;
  background: transparent;
  color: var(--text-secondary);
  display: grid;
  place-items: center;
  cursor: pointer;
}
.icon-sm:hover {
  background: var(--bg-hover);
  color: var(--text-primary);
}
.icon-sm.danger:hover {
  color: #ff6b6b;
}
</style>