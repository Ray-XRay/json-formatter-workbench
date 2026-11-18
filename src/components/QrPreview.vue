<script setup lang="ts">
import { computed } from 'vue'

const props = withDefaults(defineProps<{ text: string; size?: number }>(), { size: 220 })

/** Deterministic decorative QR-style matrix (preview only — not a real code).
 * 25x25 modules, finder patterns in three corners, the rest from a seeded PRNG. */
const MODULES = 25

function hashSeed(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return (): number => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function inFinder(r: number, c: number): boolean {
  const inCorner = (r0: number, c0: number): boolean =>
    r >= r0 && r < r0 + 7 && c >= c0 && c < c0 + 7
  return inCorner(0, 0) || inCorner(0, MODULES - 7) || inCorner(MODULES - 7, 0)
}

function finderValue(r: number, c: number): boolean {
  const r0 = r < 7 ? 0 : MODULES - 7
  const c0 = c < 7 ? 0 : MODULES - 7
  const dr = r - r0
  const dc = c - c0
  if (dr === 0 || dr === 6 || dc === 0 || dc === 6) return true
  if (dr >= 2 && dr <= 4 && dc >= 2 && dc <= 4) return true
  return false
}

const cells = computed<boolean[]>((): boolean[] => {
  const rand = mulberry32(hashSeed(props.text))
  const out: boolean[] = []
  for (let r = 0; r < MODULES; r++) {
    for (let c = 0; c < MODULES; c++) {
      if (inFinder(r, c)) out.push(finderValue(r, c))
      else out.push(rand() < 0.46)
    }
  }
  return out
})
</script>

<template>
  <div
    class="rounded-lg bg-white p-3 shadow-sm ring-1 ring-black/10"
    :style="{ width: `${size}px`, height: `${size}px` }"
  >
    <div
      class="grid h-full w-full"
      :style="{ gridTemplateColumns: `repeat(${MODULES}, minmax(0, 1fr))` }"
    >
      <div
        v-for="(on, i) in cells"
        :key="i"
        :class="on ? 'bg-zinc-900' : 'bg-white'"
      />
    </div>
  </div>
</template>
