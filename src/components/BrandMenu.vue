<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import {
  Braces,
  BusFront,
  Check,
  ChevronDown,
  KeyRound,
  QrCode,
  type LucideIcon,
} from 'lucide-vue-next'

interface ToolEntry {
  name: string
  path: string
  label: string
  icon: LucideIcon
}

/** The four tools, in the same order as the 1.x brand menu. */
const TOOLS: readonly ToolEntry[] = [
  { name: 'json-sql', path: '/json-sql', label: 'JSON / SQL 工作台', icon: Braces },
  { name: 'password', path: '/password', label: '密码与助记词', icon: KeyRound },
  { name: 'qr-barcode', path: '/qr-barcode', label: 'QR / 条码', icon: QrCode },
  { name: 'gmb', path: '/gmb', label: '到站看板', icon: BusFront },
]

const route = useRoute()
const open = ref(false)
const menuRef = ref<HTMLElement | null>(null)

/** The tool currently open (from route.name; falls back to JSON / SQL). */
const currentTool = computed<ToolEntry>(
  (): ToolEntry =>
    TOOLS.find((t: ToolEntry): boolean => t.name === route.name) ?? TOOLS[0],
)

/**
 * Prefetch a route chunk on hover/focus so the first visit is instant.
 * Same static import specifiers as the router, so Vite splits the
 * identical chunks and the import is a cache hit after the first call.
 */
const PREFETCHERS: Record<string, () => Promise<unknown>> = {
  '/json-sql': () => import('../views/JsonSqlView.vue'),
  '/password': () => import('../views/PasswordView.vue'),
  '/qr-barcode': () => import('../views/QrBarcodeView.vue'),
  '/gmb': () => import('../views/GmbView.vue'),
}

function prefetch(path: string): void {
  if (route.path === path) return
  const load = PREFETCHERS[path]
  if (load) void load()
}

function toggle(): void {
  open.value = !open.value
}

function close(): void {
  open.value = false
}

function onDocumentClick(e: MouseEvent): void {
  if (menuRef.value && !menuRef.value.contains(e.target as Node)) close()
}

function onEscape(e: KeyboardEvent): void {
  if (e.key === 'Escape') close()
}

onMounted((): void => {
  document.addEventListener('click', onDocumentClick)
  document.addEventListener('keydown', onEscape)
})

onUnmounted((): void => {
  document.removeEventListener('click', onDocumentClick)
  document.removeEventListener('keydown', onEscape)
})
</script>

<template>
  <div ref="menuRef" class="relative shrink-0">
    <button
      type="button"
      aria-label="切换工具"
      aria-haspopup="menu"
      :aria-expanded="open"
      class="flex h-9 items-center gap-2 rounded-md px-1.5 transition-colors hover:bg-accent"
      @click="toggle()"
    >
      <component :is="currentTool.icon" class="h-4 w-4 shrink-0 text-muted-foreground" />
      <span class="truncate text-sm font-semibold tracking-tight">{{ currentTool.label }}</span>
      <ChevronDown class="h-4 w-4 shrink-0 text-muted-foreground" />
    </button>

    <Transition name="wb-menu">
      <div
        v-if="open"
        role="menu"
        aria-label="切换工具"
        class="absolute left-0 top-11 z-50 w-56 overflow-hidden rounded-lg border border-border bg-popover text-popover-foreground shadow-xl"
      >
        <RouterLink
          v-for="tool in TOOLS"
          :key="tool.name"
          :to="tool.path"
          role="menuitem"
          class="flex items-center gap-2.5 px-3 py-3 text-sm transition-colors hover:bg-accent"
          @click="close()"
          @mouseenter="prefetch(tool.path)"
          @focus="prefetch(tool.path)"
        >
          <component :is="tool.icon" class="h-4 w-4 shrink-0 text-muted-foreground" />
          <span class="flex-1 truncate">{{ tool.label }}</span>
          <Check v-if="route.name === tool.name" class="h-4 w-4 shrink-0 text-primary" />
        </RouterLink>
        <div class="border-t border-border px-3 py-2">
          <span
            class="rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-[10px] font-medium text-muted-foreground"
          >
            2.0.0-alpha.11
          </span>
        </div>
      </div>
    </Transition>
  </div>
</template>
