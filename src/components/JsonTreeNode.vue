<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { ChevronDown } from 'lucide-vue-next'
import { useToast } from '../composables/useToast'
import {
  highlightSearchHtml,
  nodeSearchHit,
  parseSearchKeywords,
  treeHasMatch,
} from '../lib/jsonsql/jsonCore'
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
  /** Ancestor keys from the root to this node's parent (search path). */
  ancestorKeys?: (string | number)[]
  /** Current expand-all / collapse-all state; newly mounted nodes start here,
   *  so a collapse-all holds for children mounted later by expanding a parent. */
  allExpanded?: boolean
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

/** Ancestor keys for this node's children (own key appended when it has one). */
const childAncestorKeys = computed((): (string | number)[] => {
  const base = props.ancestorKeys ?? []
  return props.nodeKey === undefined ? base : [...base, props.nodeKey]
})

const keywords = computed((): string[] => parseSearchKeywords(props.query))

const selfHit = computed((): boolean => {
  if (keywords.value.length === 0) return false
  return nodeSearchHit(props.value, keywords.value, props.nodeKey, props.ancestorKeys ?? [])
})

const descendantHit = computed((): boolean => {
  if (keywords.value.length === 0) return false
  return entries.value.some(([k, v]) => treeHasMatch(v, props.query, k, childAncestorKeys.value))
})

/** Hidden by search when neither this node nor any descendant matches;
 *  matching nodes keep their ancestors visible. */
const visible = computed((): boolean => keywords.value.length === 0 || selfHit.value || descendantHit.value)

/** A node the user folded by hand during a search stays folded when the
 *  query changes — the old query watch sprang it back open on every keystroke.
 *  Cleared by expanding the node by hand, by expand-all, or by clearing the
 *  search. */
const userCollapsed = ref(false)

const expanded = ref(props.allExpanded ?? true)

watch(
  () => props.query,
  (next) => {
    // Search: auto-expand paths that contain a hit; clearing the search
    // restores the fully-expanded default (mirrors 1.x filterTree('')).
    // A node the user folded by hand during this search is left alone.
    if (!next.trim()) {
      expanded.value = true
      userCollapsed.value = false
    } else if (!userCollapsed.value && (selfHit.value || descendantHit.value)) {
      expanded.value = true
    }
  },
)

watch(
  () => props.toggleSignal,
  (signal) => {
    if (!signal) return
    expanded.value = signal.expand
    // Collapse-all during a search is an explicit fold: remember it so the
    // next keystroke does not spring the node back open. Expand-all clears it.
    userCollapsed.value = !signal.expand && keywords.value.length > 0
  },
)

watch(
  () => props.value,
  () => {
    // A freshly formatted document brings new nodes: start from the current
    // expand-all / collapse-all state and drop the hand-folded mark.
    expanded.value = props.allExpanded ?? true
    userCollapsed.value = false
  },
)

function toggle(): void {
  expanded.value = !expanded.value
  if (!expanded.value && keywords.value.length > 0) userCollapsed.value = true
  else if (expanded.value) userCollapsed.value = false
}

/** Key label with search hits highlighted (quotes stay outside the marks). */
const keyHtml = computed((): string =>
  props.nodeKey === undefined
    ? ''
    : '"' + highlightSearchHtml(String(props.nodeKey), keywords.value) + '"',
)

/** Leaf value with search hits highlighted (string quotes stay outside). */
const valueHtml = computed((): string => {
  const v = props.value
  if (typeof v === 'string') return '"' + highlightSearchHtml(v, keywords.value) + '"'
  return highlightSearchHtml(String(v), keywords.value)
})

async function copyTextToClipboard(text: string): Promise<void> {
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

/** 点值复制值（字符串不带引号）。 */
function copyLeaf(): void {
  void copyTextToClipboard(String(props.value))
}

/** 点键名复制键名原文（不带引号）。 */
function copyKey(): void {
  if (props.nodeKey === undefined) return
  void copyTextToClipboard(String(props.nodeKey))
}

function leafClass(v: JsonValue): string {
  if (typeof v === 'string') return 'text-emerald-700 dark:text-emerald-300'
  if (typeof v === 'number') return 'text-orange-700 dark:text-orange-300'
  if (typeof v === 'boolean') return 'text-violet-700 dark:text-violet-300'
  return 'text-rose-700 dark:text-rose-300'
}
</script>

<template>
  <div v-show="visible" class="font-mono text-[13px] leading-6 tabular-nums">
    <template v-if="!isObj">
      <span class="rounded px-0.5">
        <span
          v-if="nodeKey !== undefined"
          class="cursor-pointer rounded px-0.5 text-sky-700 hover:bg-accent dark:text-sky-300"
          title="点击复制该键名"
          @click="copyKey"
          v-html="keyHtml"
        />
        <span v-if="nodeKey !== undefined">: </span>
        <span
          class="cursor-pointer rounded px-0.5 hover:bg-accent"
          :class="leafClass(value)"
          title="点击复制该值"
          @click="copyLeaf"
          v-html="valueHtml"
        />
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
        <span
          v-if="nodeKey !== undefined"
          class="shrink-0 cursor-pointer rounded px-0.5 text-sky-700 hover:bg-accent dark:text-sky-300"
          title="点击复制该键名"
          @click="copyKey"
          v-html="keyHtml"
        />
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
            :ancestor-keys="childAncestorKeys"
            :all-expanded="allExpanded ?? true"
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
