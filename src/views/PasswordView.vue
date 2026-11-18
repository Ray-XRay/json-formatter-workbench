<script setup lang="ts">
import { computed, ref } from 'vue'
import { Check, ShieldCheck, TriangleAlert } from 'lucide-vue-next'
import CopyButton from '../components/CopyButton.vue'
import PageHeader from '../components/PageHeader.vue'

type PwMode = 'password' | 'mnemonic' | 'numbers'

const MODES: { id: PwMode; label: string }[] = [
  { id: 'password', label: '随机密码' },
  { id: 'mnemonic', label: '助记词' },
  { id: 'numbers', label: '随机数' },
]

const mode = ref<PwMode>('password')

const mainPassword = 'X7$kQ2v!mP9z#wR4t&yU8n'
const altPasswords = [
  'dR8!pL3#sW6@qT2&vN5',
  'mK4$zX9!bQ7#wE2@rT8',
  'pL9#vN2!xK5$wQ8@zM3',
  'tR6!kM3#nB8$jH2@pL5',
]

/* BIP39 官方测试向量：16 字节零熵 → abandon × 11 + about。 */
const mnemonicWords = [
  'abandon',
  'abandon',
  'abandon',
  'abandon',
  'abandon',
  'abandon',
  'abandon',
  'abandon',
  'abandon',
  'abandon',
  'abandon',
  'about',
]
const mnemonicText = computed<string>((): string => mnemonicWords.join(' '))

const numbers = ['482913', '027451', '918204', '635087', '104938']

const checkRows: { label: string; value: string; ok: boolean }[] = [
  { label: '长度', value: '20 字符', ok: true },
  { label: '字符种类', value: '大写 / 小写 / 数字 / 符号，共 4 类', ok: true },
  { label: '熵', value: '98.2 bits', ok: true },
  { label: '常见弱密码', value: '未命中', ok: true },
]
</script>

<template>
  <div class="mx-auto w-full max-w-5xl space-y-6">
    <PageHeader
      eyebrow="工具 · 密码"
      title="密码与助记词"
      description="随机密码、BIP39 助记词与随机数。全部在浏览器本地生成，不上传、不保存。"
      badge="Phase 2 迁移中"
    />

    <div class="inline-flex rounded-lg border border-border bg-muted p-0.5" role="tablist" aria-label="生成模式">
      <button
        v-for="item in MODES"
        :key="item.id"
        type="button"
        role="tab"
        :aria-selected="mode === item.id"
        :class="[
          'rounded-md px-3 py-1.5 text-xs font-medium transition-all',
          mode === item.id ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
        ]"
        @click="mode = item.id"
      >
        {{ item.label }}
      </button>
    </div>

    <!-- Random password -->
    <div v-if="mode === 'password'" class="space-y-4">
      <section class="rounded-xl border border-border bg-card p-4 shadow-sm sm:p-5">
        <div class="flex flex-wrap items-center justify-between gap-2">
          <h2 class="text-sm font-medium">主密码</h2>
          <CopyButton :text="mainPassword" label="复制密码" />
        </div>
        <p class="mt-3 break-all font-mono text-xl leading-relaxed tabular-nums sm:text-2xl">
          {{ mainPassword }}
        </p>
        <div class="mt-4 flex items-center gap-2">
          <div class="flex flex-1 gap-1" aria-label="强度：很强">
            <span v-for="i in 5" :key="i" class="h-1.5 flex-1 rounded-full bg-emerald-500" />
          </div>
          <span class="shrink-0 text-xs font-medium text-emerald-600 dark:text-emerald-400">很强</span>
        </div>
        <div class="mt-3 flex flex-wrap gap-2 text-xs text-muted-foreground">
          <span class="rounded-full border border-border bg-muted px-2 py-0.5">熵 98.2 bits</span>
          <span class="rounded-full border border-border bg-muted px-2 py-0.5">约 3 千年可破解</span>
          <span class="rounded-full border border-border bg-muted px-2 py-0.5">20 字符</span>
          <span class="rounded-full border border-border bg-muted px-2 py-0.5">4 类字符</span>
        </div>
      </section>

      <section class="rounded-xl border border-border bg-card shadow-sm">
        <h2 class="border-b border-border px-4 py-2.5 text-sm font-medium">备选密码</h2>
        <ul class="divide-y divide-border">
          <li
            v-for="pw in altPasswords"
            :key="pw"
            class="flex items-center justify-between gap-3 px-4 py-2.5"
          >
            <span class="break-all font-mono text-sm tabular-nums">{{ pw }}</span>
            <CopyButton :text="pw" />
          </li>
        </ul>
      </section>
    </div>

    <!-- Mnemonic -->
    <div v-if="mode === 'mnemonic'" class="space-y-4">
      <section class="rounded-xl border border-border bg-card p-4 shadow-sm sm:p-5">
        <div class="flex flex-wrap items-center justify-between gap-2">
          <h2 class="text-sm font-medium">助记词 · 12 词</h2>
          <CopyButton :text="mnemonicText" label="复制助记词" />
        </div>
        <div class="mt-4 grid grid-cols-3 gap-2 sm:grid-cols-4">
          <div
            v-for="(word, i) in mnemonicWords"
            :key="i"
            class="rounded-lg border border-border bg-muted/50 px-3 py-2.5"
          >
            <span class="block font-mono text-[10px] text-muted-foreground">{{ i + 1 }}</span>
            <span class="block font-mono text-sm font-medium">{{ word }}</span>
          </div>
        </div>
        <p class="mt-3 text-xs leading-relaxed text-muted-foreground">
          示例为 BIP39 官方测试向量（16 字节零熵），仅用于展示词卡样式。
        </p>
      </section>

      <section
        class="flex gap-3 rounded-xl border border-amber-500/40 bg-amber-500/10 p-4 text-sm"
      >
        <TriangleAlert class="h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400" />
        <p class="leading-relaxed text-amber-900 dark:text-amber-100">
          助记词就是私钥：别截图、别发给别人，抄在纸上保存。
        </p>
      </section>
    </div>

    <!-- Random numbers -->
    <div v-if="mode === 'numbers'" class="space-y-4">
      <section class="rounded-xl border border-border bg-card p-4 shadow-sm sm:p-5">
        <div class="flex flex-wrap items-center justify-between gap-2">
          <h2 class="text-sm font-medium">随机数 · 5 个</h2>
          <CopyButton :text="numbers.join(', ')" label="复制全部" />
        </div>
        <div class="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-5">
          <div
            v-for="n in numbers"
            :key="n"
            class="rounded-lg border border-border bg-muted/50 px-3 py-3 text-center font-mono text-lg font-medium tabular-nums"
          >
            {{ n }}
          </div>
        </div>
        <div class="mt-4 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <span class="rounded-full border border-border bg-muted px-2 py-0.5">范围 0 – 999999</span>
          <span class="rounded-full border border-border bg-muted px-2 py-0.5">已补零到 6 位</span>
          <span class="rounded-full border border-border bg-muted px-2 py-0.5">PIN 快捷：4 位 / 6 位</span>
        </div>
      </section>
    </div>

    <!-- Check my password -->
    <section class="rounded-xl border border-border bg-card shadow-sm">
      <div class="flex items-center gap-2 border-b border-border px-4 py-2.5">
        <ShieldCheck class="h-4 w-4 text-muted-foreground" />
        <h2 class="text-sm font-medium">检查我的密码</h2>
        <span class="ml-auto text-xs text-muted-foreground">示例分析 · 本地计算，不上传</span>
      </div>
      <ul class="divide-y divide-border">
        <li
          v-for="row in checkRows"
          :key="row.label"
          class="flex items-center gap-2 px-4 py-2.5 text-sm"
        >
          <Check class="h-4 w-4 shrink-0 text-emerald-500" />
          <span class="text-muted-foreground">{{ row.label }}</span>
          <span class="ml-auto font-medium">{{ row.value }}</span>
        </li>
        <li class="flex items-center gap-2 px-4 py-2.5 text-sm">
          <Check class="h-4 w-4 shrink-0 text-emerald-500" />
          <span class="text-muted-foreground">强度</span>
          <span class="ml-auto rounded-full bg-emerald-500/15 px-2 py-0.5 text-xs font-medium text-emerald-600 dark:text-emerald-400">
            很强
          </span>
        </li>
      </ul>
    </section>
  </div>
</template>
