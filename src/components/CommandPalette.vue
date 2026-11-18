<script setup lang="ts">
import { computed, nextTick, ref, watch, type Component } from 'vue'
import { useRouter } from 'vue-router'
import {
  DialogContent,
  DialogDescription,
  DialogOverlay,
  DialogPortal,
  DialogRoot,
  DialogTitle,
} from 'reka-ui'
import {
  Braces,
  BusFront,
  Check,
  KeyRound,
  Monitor,
  Moon,
  QrCode,
  Sun,
} from 'lucide-vue-next'
import { useCommandPalette } from '../composables/useCommandPalette'
import { useTheme, type ThemeMode } from '../composables/useTheme'

interface PaletteAction {
  label: string
  keywords: string
  hint: string
  icon: Component
  run: () => void
  /** Theme mode this action sets, if it is a theme action. */
  themeMode?: ThemeMode
}

const router = useRouter()
const { isOpen, close } = useCommandPalette()
const { mode, setMode } = useTheme()

const query = ref('')
const activeIndex = ref(0)
const inputRef = ref<HTMLInputElement | null>(null)

const actions = computed<PaletteAction[]>(() => [
  {
    label: 'JSON / SQL 工作台',
    keywords: 'json sql 格式化',
    hint: '/json-sql',
    icon: Braces,
    run: (): void => {
      void router.push('/json-sql')
    },
  },
  {
    label: '密码与助记词',
    keywords: '密码 助记词',
    hint: '/password',
    icon: KeyRound,
    run: (): void => {
      void router.push('/password')
    },
  },
  {
    label: 'QR / 条码',
    keywords: 'qr 条码',
    hint: '/qr-barcode',
    icon: QrCode,
    run: (): void => {
      void router.push('/qr-barcode')
    },
  },
  {
    label: '到站看板',
    keywords: '到站 小巴 巴士 港铁',
    hint: '/gmb',
    icon: BusFront,
    run: (): void => {
      void router.push('/gmb')
    },
  },
  {
    label: '浅色主题',
    keywords: '浅色 主题 light',
    hint: '',
    icon: Sun,
    themeMode: 'light',
    run: (): void => {
      setMode('light')
    },
  },
  {
    label: '深色主题',
    keywords: '深色 主题 dark',
    hint: '',
    icon: Moon,
    themeMode: 'dark',
    run: (): void => {
      setMode('dark')
    },
  },
  {
    label: '跟随系统',
    keywords: '跟随 系统 主题 system',
    hint: '',
    icon: Monitor,
    themeMode: 'system',
    run: (): void => {
      setMode('system')
    },
  },
])

const filteredActions = computed<PaletteAction[]>(() => {
  const q = query.value.trim().toLowerCase()
  if (!q) return actions.value
  return actions.value.filter((action: PaletteAction): boolean =>
    `${action.label} ${action.keywords}`.toLowerCase().includes(q),
  )
})

function runAction(action: PaletteAction): void {
  action.run()
  close()
}

function moveDown(): void {
  if (filteredActions.value.length === 0) return
  activeIndex.value = (activeIndex.value + 1) % filteredActions.value.length
}

function moveUp(): void {
  if (filteredActions.value.length === 0) return
  activeIndex.value =
    (activeIndex.value - 1 + filteredActions.value.length) % filteredActions.value.length
}

function runActive(): void {
  const action = filteredActions.value[activeIndex.value]
  if (action) runAction(action)
}

watch(query, (): void => {
  activeIndex.value = 0
})

watch(isOpen, (open: boolean): void => {
  if (!open) return
  query.value = ''
  activeIndex.value = 0
  void nextTick((): void => {
    inputRef.value?.focus()
  })
})
</script>

<template>
  <DialogRoot v-model:open="isOpen">
    <DialogPortal>
      <DialogOverlay
        class="palette-overlay fixed inset-0 z-50 bg-black/50 backdrop-blur-sm"
      />
      <DialogContent
        class="palette-content fixed left-1/2 top-[18%] z-50 w-[calc(100%-2rem)] max-w-lg -translate-x-1/2 rounded-xl border border-border bg-popover shadow-2xl outline-none"
      >
        <DialogTitle class="sr-only">命令面板</DialogTitle>
        <DialogDescription class="sr-only">搜索工具或切换主题</DialogDescription>

        <div class="flex items-center gap-2 border-b border-border px-4">
          <input
            ref="inputRef"
            v-model="query"
            type="text"
            placeholder="搜索工具或切换主题…"
            class="h-12 w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            @keydown.down.prevent="moveDown"
            @keydown.up.prevent="moveUp"
            @keydown.enter.prevent="runActive"
          />
        </div>

        <ul v-if="filteredActions.length > 0" class="max-h-80 overflow-y-auto p-2">
          <li
            v-for="(action, index) in filteredActions"
            :key="action.label"
            :class="[
              'flex cursor-pointer items-center gap-3 rounded-md px-3 py-2 text-sm',
              index === activeIndex ? 'bg-accent' : '',
            ]"
            @mouseenter="activeIndex = index"
            @click="runAction(action)"
          >
            <component :is="action.icon" class="h-4 w-4 shrink-0 text-muted-foreground" />
            <span class="flex-1 truncate">{{ action.label }}</span>
            <Check
              v-if="action.themeMode && mode === action.themeMode"
              class="h-4 w-4 shrink-0"
            />
            <span v-else-if="action.hint" class="shrink-0 text-xs text-muted-foreground">
              {{ action.hint }}
            </span>
          </li>
        </ul>
        <p v-else class="px-4 py-8 text-center text-sm text-muted-foreground">
          没有匹配的结果
        </p>

        <div class="border-t border-border px-4 py-2 text-xs text-muted-foreground">
          ↑↓ 选择 · Enter 跳转 · Esc 关闭
        </div>
      </DialogContent>
    </DialogPortal>
  </DialogRoot>
</template>

<style scoped>
.palette-overlay[data-state='open'] {
  animation: palette-fade-in 150ms ease-out;
}

.palette-overlay[data-state='closed'] {
  animation: palette-fade-out 150ms ease-in;
}

.palette-content[data-state='open'] {
  animation: palette-content-in 150ms cubic-bezier(0.16, 1, 0.3, 1);
}

.palette-content[data-state='closed'] {
  animation: palette-content-out 150ms cubic-bezier(0.16, 1, 0.3, 1);
}

@keyframes palette-fade-in {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}

@keyframes palette-fade-out {
  from {
    opacity: 1;
  }
  to {
    opacity: 0;
  }
}

@keyframes palette-content-in {
  from {
    opacity: 0;
    transform: translateX(-50%) scale(0.96);
  }
  to {
    opacity: 1;
    transform: translateX(-50%) scale(1);
  }
}

@keyframes palette-content-out {
  from {
    opacity: 1;
    transform: translateX(-50%) scale(1);
  }
  to {
    opacity: 0;
    transform: translateX(-50%) scale(0.96);
  }
}
</style>
