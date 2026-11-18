<script setup lang="ts">
import { onUnmounted, watch } from 'vue'
import { Layers, X } from 'lucide-vue-next'
import SidebarNav from './SidebarNav.vue'
import { useSidebar } from '../composables/useSidebar'
import { cn } from '../lib/utils'

const { collapsed, mobileOpen, closeMobile } = useSidebar()

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
        class="logo-gradient flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-white shadow-sm ring-1 ring-black/10"
      >
        <Layers class="h-4 w-4" />
      </span>
      <template v-if="!collapsed">
        <span class="truncate text-sm font-semibold tracking-tight">MyWorkbench</span>
        <span
          class="shrink-0 rounded-full border border-border bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground"
        >
          2.0
        </span>
      </template>
    </div>

    <SidebarNav :collapsed="collapsed" />

    <div class="shrink-0 border-t border-border px-3 py-3">
      <template v-if="!collapsed">
        <p class="text-xs text-muted-foreground">
          <span
            class="mr-1.5 rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-[10px] font-medium"
          >
            2.0.0-alpha.2
          </span>
        </p>
        <p class="mt-2 text-[11px] leading-relaxed text-muted-foreground">
          按
          <kbd class="rounded border border-border bg-muted px-1 py-0.5 font-mono text-[10px]">
            ⌘K
          </kbd>
          快速跳转
        </p>
      </template>
      <p v-else class="text-center font-mono text-[10px] text-muted-foreground">2.0</p>
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
          class="logo-gradient flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-white shadow-sm ring-1 ring-black/10"
        >
          <Layers class="h-4 w-4" />
        </span>
        <span class="flex-1 truncate text-sm font-semibold tracking-tight">MyWorkbench</span>
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

      <SidebarNav @navigate="closeMobile()" />

      <div class="shrink-0 border-t border-border px-3 py-3 text-xs text-muted-foreground">
        <span
          class="mr-1.5 rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-[10px] font-medium"
        >
          2.0.0-alpha.2
        </span>
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
