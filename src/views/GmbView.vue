<script setup lang="ts">
import CopyButton from '../components/CopyButton.vue'

const sample = '87M · 四號貨櫃碼頭 → 葵芳站'
</script>

<template>
  <div class="mx-auto w-full max-w-3xl space-y-6">
    <header class="space-y-1">
      <h1 class="text-xl font-semibold tracking-tight">到站看板</h1>
      <p class="text-sm text-muted-foreground">小巴、巴士与港铁实时到站。Phase 1 骨架，业务逻辑将于 Phase 2 迁移。</p>
    </header>

    <section class="rounded-lg border border-border bg-card p-4 shadow-sm">
      <div class="mb-3 flex items-center justify-between">
        <h2 class="text-sm font-medium">示例路线</h2>
        <CopyButton :text="sample" label="复制路线" />
      </div>
      <pre class="overflow-x-auto rounded-md bg-muted p-3 font-mono text-[13px] leading-relaxed tabular-nums text-foreground">{{ sample }}</pre>
    </section>
  </div>
</template>
