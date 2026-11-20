<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, type CSSProperties } from 'vue'
import { ChevronDown, LocateFixed, RotateCcw } from 'lucide-vue-next'
import WbDragBlock from '../components/WbDragBlock.vue'
import WbSpinner from '../components/WbSpinner.vue'
import WbTabs from '../components/WbTabs.vue'
import { useBlockLayout } from '../composables/useBlockLayout'
import { useToast } from '../composables/useToast'
import type { WbTab } from '../components/WbTabs.vue'
import { useGmb } from '../lib/gmb/useGmb'
import {
  MTR_LINE_COLORS,
  findStationEntry,
  lineChipText,
  mtrStationName,
} from '../lib/gmb/mtrStations'
import { useGmbRoad2Enabled } from '../composables/useGmbRoad2Enabled'

const {
  mode,
  loading,
  refreshing,
  autoRefresh,
  routeInput,
  stopFilter,
  roadSrc,
  roadCode,
  candidates,
  recent,
  mtr,
  locating,
  nearestInfo,
  autoLocate,
  status,
  etaAnim,
  etaNumKey,
  etaCards,
  dirOptions,
  activeDirKey,
  currentStops,
  filteredStops,
  stopSeqModel,
  routeRegionLabel,
  mtrLineOptions,
  mtrLineStations,
  mtrStationLines,
  mtrOtherLines,
  statusDotClass,
  detailStats,
  srcShort,
  setMode,
  onSearch,
  onRouteKeydown,
  onCandidatePick,
  onRecentClick,
  onDirPick,
  onStopPick,
  onMtrLinePick,
  onMtrStationPick,
  onEtaAnimEnd,
  locateNearest,
  refreshNow,
  road2,
} = useGmb()

/* 第二條路線（換乘）的綁定：road2 是 RoadPanel，逐項改名取用。 */
const {
  routeInput: routeInput2,
  roadSrc: roadSrc2,
  roadCode: roadCode2,
  candidates: candidates2,
  loading: loading2,
  status: status2,
  etaAnim: etaAnim2,
  etaNumKey: etaNumKey2,
  etaCards: etaCards2,
  dirOptions: dirOptions2,
  activeDirKey: activeDirKey2,
  currentStops: currentStops2,
  stopSeqModel: stopSeqModel2,
  routeRegionLabel: routeRegionLabel2,
  statusDotClass: statusDotClass2,
  detailStats: detailStats2,
  onSearch: onSearch2,
  onRouteKeydown: onRouteKeydown2,
  onCandidatePick: onCandidatePick2,
  onDirPick: onDirPick2,
  onEtaAnimEnd: onEtaAnimEnd2,
} = road2

/** 區塊布局（Phase 4 可拖拽試點）：5 個區塊，預設順序 = 舊版式自上而下。
 *  頁頭固定不參與；road2 / stops 只在 road 模式顯示，road2 還要設定裡的
 *  「第二條路線（換乘）」開關開著才顯示——開關只管可見性，road2 在完整
 *  順序裡的位置始終保留，開關來回切也不會丟拖拽位置；切模式時在完整
 *  順序裡保留位置、切回來原地出現；拖拽與上/下移只對當前可見區塊操作。 */
type GmbBlockId = 'controls' | 'eta' | 'road2' | 'stops' | 'help'
const GMB_LAYOUT_KEY = 'wb20-gmb-layout'
const GMB_DEFAULT_ORDER: readonly GmbBlockId[] = ['controls', 'eta', 'road2', 'stops', 'help']
const GMB_BLOCK_LABELS: Record<GmbBlockId, string> = {
  controls: '控制區',
  eta: '下三班車',
  road2: '第二條路線（換乘）',
  stops: '全部站點',
  help: '使用說明',
}

const { road2Enabled } = useGmbRoad2Enabled()

const {
  order: blockOrder,
  swap: swapBlocks,
  moveBefore: moveBlockBefore,
  moveAfter: moveBlockAfter,
  resetToDefault: resetBlockLayout,
} = useBlockLayout<GmbBlockId>(GMB_LAYOUT_KEY, GMB_DEFAULT_ORDER)
const { push } = useToast()

function isBlockVisible(id: GmbBlockId): boolean {
  if (id === 'road2') return mode.value === 'road' && road2Enabled.value
  if (id === 'stops') return mode.value === 'road'
  return true
}
const visibleBlocks = computed((): GmbBlockId[] =>
  blockOrder.value.filter(isBlockVisible),
)

/** 拖拽中的區塊 id；落點（目標區塊 + 前/後）由 dragover 即時算。 */
const dragId = ref<GmbBlockId | null>(null)
const dropTarget = ref<{ id: GmbBlockId; position: 'before' | 'after' } | null>(null)

function visibleIndex(id: GmbBlockId): number {
  return visibleBlocks.value.indexOf(id)
}

function dropPositionFor(id: GmbBlockId): 'before' | 'after' | null {
  const t = dropTarget.value
  return t !== null && t.id === id ? t.position : null
}

/** 上/下移：在完整順序裡與相鄰「可見」區塊交換，隱藏區塊位置不動。 */
function onBlockMoveUp(id: GmbBlockId): void {
  const i = visibleIndex(id)
  if (i > 0) swapBlocks(id, visibleBlocks.value[i - 1])
}
function onBlockMoveDown(id: GmbBlockId): void {
  const i = visibleIndex(id)
  if (i >= 0 && i < visibleBlocks.value.length - 1) {
    swapBlocks(id, visibleBlocks.value[i + 1])
  }
}

function onBlockDragStart(id: GmbBlockId): void {
  dragId.value = id
}
function onBlockDragEnd(): void {
  dragId.value = null
  dropTarget.value = null
}
function onBlockDragOver(id: GmbBlockId, e: DragEvent): void {
  if (dragId.value === null || dragId.value === id) {
    dropTarget.value = null
    return
  }
  const el = e.currentTarget as HTMLElement | null
  if (el === null) return
  const rect = el.getBoundingClientRect()
  dropTarget.value = {
    id,
    position: e.clientY < rect.top + rect.height / 2 ? 'before' : 'after',
  }
}
function onBlockDragLeave(e: DragEvent): void {
  const el = e.currentTarget as HTMLElement | null
  if (el !== null && e.relatedTarget instanceof Node && el.contains(e.relatedTarget)) return
  dropTarget.value = null
}
function onBlockDrop(): void {
  const dragged = dragId.value
  const target = dropTarget.value
  dragId.value = null
  dropTarget.value = null
  if (dragged === null || target === null || dragged === target.id) return
  // 落在目標緊前/緊後：插在目標本體旁邊，夾在中間的隱藏區塊相對順序不變。
  if (target.position === 'before') moveBlockBefore(dragged, target.id)
  else moveBlockAfter(dragged, target.id)
}

function onResetLayout(): void {
  resetBlockLayout()
  push('已恢復預設佈局')
}

/** 模式 Tab（共享 WbTabs）：id 必須是 Mode，update 時先收窄再交給 setMode。 */
const modeTabs: WbTab[] = [
  { id: 'road', label: '巴士 · 小巴' },
  { id: 'mtr', label: '港鐵' },
]

/** 兩組折疊區的開合狀態（預設收起，與舊 <details> 一致）。
 *  第二條路線不再折疊：設定開關開著就整塊顯示、關掉就整塊隱藏。 */
const showAllStops = ref(false)
const showHelp = ref(false)

/** 首屏掛載進場：只在首次掛載播一次（見下方 onMounted），之後刷新不重播。 */
const mountEnter = ref(true)
let mountTimer: number | undefined
onMounted(() => {
  // 進場動畫 300ms + 最大錯開 140ms，700ms 後摘掉 class，不再觸發。
  mountTimer = window.setTimeout(() => {
    mountEnter.value = false
  }, 700)
})
onUnmounted(() => {
  if (mountTimer !== undefined) window.clearTimeout(mountTimer)
})

function onModeTab(value: string): void {
  if (value === 'road' || value === 'mtr') {
    // 切模式即卸載舊 <details>、回來是收起的；這裡同樣收起全部站點。
    showAllStops.value = false
    setMode(value)
  }
}

/** 三卡的 animation-delay：數據變了（eta-updated）與首屏進場共用同一 70ms 錯開。 */
function etaCardStyle(i: number): CSSProperties | undefined {
  return etaAnim.value[i] || mountEnter.value
    ? { animationDelay: `${i * 70}ms` }
    : undefined
}

function dirBtnClass(key: string): string {
  const base =
    'rounded-md border px-3 py-1.5 text-sm transition-colors hover:bg-accent'
  return activeDirKey.value === key
    ? `${base} border-primary bg-accent font-medium`
    : `${base} border-border bg-background`
}

function dirBtnClass2(key: string): string {
  const base =
    'rounded-md border px-3 py-1.5 text-sm transition-colors hover:bg-accent'
  return activeDirKey2.value === key
    ? `${base} border-primary bg-accent font-medium`
    : `${base} border-border bg-background`
}

/** 第二條路線三卡的 animation-delay（與主面板同一 70ms 錯開）。 */
function etaCardStyle2(i: number): CSSProperties | undefined {
  return etaAnim2.value[i] ? { animationDelay: `${i * 70}ms` } : undefined
}

/** 港鐵當前綫的官方路線圖顏色（只做點綴：結果卡左邊框）。 */
const mtrLineColor = computed((): string => MTR_LINE_COLORS[mtr.value.line] ?? '#888888')

/** 綫路徽章上的綫名（按代碼查 mtrLineOptions）。 */
function mtrLineName(code: string): string {
  return mtrLineOptions.value.find((l) => l.code === code)?.name ?? code
}

/** 當前站名（按當前綫查；代碼重用的站以綫區分，TAW 太古／大圍不串站）。 */
const mtrCurrentStationName = computed((): string =>
  mtrStationName(mtr.value.line, mtr.value.sta),
)

/** 某站的全部綫路色點（轉車站一眼看到所有綫；單綫站只有自己的色）。 */
function mtrStationDots(code: string): string[] {
  return findStationEntry(code, mtr.value.line)?.lines ?? [mtr.value.line]
}

/** 車站下拉框：原生 <select> 的選項裡畫不出色點，改自訂按鈕 + 下拉列表。
 *  列表只列當前綫的站，每行前面是該站全部綫路的彩色圓點；頂部小搜尋
 *  只過濾當前綫的站。點選站、點空白處、按 Esc 都關下拉。 */
const mtrStationMenuOpen = ref(false)
const mtrStationFilter = ref('')
const mtrStationFilterInput = ref<HTMLInputElement | HTMLInputElement[] | null>(null)
const filteredMtrLineStations = computed((): { code: string; name: string }[] => {
  const q = mtrStationFilter.value.trim().toLowerCase()
  if (!q) return mtrLineStations.value
  return mtrLineStations.value.filter(
    (s) => s.name.includes(q) || s.code.toLowerCase().includes(q),
  )
})

function toggleMtrStationMenu(): void {
  mtrStationMenuOpen.value = !mtrStationMenuOpen.value
  if (mtrStationMenuOpen.value) {
    void nextTick(() => {
      // ref-in-for：整個 GMB 模板在 v-for="blockId in visibleBlocks" 拖拽區塊
      // 迴圈裡，Vue 把模板 ref 收成陣列，value 是 [input] 而非 input，直接
      // .focus() 會拋 TypeError: n.focus is not a function（alpha.10 引入，
      // alpha.12 測試才逮住）。只有一個實例，取 [0] 即可。
      const el = mtrStationFilterInput.value
      ;(Array.isArray(el) ? el[0] : el)?.focus()
    })
  }
}

function closeMtrStationMenu(): void {
  mtrStationMenuOpen.value = false
  mtrStationFilter.value = ''
}

function onMtrStationSelect(code: string): void {
  onMtrStationPick(code)
  closeMtrStationMenu()
}

function onMtrLineSelect(line: string): void {
  onMtrLinePick(line)
  closeMtrStationMenu()
}

/** 綫路下拉框：與選站下拉框同做法（按鈕 + 下拉列表），10 條綫只收一格；
 *  每行前面是官方綫色圓點 + 綫名，當前綫高亮。點選綫、點空白處、按 Esc 都關下拉。
 *  切綫走同一條 onMtrLineSelect，邏輯一字未動（onMtrLineSelect 本身不改，
 *  關下拉在這裡的 wrapper 做）。 */
const mtrLineMenuOpen = ref(false)

function toggleMtrLineMenu(): void {
  mtrLineMenuOpen.value = !mtrLineMenuOpen.value
}

function closeMtrLineMenu(): void {
  mtrLineMenuOpen.value = false
}

function onMtrLineRowSelect(line: string): void {
  onMtrLineSelect(line)
  closeMtrLineMenu()
}

/** 綫路徽章：官方底色 + 對比文字色；當前綫描邊高亮、其餘半透明。 */
function mtrLineChipClass(code: string): string {
  const base = 'rounded-full px-3 py-1.5 text-xs font-medium transition-all active:scale-95'
  return mtr.value.line === code
    ? `${base} ring-2 ring-ring ring-offset-2 ring-offset-background`
    : `${base} opacity-60 hover:opacity-100`
}

const inputClass =
  'h-9 rounded-md border border-input bg-background px-3 text-sm outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring'
/** 路線號碼輸入框（合併後的唯一顯示）：大字粗體 + 主題重點色；底色用 bg-card，
 *  讓重點色落在卡片表面上（淺色主題的重點色在 --background 上對比略低於 4.5:1）。 */
const routeInputClass =
  'h-10 rounded-md border border-input bg-card px-3 text-lg font-bold tabular-nums text-primary outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring'
const selectClass =
  'h-9 rounded-md border border-input bg-background px-2 text-sm outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring'
</script>

<template>
  <div class="mx-auto w-full max-w-3xl space-y-6">
    <header class="space-y-1">
      <div class="flex items-center gap-2">
        <h1 class="text-xl font-semibold tracking-tight">到站看板</h1>
        <button
          type="button"
          class="ml-auto inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md px-2.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          title="把五個區塊恢復成預設順序"
          @click="onResetLayout"
        >
          <RotateCcw class="h-3.5 w-3.5" />
          恢復預設佈局
        </button>
      </div>
      <p class="text-sm text-muted-foreground">
        小巴、巴士、港鐵實時到站：輸路線號碼、選方向、選站，即見下三班車；港鐵先選綫、再選站，轉車站點綫路徽章切綫。
      </p>
    </header>

    <!-- 區塊列表：:key 用區塊 id（不用序號），重排只移 DOM、不重掛區塊，
         ETA 狀態與掛載進場動畫都不會被重觸發。 -->
    <WbDragBlock
      v-for="blockId in visibleBlocks"
      :key="blockId"
      :block-id="blockId"
      :label="GMB_BLOCK_LABELS[blockId]"
      :can-move-up="visibleIndex(blockId) > 0"
      :can-move-down="visibleIndex(blockId) < visibleBlocks.length - 1"
      :is-dragging="dragId === blockId"
      :drop-position="dropPositionFor(blockId)"
      @move-up="onBlockMoveUp(blockId)"
      @move-down="onBlockMoveDown(blockId)"
      @drag-start="onBlockDragStart(blockId)"
      @drag-end="onBlockDragEnd"
      @drag-over="onBlockDragOver(blockId, $event)"
      @drag-leave="onBlockDragLeave"
      @drop="onBlockDrop"
    >
      <!-- 控制區：路線、方向、上車站都在第一屏 -->
      <template v-if="blockId === 'controls'">
        <section class="space-y-4 rounded-lg border border-border bg-card p-5 shadow-sm">
      <!-- 模式切換：共享 WbTabs（滑動指示條）；面板切換見下方 wb-fade Transition -->
      <WbTabs :model-value="mode" :tabs="modeTabs" @update:model-value="onModeTab" />

      <!-- 巴士 · 小巴 / 港鐵面板：共享 wb-fade 交叉淡入淡出（mode="out-in"，不同高度不跳版式） -->
      <Transition name="wb-fade" mode="out-in">
        <div v-if="mode === 'road'" key="road" class="flex flex-wrap items-center gap-2">
          <label class="sr-only" for="routeInput">路線號碼</label>
          <input
            id="routeInput"
            v-model="routeInput"
            type="text"
            placeholder="例如 87M、1、101、968"
            autocomplete="off"
            autocapitalize="characters"
            spellcheck="false"
            aria-label="路線號碼"
            :class="routeInputClass"
            class="w-36 uppercase"
            @keydown="onRouteKeydown"
          />
          <button
            type="button"
            class="inline-flex h-9 items-center rounded-md bg-primary px-3.5 text-sm font-medium text-primary-foreground transition-all hover:opacity-90 active:scale-95 disabled:opacity-50"
            :disabled="loading"
            @click="onSearch"
          >
            {{ loading ? '搜尋中…' : '查路線' }}
          </button>
          <button
            type="button"
            title="重新查一次到站時間"
            class="inline-flex h-9 items-center rounded-md border border-border bg-background px-3.5 text-sm font-medium transition-all hover:bg-accent active:scale-95 disabled:opacity-50"
            :disabled="refreshing"
            @click="refreshNow"
          >
            <WbSpinner v-if="refreshing" size="md" class="mr-2" />
            {{ refreshing ? '刷新中…' : '刷新' }}
          </button>
          <span v-if="routeRegionLabel" class="text-sm text-muted-foreground">
            {{ routeRegionLabel }}
          </span>
        </div>

        <!-- 港鐵：先選綫，再選站；轉車站點綫路徽章切綫 -->
        <div v-else key="mtr" class="space-y-3">
          <!-- 找最近車站：只在點按鈕時請求定位權限；授權過且開關開著時，進港鐵模式自動定位一次 -->
          <div class="flex flex-wrap items-center gap-2">
            <button
              type="button"
              class="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md border border-border bg-background px-3 text-xs font-medium transition-colors hover:bg-accent active:scale-95 disabled:opacity-50"
              :disabled="locating"
              @click="locateNearest"
            >
              <WbSpinner v-if="locating" size="sm" />
              <LocateFixed v-else class="h-3.5 w-3.5" />
              {{ locating ? '定位中…' : '找最近車站' }}
            </button>
            <label
              class="flex shrink-0 cursor-pointer items-center gap-1.5 text-xs text-muted-foreground"
              title="下次進入港鐵模式時自動定位"
            >
              <span class="relative inline-flex">
                <input v-model="autoLocate" type="checkbox" class="peer sr-only" />
                <span
                  class="block h-5 w-9 rounded-full bg-muted transition-colors peer-checked:bg-primary"
                />
                <span
                  class="pointer-events-none absolute left-0.5 top-0.5 block h-4 w-4 rounded-full bg-white shadow transition-transform peer-checked:translate-x-4"
                />
              </span>
              自動定位
            </label>
            <span v-if="nearestInfo" class="text-xs text-muted-foreground">{{
              nearestInfo
            }}</span>
          </div>
          <p class="text-xs text-muted-foreground">
            位置只在瀏覽器本地計算最近車站，不會上傳。
          </p>
          <!-- 先選綫：10 條綫收進下拉框（手機上不再堆三行），與選站下拉框同做法：
               每行前面是官方綫色圓點 + 綫名，當前綫高亮；切綫時當前站若在新綫上有停
               就保留，否則落到新綫首站（onMtrLineSelect 邏輯不動）。 -->
          <div class="flex flex-wrap items-center gap-2">
            <span class="text-xs text-muted-foreground">綫路</span>
            <div class="relative" @keydown.escape="closeMtrLineMenu">
              <button
                type="button"
                aria-haspopup="listbox"
                :aria-expanded="mtrLineMenuOpen"
                aria-label="港鐵綫路"
                :class="selectClass"
                class="flex items-center gap-2 pr-2"
                @click="toggleMtrLineMenu"
              >
                <span
                  class="inline-block h-2.5 w-2.5 shrink-0 rounded-full"
                  :style="{ backgroundColor: mtrLineColor }"
                  aria-hidden="true"
                />
                <span class="font-medium">{{ mtrLineName(mtr.line) }}</span>
                <ChevronDown
                  class="h-4 w-4 shrink-0 text-muted-foreground transition-transform"
                  :class="{ 'rotate-180': mtrLineMenuOpen }"
                />
              </button>
              <div
                v-if="mtrLineMenuOpen"
                class="absolute left-0 z-20 mt-1 w-56 rounded-md border border-border bg-popover shadow-lg"
              >
                <div role="listbox" aria-label="港鐵綫路" class="max-h-72 overflow-y-auto p-1">
                  <button
                    v-for="line in mtrLineOptions"
                    :key="line.code"
                    type="button"
                    role="option"
                    :aria-selected="mtr.line === line.code"
                    class="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-sm transition-colors hover:bg-accent"
                    :class="mtr.line === line.code ? 'bg-accent font-medium' : ''"
                    @click="onMtrLineRowSelect(line.code)"
                  >
                    <span
                      class="inline-block h-2.5 w-2.5 shrink-0 rounded-full"
                      :style="{ backgroundColor: MTR_LINE_COLORS[line.code] ?? '#888888' }"
                      aria-hidden="true"
                    />
                    <span class="flex-1">{{ line.name }}</span>
                  </button>
                </div>
              </div>
              <!-- 點空白處關下拉（透明遮罩蓋住全屏，下拉本身 z-20 在遮罩之上） -->
              <button
                v-if="mtrLineMenuOpen"
                type="button"
                aria-hidden="true"
                tabindex="-1"
                class="fixed inset-0 z-10 cursor-default"
                @click="closeMtrLineMenu"
              />
            </div>
          </div>
          <!-- 再選站：只列當前綫的站。原生 select 的選項畫不出色點，改自訂下拉：
               每行前面是該站全部綫路的彩色圓點（轉車站一眼看到所有綫），
               頂部小搜尋只過濾當前綫的站。 -->
          <div class="flex flex-wrap items-center gap-2">
            <div class="relative" @keydown.escape="closeMtrStationMenu">
              <button
                type="button"
                aria-haspopup="listbox"
                :aria-expanded="mtrStationMenuOpen"
                aria-label="港鐵站"
                :class="selectClass"
                class="flex items-center gap-2 pr-2"
                @click="toggleMtrStationMenu"
              >
                <span class="flex items-center gap-1" aria-hidden="true">
                  <span
                    v-for="code in mtrStationLines"
                    :key="code"
                    class="inline-block h-2 w-2 rounded-full"
                    :style="{ backgroundColor: MTR_LINE_COLORS[code] ?? '#888888' }"
                  />
                </span>
                <span class="font-medium">{{ mtrCurrentStationName }} · {{ mtr.sta }}</span>
                <ChevronDown
                  class="h-4 w-4 shrink-0 text-muted-foreground transition-transform"
                  :class="{ 'rotate-180': mtrStationMenuOpen }"
                />
              </button>
              <div
                v-if="mtrStationMenuOpen"
                class="absolute left-0 z-20 mt-1 w-64 rounded-md border border-border bg-popover shadow-lg"
              >
                <div class="border-b border-border p-2">
                  <input
                    ref="mtrStationFilterInput"
                    v-model="mtrStationFilter"
                    type="text"
                    placeholder="搜尋站名或代碼…"
                    aria-label="搜尋本站綫車站"
                    spellcheck="false"
                    :class="inputClass"
                    class="w-full"
                  />
                </div>
                <div role="listbox" aria-label="港鐵站" class="max-h-72 overflow-y-auto p-1">
                  <p
                    v-if="!filteredMtrLineStations.length"
                    class="px-2.5 py-2 text-sm text-muted-foreground"
                  >
                    沒有符合的站
                  </p>
                  <button
                    v-for="s in filteredMtrLineStations"
                    :key="s.code"
                    type="button"
                    role="option"
                    :aria-selected="s.code === mtr.sta"
                    class="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-sm transition-colors hover:bg-accent"
                    :class="s.code === mtr.sta ? 'bg-accent font-medium' : ''"
                    @click="onMtrStationSelect(s.code)"
                  >
                    <span class="flex shrink-0 items-center gap-1" aria-hidden="true">
                      <span
                        v-for="code in mtrStationDots(s.code)"
                        :key="code"
                        class="inline-block h-2 w-2 rounded-full"
                        :style="{
                          backgroundColor: MTR_LINE_COLORS[code] ?? '#888888',
                        }"
                      />
                    </span>
                    <span class="flex-1">{{ s.name }}</span>
                    <span class="text-xs text-muted-foreground">{{ s.code }}</span>
                  </button>
                </div>
              </div>
              <!-- 點空白處關下拉（透明遮罩蓋住全屏，下拉本身 z-20 在遮罩之上） -->
              <button
                v-if="mtrStationMenuOpen"
                type="button"
                aria-hidden="true"
                tabindex="-1"
                class="fixed inset-0 z-10 cursor-default"
                @click="closeMtrStationMenu"
              />
            </div>
            <button
              type="button"
              title="重新查一次班次"
              class="inline-flex h-9 items-center rounded-md border border-border bg-background px-3.5 text-sm font-medium transition-all hover:bg-accent active:scale-95 disabled:opacity-50"
              :disabled="refreshing"
              @click="refreshNow"
            >
              <WbSpinner v-if="refreshing" size="md" class="mr-2" />
              {{ refreshing ? '刷新中…' : '刷新' }}
            </button>
          </div>
          <!-- 轉車：該站的其他綫路，官方路線圖顏色，點一下切綫看班次（站不變）。
               單綫站沒有其他綫路，這一行不顯示。
               每條綫的下一班在下方「下三班車」；徽章裡不另塞分鐘數（多綫轉車站
               要多查幾次 API，版式也擠），點徽章切綫就夠。 -->
          <div
            v-if="mtrOtherLines.length"
            class="flex flex-wrap items-center gap-2"
            role="tablist"
            aria-label="轉車綫路"
          >
            <span class="text-xs text-muted-foreground">轉車</span>
            <button
              v-for="code in mtrOtherLines"
              :key="code"
              type="button"
              role="tab"
              :aria-selected="false"
              :class="mtrLineChipClass(code)"
              :style="{
                backgroundColor: MTR_LINE_COLORS[code] ?? '#888888',
                color: lineChipText(code),
              }"
              @click="onMtrLineSelect(code)"
            >
              {{ mtrLineName(code) }}
            </button>
          </div>
        </div>
      </Transition>

      <!-- 同編號多條路線：全部列出、點一下自由切換（放 Transition 外：只屬 road 模式；
           增減用 v-auto-animate，模式切換時隨 road 面板隱去，不參與淡入淡出） -->
      <div v-if="mode === 'road' && candidates.length > 1" v-auto-animate class="space-y-2">
        <p class="text-xs text-muted-foreground">同一個編號有多條路線，請選一條：</p>
        <button
          v-for="c in candidates"
          :key="c.src"
          type="button"
          class="flex w-full flex-col gap-0.5 rounded-md border px-3 py-2 text-left transition-colors hover:bg-accent"
          :class="
            roadSrc === c.src && roadCode === c.code
              ? 'border-primary bg-accent'
              : 'border-border bg-background'
          "
          @click="onCandidatePick(c)"
        >
          <span class="text-sm font-medium">{{ c.label }} {{ c.code }}</span>
          <span class="text-xs text-muted-foreground">{{ c.summary }}</span>
        </button>
      </div>

      <!-- 方向：巴士 · 小巴是起訖點，港鐵是往哪個終點站 -->
      <div
        v-if="dirOptions.length"
        v-auto-animate
        class="flex flex-wrap items-center gap-2"
        role="tablist"
        aria-label="方向"
      >
        <span class="text-xs text-muted-foreground">方向</span>
        <button
          v-for="d in dirOptions"
          :key="d.key"
          type="button"
          :class="dirBtnClass(d.key)"
          @click="onDirPick(d.key)"
        >
          {{ d.label }}
        </button>
      </div>

      <!-- 上車站 -->
      <label v-if="mode === 'road'" class="flex flex-wrap items-center gap-2 text-sm">
        上車站
        <select
          v-model.number="stopSeqModel"
          aria-label="上車站"
          :class="selectClass"
          class="max-w-full"
        >
          <option
            v-for="s in currentStops"
            :key="s.stop_seq"
            :value="s.stop_seq"
          >
            {{ s.stop_seq }}. {{ s.name_tc }}
          </option>
        </select>
      </label>

      <!-- 最近路線 -->
      <div
        v-if="mode === 'road' && recent.length"
        v-auto-animate
        class="flex flex-wrap items-center gap-2"
      >
        <span class="text-xs text-muted-foreground">最近：</span>
        <button
          v-for="e in recent"
          :key="`${e.code}|${e.src}`"
          type="button"
          class="rounded-full border border-border bg-muted/50 px-2.5 py-1 text-xs transition-colors hover:bg-accent"
          @click="onRecentClick(e)"
        >
          {{ e.code }}{{ e.src && srcShort(e.src) ? ` · ${srcShort(e.src)}` : '' }}
        </button>
      </div>

      <!-- 狀態列：自動刷新開關、即時狀態、更新頻率 -->
      <div class="border-t border-border pt-3">
        <div class="flex flex-wrap items-center gap-3">
          <label class="flex cursor-pointer items-center gap-2 text-sm">
            <input v-model="autoRefresh" type="checkbox" class="h-4 w-4 accent-current" />
            每 30 秒自動刷新
          </label>
          <span class="flex items-center gap-2 text-sm">
            <WbSpinner v-if="refreshing" size="sm" class="shrink-0 text-muted-foreground" />
            <span
              v-else
              class="inline-block h-2 w-2 shrink-0 rounded-full"
              :class="statusDotClass"
            />
            <span>{{ status.message }}</span>
          </span>
          <span class="flex-1" />
          <span class="text-xs text-muted-foreground">{{ detailStats }}</span>
        </div>
      </div>
        </section>
      </template>

      <!-- 下三班車：標題只在上方區塊工具條（WbDragBlock 的 label），內容裡不再重複一行 -->
      <template v-else-if="blockId === 'eta'">
        <section class="grid grid-cols-3 gap-3" aria-live="polite">
      <article
        v-for="(card, i) in etaCards"
        :key="card.label"
        class="eta-card rounded-lg border bg-card p-4 text-center shadow-sm sm:p-5"
        :class="[
          card.soon ? 'border-green-500' : 'border-border',
          etaAnim[i] ? 'eta-updated' : '',
          mountEnter ? 'eta-mount-in' : '',
        ]"
        :style="[
          etaCardStyle(i),
          mode === 'mtr' ? { borderLeft: `3px solid ${mtrLineColor}` } : undefined,
        ]"
        @animationend="onEtaAnimEnd(i)"
      >
        <div class="text-xs text-muted-foreground sm:text-[13px]">{{ card.label }}</div>
        <div
          class="flex min-h-[3.75rem] items-center justify-center overflow-hidden font-mono tabular-nums text-5xl font-bold leading-tight sm:min-h-[4.6875rem] sm:text-6xl"
          :class="card.soon ? 'text-green-600 dark:text-green-400' : 'text-primary'"
        >
          <!-- 數字掉落動效：分鐘數真變時 :key 換，舊數字上滑淡出、新數字從上方落下；
               單位「分鐘」span 在 eta-num Transition 外，不參與掉落，改由 wb-fade
               淡入淡出（1→0 變「即到」時不硬消失、版式不跳動）
               港鐵到站顯示 Arriving：字號縮到 text-sm / sm:text-lg + nowrap，一行塞進窄卡；
               容器 min-h 與數字態行高相同（text-5xl 60px / sm:text-6xl 75px），
               Arriving 垂直居中，數字 ↔ Arriving 切換時卡高不跳。 -->
          <Transition name="eta-num" mode="out-in">
            <span
              :key="etaNumKey[i]"
              :style="{ animationDelay: `${i * 70}ms` }"
              class="inline-block"
              :class="card.arrivingEn ? 'whitespace-nowrap text-sm sm:text-lg' : ''"
              >{{ card.minText }}</span
            >
          </Transition><Transition name="wb-fade">
            <span
              v-if="card.showUnit"
              class="ml-1 text-sm font-semibold text-muted-foreground"
              >分鐘</span
            >
          </Transition>
        </div>
        <Transition name="wb-fade" mode="out-in">
          <div :key="card.timeText" class="text-xs sm:text-sm">{{ card.timeText }}</div>
        </Transition>
        <Transition name="wb-fade" mode="out-in">
          <div :key="card.remark" class="min-h-[15px] text-xs text-muted-foreground">
            {{ card.remark }}
          </div>
        </Transition>
      </article>
        </section>
      </template>

      <!-- 第二條路線（換乘）：設定開關開著才出現，不折疊、整塊直接顯示；
           與主面板同一 30 秒 tick 一起刷新（開關關掉時不查） -->
      <template v-else-if="blockId === 'road2'">
        <section class="space-y-4 rounded-lg border border-border bg-card p-5 shadow-sm">
          <div class="flex flex-wrap items-center gap-2">
            <label class="sr-only" for="routeInput2">第二條路線號碼</label>
            <input
              id="routeInput2"
              v-model="routeInput2"
              type="text"
              placeholder="例如 87M、1、101、968"
              autocomplete="off"
              autocapitalize="characters"
              spellcheck="false"
              aria-label="第二條路線號碼"
              :class="routeInputClass"
              class="w-36 uppercase"
              @keydown="onRouteKeydown2"
            />
            <button
              type="button"
              class="inline-flex h-10 items-center rounded-md bg-primary px-3.5 text-sm font-medium text-primary-foreground transition-all hover:opacity-90 active:scale-95 disabled:opacity-50"
              :disabled="loading2"
              @click="onSearch2"
            >
              {{ loading2 ? '搜尋中…' : '查路線' }}
            </button>
            <span v-if="routeRegionLabel2" class="text-sm text-muted-foreground">
              {{ routeRegionLabel2 }}
            </span>
          </div>

          <div v-if="candidates2.length > 1" v-auto-animate class="space-y-2">
            <p class="text-xs text-muted-foreground">同一個編號有多條路線，請選一條：</p>
            <button
              v-for="c in candidates2"
              :key="c.src"
              type="button"
              class="flex w-full flex-col gap-0.5 rounded-md border px-3 py-2 text-left transition-colors hover:bg-accent"
              :class="
                roadSrc2 === c.src && roadCode2 === c.code
                  ? 'border-primary bg-accent'
                  : 'border-border bg-background'
              "
              @click="onCandidatePick2(c)"
            >
              <span class="text-sm font-medium">{{ c.label }} {{ c.code }}</span>
              <span class="text-xs text-muted-foreground">{{ c.summary }}</span>
            </button>
          </div>

          <div
            v-if="dirOptions2.length"
            v-auto-animate
            class="flex flex-wrap gap-2"
            role="tablist"
            aria-label="第二條路線方向"
          >
            <button
              v-for="d in dirOptions2"
              :key="d.key"
              type="button"
              :class="dirBtnClass2(d.key)"
              @click="onDirPick2(d.key)"
            >
              {{ d.label }}
            </button>
          </div>

          <label v-if="currentStops2.length" class="flex flex-wrap items-center gap-2 text-sm">
            上車站
            <select
              v-model.number="stopSeqModel2"
              aria-label="第二條路線上車站"
              :class="selectClass"
              class="max-w-full"
            >
              <option
                v-for="s in currentStops2"
                :key="s.stop_seq"
                :value="s.stop_seq"
              >
                {{ s.stop_seq }}. {{ s.name_tc }}
              </option>
            </select>
          </label>

          <div class="grid grid-cols-3 gap-3" aria-live="polite">
            <article
              v-for="(card, i) in etaCards2"
              :key="card.label"
              class="eta-card rounded-lg border bg-card p-4 text-center shadow-sm sm:p-5"
              :class="[
                card.soon ? 'border-green-500' : 'border-border',
                etaAnim2[i] ? 'eta-updated' : '',
              ]"
              :style="etaCardStyle2(i)"
              @animationend="onEtaAnimEnd2(i)"
            >
              <div class="text-xs text-muted-foreground sm:text-[13px]">{{ card.label }}</div>
              <div
                class="overflow-hidden font-mono tabular-nums text-5xl font-bold leading-tight sm:text-6xl"
                :class="card.soon ? 'text-green-600 dark:text-green-400' : 'text-primary'"
              >
                <Transition name="eta-num" mode="out-in">
                  <span
                    :key="etaNumKey2[i]"
                    :style="{ animationDelay: `${i * 70}ms` }"
                    class="inline-block"
                    >{{ card.minText }}</span
                  >
                </Transition><Transition name="wb-fade">
                  <span
                    v-if="card.showUnit"
                    class="ml-1 text-sm font-semibold text-muted-foreground"
                    >分鐘</span
                  >
                </Transition>
              </div>
              <Transition name="wb-fade" mode="out-in">
                <div :key="card.timeText" class="text-xs sm:text-sm">{{ card.timeText }}</div>
              </Transition>
              <Transition name="wb-fade" mode="out-in">
                <div :key="card.remark" class="min-h-[15px] text-xs text-muted-foreground">
                  {{ card.remark }}
                </div>
              </Transition>
            </article>
          </div>

          <div class="flex flex-wrap items-center gap-3">
            <span class="flex items-center gap-2 text-sm">
              <span
                class="inline-block h-2 w-2 shrink-0 rounded-full"
                :class="statusDotClass2"
              />
              <span>{{ status2.message }}</span>
            </span>
            <span class="flex-1" />
            <span class="text-xs text-muted-foreground">{{ detailStats2 }}</span>
          </div>
        </section>
      </template>

      <!-- 全部站點：按鈕 + v-auto-animate 折疊（取代原生 <details> 的瞬間開合） -->
      <template v-else-if="blockId === 'stops'">
        <section class="rounded-lg border border-border bg-card p-4 shadow-sm">
      <button
        type="button"
        class="flex w-full items-center justify-between gap-2 text-sm font-medium"
        :aria-expanded="showAllStops"
        @click="showAllStops = !showAllStops"
      >
        <span>全部站點（{{ currentStops.length }} 站）· 點開用列表切換</span>
        <svg
          class="wb-chevron shrink-0"
          :class="{ 'wb-chevron--open': showAllStops }"
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
          aria-hidden="true"
        >
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>
      <div v-auto-animate>
        <div v-if="showAllStops" class="mt-3 space-y-2">
          <input
            v-model="stopFilter"
            type="text"
            placeholder="搜尋站名…"
            aria-label="搜尋站名"
            spellcheck="false"
            :class="inputClass"
            class="w-full"
          />
          <div v-auto-animate class="flex max-h-80 flex-col gap-1 overflow-y-auto">
            <p v-if="!filteredStops.length" class="text-sm text-muted-foreground">
              沒有符合的站
            </p>
            <button
              v-for="s in filteredStops"
              :key="s.stop_seq"
              type="button"
              class="flex items-center gap-3 rounded-md border px-2.5 py-2 text-left text-sm transition-colors hover:bg-accent"
              :class="
                s.stop_seq === stopSeqModel
                  ? 'border-primary bg-accent'
                  : 'border-transparent'
              "
              @click="onStopPick(s.stop_seq)"
            >
              <span
                class="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-border bg-muted text-xs text-muted-foreground"
              >
                {{ s.stop_seq }}
              </span>
              <span>{{ s.name_tc }}</span>
            </button>
          </div>
        </div>
      </div>
        </section>
      </template>

      <!-- 使用說明：按鈕 + v-auto-animate 折疊（取代原生 <details> 的瞬間開合） -->
      <template v-else-if="blockId === 'help'">
        <section class="rounded-lg border border-border bg-card p-4 shadow-sm">
      <button
        type="button"
        class="flex w-full items-center justify-between gap-2 text-sm font-medium"
        :aria-expanded="showHelp"
        @click="showHelp = !showHelp"
      >
        <span>使用說明</span>
        <svg
          class="wb-chevron shrink-0"
          :class="{ 'wb-chevron--open': showHelp }"
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
          aria-hidden="true"
        >
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>
      <div v-auto-animate>
        <p v-if="showHelp" class="mt-2 text-xs leading-relaxed text-muted-foreground">
          巴士 / 小巴：輸路線號碼，同一個編號有多條路線時（例如 1
          號有九巴、城巴、新界小巴、港島小巴）會全部列出，點一下就能自由切換。港鐵先選綫、再選站，轉車站每行前面有全部綫路的色點，下方「轉車」一點就切綫看班次。想同時查另一條路線（換乘），在設定裡打開「第二條路線」。數據：運輸署
          / 九巴 / 城巴 / 港鐵經 data.gov.hk，每分鐘更新，僅供參考。
        </p>
      </div>
        </section>
      </template>
    </WbDragBlock>
  </div>
</template>

<style scoped>
/* 到站看板 v1.17 刷新動效（照搬 1.x）：
   三張卡按「下一班 → 再下一班 → 第三班」依次輕抬淡入（錯開 70ms），
   只有分鐘數真的變了的卡才動。
   減弱動態效果的用戶不播動畫。 */
@keyframes eta-rise {
  from {
    opacity: 0.35;
    transform: translateY(6px) scale(0.985);
  }
  to {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}

/* 到站數字掉落動效（新加在數字本身上，整卡輕抬淡入那套不動）：
   舊數字上滑淡出 0.18s，新數字從上方落下 0.3s cubic-bezier(.22,1,.36,1)，
   三卡錯開 70ms（模板裡按序加 animation-delay），單位「分鐘」不參與；
   減弱動態效果的用戶不播動畫。 */
@keyframes eta-num-out {
  from {
    transform: translateY(0);
    opacity: 1;
  }
  to {
    transform: translateY(-100%);
    opacity: 0;
  }
}

@keyframes eta-num-in {
  from {
    transform: translateY(-100%);
    opacity: 0;
  }
  to {
    transform: translateY(0);
    opacity: 1;
  }
}

/* 狀態點呼吸脈衝：查資料進行中時淡入淡出（減弱動態效果的用戶不播動畫）。 */
@keyframes gmb-status-pulse {
  from {
    opacity: 1;
  }
  to {
    opacity: 0.35;
  }
}

@media (prefers-reduced-motion: no-preference) {
  /* 首屏掛載進場（Phase 3）：淡入 + 輕抬（沿用 eta-rise 關鍵幀），錯開 70ms；
     只在首次掛載播一次，之後刷新走 eta-updated，不重播。
     寫在 .eta-updated 之前：萬一兩者同時在身上，數據變化的動畫優先。 */
  .eta-mount-in {
    animation: eta-rise var(--wb-dur-eta-in) var(--wb-ease-out) both;
  }

  .gmb-status-pulse {
    animation: gmb-status-pulse var(--wb-dur-eta-rise) var(--wb-ease-standard)
      infinite alternate;
  }

  .eta-updated {
    animation: eta-rise 0.38s cubic-bezier(0.22, 1, 0.36, 1) both;
  }

  .eta-num-leave-active {
    animation: eta-num-out 0.18s ease-out both;
  }

  .eta-num-enter-active {
    animation: eta-num-in 0.3s cubic-bezier(0.22, 1, 0.36, 1) both;
  }
}
</style>
