<script setup lang="ts">
import { onUnmounted, watch } from 'vue'
import { useRoute } from 'vue-router'
import {
  Braces,
  BusFront,
  KeyRound,
  Layers,
  QrCode,
  X,
  type LucideIcon,
} from 'lucide-vue-next'
import { useSidebar } from '../composables/useSidebar'
import { cn } from '../lib/utils'

interface NavItem {
  label: string
  to: string
  icon: LucideIcon
}

const NAV_ITEMS: NavItem[] = [
  { label: 'JSON / SQL 工作台', to: '/json-sql', icon: Braces },
  { label: '密码与助记词', to: '/password', icon: KeyRound },
  { label: 'QR / 条码', to: '/qr-barcode', icon: QrCode },
  { label: '到站看板', to: '/gmb', icon: BusFront },
]

const route = useRoute()
const { collapsed, mobileOpen, closeMobile } = useSidebar()

function isActive(to: string): boolean {
  return route.path === to
}

function onEscape(e: KeyboardEvent): void {
  if (e.key === 'Escape') closeMobile()
}

watch(
  mobileOpen,
  (open: boolean): void => {
    if (open) window.addEventListener('keydown', onEscape)
    else window.removeEventListener('keydown', onEscape)
  },
)

onUnmounted((): void => {
  window.removeEventListener('keydown', onEscape)
})
</script>

<template>
  <!-- Desktop sidebar -->
  <aside
    :class="
      cn(
        'hidden shrink-0 flex-col border-r border-border bg-card transition-[width] duration-200 ease-in-out lg:flex',
        collapsed ? 'w-16' : 'w-60',
      )
    "
  >
    <div
      :class="
        cn(
          'flex h-14 shrink-0 items-center gap-2 border-b border-border px-3',
          collapsed && 'justify-center px-0',
        )
      "
    >
      <span
        class="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground"
      >
        <Layers class="h-4 w-4" />
      </span>
      <template v-if="!collapsed">
        <span class="truncate text-sm font-semibold">MyWorkbench</span>
        <span
          class="shrink-0 rounded-full border border-border bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground"
        >
          2.0
        </span>
      </template>
    </div>

    <nav aria-label="工具" class="flex-1 space-y-1 overflow-y-auto p-2">
      <RouterLink
        v-for="item in NAV_ITEMS"
        :key="item.to"
        :to="item.to"
        :title="item.label"
        :aria-current="isActive(item.to) ? 'page' : undefined"
        :class="
          cn(
            'flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors',
            collapsed && 'justify-center px-0',
            isActive(item.to)
              ? 'bg-accent font-medium text-foreground'
              : 'text-muted-foreground hover:bg-accent/60 hover:text-foreground',
          )
        "
      >
        <component :is="item.icon" class="h-5 w-5 shrink-0" />
        <span v-if="!collapsed" class="truncate">{{ item.label }}</span>
      </RouterLink>
    </nav>

    <div v-if="!collapsed" class="shrink-0 border-t border-border px-3 py-3 text-xs text-muted-foreground">
      2.0.0-alpha
    </div>
  </aside>

  <!-- Mobile drawer -->
  <Transition name="drawer-backdrop">
    <div
      v-if="mobileOpen"
      class="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm lg:hidden"
      @click="closeMobile()"
    />
  </Transition>
  <Transition name="drawer-panel">
    <aside
      v-if="mobileOpen"
      class="fixed left-0 top-0 z-50 flex h-full w-64 flex-col border-r border-border bg-card lg:hidden"
    >
      <div class="flex h-14 shrink-0 items-center gap-2 border-b border-border px-3">
        <span
          class="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground"
        >
          <Layers class="h-4 w-4" />
        </span>
        <span class="flex-1 truncate text-sm font-semibold">MyWorkbench</span>
        <span
          class="shrink-0 rounded-full border border-border bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground"
        >
          2.0
        </span>
        <button
          type="button"
          aria-label="关闭菜单"
          class="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          @click="closeMobile()"
        >
          <X class="h-5 w-5" />
        </button>
      </div>

      <nav aria-label="工具" class="flex-1 space-y-1 overflow-y-auto p-2">
        <RouterLink
          v-for="item in NAV_ITEMS"
          :key="item.to"
          :to="item.to"
          :title="item.label"
          :aria-current="isActive(item.to) ? 'page' : undefined"
          :class="
            cn(
              'flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors',
              isActive(item.to)
                ? 'bg-accent font-medium text-foreground'
                : 'text-muted-foreground hover:bg-accent/60 hover:text-foreground',
            )
          "
          @click="closeMobile()"
        >
          <component :is="item.icon" class="h-5 w-5 shrink-0" />
          <span class="truncate">{{ item.label }}</span>
        </RouterLink>
      </nav>

      <div class="shrink-0 border-t border-border px-3 py-3 text-xs text-muted-foreground">
        2.0.0-alpha
      </div>
    </aside>
  </Transition>
</template>

<style scoped>
.drawer-backdrop-enter-active,
.drawer-backdrop-leave-active {
  transition: opacity 200ms ease;
}

.drawer-backdrop-enter-from,
.drawer-backdrop-leave-to {
  opacity: 0;
}

.drawer-panel-enter-active,
.drawer-panel-leave-active {
  transition: transform 200ms ease;
}

.drawer-panel-enter-from,
.drawer-panel-leave-to {
  transform: translateX(-100%);
}
</style>
