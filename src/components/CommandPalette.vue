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
import { Braces, BusFront, Check, KeyRound, Monitor, QrCode, Settings } from 'lucide-vue-next'
import { useCommandPalette } from '../composables/useCommandPalette'
import { useSettings } from '../composables/useSettings'
import { useShortcuts } from '../composables/useShortcuts'
import { FAMILIES, useTheme, type FamilyId, type ThemeFamily } from '../composables/useTheme'

interface PaletteAction {
  label: string
  keywords: string
  hint: string
  icon: Component | null
  swatchBg?: string
  swatchAccent?: string
  run: () => void
  /** Theme family this action selects, if it is a theme action. */
  family?: FamilyId
  /** True when this action toggles follow-system. */
  followSystemAction?: boolean
}

const router = useRouter()
const { isOpen, close } = useCommandPalette()
const { open: openSettings } = useSettings()
const { shortcutLabel } = useShortcuts()
const { family, followSystem, setFamily, setFollowSystem, variantMetaOf } = useTheme()

const query = ref('')
const activeIndex = ref(0)
const inputRef = ref<HTMLInputElement | null>(null)

const toolActions: PaletteAction[] = [
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
]

/* 6 个主题族 + 1 个跟随系统开关（不列 4 个浅色 id 为独立动作）。
 *  computed：行内色块跟当前变体走，开关文案跟跟随状态走。 */
const themeActions = computed<PaletteAction[]>(() => [
  ...FAMILIES.map(
    (f: ThemeFamily): PaletteAction => ({
      label: `${f.label}主题`,
      keywords: `主题 ${f.nameEn.toLowerCase()} ${f.label}`,
      hint: f.nameEn,
      icon: null,
      swatchBg: variantMetaOf(f.id).swatchBg,
      swatchAccent: variantMetaOf(f.id).swatchAccent,
      family: f.id,
      run: (): void => {
        setFamily(f.id)
      },
    }),
  ),
  {
    label: followSystem.value ? '关闭跟随系统' : '跟随系统',
    keywords: '跟随 系统 主题 system',
    hint: 'System',
    icon: Monitor,
    followSystemAction: true,
    run: (): void => {
      setFollowSystem(!followSystem.value)
    },
  },
])

/* 设置入口（alpha.8）：手机无键盘打不开 Ctrl+Alt+S，所以设置也要
 *  在命令面板里可搜可点。hint 跟注册表走，用户改键后仍显示正确组合键。 */
const settingsActions = computed<PaletteAction[]>(() => [
  {
    label: '设置',
    keywords: '设置 历史 清除 快捷键 settings',
    hint: shortcutLabel('openSettings'),
    icon: Settings,
    run: (): void => {
      openSettings()
    },
  },
])

interface PaletteGroup {
  label: string
  items: PaletteAction[]
}

function matches(action: PaletteAction, q: string): boolean {
  return `${action.label} ${action.keywords}`.toLowerCase().includes(q)
}

const groups = computed<PaletteGroup[]>(() => {
  const q = query.value.trim().toLowerCase()
  const filter = (items: PaletteAction[]): PaletteAction[] =>
    q ? items.filter((a: PaletteAction): boolean => matches(a, q)) : items
  return [
    { label: '工具', items: filter(toolActions) },
    { label: '设置', items: filter(settingsActions.value) },
    { label: '主题', items: filter(themeActions.value) },
  ].filter((g: PaletteGroup): boolean => g.items.length > 0)
})

/** Flat action list for keyboard navigation (group headers are not selectable). */
const flatActions = computed<PaletteAction[]>(() =>
  groups.value.flatMap((g: PaletteGroup): PaletteAction[] => g.items),
)

function flatIndexOf(action: PaletteAction): number {
  return flatActions.value.indexOf(action)
}

function runAction(action: PaletteAction): void {
  action.run()
  close()
}

function moveDown(): void {
  if (flatActions.value.length === 0) return
  activeIndex.value = (activeIndex.value + 1) % flatActions.value.length
}

function moveUp(): void {
  if (flatActions.value.length === 0) return
  activeIndex.value =
    (activeIndex.value - 1 + flatActions.value.length) % flatActions.value.length
}

function runActive(): void {
  const action = flatActions.value[activeIndex.value]
  if (action) runAction(action)
}

/**
 * Prefetch all four route chunks while the palette is open, so picking a
 * tool never waits on a first-visit chunk load. Static imports keep
 * Vite's chunk splitting identical to the router's.
 */
function prefetchRouteChunks(): void {
  void import('../views/JsonSqlView.vue')
  void import('../views/PasswordView.vue')
  void import('../views/QrBarcodeView.vue')
  void import('../views/GmbView.vue')
}

watch(query, (): void => {
  activeIndex.value = 0
})

watch(isOpen, (open: boolean): void => {
  if (!open) return
  prefetchRouteChunks()
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
        <DialogDescription class="sr-only">搜索工具、设置或切换主题</DialogDescription>

        <div class="flex items-center gap-2 border-b border-border px-4">
          <input
            ref="inputRef"
            v-model="query"
            type="text"
            placeholder="搜索工具、设置或切换主题…"
            class="h-12 w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            @keydown.down.prevent="moveDown"
            @keydown.up.prevent="moveUp"
            @keydown.enter.prevent="runActive"
          />
        </div>

        <div v-if="flatActions.length > 0" class="max-h-80 overflow-y-auto p-2">
          <template v-for="group in groups" :key="group.label">
            <p class="px-3 pb-1 pt-2 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
              {{ group.label }}
            </p>
            <ul>
              <li
                v-for="action in group.items"
                :key="action.label"
                :class="[
                  'flex cursor-pointer items-center gap-3 rounded-md px-3 py-2 text-sm',
                  flatIndexOf(action) === activeIndex ? 'bg-accent' : '',
                ]"
                @mouseenter="activeIndex = flatIndexOf(action)"
                @click="runAction(action)"
              >
                <span
                  v-if="action.swatchBg"
                  class="h-4 w-4 shrink-0 rounded-full border"
                  :style="{
                    backgroundColor: action.swatchBg,
                    borderColor: action.swatchAccent,
                  }"
                />
                <component
                  :is="action.icon"
                  v-else-if="action.icon"
                  class="h-4 w-4 shrink-0 text-muted-foreground"
                />
                <span class="flex-1 truncate">{{ action.label }}</span>
                <Check
                  v-if="
                    (action.family && family === action.family) ||
                    (action.followSystemAction && followSystem)
                  "
                  class="h-4 w-4 shrink-0"
                />
                <span v-else-if="action.hint" class="shrink-0 text-xs text-muted-foreground">
                  {{ action.hint }}
                </span>
              </li>
            </ul>
          </template>
        </div>
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
  animation: palette-fade-in var(--wb-dur-base) ease-out;
}

.palette-overlay[data-state='closed'] {
  animation: palette-fade-out var(--wb-dur-base) ease-in;
}

.palette-content[data-state='open'] {
  animation: palette-content-in var(--wb-dur-base) var(--wb-ease-standard);
}

.palette-content[data-state='closed'] {
  animation: palette-content-out var(--wb-dur-base) var(--wb-ease-standard);
}

@media (prefers-reduced-motion: reduce) {
  .palette-overlay[data-state='open'],
  .palette-overlay[data-state='closed'],
  .palette-content[data-state='open'],
  .palette-content[data-state='closed'] {
    animation: none;
  }
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
