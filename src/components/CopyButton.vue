<script setup lang="ts">
import { onUnmounted, ref } from 'vue'
import { Check, Copy } from 'lucide-vue-next'
import { useToast } from '../composables/useToast'

const props = defineProps<{
  text: string
  label?: string
}>()

const { push } = useToast()

const copied = ref(false)
let resetTimer: number | undefined

function fallbackCopy(text: string): boolean {
  const textarea = document.createElement('textarea')
  textarea.value = text
  textarea.style.position = 'fixed'
  textarea.style.opacity = '0'
  document.body.appendChild(textarea)
  textarea.select()
  let ok = false
  try {
    ok = document.execCommand('copy')
  } catch {
    ok = false
  }
  document.body.removeChild(textarea)
  return ok
}

async function copy(): Promise<void> {
  let ok = false
  try {
    await navigator.clipboard.writeText(props.text)
    ok = true
  } catch {
    ok = fallbackCopy(props.text)
  }
  if (!ok) return

  copied.value = true
  push('已复制到剪贴板')
  if (resetTimer !== undefined) window.clearTimeout(resetTimer)
  resetTimer = window.setTimeout((): void => {
    copied.value = false
    resetTimer = undefined
  }, 1500)
}

onUnmounted((): void => {
  if (resetTimer !== undefined) window.clearTimeout(resetTimer)
})
</script>

<template>
  <button
    type="button"
    :aria-label="label ?? '复制'"
    :title="label ?? '复制'"
    class="inline-flex h-8 items-center gap-1.5 rounded-md border border-border bg-background px-2.5 text-sm font-medium transition-all hover:bg-accent active:scale-95"
    @click="copy"
  >
    <Check v-if="copied" class="h-4 w-4 text-green-500 animate-copy-pop" />
    <Copy v-else class="h-4 w-4" />
    <span v-if="label">{{ copied ? '已复制' : label }}</span>
  </button>
</template>
