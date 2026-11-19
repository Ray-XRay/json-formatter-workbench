<script setup lang="ts">
import { onMounted, onUnmounted } from 'vue'
import {
  CheckCircle2,
  Search,
} from 'lucide-vue-next'
import BrandMenu from '../components/BrandMenu.vue'
import CommandPalette from '../components/CommandPalette.vue'
import ErrorBoundary from '../components/ErrorBoundary.vue'
import ThemeMenu from '../components/ThemeMenu.vue'
import WbSettingsDialog from '../components/WbSettingsDialog.vue'
import { useCommandPalette } from '../composables/useCommandPalette'
import { useSettings } from '../composables/useSettings'
import { useShortcuts } from '../composables/useShortcuts'
import { useToast } from '../composables/useToast'

const { open, toggle } = useCommandPalette()
const { open: openSettings } = useSettings()
const { eventCombo, comboOf } = useShortcuts()
const { toasts, dismiss } = useToast()

function onKeydown(e: KeyboardEvent): void {
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
    e.preventDefault()
    toggle()
    return
  }
  // 全局设置快捷键（四页通用；组合键从注册表读，用户改键后仍生效）
  const combo = eventCombo(e)
  if (combo && combo === comboOf('openSettings')) {
    e.preventDefault()
    openSettings()
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
    <WbSettingsDialog />
  </div>
</template>
