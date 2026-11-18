<script setup lang="ts">
import { computed, ref } from 'vue'
import {
  ArrowLeftRight,
  Braces,
  ChevronDown,
  FileCode2,
  History,
  Minimize2,
  Search,
  type LucideIcon,
} from 'lucide-vue-next'
import CopyButton from '../components/CopyButton.vue'
import PageHeader from '../components/PageHeader.vue'

type LangId = 'json' | 'sql' | 'python' | 'go' | 'java'

const LANGS: { id: LangId; label: string }[] = [
  { id: 'json', label: 'JSON' },
  { id: 'sql', label: 'SQL' },
  { id: 'python', label: 'Python' },
  { id: 'go', label: 'Go' },
  { id: 'java', label: 'Java' },
]

const SAMPLES: Record<LangId, string> = {
  json: '{\n  "name": "MyWorkbench",\n  "version": "2.0.0-alpha",\n  "tools": ["json-sql", "password", "qr-barcode", "gmb"],\n  "meta": { "lang": "zh-CN", "dark": true }\n}',
  sql: 'SELECT id, name, price\nFROM products\nWHERE price > 100\nORDER BY price DESC\nLIMIT 10;',
  python: 'def greet(name: str) -> str:\n    return f"Hello, {name}"\n\nprint(greet("MyWorkbench"))',
  go: 'package main\n\nimport "fmt"\n\nfunc main() {\n\tfmt.Println("MyWorkbench 2.0")\n}',
  java: 'public class Main {\n    public static void main(String[] args) {\n        System.out.println("MyWorkbench 2.0");\n    }\n}',
}

const lang = ref<LangId>('json')
const sample = computed<string>((): string => SAMPLES[lang.value])
const lineCount = computed<number>((): number => sample.value.split('\n').length)
const byteSize = computed<number>((): number => new TextEncoder().encode(sample.value).length)

/* Minimal JSON syntax highlighter for the static sample (presentation only). */
function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

const TOKEN_RE =
  /("(?:[^"\\]|\\.)*")(\s*:)?|\b(true|false)\b|\b(null)\b|(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)/g

function highlightJson(src: string): string {
  let out = ''
  let last = 0
  TOKEN_RE.lastIndex = 0
  let m: RegExpExecArray | null
  while ((m = TOKEN_RE.exec(src)) !== null) {
    out += escapeHtml(src.slice(last, m.index))
    const [full, str, colon, bool, nul, num] = m
    if (str !== undefined) {
      out += `<span class="${colon !== undefined ? 'tok-key' : 'tok-string'}">${escapeHtml(str)}</span>`
      if (colon !== undefined) out += escapeHtml(colon)
    } else if (bool !== undefined) {
      out += `<span class="tok-bool">${bool}</span>`
    } else if (nul !== undefined) {
      out += `<span class="tok-null">${nul}</span>`
    } else if (num !== undefined) {
      out += `<span class="tok-number">${num}</span>`
    } else {
      out += escapeHtml(full)
    }
    last = m.index + full.length
  }
  out += escapeHtml(src.slice(last))
  return out
}

const highlighted = computed<string>((): string =>
  lang.value === 'json' ? highlightJson(sample.value) : escapeHtml(sample.value),
)

const FEATURES: { icon: LucideIcon; title: string; desc: string }[] = [
  { icon: Braces, title: '格式化与验证', desc: '一键排版，报错带行列号' },
  { icon: Minimize2, title: '压缩', desc: '去掉空白，最小体积' },
  { icon: Search, title: 'JSONPath 查询', desc: '按路径提取任意节点' },
  { icon: FileCode2, title: '生成类型', desc: 'JSON 转 TypeScript 类型' },
  { icon: ArrowLeftRight, title: 'JSON 对比', desc: '两份 JSON 并排找不同' },
  { icon: History, title: '历史记录', desc: '最近 5 次输入，本机保存' },
]

function triggerError(): void {
  throw new Error('演示错误：JSON / SQL 模块触发了异常（Phase 1 错误边界演示）')
}
</script>

<template>
  <div class="mx-auto w-full max-w-5xl space-y-6">
    <PageHeader
      eyebrow="工具 · JSON / SQL"
      title="JSON / SQL 工作台"
      description="格式化、压缩、验证与树形视图。支持 JSON、SQL、Python、Go、Java 五种语言。"
      badge="Phase 2 迁移中"
    />

    <!-- Language + actions -->
    <div class="flex flex-wrap items-center gap-3">
      <div class="inline-flex rounded-lg border border-border bg-muted p-0.5" role="tablist" aria-label="语言">
        <button
          v-for="item in LANGS"
          :key="item.id"
          type="button"
          role="tab"
          :aria-selected="lang === item.id"
          :class="[
            'rounded-md px-2.5 py-1 text-xs font-medium transition-all',
            lang === item.id ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
          ]"
          @click="lang = item.id"
        >
          {{ item.label }}
        </button>
      </div>
      <span class="text-xs text-muted-foreground">
        示例 · {{ lineCount }} 行 · {{ byteSize }} 字节
      </span>
      <span class="flex-1" />
      <CopyButton :text="sample" label="复制示例" />
    </div>

    <!-- Input + tree -->
    <div class="grid gap-4 lg:grid-cols-2">
      <section class="rounded-xl border border-border bg-card shadow-sm">
        <div class="flex items-center justify-between border-b border-border px-4 py-2.5">
          <h2 class="text-sm font-medium">输入</h2>
          <span class="font-mono text-xs text-muted-foreground">{{ lang.toUpperCase() }}</span>
        </div>
        <pre
          class="overflow-x-auto p-4 font-mono text-[13px] leading-relaxed tabular-nums"
        ><code v-html="highlighted" /></pre>
      </section>

      <section class="rounded-xl border border-border bg-card shadow-sm">
        <div class="flex items-center justify-between border-b border-border px-4 py-2.5">
          <h2 class="text-sm font-medium">树形视图</h2>
          <span class="font-mono text-xs text-muted-foreground">tree</span>
        </div>
        <div v-if="lang === 'json'" class="p-3 font-mono text-[13px] leading-7">
          <div class="flex items-center gap-1 rounded px-1 hover:bg-accent/60">
            <ChevronDown class="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            <span class="tok-punct">{ }</span>
            <span class="ml-1 text-xs text-muted-foreground">根对象 · 5 个键</span>
          </div>
          <div class="flex items-center gap-1 rounded px-1 pl-7 hover:bg-accent/60">
            <span class="tok-key">"name"</span><span class="tok-punct">:</span>
            <span class="tok-string">"MyWorkbench"</span>
          </div>
          <div class="flex items-center gap-1 rounded px-1 pl-7 hover:bg-accent/60">
            <span class="tok-key">"version"</span><span class="tok-punct">:</span>
            <span class="tok-string">"2.0.0-alpha"</span>
          </div>
          <div class="flex items-center gap-1 rounded px-1 pl-7 hover:bg-accent/60">
            <ChevronDown class="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            <span class="tok-key">"tools"</span><span class="tok-punct">:</span>
            <span class="tok-punct">[ ]</span>
            <span class="ml-1 text-xs text-muted-foreground">4 项</span>
          </div>
          <div class="flex items-center gap-1 rounded px-1 pl-12 hover:bg-accent/60">
            <span class="text-muted-foreground">[0]</span>
            <span class="tok-string">"json-sql"</span>
          </div>
          <div class="flex items-center gap-1 rounded px-1 pl-12 hover:bg-accent/60">
            <span class="text-muted-foreground">[1]</span>
            <span class="tok-string">"password"</span>
          </div>
          <div class="flex items-center gap-1 rounded px-1 pl-12 hover:bg-accent/60">
            <span class="text-muted-foreground">[2]</span>
            <span class="tok-string">"qr-barcode"</span>
          </div>
          <div class="flex items-center gap-1 rounded px-1 pl-12 hover:bg-accent/60">
            <span class="text-muted-foreground">[3]</span>
            <span class="tok-string">"gmb"</span>
          </div>
          <div class="flex items-center gap-1 rounded px-1 pl-7 hover:bg-accent/60">
            <ChevronDown class="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            <span class="tok-key">"meta"</span><span class="tok-punct">:</span>
            <span class="tok-punct">{ }</span>
            <span class="ml-1 text-xs text-muted-foreground">2 个键</span>
          </div>
          <div class="flex items-center gap-1 rounded px-1 pl-12 hover:bg-accent/60">
            <span class="tok-key">"lang"</span><span class="tok-punct">:</span>
            <span class="tok-string">"zh-CN"</span>
          </div>
          <div class="flex items-center gap-1 rounded px-1 pl-12 hover:bg-accent/60">
            <span class="tok-key">"dark"</span><span class="tok-punct">:</span>
            <span class="tok-bool">true</span>
          </div>
        </div>
        <div v-else class="flex flex-col items-center gap-2 px-4 py-12 text-center">
          <Braces class="h-8 w-8 text-muted-foreground" />
          <p class="text-sm text-muted-foreground">树形视图仅支持 JSON</p>
          <p class="text-xs text-muted-foreground">切回 JSON 语言查看节点树</p>
        </div>
      </section>
    </div>

    <!-- Feature preview -->
    <section>
      <h2 class="mb-3 text-sm font-medium">功能预览</h2>
      <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <div
          v-for="feature in FEATURES"
          :key="feature.title"
          class="rounded-xl border border-border bg-card p-4 shadow-sm transition-shadow hover:shadow-md"
        >
          <span class="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-muted">
            <component :is="feature.icon" class="h-4 w-4 text-foreground" />
          </span>
          <p class="mt-3 text-sm font-medium">{{ feature.title }}</p>
          <p class="mt-0.5 text-xs leading-relaxed text-muted-foreground">{{ feature.desc }}</p>
        </div>
      </div>
    </section>

    <!-- Error boundary demo -->
    <section class="rounded-xl border border-dashed border-border bg-card/50 p-4">
      <h2 class="text-sm font-medium text-muted-foreground">开发演示</h2>
      <p class="mt-1 text-sm text-muted-foreground">
        点击下方按钮会抛出一个运行时异常，ErrorBoundary 应捕获并展示降级卡片，「重置模块」可恢复。
      </p>
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
