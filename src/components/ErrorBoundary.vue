<script setup lang="ts">
import { onErrorCaptured, ref } from 'vue'
import { AlertTriangle } from 'lucide-vue-next'

const hasError = ref(false)
const error = ref<Error | null>(null)
const resetKey = ref(0)

onErrorCaptured((err: unknown): boolean => {
  error.value = err instanceof Error ? err : new Error(String(err))
  hasError.value = true
  return false
})

function reset(): void {
  error.value = null
  hasError.value = false
  resetKey.value += 1
}
</script>

<template>
  <div v-if="!hasError" :key="resetKey">
    <slot />
  </div>
  <div
    v-else
    class="rounded-lg border border-border bg-card p-6 text-center shadow-sm"
  >
    <AlertTriangle class="mx-auto h-8 w-8 text-destructive" />
    <p class="mt-3 text-sm font-medium">这个模块出了点问题</p>
    <p
      v-if="error"
      class="mx-auto mt-2 max-w-full break-words rounded-md bg-muted p-3 text-left font-mono text-xs text-muted-foreground"
    >
      {{ error.message }}
    </p>
    <button
      type="button"
      class="mt-4 h-9 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground active:scale-95"
      @click="reset"
    >
      重置模块
    </button>
  </div>
</template>
