import { createRouter, createWebHashHistory } from 'vue-router'

const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    { path: '/', redirect: '/dashboard' },
    {
      path: '/dashboard',
      name: 'dashboard',
      component: () => import('../views/DashboardView.vue'),
      meta: { title: '数据看板' }
    },
    {
      path: '/roi',
      name: 'roi',
      component: () => import('../views/RoIView.vue'),
      meta: { title: '投产比计算' }
    },
    {
      path: '/chat',
      name: 'chat',
      component: () => import('../views/ChatView.vue'),
      meta: { title: 'AI 对话' }
    },
    {
      path: '/import',
      name: 'import',
      component: () => import('../views/ImportView.vue'),
      meta: { title: '导入中心' }
    },
    {
      path: '/product',
      name: 'product',
      component: () => import('../views/ProductView.vue'),
      meta: { title: '单品分析' }
    },
    {
      path: '/promo',
      name: 'promo',
      component: () => import('../views/PromoView.vue'),
      meta: { title: '推广分析' }
    },
    {
      path: '/cs',
      name: 'cs',
      component: () => import('../views/CsView.vue'),
      meta: { title: '客服绩效' }
    },
    {
      path: '/dsr',
      name: 'dsr',
      component: () => import('../views/DsrView.vue'),
      meta: { title: 'DSR' }
    },
    {
      path: '/keywords',
      name: 'keywords',
      component: () => import('../views/KeywordsView.vue'),
      meta: { title: '搜索词' }
    },
    {
      path: '/store',
      name: 'store',
      component: () => import('../views/StoreView.vue'),
      meta: { title: '全店分析' }
    },
    {
      path: '/compare',
      name: 'compare',
      component: () => import('../views/CompareView.vue'),
      meta: { title: '店铺对比' }
    },
    {
      path: '/skills',
      name: 'skills',
      component: () => import('../views/SkillsView.vue'),
      meta: { title: '技能管理' }
    },
    {
      path: '/qa',
      name: 'qa',
      component: () => import('../views/QaView.vue'),
      meta: { title: '聊天质检' }
    },    {
      path: '/settings',
      name: 'settings',
      component: () => import('../views/SettingsView.vue'),
      meta: { title: '设置' }
    }
  ]
})

export default router