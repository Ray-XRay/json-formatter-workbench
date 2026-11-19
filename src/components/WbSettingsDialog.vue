<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { dispatchClearHistory, useSettings, type ClearScope } from '../composables/useSettings'
import { useGmbRoad2Enabled } from '../composables/useGmbRoad2Enabled'
import { useShortcuts } from '../composables/useShortcuts'
import { useToast } from '../composables/useToast'
import { clearDraft, clearHistory as clearJsonHistory } from '../lib/jsonsql/storage'
import { clearQrHistory } from '../lib/qr/history'
import { clearRecent } from '../lib/gmb/recent'

const route = useRoute()
const { isOpen, close } = useSettings()
const { push } = useToast()
const { road2Enabled } = useGmbRoad2Enabled()
const {
  shortcuts,
  listeningId,
  comboLabel,
  captureCombo,
  resetShortcuts,
  startRebind,
  cancelRebind,
} = useShortcuts()

type ToolKey = 'json-sql' | 'password' | 'qr-barcode' | 'gmb' | 'other'

const tool = computed<ToolKey>((): ToolKey => {
  const name = route.name as string
  if (name === 'json-sql' || name === 'password' || name === 'qr-barcode' || name === 'gmb')
    return name
  return 'other'
})

const toolLabel = computed<string>((): string => {
  if (tool.value === 'json-sql') return 'JSON / SQL 工作台'
  if (tool.value === 'password') return '密码与助记词'
  if (tool.value === 'qr-barcode') return 'QR / 条码'
  if (tool.value === 'gmb') return '到站看板'
  return '当前工具'
})

/** "全部清除" 两步确认：第一次点进入待确认态，3 秒内不点则自动解除。 */
const clearArmed = ref(false)
let disarmTimer: number | undefined

function disarm(): void {
  clearArmed.value = false
  if (disarmTimer !== undefined) {
    window.clearTimeout(disarmTimer)
    disarmTimer = undefined
  }
}

watch(isOpen, (open: boolean): void => {
  if (!open) {
    disarm()
    cancelRebind()
  }
})

function removeKeys(scope: ClearScope): void {
  if (scope === 'json' || scope === 'all') {
    clearJsonHistory()
    clearDraft()
  }
  if (scope === 'qr' || scope === 'all') clearQrHistory()
  if (scope === 'gmb' || scope === 'all') clearRecent()
}

function clearCurrent(): void {
  if (tool.value === 'other' || tool.value === 'password') return
  // 路由名 → 清除范围：json-sql → 'json'，qr-barcode → 'qr'，gmb → 'gmb'
  const scope: ClearScope =
    tool.value === 'json-sql' ? 'json' : tool.value === 'qr-barcode' ? 'qr' : 'gmb'
  removeKeys(scope)
  dispatchClearHistory(scope)
  push(`已清空${toolLabel.value}的历史记录`)
}

function clearAll(): void {
  if (!clearArmed.value) {
    clearArmed.value = true
    disarmTimer = window.setTimeout((): void => {
      clearArmed.value = false
    }, 3000)
    return
  }
  disarm()
  removeKeys('all')
  dispatchClearHistory('all')
  push('已清空全部历史记录')
}

function onDialogKeydown(e: KeyboardEvent): void {
  // 改键捕获：吞掉本次组合键，只做捕获，不触发其它快捷键
  if (listeningId.value) {
    e.preventDefault()
    e.stopPropagation()
    captureCombo(e)
    return
  }
  if (e.key === 'Escape') {
    e.stopPropagation()
    close()
  }
}

watch(isOpen, (open: boolean): void => {
  if (open) document.addEventListener('keydown', onDialogKeydown, true)
  else document.removeEventListener('keydown', onDialogKeydown, true)
})
</script>

<template>
  <Transition name="wb-overlay">
    <div
      v-if="isOpen"
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      @click.self="close()"
    >
      <Transition name="wb-dialog">
        <div
          v-if="isOpen"
          role="dialog"
          aria-modal="true"
          aria-label="设置"
          class="w-full max-w-md rounded-lg border border-border bg-card p-4 shadow-xl"
        >
          <div class="mb-2 flex items-center justify-between">
            <h2 class="text-base font-semibold">设置</h2>
            <button
              type="button"
              class="inline-flex h-8 items-center rounded-md border border-border bg-background px-2.5 text-sm font-medium transition-colors hover:bg-accent"
              @click="close()"
            >
              关闭
            </button>
          </div>

          <h3 class="mb-1.5 text-sm font-medium">清除历史记录</h3>
          <p v-if="tool === 'password'" class="mb-3 text-sm text-muted-foreground">
            本工具不保存任何历史记录，无需清除。
          </p>
          <p v-else class="mb-3 text-sm text-muted-foreground">
            清除{{ toolLabel }}的历史记录（JSON 还会同时清除输入草稿）。
          </p>
          <div class="mb-4 flex flex-wrap gap-2">
            <button
              v-if="tool !== 'password' && tool !== 'other'"
              type="button"
              class="inline-flex h-9 items-center rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 active:scale-95"
              @click="clearCurrent()"
            >
              清除{{ toolLabel }}的历史
            </button>
            <button
              type="button"
              :class="[
                'inline-flex h-9 items-center rounded-md border px-3 text-sm font-medium transition-colors active:scale-95',
                clearArmed
                  ? 'border-red-500 bg-red-500 text-white hover:bg-red-600'
                  : 'border-border bg-background hover:bg-accent',
              ]"
              @click="clearAll()"
            >
              {{ clearArmed ? '确认全部清除？' : '全部清除' }}
            </button>
          </div>
          <p v-if="clearArmed" class="mb-4 text-xs text-red-500">
            将清除全部工具的历史记录与草稿（JSON 草稿、二维码历史、最近路线），再点一次确认。
          </p>

          <template v-if="tool === 'gmb'">
            <h3 class="mb-1.5 text-sm font-medium">到站看板</h3>
            <label class="mb-4 flex cursor-pointer items-start gap-2.5">
              <span class="relative mt-0.5 inline-flex shrink-0">
                <input v-model="road2Enabled" type="checkbox" class="peer sr-only" />
                <span
                  class="block h-5 w-9 rounded-full bg-muted transition-colors peer-checked:bg-primary"
                />
                <span
                  class="pointer-events-none absolute left-0.5 top-0.5 block h-4 w-4 rounded-full bg-white shadow transition-transform peer-checked:translate-x-4"
                />
              </span>
              <span>
                <span class="block text-sm">第二條路線（換乘）</span>
                <span class="block text-xs text-muted-foreground">
                  在看板上顯示第二條路線區塊，同時查另一條路線，方便轉車。關掉後區塊完全隱藏，拖拽位置保留。
                </span>
              </span>
            </label>
          </template>

          <template v-if="tool === 'json-sql'">
            <h3 class="mb-1.5 text-sm font-medium">快捷键设置</h3>
            <p class="mb-3 text-sm text-muted-foreground">
              点「更改」，然后按下新的组合键（至少包含 Ctrl / Cmd 或 Alt，Esc 取消）。改完自动保存。
            </p>
            <div class="space-y-1.5">
              <div
                v-for="s in shortcuts"
                :key="s.id"
                :class="[
                  'flex items-center gap-2 rounded-md border px-3 py-2',
                  listeningId === s.id ? 'border-primary' : 'border-border',
                ]"
              >
                <span class="min-w-0 flex-1 text-sm">{{ s.name }}</span>
                <kbd
                  class="shrink-0 rounded border border-border bg-muted px-2 py-0.5 font-mono text-xs"
                >
                  {{ listeningId === s.id ? '按下新的组合键…' : comboLabel(s.combo) }}
                </kbd>
                <button
                  type="button"
                  class="inline-flex h-8 shrink-0 items-center rounded-md border border-border bg-background px-2.5 text-sm font-medium transition-colors hover:bg-accent"
                  @click="listeningId === s.id ? cancelRebind() : startRebind(s.id)"
                >
                  {{ listeningId === s.id ? '取消' : '更改' }}
                </button>
              </div>
            </div>
            <div class="mt-3">
              <button
                type="button"
                class="inline-flex h-9 items-center rounded-md border border-border bg-background px-3 text-sm font-medium transition-colors hover:bg-accent active:scale-95"
                @click="resetShortcuts()"
              >
                恢复默认
              </button>
            </div>
          </template>
        </div>
      </Transition>
    </div>
  </Transition>
</template>
