<script setup lang="ts">
defineProps<{
  eyebrow: string
  title: string
  description: string
  badge?: string
}>()
</script>

<template>
  <header class="space-y-2">
    <p class="text-xs font-medium uppercase tracking-wider text-muted-foreground">
      {{ eyebrow }}
    </p>
    <div class="flex flex-wrap items-center gap-3">
      <h1 class="text-2xl font-semibold tracking-tight">{{ title }}</h1>
      <span
        v-if="badge"
        class="rounded-full border border-border bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground"
      >
        {{ badge }}
      </span>
    </div>
    <p class="max-w-2xl text-sm leading-relaxed text-muted-foreground">{{ description }}</p>
  </header>
</template>
