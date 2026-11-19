<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { ChevronDown } from 'lucide-vue-next'
import { useToast } from '../composables/useToast'
import { treeHasMatch } from '../lib/jsonsql/jsonCore'
import { isRecord, type JsonValue } from '../lib/jsonsql/types'

export interface ToggleSignal {
  id: number
  expand: boolean
}

const props = defineProps<{
  value: JsonValue
  nodeKey?: string | number
  query: string
  toggleSignal: ToggleSignal | null
  /** Whether a trailing comma follows this node (not the last sibling). */
  comma?: boolean
}>()

const { push } = useToast()

const isObj = computed((): boolean => props.value !== null && typeof props.value === 'object')

const entries = computed((): [string | number, JsonValue][] => {
  const v = props.value
  if (Array.isArray(v)) return v.map((el, i): [number, JsonValue] => [i, el])
  if (isRecord(v)) return Object.keys(v).map((k): [string, JsonValue] => [k, v[k]])
  return []
})

const typeLabel = computed((): string => {
  const v = props.value
  if (v === null) return 'null'
  if (Array.isArray(v)) return `array · ${v.length} 项`
  if (typeof v === 'object') return `object · ${Object.keys(v).length} 键`
  return typeof v
})

const openBracket = computed((): string => (Array.isArray(props.value) ? '[' : '{'))
const closeBracket = computed((): string => (Array.isArray(props.value) ? ']' : '}'))

const q = computed((): string => props.query.trim().toLowerCase())

const selfHit = computed((): boolean => {
  if (!q.value) return false
  const v = props.value
  if (v !== null && typeof v === 'object') {
    return props.nodeKey === undefined
      ? false
      : `"${props.nodeKey}"`.toLowerCase().includes(q.value)
  }
  const text = typeof v === 'string' ? `"${v}"` : String(v)
  const keyText = props.nodeKey === undefined ? '' : `"${props.nodeKey}"`
  return text.toLowerCase().includes(q.value) || keyText.toLowerCase().includes(q.value)
})

const descendantHit = computed((): boolean => {
  if (!q.value) return false
  return entries.value.some(([k, v]) => treeHasMatch(v, q.value, k))
})

/** Hidden by search when neither this node nor any descendant matches;
 *  matching nodes keep their ancestors visible. */
const visible = computed((): boolean => !q.value || selfHit.value || descendantHit.value)

const expanded = ref(true)

watch(
  () => props.query,
  (next) => {
    // Search: auto-expand paths that contain a hit; clearing the search
    // restores the fully-expanded default (mirrors 1.x filterTree('')).
    if (!next.trim()) expanded.value = true
    else if (selfHit.value || descendantHit.value) expanded.value = true
  },
)

watch(
  () => props.toggleSignal,
  (signal) => {
    if (signal) expanded.value = signal.expand
  },
)

function toggle(): void {
  expanded.value = !expanded.value
}

async function copyLeaf(): Promise<void> {
  const text = String(props.value)
  try {
    await navigator.clipboard.writeText(text)
    push('已复制到剪贴板')
  } catch {
    const ta = document.createElement('textarea')
    ta.value = text
    document.body.appendChild(ta)
    ta.select()
    try {
      document.execCommand('copy')
      push('已复制到剪贴板')
    } catch {
      push('复制失败，请手动选择复制')
    }
    document.body.removeChild(ta)
  }
}

function leafClass(v: JsonValue): string {
  if (typeof v === 'string') return 'text-emerald-700 dark:text-emerald-300'
  if (typeof v === 'number') return 'text-orange-700 dark:text-orange-300'
  if (typeof v === 'boolean') return 'text-violet-700 dark:text-violet-300'
  return 'text-rose-700 dark:text-rose-300'
}

function leafText(v: JsonValue): string {
  if (typeof v === 'string') return `"${v}"`
  return String(v)
}
</script>

<template>
  <div v-show="visible" class="font-mono text-[13px] leading-6 tabular-nums">
    <template v-if="!isObj">
      <span
        class="cursor-pointer rounded px-0.5 hover:bg-accent"
        title="点击复制该值"
        @click="copyLeaf"
      >
        <span v-if="nodeKey !== undefined" class="text-sky-700 dark:text-sky-300">"{{ nodeKey }}"</span>
        <span v-if="nodeKey !== undefined">: </span>
        <span :class="leafClass(value)">{{ leafText(value) }}</span>
        <span v-if="comma">,</span>
      </span>
    </template>
    <template v-else>
      <div class="flex items-baseline gap-1">
        <button
          type="button"
          class="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          :aria-label="expanded ? '折叠' : '展开'"
          @click="toggle"
        >
          <ChevronDown class="wb-chevron h-4 w-4" :class="{ 'wb-chevron--open': expanded }" />
        </button>
        <span v-if="nodeKey !== undefined" class="shrink-0 text-sky-700 dark:text-sky-300">"{{ nodeKey }}"</span>
        <span v-if="nodeKey !== undefined" class="shrink-0">: </span>
        <span class="text-muted-foreground">{{ typeLabel }}</span>
        <span v-if="entries.length === 0">{{ openBracket }}{{ closeBracket }}<span v-if="comma">,</span></span>
        <span v-else>{{ openBracket }}</span>
      </div>
      <div v-if="entries.length > 0" v-auto-animate class="ml-5 border-l border-border pl-3">
        <template v-if="expanded">
          <JsonTreeNode
            v-for="([k, v], idx) in entries"
            :key="String(k)"
            :value="v"
            :node-key="Array.isArray(value) ? undefined : k"
            :query="query"
            :toggle-signal="toggleSignal"
            :comma="idx < entries.length - 1"
          />
        </template>
      </div>
      <div v-if="entries.length > 0" v-show="expanded" class="ml-5 text-muted-foreground">
        {{ closeBracket }}<span v-if="comma">,</span>
      </div>
    </template>
  </div>
</template>

<style scoped>
/* Phase 3：共享 chevron 在减弱动效下不旋转（.wb-chevron 本体在 main.css）。 */
@media (prefers-reduced-motion: reduce) {
  .wb-chevron {
    transition: none;
  }
}
</style>
