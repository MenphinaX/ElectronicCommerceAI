import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import router from './router'
import './assets/base.css'
import './assets/dashboard-blueprint.css'

createApp(App).use(createPinia()).use(router).mount('#app')

// 验收辅助：EC_AI_AUTOSHOT=1 且 URL 带 autoshot=1 时自动走一遍主题/页面/弹窗并截图
if (import.meta.env.DEV && new URLSearchParams(window.location.search).has('autoshot')) {
  import('./autoshot').then((m) => m.runAutoshot())
}