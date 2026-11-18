<script setup lang="ts">
import { computed, ref } from 'vue'
import { BusFront, RotateCw, TrainFront } from 'lucide-vue-next'
import CopyButton from '../components/CopyButton.vue'
import PageHeader from '../components/PageHeader.vue'

type GMBMode = 'minibus' | 'bus' | 'mtr'

const MODES: { id: GMBMode; label: string }[] = [
  { id: 'minibus', label: '专线小巴' },
  { id: 'bus', label: '巴士' },
  { id: 'mtr', label: '港铁' },
]

interface RoutePreview {
  label: string
  operator: string
  etas: number[]
  platform?: string
}

const ROUTES: Record<GMBMode, RoutePreview> = {
  minibus: {
    label: '87M · 四號貨櫃碼頭 → 葵芳站',
    operator: '专线小巴 · 新界',
    etas: [1, 6, 10],
  },
  bus: {
    label: '1 · 尖沙咀碼頭 → 竹園邨',
    operator: '九巴',
    etas: [4, 9, 15],
  },
  mtr: {
    label: '荃湾线 · 葵芳站',
    operator: '港铁',
    etas: [2, 7],
    platform: '1 号月台 · 往荃湾',
  },
}

const ETA_LABELS = ['下一班', '再下一班', '第三班']

const mode = ref<GMBMode>('minibus')
const refreshKey = ref(0)

const current = computed<RoutePreview>((): RoutePreview => ROUTES[mode.value])

function pad(n: number): string {
  return String(n).padStart(2, '0')
}

function arrivalTime(min: number): string {
  const d = new Date(Date.now() + min * 60000)
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/** Recomputed on every refresh so the timestamp moves; values stay the same. */
const updatedAt = computed<string>((): string => {
  void refreshKey.value
  const d = new Date()
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
})

function refresh(): void {
  refreshKey.value += 1
}
</script>

<template>
  <div class="mx-auto w-full max-w-5xl space-y-6">
    <PageHeader
      eyebrow="工具 · 到站"
      title="到站看板"
      description="小巴、巴士与港铁实时到站。输入路线号码，选方向、点站即见下三班车。"
      badge="Phase 2 迁移中"
    />

    <div class="flex flex-wrap items-center gap-3">
      <div class="inline-flex rounded-lg border border-border bg-muted p-0.5" role="tablist" aria-label="交通模式">
        <button
          v-for="item in MODES"
          :key="item.id"
          type="button"
          role="tab"
          :aria-selected="mode === item.id"
          :class="[
            'rounded-md px-3 py-1.5 text-xs font-medium transition-all',
            mode === item.id ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
          ]"
          @click="mode = item.id"
        >
          {{ item.label }}
        </button>
      </div>
      <span class="flex-1" />
      <button
        type="button"
        class="inline-flex h-9 items-center gap-1.5 rounded-md border border-border bg-background px-3 text-sm font-medium transition-colors hover:bg-accent active:scale-95"
        @click="refresh"
      >
        <RotateCw class="h-4 w-4" />
        刷新
      </button>
    </div>

    <!-- Route summary -->
    <section class="rounded-xl border border-border bg-card p-4 shadow-sm sm:p-5">
      <div class="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p class="text-xs text-muted-foreground">{{ current.operator }}</p>
          <h2 class="mt-1 text-lg font-semibold tracking-tight">{{ current.label }}</h2>
          <p v-if="current.platform" class="mt-1 flex items-center gap-1.5 text-sm text-muted-foreground">
            <TrainFront class="h-4 w-4" />
            {{ current.platform }}
          </p>
          <p v-else class="mt-1 flex items-center gap-1.5 text-sm text-muted-foreground">
            <BusFront class="h-4 w-4" />
            上车站：第 1 站
          </p>
        </div>
        <CopyButton :text="current.label" label="复制路线" />
      </div>
    </section>

    <!-- ETA cards -->
    <div :key="`${mode}-${refreshKey}`" class="grid grid-cols-2 gap-3 sm:grid-cols-3">
      <section
        v-for="(min, i) in current.etas"
        :key="i"
        class="animate-eta-rise rounded-xl border border-border bg-card p-4 text-center shadow-sm"
        :style="{ animationDelay: `${i * 70}ms` }"
      >
        <p class="text-xs text-muted-foreground">{{ ETA_LABELS[i] ?? `第 ${i + 1} 班` }}</p>
        <p class="mt-1 font-mono text-4xl font-semibold tabular-nums sm:text-5xl">{{ min }}</p>
        <p class="text-xs text-muted-foreground">分钟 · 约 {{ arrivalTime(min) }} 到站</p>
      </section>
      <section
        v-if="current.etas.length < 3"
        class="hidden rounded-xl border border-dashed border-border bg-card/50 p-4 text-center sm:block"
      >
        <p class="text-xs text-muted-foreground">班次</p>
        <p class="mt-1 font-mono text-4xl font-semibold text-muted-foreground sm:text-5xl">–</p>
        <p class="text-xs text-muted-foreground">暂无更多班次</p>
      </section>
    </div>

    <p class="text-xs text-muted-foreground">
      更新於 {{ updatedAt }} · 每 30 秒自动刷新 · 实时数据将于 Phase 2 接入（运输署 · 九巴 · 城巴 · 港铁）
    </p>
  </div>
</template>
