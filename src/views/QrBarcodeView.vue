<script setup lang="ts">
import { computed, ref } from 'vue'
import CopyButton from '../components/CopyButton.vue'
import PageHeader from '../components/PageHeader.vue'
import QrPreview from '../components/QrPreview.vue'

type QrFormat = 'qr' | 'code128'
type QrSize = 'small' | 'medium' | 'large'

const content = 'https://example.com/product/012345678905'

const format = ref<QrFormat>('qr')
const size = ref<QrSize>('medium')

const SIZES: { id: QrSize; label: string; px: number; display: number }[] = [
  { id: 'small', label: '小', px: 200, display: 160 },
  { id: 'medium', label: '中', px: 300, display: 220 },
  { id: 'large', label: '大', px: 400, display: 280 },
]

const activeSize = computed(() => SIZES.find((s) => s.id === size.value) ?? SIZES[1])

/** Deterministic bar pattern for the Code 128 preview (presentation only). */
function hashSeed(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

const bars = computed<number[]>((): number[] => {
  let a = hashSeed(content)
  const out: number[] = []
  for (let i = 0; i < 56; i++) {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    const v = ((t ^ (t >>> 14)) >>> 0) / 4294967296
    out.push(v < 0.45 ? 1 : v < 0.8 ? 2 : 3)
  }
  return out
})

interface Gs1Row {
  ai: string
  name: string
  value: string
  enabled: boolean
}

const gs1Rows = ref<Gs1Row[]>([
  { ai: '01', name: '商品标识 GTIN', value: '069012345678905', enabled: true },
  { ai: '10', name: '生产批号', value: 'LOT20261118', enabled: true },
  { ai: '17', name: '有效期', value: '2027-11-18', enabled: false },
])
</script>

<template>
  <div class="mx-auto w-full max-w-5xl space-y-6">
    <PageHeader
      eyebrow="工具 · QR / 条码"
      title="QR / 条码"
      description="QR Code 二维码与 Code 128 条码，含 GS1 参数。二维码尺寸精确固定：小 200、中 300、大 400 像素。"
      badge="Phase 2 迁移中"
    />

    <!-- Controls -->
    <div class="flex flex-wrap items-center gap-3">
      <div class="inline-flex rounded-lg border border-border bg-muted p-0.5" role="tablist" aria-label="格式">
        <button
          type="button"
          role="tab"
          :aria-selected="format === 'qr'"
          :class="[
            'rounded-md px-3 py-1.5 text-xs font-medium transition-all',
            format === 'qr' ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
          ]"
          @click="format = 'qr'"
        >
          QR Code
        </button>
        <button
          type="button"
          role="tab"
          :aria-selected="format === 'code128'"
          :class="[
            'rounded-md px-3 py-1.5 text-xs font-medium transition-all',
            format === 'code128' ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
          ]"
          @click="format = 'code128'"
        >
          条码 · Code 128
        </button>
      </div>

      <div class="inline-flex rounded-lg border border-border bg-muted p-0.5" role="tablist" aria-label="尺寸">
        <button
          v-for="item in SIZES"
          :key="item.id"
          type="button"
          role="tab"
          :aria-selected="size === item.id"
          :class="[
            'rounded-md px-3 py-1.5 text-xs font-medium transition-all',
            size === item.id ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
          ]"
          @click="size = item.id"
        >
          {{ item.label }} {{ item.px }}
        </button>
      </div>

      <span class="flex-1" />
      <CopyButton :text="content" label="复制内容" />
    </div>

    <!-- Content -->
    <section class="rounded-xl border border-border bg-card shadow-sm">
      <div class="flex items-center justify-between border-b border-border px-4 py-2.5">
        <h2 class="text-sm font-medium">内容</h2>
        <span class="font-mono text-xs text-muted-foreground">{{ content.length }} 字符</span>
      </div>
      <p class="break-all px-4 py-3 font-mono text-sm tabular-nums">{{ content }}</p>
    </section>

    <!-- Previews -->
    <div class="grid gap-4 lg:grid-cols-2">
      <section
        :class="[
          'rounded-xl border bg-card p-5 shadow-sm transition-all',
          format === 'qr' ? 'border-primary' : 'border-border',
        ]"
      >
        <h2 class="text-sm font-medium">QR Code 预览</h2>
        <div class="mt-4 flex justify-center">
          <QrPreview :text="content" :size="activeSize.display" />
        </div>
        <p class="mt-4 text-center text-xs leading-relaxed text-muted-foreground">
          {{ activeSize.label }} · {{ activeSize.px }} × {{ activeSize.px }} px<br />
          预览效果，Phase 2 接入真实生成
        </p>
      </section>

      <section
        :class="[
          'rounded-xl border bg-card p-5 shadow-sm transition-all',
          format === 'code128' ? 'border-primary' : 'border-border',
        ]"
      >
        <h2 class="text-sm font-medium">条码预览 · Code 128</h2>
        <div class="mt-4 flex justify-center">
          <div class="rounded-lg bg-white px-4 py-3 shadow-sm ring-1 ring-black/10">
            <div class="flex h-16 items-stretch gap-[2px]">
              <span
                v-for="(w, i) in bars"
                :key="i"
                class="bg-zinc-900"
                :style="{ width: `${w * 2}px` }"
              />
            </div>
            <p class="mt-2 text-center font-mono text-sm tracking-[0.2em] text-zinc-900">
              6 901234 567890
            </p>
          </div>
        </div>
        <p class="mt-4 text-center text-xs leading-relaxed text-muted-foreground">
          模块宽度随尺寸档变化 · 3 / 4 / 6 px<br />
          预览效果，Phase 2 接入真实生成
        </p>
      </section>
    </div>

    <!-- GS1 params -->
    <section class="rounded-xl border border-border bg-card shadow-sm">
      <div class="flex items-center justify-between border-b border-border px-4 py-2.5">
        <h2 class="text-sm font-medium">GS1 参数</h2>
        <span class="rounded-full border border-border bg-muted px-2 py-0.5 text-xs text-muted-foreground">
          GS1 示例
        </span>
      </div>
      <div class="overflow-x-auto">
        <table class="w-full min-w-96 text-sm">
          <thead>
            <tr class="border-b border-border text-left text-xs text-muted-foreground">
              <th class="w-12 px-4 py-2 font-medium">启用</th>
              <th class="w-16 px-2 py-2 font-medium">AI</th>
              <th class="px-2 py-2 font-medium">名称</th>
              <th class="px-4 py-2 font-medium">值</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in gs1Rows" :key="row.ai" class="border-b border-border last:border-0">
              <td class="px-4 py-2.5">
                <input
                  v-model="row.enabled"
                  type="checkbox"
                  :aria-label="`启用 ${row.name}`"
                  class="h-4 w-4 accent-[hsl(var(--primary))]"
                />
              </td>
              <td class="px-2 py-2.5 font-mono text-xs">({{ row.ai }})</td>
              <td class="px-2 py-2.5">{{ row.name }}</td>
              <td class="px-4 py-2.5 font-mono text-xs tabular-nums">{{ row.value }}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p class="border-t border-border px-4 py-2.5 text-xs text-muted-foreground">
        勾选后将拼入 GS1 Digital Link（Phase 2）。
      </p>
    </section>
  </div>
</template>
