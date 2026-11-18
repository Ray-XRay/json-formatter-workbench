import {
  defineAsyncComponent,
  defineComponent,
  h,
  nextTick,
  type Component,
  type VNode,
} from 'vue'
import { createRouter, createWebHistory, type RouteRecordRaw } from 'vue-router'

declare module 'vue-router' {
  interface RouteMeta {
    title: string
  }
}

/**
 * First-visit skeleton (title bar + card placeholders). Shown while a lazy
 * route chunk is loading so the main area is never fully blank — the View
 * Transition snapshots it instead of an empty view.
 */
const RouteSkeleton: Component = defineComponent({
  name: 'RouteSkeleton',
  render(): VNode {
    return h('div', { class: 'route-skeleton', 'aria-hidden': 'true' }, [
      h('div', { class: 'route-skeleton-title' }),
      h('div', { class: 'route-skeleton-card' }),
      h('div', { class: 'route-skeleton-card route-skeleton-card--short' }),
    ])
  },
})

/**
 * Lazy view with a skeleton shown immediately while its chunk loads.
 * `delay: 0` matters: the View Transition takes its "new" snapshot one
 * tick after the swap, and a delayed skeleton would leave that snapshot
 * blank. With prefetch (BrandMenu hover/focus, CommandPalette open) the
 * chunk is usually cached, so the skeleton rarely paints at all.
 */
const JsonSqlView = defineAsyncComponent({
  loader: () => import('../views/JsonSqlView.vue'),
  loadingComponent: RouteSkeleton,
  delay: 0,
})

const PasswordView = defineAsyncComponent({
  loader: () => import('../views/PasswordView.vue'),
  loadingComponent: RouteSkeleton,
  delay: 0,
})

const QrBarcodeView = defineAsyncComponent({
  loader: () => import('../views/QrBarcodeView.vue'),
  loadingComponent: RouteSkeleton,
  delay: 0,
})

const GmbView = defineAsyncComponent({
  loader: () => import('../views/GmbView.vue'),
  loadingComponent: RouteSkeleton,
  delay: 0,
})

const routes: RouteRecordRaw[] = [
  { path: '/', redirect: '/json-sql' },
  {
    path: '/json-sql',
    name: 'json-sql',
    component: JsonSqlView,
    meta: { title: 'JSON / SQL 工作台' },
  },
  {
    path: '/password',
    name: 'password',
    component: PasswordView,
    meta: { title: '密码与助记词' },
  },
  {
    path: '/qr-barcode',
    name: 'qr-barcode',
    component: QrBarcodeView,
    meta: { title: 'QR / 条码' },
  },
  {
    path: '/gmb',
    name: 'gmb',
    component: GmbView,
    meta: { title: '到站看板' },
  },
  { path: '/:pathMatch(.*)*', redirect: '/json-sql' },
]

const router = createRouter({
  history: createWebHistory(),
  routes,
})

function prefersReducedMotion(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

/**
 * Route changes wrapped in a View Transition (1.x v1.14.0 behaviour, 0.28s
 * easeOutQuint: old page scales/fades out while the new one rises in, the
 * two cross-fading with no blank frame in between). Unsupported browsers
 * get a one-shot manual fade-in on <main> via the `nav-enter` class
 * (see main.css); reduced-motion users get a plain swap, no animation.
 */
router.beforeEach((to, from, next): void => {
  // Initial load: there is no outgoing page to transition from.
  if (!from.name || to.path === from.path) {
    next()
    return
  }

  if (!('startViewTransition' in document) || prefersReducedMotion()) {
    if (!prefersReducedMotion()) {
      document.documentElement.classList.add('nav-enter')
      window.setTimeout((): void => {
        document.documentElement.classList.remove('nav-enter')
      }, 320)
    }
    next()
    return
  }

  try {
    const transition = document.startViewTransition(async (): Promise<void> => {
      next()
      // Wait until the new view — or its skeleton, while the chunk loads —
      // is actually in the DOM before the "new" snapshot is taken. The
      // extra ticks cover the cached-chunk case, where the async component
      // swaps skeleton -> real view one flush later.
      for (let i = 0; i < 3; i += 1) {
        await nextTick()
        if (!document.querySelector('.route-skeleton')) break
      }
    })
    // A skipped or superseded transition rejects `finished`; the
    // navigation itself has already been applied, so just swallow it.
    transition.finished.catch((): void => {})
  } catch {
    next()
  }
})

export default router
