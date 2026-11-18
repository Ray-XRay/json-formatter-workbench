<script setup lang="ts">
import CopyButton from '../components/CopyButton.vue'

const sample = '{\n  "name": "MyWorkbench",\n  "version": "2.0.0-alpha",\n  "tools": ["json-sql", "password", "qr-barcode", "gmb"]\n}'

function triggerError(): void {
  throw new Error('演示错误：JSON / SQL 模块触发了异常（Phase 1 错误边界演示）')
}
</script>

<template>
  <div class="mx-auto w-full max-w-3xl space-y-6">
    <header class="space-y-1">
      <h1 class="text-xl font-semibold tracking-tight">JSON / SQL 工作台</h1>
      <p class="text-sm text-muted-foreground">格式化、压缩、验证与树形视图。Phase 1 骨架，业务逻辑将于 Phase 2 迁移。</p>
    </header>

    <section class="rounded-lg border border-border bg-card p-4 shadow-sm">
      <div class="mb-3 flex items-center justify-between">
        <h2 class="text-sm font-medium">示例</h2>
        <CopyButton :text="sample" label="复制示例" />
      </div>
      <pre class="overflow-x-auto rounded-md bg-muted p-3 font-mono text-[13px] leading-relaxed tabular-nums text-foreground">{{ sample }}</pre>
    </section>

    <section class="rounded-lg border border-border bg-card p-4 shadow-sm">
      <h2 class="text-sm font-medium">错误边界演示</h2>
      <p class="mt-1 text-sm text-muted-foreground">点击下方按钮会抛出一个运行时异常，ErrorBoundary 应捕获并展示降级卡片，「重置模块」可恢复。</p>
      <button
        type="button"
        class="mt-3 inline-flex h-9 items-center rounded-md border border-border bg-background px-3 text-sm font-medium transition-colors hover:bg-accent active:scale-95"
        @click="triggerError"
      >
        测试错误边界
      </button>
    </section>
  </div>
</template>
