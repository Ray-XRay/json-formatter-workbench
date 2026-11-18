<script setup lang="ts">
import { computed, onMounted, onUnmounted } from 'vue'
import { useRoute } from 'vue-router'
import {
  Braces,
  BusFront,
  CheckCircle2,
  KeyRound,
  QrCode,
  Search,
  type LucideIcon,
} from 'lucide-vue-next'
import BrandMenu from '../components/BrandMenu.vue'
import CommandPalette from '../components/CommandPalette.vue'
import ErrorBoundary from '../components/ErrorBoundary.vue'
import ThemeMenu from '../components/ThemeMenu.vue'
import { useCommandPalette } from '../composables/useCommandPalette'
import { useToast } from '../composables/useToast'

const ROUTE_ICONS: Record<string, LucideIcon> = {
  'json-sql': Braces,
  password: KeyRound,
  'qr-barcode': QrCode,
  gmb: BusFront,
}

const route = useRoute()
const { open, toggle } = useCommandPalette()
const { toasts, dismiss } = useToast()

const routeIcon = computed<LucideIcon>((): LucideIcon => ROUTE_ICONS[route.name as string] ?? Braces)

function onKeydown(e: KeyboardEvent): void {
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
    e.preventDefault()
    toggle()
  }
}

onMounted((): void => {
  window.addEventListener('keydown', onKeydown)
})

onUnmounted((): void => {
  window.removeEventListener('keydown', onKeydown)
})
</script>

<template>
  <div class="flex h-dvh w-full flex-col bg-background text-foreground">
    <header
      class="flex h-14 shrink-0 items-center gap-2 border-b border-border bg-card/70 px-3 backdrop-blur sm:px-4"
    >
      <BrandMenu />

      <nav aria-label="面包屑" class="flex min-w-0 items-center gap-1 text-sm">
        <component :is="routeIcon" class="h-4 w-4 shrink-0 text-muted-foreground" />
        <span class="hidden truncate font-medium sm:inline">{{ route.meta.title }}</span>
      </nav>

      <div class="flex-1" />

      <button
        type="button"
        aria-label="打开命令面板 (Ctrl+K)"
        class="inline-flex h-9 items-center gap-2 rounded-md border border-border bg-muted/50 px-2.5 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground sm:w-56"
        @click="open()"
      >
        <Search class="h-4 w-4 shrink-0" />
        <span class="hidden flex-1 text-left sm:inline">搜索工具…</span>
        <kbd
          class="hidden rounded border border-border bg-background px-1.5 py-0.5 font-mono text-xs font-medium sm:inline-block"
        >
          ⌘K
        </kbd>
      </button>

      <ThemeMenu />
    </header>

    <main class="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8">
      <router-view v-slot="{ Component }">
        <ErrorBoundary :key="$route.fullPath">
          <component :is="Component" />
        </ErrorBoundary>
      </router-view>
    </main>

    <div class="pointer-events-none fixed right-4 top-4 z-[100]">
      <TransitionGroup name="toast" tag="div" class="flex flex-col gap-2">
        <button
          v-for="toast in toasts"
          :key="toast.id"
          type="button"
          class="pointer-events-auto flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-left text-sm shadow-xl"
          @click="dismiss(toast.id)"
        >
          <CheckCircle2 class="h-4 w-4 shrink-0 text-green-500" />
          <span>{{ toast.message }}</span>
        </button>
      </TransitionGroup>
    </div>

    <CommandPalette />
  </div>
</template>
