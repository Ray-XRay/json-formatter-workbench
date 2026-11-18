<script setup lang="ts">
import { useGmb } from '../lib/gmb/useGmb'

const {
  mode,
  loading,
  autoRefresh,
  routeInput,
  stopFilter,
  roadSrc,
  roadCode,
  candidates,
  recent,
  mtr,
  status,
  updatedAt,
  stampKey,
  etaAnim,
  etaCards,
  dirOptions,
  activeDirKey,
  currentStops,
  filteredStops,
  stopSeqModel,
  routeTitle,
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
  loadCurrentEta,
} = useGmb()

function modeBtnClass(tab: string): string {
  const base =
    'flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition-colors sm:flex-none sm:px-4'
  return mode.value === tab
    ? `${base} bg-card text-foreground shadow-sm`
    : `${base} text-muted-foreground hover:text-foreground`
}

function dirBtnClass(key: string): string {
  const base =
    'rounded-md border px-3 py-1.5 text-sm transition-colors hover:bg-accent'
  return activeDirKey.value === key
    ? `${base} border-primary bg-accent font-medium`
    : `${base} border-border bg-background`
}

const inputClass =
  'h-9 rounded-md border border-input bg-background px-3 text-sm outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring'
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
    <section class="space-y-4 rounded-lg border border-border bg-card p-4 shadow-sm">
      <div class="flex rounded-lg bg-muted p-1" role="tablist" aria-label="交通工具">
        <button type="button" :class="modeBtnClass('road')" @click="setMode('road')">
          巴士 · 小巴
        </button>
        <button type="button" :class="modeBtnClass('mtr')" @click="setMode('mtr')">
          港鐵
        </button>
      </div>

      <!-- 巴士 · 小巴：查路線 -->
      <div v-if="mode === 'road'" class="flex flex-wrap items-center gap-2">
        <span class="min-w-12 text-lg font-bold tabular-nums">{{ routeTitle }}</span>
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
          :class="inputClass"
          class="w-32 uppercase"
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
          class="inline-flex h-9 items-center rounded-md border border-border bg-background px-3.5 text-sm font-medium transition-all hover:bg-accent active:scale-95"
          @click="loadCurrentEta"
        >
          刷新
        </button>
        <span v-if="routeRegionLabel" class="text-sm text-muted-foreground">
          {{ routeRegionLabel }}
        </span>
        <span
          v-if="updatedAt"
          :key="stampKey"
          class="stamp-updated text-sm text-muted-foreground"
        >
          更新於 {{ updatedAt }}
        </span>
      </div>

      <!-- 同編號多條路線：全部列出、點一下自由切換 -->
      <div v-if="mode === 'road' && candidates.length > 1" class="space-y-2">
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

      <!-- 港鐵：選綫、選站 -->
      <div v-if="mode === 'mtr'" class="flex flex-wrap items-center gap-2">
        <label class="flex items-center gap-2 text-sm">
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
        <button
          type="button"
          title="重新查一次班次"
          class="inline-flex h-9 items-center rounded-md border border-border bg-background px-3.5 text-sm font-medium transition-all hover:bg-accent active:scale-95"
          @click="loadCurrentEta"
        >
          刷新
        </button>
        <span v-if="routeRegionLabel" class="text-sm text-muted-foreground">
          {{ routeRegionLabel }}
        </span>
        <span
          v-if="updatedAt"
          :key="stampKey"
          class="stamp-updated text-sm text-muted-foreground"
        >
          更新於 {{ updatedAt }}
        </span>
      </div>

      <!-- 方向 -->
      <div
        v-if="dirOptions.length"
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
          <span
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
    <section class="grid grid-cols-3 gap-3" aria-live="polite">
      <article
        v-for="(card, i) in etaCards"
        :key="card.label"
        class="eta-card rounded-lg border bg-card p-3 text-center shadow-sm sm:p-4"
        :class="[
          card.soon ? 'border-green-500' : 'border-border',
          etaAnim[i] ? 'eta-updated' : '',
        ]"
        :style="etaAnim[i] ? { animationDelay: `${i * 70}ms` } : undefined"
        @animationend="onEtaAnimEnd(i)"
      >
        <div class="text-xs text-muted-foreground sm:text-[13px]">{{ card.label }}</div>
        <div
          class="font-mono tabular-nums text-4xl font-bold leading-tight sm:text-5xl"
          :class="card.soon ? 'text-green-600 dark:text-green-400' : 'text-primary'"
        >
          {{ card.minText }}<span
            v-if="card.showUnit"
            class="ml-1 text-sm font-semibold text-muted-foreground"
            >分鐘</span
          >
        </div>
        <div class="text-xs sm:text-sm">{{ card.timeText }}</div>
        <div class="min-h-[15px] text-xs text-muted-foreground">{{ card.remark }}</div>
      </article>
    </section>

    <!-- 全部站點 -->
    <details
      v-if="mode === 'road'"
      class="rounded-lg border border-border bg-card p-4 shadow-sm"
    >
      <summary class="cursor-pointer text-sm font-medium">
        全部站點（{{ currentStops.length }} 站）· 點開用列表切換
      </summary>
      <div class="mt-3 space-y-2">
        <input
          v-model="stopFilter"
          type="text"
          placeholder="搜尋站名…"
          aria-label="搜尋站名"
          spellcheck="false"
          :class="inputClass"
          class="w-48"
        />
        <div class="flex max-h-80 flex-col gap-1 overflow-y-auto">
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
    </details>

    <p class="text-xs leading-relaxed text-muted-foreground">
      巴士 / 小巴：輸路線號碼，同一個編號有多條路線時（例如 1 號有九巴、城巴、新界小巴、港島小巴）會全部列出，點一下就能自由切換；港鐵選綫、選站即見下三班車。數據：運輸署
      / 九巴 / 城巴 / 港鐵經 data.gov.hk，每分鐘更新，僅供參考。
    </p>
  </div>
</template>

<style scoped>
/* 到站看板 v1.17 刷新動效（照搬 1.x）：
   三張卡按「下一班 → 再下一班 → 第三班」依次輕抬淡入（錯開 70ms），
   只有分鐘數真的變了的卡才動；「更新於」時間戳同步淡入一次。
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

@keyframes eta-stamp {
  from {
    opacity: 0.3;
  }
  to {
    opacity: 1;
  }
}

@media (prefers-reduced-motion: no-preference) {
  .eta-updated {
    animation: eta-rise 0.38s cubic-bezier(0.22, 1, 0.36, 1) both;
  }

  .stamp-updated {
    animation: eta-stamp 0.5s ease-out both;
  }
}
</style>
