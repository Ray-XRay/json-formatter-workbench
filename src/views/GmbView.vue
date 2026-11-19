<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, type CSSProperties } from 'vue'
import { LocateFixed } from 'lucide-vue-next'
import WbSpinner from '../components/WbSpinner.vue'
import WbTabs from '../components/WbTabs.vue'
import type { WbTab } from '../components/WbTabs.vue'
import { useGmb } from '../lib/gmb/useGmb'
import { MTR_LINE_COLORS, lineChipText } from '../lib/gmb/mtrStations'

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
  mtrStations,
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
  onMtrLineChange,
  onMtrStationChange,
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

/** 模式 Tab（共享 WbTabs）：id 必須是 Mode，update 時先收窄再交給 setMode。 */
const modeTabs: WbTab[] = [
  { id: 'road', label: '巴士 · 小巴' },
  { id: 'mtr', label: '港鐵' },
]

/** 三組折疊區的開合狀態（預設收起，與舊 <details> 一致）。 */
const showAllStops = ref(false)
const showHelp = ref(false)
const showRoad2 = ref(false)

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

/** 港鐵當前綫的官方路線圖顏色（只做點綴：色點、徽章、結果卡左邊框）。 */
const mtrLineColor = computed((): string => MTR_LINE_COLORS[mtr.value.line] ?? '#888888')
const mtrLineChipText = computed((): string => lineChipText(mtr.value.line))
const currentLineName = computed(
  (): string => mtrLineOptions.value.find((l) => l.code === mtr.value.line)?.name ?? '',
)

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
      <h1 class="text-xl font-semibold tracking-tight">到站看板</h1>
      <p class="text-sm text-muted-foreground">
        小巴、巴士、港鐵實時到站：輸路線號碼、選方向、選站，即見下三班車。
      </p>
    </header>

    <!-- 控制區：路線、方向、上車站都在第一屏 -->
    <section class="space-y-5 rounded-lg border border-border bg-card p-5 shadow-sm">
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

        <!-- 港鐵：選綫、選站 -->
        <div v-else key="mtr" class="space-y-3">
          <!-- 找最近車站：只在點按鈕時請求定位權限；授權過且開關開著時，進港鐵模式自動定位一次 -->
          <div class="flex items-center gap-2">
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
          </div>
          <p v-if="nearestInfo" class="text-xs text-muted-foreground">{{ nearestInfo }}</p>
          <p class="text-xs text-muted-foreground">
            位置只在瀏覽器本地計算最近車站，不會上傳。
          </p>
          <div class="flex flex-wrap items-center gap-2">
            <label class="flex items-center gap-2 text-sm">
              <span
                class="h-3 w-3 shrink-0 rounded-full"
                :style="{ backgroundColor: mtrLineColor }"
                aria-hidden="true"
              />
              綫
              <select
                v-model="mtr.line"
                aria-label="港鐵綫"
                :class="selectClass"
                @change="onMtrLineChange"
              >
                <option
                  v-for="line in mtrLineOptions"
                  :key="line.code"
                  :value="line.code"
                >
                  {{ line.name }}
                </option>
              </select>
            </label>
            <label class="flex items-center gap-2 text-sm">
              站
              <select
                v-model="mtr.sta"
                aria-label="港鐵站"
                :class="selectClass"
                @change="onMtrStationChange"
              >
                <option v-for="[code, name] in mtrStations" :key="code" :value="code">
                  {{ name }}
                </option>
              </select>
            </label>
            <span
              class="rounded-full px-2.5 py-1 text-xs font-medium"
              :style="{ backgroundColor: mtrLineColor, color: mtrLineChipText }"
            >
              {{ currentLineName }}
            </span>
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
            <span v-if="routeRegionLabel" class="text-sm text-muted-foreground">
              {{ routeRegionLabel }}
            </span>
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

      <!-- 方向 -->
      <div
        v-if="dirOptions.length"
        v-auto-animate
        class="flex flex-wrap gap-2"
        role="tablist"
        aria-label="方向"
      >
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
    </section>

    <!-- 下三班車 -->
    <p class="text-xs font-medium tracking-wide text-muted-foreground">下三班車</p>
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
          class="overflow-hidden font-mono tabular-nums text-5xl font-bold leading-tight sm:text-6xl"
          :class="card.soon ? 'text-green-600 dark:text-green-400' : 'text-primary'"
        >
          <!-- 數字掉落動效：分鐘數真變時 :key 換，舊數字上滑淡出、新數字從上方落下；
               單位「分鐘」span 在 eta-num Transition 外，不參與掉落，改由 wb-fade
               淡入淡出（1→0 變「即到」時不硬消失、版式不跳動） -->
          <Transition name="eta-num" mode="out-in">
            <span
              :key="etaNumKey[i]"
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
    </section>

    <!-- 第二條路線（換乘）：預設收起；與主面板同一 30 秒 tick 一起刷新 -->
    <section
      v-if="mode === 'road'"
      class="rounded-lg border border-border bg-card p-5 shadow-sm"
    >
      <button
        type="button"
        class="flex w-full items-center justify-between gap-2 text-sm font-medium"
        :aria-expanded="showRoad2"
        @click="showRoad2 = !showRoad2"
      >
        <span>
          第二條路線（換乘）
          <span v-if="roadCode2" class="font-normal text-muted-foreground">
            · {{ roadCode2 }}
          </span>
        </span>
        <svg
          class="wb-chevron shrink-0"
          :class="{ 'wb-chevron--open': showRoad2 }"
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
        <div v-if="showRoad2" class="mt-4 space-y-4">
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
        </div>
      </div>
    </section>

    <!-- 全部站點：按鈕 + v-auto-animate 折疊（取代原生 <details> 的瞬間開合） -->
    <section
      v-if="mode === 'road'"
      class="rounded-lg border border-border bg-card p-4 shadow-sm"
    >
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

    <!-- 使用說明：按鈕 + v-auto-animate 折疊（取代原生 <details> 的瞬間開合） -->
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
          號有九巴、城巴、新界小巴、港島小巴）會全部列出，點一下就能自由切換；「第二條路線（換乘）」可以同時查另一條路線，方便轉車。港鐵選綫、選站即見下三班車。數據：運輸署
          / 九巴 / 城巴 / 港鐵經 data.gov.hk，每分鐘更新，僅供參考。
        </p>
      </div>
    </section>
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
