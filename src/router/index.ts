import { createRouter, createWebHistory, type RouteRecordRaw } from 'vue-router'

declare module 'vue-router' {
  interface RouteMeta {
    title: string
  }
}

const routes: RouteRecordRaw[] = [
  { path: '/', redirect: '/json-sql' },
  {
    path: '/json-sql',
    name: 'json-sql',
    component: () => import('../views/JsonSqlView.vue'),
    meta: { title: 'JSON / SQL 工作台' },
  },
  {
    path: '/password',
    name: 'password',
    component: () => import('../views/PasswordView.vue'),
    meta: { title: '密码与助记词' },
  },
  {
    path: '/qr-barcode',
    name: 'qr-barcode',
    component: () => import('../views/QrBarcodeView.vue'),
    meta: { title: 'QR / 条码' },
  },
  {
    path: '/gmb',
    name: 'gmb',
    component: () => import('../views/GmbView.vue'),
    meta: { title: '到站看板' },
  },
  { path: '/:pathMatch(.*)*', redirect: '/json-sql' },
]

const router = createRouter({
  history: createWebHistory(),
  routes,
})

export default router
