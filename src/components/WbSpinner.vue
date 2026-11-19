<script setup lang="ts">
export type WbSpinnerSize = 'sm' | 'md' | 'lg'

withDefaults(
  defineProps<{
    size?: WbSpinnerSize
  }>(),
  { size: 'md' },
)
</script>

<template>
  <div
    role="status"
    aria-label="載入中"
    :class="['wb-spinner animate-spin', `wb-spinner--${size}`]"
  />
</template>
