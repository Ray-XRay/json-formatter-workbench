<script setup lang="ts">
import { computed, onMounted, onUnmounted } from 'vue'
import { useRoute } from 'vue-router'
import {
  CheckCircle2,
  ChevronRight,
  Menu,
  Monitor,
  Moon,
  PanelLeft,
  Search,
  Sun,
} from 'lucide-vue-next'
import Sidebar from '../components/Sidebar.vue'
import CommandPalette from '../components/CommandPalette.vue'
import ErrorBoundary from '../components/ErrorBoundary.vue'
import { useCommandPalette } from '../composables/useCommandPalette'
import { useSidebar } from '../composables/useSidebar'
import { useTheme } from '../composables/useTheme'
import { useToast } from '../composables/useToast'

const route = useRoute()
const { toggleMobile, toggleCollapsed } = useSidebar()
const { mode, resolved, cycleMode } = useTheme()
const { open, toggle } = useCommandPalette()
const { toasts, dismiss } = useToast()

const themeLabel = computed((): string => {
  if (mode.value === 'system') return '主题：跟随系统'
  if (mode.value === 'dark') return '主题：深色'
  return '主题：浅色'
})

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
  <div class="flex h-dvh w-full bg-background text-foreground">
    <Sidebar />

    <div class="flex min-w-0 flex-1 flex-col">
      <header class="flex h-14 shrink-0 items-center gap-2 border-b border-border px-3 sm:px-4">
        <button
          type="button"
          aria-label="打开菜单"
          class="inline-flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground lg:hidden"
          @click="toggleMobile()"
        >
          <Menu class="h-5 w-5" />
        </button>

        <button
          type="button"
          aria-label="折叠侧边栏"
          class="hidden h-9 w-9 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground lg:inline-flex"
          @click="toggleCollapsed()"
        >
          <PanelLeft class="h-5 w-5" />
        </button>

        <nav aria-label="面包屑" class="flex min-w-0 items-center gap-1 text-sm">
          <span class="text-muted-foreground">MyWorkbench</span>
          <ChevronRight class="h-4 w-4 shrink-0 text-muted-foreground" />
          <span class="truncate font-medium">{{ route.meta.title }}</span>
        </nav>

        <div class="flex-1" />

        <button
          type="button"
          aria-label="打开命令面板 (Ctrl+K)"
          class="inline-flex h-9 items-center gap-2 rounded-md border border-border bg-muted/50 px-2.5 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          @click="open()"
        >
          <Search class="h-4 w-4" />
          <kbd
            class="hidden rounded border border-border bg-background px-1.5 py-0.5 text-xs font-medium sm:inline-block"
          >
            ⌘K
          </kbd>
        </button>

        <button
          type="button"
          aria-label="切换主题"
          :title="themeLabel"
          class="inline-flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          @click="cycleMode()"
        >
          <Monitor v-if="mode === 'system'" class="h-5 w-5" />
          <Moon v-else-if="resolved === 'dark'" class="h-5 w-5" />
          <Sun v-else class="h-5 w-5" />
        </button>
      </header>

      <main class="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8">
        <router-view v-slot="{ Component }">
          <Transition name="route-fade" mode="out-in">
            <ErrorBoundary :key="$route.fullPath">
              <component :is="Component" />
            </ErrorBoundary>
          </Transition>
        </router-view>
      </main>
    </div>

    <div class="pointer-events-none fixed right-4 top-4 z-[100]">
      <TransitionGroup name="toast" tag="div" class="flex flex-col gap-2">
        <button
          v-for="toast in toasts"
          :key="toast.id"
          type="button"
          class="pointer-events-auto flex items-center gap-2 rounded-md border border-border bg-card px-3 py-2 text-left text-sm shadow-lg"
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
