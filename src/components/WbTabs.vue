<script setup lang="ts">
import { computed, type CSSProperties } from 'vue'

export interface WbTab {
  id: string
  label: string
}

const props = defineProps<{
  tabs: readonly WbTab[]
  modelValue: string
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', value: string): void
}>()

/** Index of the active tab; falls back to the first tab. No DOM measurement. */
const activeIndex = computed((): number => {
  const i = props.tabs.findIndex((t: WbTab): boolean => t.id === props.modelValue)
  return i >= 0 ? i : 0
})

/** Sliding underline, positioned purely by percentage of the tab count. */
const indicatorStyle = computed((): CSSProperties => {
  const n = props.tabs.length
  if (n === 0) return { display: 'none' }
  return {
    left: `calc(${activeIndex.value} * 100% / ${n})`,
    width: `calc(100% / ${n})`,
  }
})

function select(id: string): void {
  emit('update:modelValue', id)
}
</script>

<template>
  <div role="tablist" class="relative flex border-b border-border">
    <button
      v-for="tab in tabs"
      :key="tab.id"
      type="button"
      role="tab"
      :aria-selected="tab.id === modelValue"
      :class="[
        'relative z-10 flex-1 px-2 pb-2.5 pt-2 text-sm font-medium transition-colors hover:text-foreground',
        tab.id === modelValue ? 'text-foreground' : 'text-muted-foreground',
      ]"
      @click="select(tab.id)"
    >
      {{ tab.label }}
    </button>
    <span class="wb-tabs-indicator" aria-hidden="true" :style="indicatorStyle" />
  </div>
</template>

<style scoped>
.wb-tabs-indicator {
  position: absolute;
  bottom: -1px;
  height: 2px;
  border-radius: 9999px;
  background: hsl(var(--primary));
  transition: left var(--wb-dur-base) var(--wb-ease-out);
}

@media (prefers-reduced-motion: reduce) {
  .wb-tabs-indicator {
    transition: none;
  }
}
</style>
