<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { Download, History, Image as ImageIcon, Plus, QrCode, X } from 'lucide-vue-next'
import bwipjs from 'bwip-js'
import CopyButton from '../components/CopyButton.vue'
import { useToast } from '../composables/useToast'
import {
  EC_OPTIONS,
  FORMATS,
  GS1_SPLIT_KEY,
  GS1_TEMPLATE_KEY,
  SIZE_KEY,
  SIZE_MAP,
  SIZE_OPTIONS,
  SPLIT_KEY,
  SPLIT_V_KEY,
  isQrSize,
  type QrEcLevel,
  type QrFormat,
  type QrSize,
} from '../lib/qr/constants'
import {
  GS1_DATE_AI,
  GS1_SAMPLE,
  createGs1Param,
  gs1AiName,
  gs1FormatDate,
  loadGs1CustomNames,
  parseGs1,
  rebuildGs1,
  resetGs1CustomNames,
  saveGs1CustomName,
  type Gs1Data,
  type Gs1Param,
} from '../lib/qr/gs1'
import {
  clearQrHistory,
  loadQrHistory,
  saveQrHistory,
  type QrHistoryItem,
} from '../lib/qr/history'
import {
  buildOpts,
  downloadBlob,
  fileName,
  friendlyError,
  qrSvgExact,
  renderQrExact,
  type QrRenderSettings,
} from '../lib/qr/render'
import { safeGet, safeSet } from '../lib/qr/storage'

const { push } = useToast()

/* ---------- 状态 ---------- */
const canvasRef = ref<HTMLCanvasElement | null>(null)
const inputRef = ref<HTMLTextAreaElement | null>(null)
const panesRef = ref<HTMLElement | null>(null)
const paneLeftRef = ref<HTMLElement | null>(null)

function loadSavedSize(): QrSize {
  const saved = safeGet(SIZE_KEY)
  return saved !== null && isQrSize(saved) ? saved : 'medium'
}

const format = ref<QrFormat>('qrcode')
const text = ref('')
const scale = ref<QrSize>(loadSavedSize())
const ec = ref<QrEcLevel>('M')
const showText = ref(true)
const fgColor = ref('#000000')
const bgColor = ref('#ffffff')

type StatusType = 'idle' | 'ok' | 'warn' | 'err'
const statusType = ref<StatusType>('idle')
const statusMessage = ref('就绪')
const statsText = ref('等待生成')
const detailStats = ref('')
const generated = ref(false)

const gs1Data = ref<Gs1Data | null>(null)
const gs1DismissedText = ref<string | null>(null)
const gs1FromTable = ref(false)
const customNames = ref<Record<string, string>>(loadGs1CustomNames())
const historyItems = ref<QrHistoryItem[]>([])
const templateInput = ref('')
const newAi = ref('')
const newValue = ref('')

/* 分隔条：桌面横向拖（qr-wb-split）/ 窄屏纵向拖（qr-wb-split-v），GS1 区纵向拖（qr-wb-gs1-split） */
const leftWidth = ref<number | null>(null)
const leftHeight = ref<number | null>(null)
const gs1Ratio = ref(40)
const isDesktop = ref(false)

const isQr = computed((): boolean => format.value === 'qrcode')
const formatHint = computed((): string => FORMATS[format.value].hint)
const inputStats = computed((): string => `${text.value.length} 字符`)
const gs1Params = computed((): Gs1Param[] => gs1Data.value?.params ?? [])
const gs1Visible = computed(
  (): boolean => gs1Data.value !== null && gs1Data.value.params.length > 0,
)
const statusDotClass = computed((): string => {
  switch (statusType.value) {
    case 'ok':
      return 'bg-green-500'
    case 'warn':
      return 'bg-amber-500'
    case 'err':
      return 'bg-red-500'
    default:
      return 'bg-muted-foreground'
  }
})
const leftPaneStyle = computed((): Record<string, string> => {
  if (isDesktop.value) {
    return leftWidth.value !== null
      ? { width: `${leftWidth.value}%`, flex: '0 0 auto' }
      : {}
  }
  return leftHeight.value !== null ? { flex: `0 0 ${leftHeight.value}%` } : {}
})
const gs1PanelStyle = computed((): Record<string, string> => ({
  flex: `0 0 ${gs1Ratio.value}%`,
}))

/* ---------- 渲染 ---------- */
function currentSettings(): QrRenderSettings {
  return {
    format: format.value,
    text: text.value,
    size: scale.value,
    ec: ec.value,
    showText: showText.value,
    fgColor: fgColor.value,
    bgColor: bgColor.value,
  }
}

function render(): void {
  const canvas = canvasRef.value
  if (!canvas) return
  const t = text.value
  if (!t.trim()) {
    generated.value = false
    statsText.value = '等待生成'
    statusType.value = 'idle'
    statusMessage.value = '就绪'
    detailStats.value = ''
    return
  }
  try {
    let modules = 0
    let target = 0
    if (format.value === 'qrcode') {
      target = SIZE_MAP[scale.value].qr
      modules = renderQrExact(canvas, buildOpts(currentSettings()), target)
    } else {
      bwipjs.toCanvas(canvas, buildOpts(currentSettings()))
    }
    generated.value = true
    statsText.value = `${FORMATS[format.value].label} · ${canvas.width} × ${canvas.height} px`
    detailStats.value = `${t.length} 字符`
    if (format.value === 'qrcode' && modules > target) {
      statusType.value = 'warn'
      statusMessage.value = `已生成，但内容太密（${modules} 模块），建议选大一档`
    } else {
      statusType.value = 'ok'
      statusMessage.value = '已生成'
    }
  } catch (e) {
    generated.value = false
    statsText.value = '生成失败'
    statusType.value = 'err'
    statusMessage.value = friendlyError(e)
  }
}

/* ---------- GS1 参数表 ---------- */
function updateGs1Panel(): void {
  if (gs1FromTable.value) return
  const t = text.value
  if (gs1DismissedText.value === t) {
    gs1Data.value = null
    return
  }
  gs1Data.value = parseGs1(t)
}

/** 表格改动后回写输入框并重新生成；写 text 时用 gs1FromTable 拦住重新解析，
 * 否则刚取消勾选的行会立刻被重新解析回来。 */
function gs1TableChanged(): void {
  if (!gs1Data.value) return
  const rebuilt = rebuildGs1(gs1Data.value)
  gs1FromTable.value = true
  text.value = rebuilt
  gs1FromTable.value = false
  render()
}

function gs1NameFor(p: Gs1Param): string {
  return gs1AiName(p.ai, customNames.value)
}

function gs1DateFor(p: Gs1Param): string {
  if (!GS1_DATE_AI.includes(p.ai)) return ''
  return gs1FormatDate(p.value) ?? ''
}

function onGs1AiChange(p: Gs1Param): void {
  p.ai = p.ai.trim()
  gs1TableChanged()
}

function onGs1NameChange(p: Gs1Param, e: Event): void {
  const input = e.target as HTMLInputElement | null
  if (!input) return
  saveGs1CustomName(p.ai, input.value.trim())
  customNames.value = loadGs1CustomNames()
}

function deleteGs1Param(id: number): void {
  if (!gs1Data.value) return
  gs1Data.value.params = gs1Data.value.params.filter((p) => p.id !== id)
  gs1TableChanged()
}

function addGs1Param(): void {
  const ai = newAi.value.trim()
  const value = newValue.value
  if (!ai) {
    push('先填 AI 代码，如 10')
    return
  }
  if (!/^\d{2,4}$/.test(ai)) {
    push('AI 代码是 2–4 位数字')
    return
  }
  if (!gs1Data.value) {
    gs1Data.value = { kind: 'element', base: '', prefix: [], params: [], extraQuery: [] }
  }
  const data = gs1Data.value
  data.params.push(
    createGs1Param(ai, value, data.kind === 'url' ? 'query' : 'element'),
  )
  newAi.value = ''
  newValue.value = ''
  gs1TableChanged()
}

function closeGs1(): void {
  gs1DismissedText.value = text.value
  gs1Data.value = null
}

function onResetGs1Names(): void {
  resetGs1CustomNames()
  customNames.value = {}
  push('AI 显示名称已恢复默认')
}

function importGs1Template(): void {
  const url = templateInput.value.trim()
  if (!url) {
    push('先在导入框里粘贴一条模板 URL')
    return
  }
  safeSet(GS1_TEMPLATE_KEY, url)
  gs1DismissedText.value = null
  text.value = url
  historyItems.value = saveQrHistory(url)
  inputRef.value?.focus()
}

/* ---------- 按钮动作 ---------- */
function doGenerate(): void {
  render()
  updateGs1Panel()
  historyItems.value = saveQrHistory(text.value)
}

function loadSample(): void {
  text.value = FORMATS[format.value].sample
  historyItems.value = saveQrHistory(FORMATS[format.value].sample)
  inputRef.value?.focus()
}

function loadGs1Sample(): void {
  gs1DismissedText.value = null
  text.value = GS1_SAMPLE
  historyItems.value = saveQrHistory(GS1_SAMPLE)
  inputRef.value?.focus()
}

function clearInput(): void {
  text.value = ''
  inputRef.value?.focus()
}

function applyHistoryItem(v: string): void {
  gs1DismissedText.value = null
  text.value = v
  historyItems.value = saveQrHistory(v)
}

function onClearHistory(): void {
  clearQrHistory()
  historyItems.value = []
  push('生成历史已清空')
}

function downloadPng(): void {
  const canvas = canvasRef.value
  if (!canvas || !generated.value) {
    push('没有可下载的内容，先生成一个')
    return
  }
  canvas.toBlob((blob) => {
    if (!blob) {
      push('下载失败')
      return
    }
    const name = fileName(format.value, 'png')
    downloadBlob(blob, name)
    push(`已下载 ${name}`)
  }, 'image/png')
}

function downloadSvg(): void {
  if (!generated.value) {
    push('没有可下载的内容，先生成一个')
    return
  }
  try {
    let svg: string
    if (format.value === 'qrcode') {
      const target = SIZE_MAP[scale.value].qr
      svg = qrSvgExact(buildOpts(currentSettings()), target)
    } else {
      svg = bwipjs.toSVG(buildOpts(currentSettings()))
    }
    const name = fileName(format.value, 'svg')
    downloadBlob(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }), name)
    push(`已下载 ${name}`)
  } catch (e) {
    push(friendlyError(e))
  }
}

function copyImage(): void {
  const canvas = canvasRef.value
  if (!canvas || !generated.value) {
    push('没有可复制的内容，先生成一个')
    return
  }
  if (!window.ClipboardItem || !navigator.clipboard || !navigator.clipboard.write) {
    push('当前浏览器不支持复制图片，改用下载 PNG')
    return
  }
  canvas.toBlob((blob) => {
    if (!blob) {
      push('复制失败')
      return
    }
    navigator.clipboard
      .write([new ClipboardItem({ 'image/png': blob })])
      .then(
        () => push('已复制图片'),
        () => push('复制失败，改用下载 PNG'),
      )
  }, 'image/png')
}

/* ---------- 下拉框（显式收窄，避免把 string 写进联合类型） ---------- */
function onFormatChange(e: Event): void {
  const v = (e.target as HTMLSelectElement | null)?.value
  if (v === 'qrcode' || v === 'code128') format.value = v
}

function onScaleChange(e: Event): void {
  const v = (e.target as HTMLSelectElement | null)?.value
  if (v !== undefined && isQrSize(v)) scale.value = v
}

function onEcChange(e: Event): void {
  const v = (e.target as HTMLSelectElement | null)?.value
  if (v === 'L' || v === 'M' || v === 'Q' || v === 'H') ec.value = v
}

/* ---------- 分隔条拖动 ---------- */
function clampSplit(p: number): number {
  return Math.min(75, Math.max(25, p))
}

function onDividerPointerDown(e: PointerEvent): void {
  const divider = e.currentTarget as HTMLElement | null
  const panes = panesRef.value
  const paneLeft = paneLeftRef.value
  if (!divider || !panes || !paneLeft) return
  e.preventDefault()
  try {
    divider.setPointerCapture(e.pointerId)
  } catch {
    /* 忽略 */
  }
  const vertical = !isDesktop.value
  const rect = panes.getBoundingClientRect()
  const startX = e.clientX
  const startY = e.clientY
  const startW = paneLeft.getBoundingClientRect().width
  const startH = paneLeft.getBoundingClientRect().height
  const onMove = (ev: PointerEvent): void => {
    if (vertical) {
      leftHeight.value = clampSplit(((startH + (ev.clientY - startY)) / rect.height) * 100)
    } else {
      leftWidth.value = clampSplit(((startW + (ev.clientX - startX)) / rect.width) * 100)
    }
  }
  const onUp = (): void => {
    divider.removeEventListener('pointermove', onMove)
    divider.removeEventListener('pointerup', onUp)
    if (vertical) {
      if (leftHeight.value !== null) safeSet(SPLIT_V_KEY, String(leftHeight.value))
    } else if (leftWidth.value !== null) {
      safeSet(SPLIT_KEY, String(leftWidth.value))
    }
  }
  divider.addEventListener('pointermove', onMove)
  divider.addEventListener('pointerup', onUp)
}

function onGs1DividerPointerDown(e: PointerEvent): void {
  const divider = e.currentTarget as HTMLElement | null
  const paneLeft = paneLeftRef.value
  if (!divider || !paneLeft) return
  e.preventDefault()
  try {
    divider.setPointerCapture(e.pointerId)
  } catch {
    /* 忽略 */
  }
  const rect = paneLeft.getBoundingClientRect()
  const onMove = (ev: PointerEvent): void => {
    gs1Ratio.value = Math.min(60, Math.max(15, ((rect.bottom - ev.clientY) / rect.height) * 100))
  }
  const onUp = (): void => {
    divider.removeEventListener('pointermove', onMove)
    divider.removeEventListener('pointerup', onUp)
    safeSet(GS1_SPLIT_KEY, String(gs1Ratio.value))
  }
  divider.addEventListener('pointermove', onMove)
  divider.addEventListener('pointerup', onUp)
}

/* ---------- 联动：输入即生成（flush:'sync'，与 1.x 的同步渲染一致） ---------- */
watch(
  text,
  (): void => {
    render()
    updateGs1Panel()
  },
  { flush: 'sync' },
)

watch([format, scale, ec, showText, fgColor, bgColor], (): void => {
  safeSet(SIZE_KEY, scale.value)
  render()
})

/* ---------- 挂载：恢复本机保存的状态 ---------- */
let mq: MediaQueryList | null = null

function onMqChange(e: MediaQueryListEvent): void {
  isDesktop.value = e.matches
}

onMounted((): void => {
  historyItems.value = loadQrHistory()
  templateInput.value = safeGet(GS1_TEMPLATE_KEY) ?? ''
  const savedSplit = safeGet(SPLIT_KEY)
  if (savedSplit) {
    const pct = clampSplit(Number(savedSplit))
    if (pct) leftWidth.value = pct
  }
  const savedSplitV = safeGet(SPLIT_V_KEY)
  if (savedSplitV) {
    const pct = clampSplit(Number(savedSplitV.replace('%', '')))
    if (pct) leftHeight.value = pct
  }
  const savedGs1 = safeGet(GS1_SPLIT_KEY)
  if (savedGs1) {
    const r = Math.min(60, Math.max(15, Number(savedGs1)))
    if (r) gs1Ratio.value = r
  }
  mq = window.matchMedia('(min-width: 1024px)')
  isDesktop.value = mq.matches
  mq.addEventListener('change', onMqChange)
  render()
})

onUnmounted((): void => {
  mq?.removeEventListener('change', onMqChange)
})

/* ---------- 模板用样式常量 ---------- */
const btnBase =
  'inline-flex items-center justify-center gap-1.5 rounded-md border border-border bg-background px-3 text-sm font-medium transition-colors hover:bg-accent active:scale-95'
const btnPrimary =
  'inline-flex items-center justify-center gap-1.5 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 active:scale-95'
const btnGhostSm =
  'inline-flex h-7 items-center gap-1 rounded-md px-2 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground'
const inputBase =
  'h-9 rounded-md border border-input bg-background px-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring'
const labelBase = 'flex items-center gap-1.5 text-sm text-muted-foreground'
</script>

<template>
  <div class="mx-auto flex w-full max-w-6xl flex-col gap-4">
    <header class="space-y-1">
      <h1 class="flex items-center gap-2 text-xl font-semibold tracking-tight">
        <QrCode class="h-5 w-5" />
        QR / 条码
      </h1>
      <p class="text-sm text-muted-foreground">
        QR Code 二维码与 Code 128 条码，尺寸精确固定 200 / 300 / 400 px，支持 GS1
        Digital Link 参数表。全部在浏览器本地完成，不上传数据。
      </p>
    </header>

    <!-- 工具栏 -->
    <section
      class="flex flex-wrap items-center gap-x-4 gap-y-3 rounded-lg border border-border bg-card p-3 shadow-sm"
    >
      <label :class="labelBase">
        类型
        <select
          :value="format"
          :class="inputBase"
          aria-label="类型"
          @change="onFormatChange"
        >
          <option value="qrcode">QR Code 二维码</option>
          <option value="code128">条码</option>
        </select>
      </label>
      <div class="flex items-center gap-2">
        <button type="button" :class="[btnPrimary, 'h-9']" @click="doGenerate">
          生成
        </button>
        <button type="button" :class="[btnBase, 'h-9']" @click="loadSample">
          载入示例
        </button>
        <button
          type="button"
          :class="[btnBase, 'h-9']"
          title="载入一条 GS1 Digital Link 示例，用参数表生成 GS1 链接与二维码来测试"
          @click="loadGs1Sample"
        >
          GS1 示例
        </button>
      </div>
      <label :class="labelBase">
        大小
        <select
          :value="scale"
          :class="inputBase"
          aria-label="大小"
          @change="onScaleChange"
        >
          <option
            v-for="opt in SIZE_OPTIONS"
            :key="opt.value"
            :value="opt.value"
          >
            {{ opt.label }}
          </option>
        </select>
      </label>
      <label v-if="isQr" :class="labelBase">
        纠错级别
        <select :value="ec" :class="inputBase" aria-label="纠错级别" @change="onEcChange">
          <option v-for="opt in EC_OPTIONS" :key="opt.value" :value="opt.value">
            {{ opt.label }}
          </option>
        </select>
      </label>
      <label v-if="!isQr" :class="labelBase">
        <input v-model="showText" type="checkbox" class="h-4 w-4 accent-primary" />
        显示下方文字
      </label>
      <label :class="labelBase">
        前景
        <input
          v-model="fgColor"
          type="color"
          class="h-9 w-11 cursor-pointer rounded-md border border-input bg-background p-1"
          aria-label="前景色"
        />
      </label>
      <label :class="labelBase">
        背景
        <input
          v-model="bgColor"
          type="color"
          class="h-9 w-11 cursor-pointer rounded-md border border-input bg-background p-1"
          aria-label="背景色"
        />
      </label>
      <span class="flex-1" />
      <div class="flex items-center gap-2">
        <button type="button" :class="[btnBase, 'h-9']" @click="downloadPng">
          <Download class="h-4 w-4" />
          下载 PNG
        </button>
        <button type="button" :class="[btnBase, 'h-9']" @click="downloadSvg">
          <Download class="h-4 w-4" />
          下载 SVG
        </button>
        <button type="button" :class="[btnBase, 'h-9']" @click="copyImage">
          <ImageIcon class="h-4 w-4" />
          复制图片
        </button>
        <CopyButton :text="text" label="复制文本" />
      </div>
    </section>

    <!-- 左右版面 -->
    <section
      ref="panesRef"
      class="flex h-[620px] flex-col overflow-hidden rounded-lg border border-border bg-card shadow-sm lg:h-[calc(100dvh-21rem)] lg:min-h-[520px] lg:flex-row"
    >
      <!-- 左：内容 -->
      <div
        ref="paneLeftRef"
        :style="leftPaneStyle"
        class="flex min-h-0 min-w-0 flex-1 flex-col"
      >
        <div class="flex h-10 shrink-0 items-center gap-2 border-b border-border px-3">
          <span class="text-sm font-medium">内容</span>
          <span class="flex-1" />
          <button type="button" :class="btnGhostSm" @click="clearInput">清空</button>
          <span class="font-mono text-xs tabular-nums text-muted-foreground">{{
            inputStats
          }}</span>
        </div>
        <div class="min-h-0 flex-1">
          <textarea
            ref="inputRef"
            v-model="text"
            spellcheck="false"
            placeholder="输入要编码的内容…"
            class="h-full w-full resize-none bg-transparent p-3 font-mono text-sm leading-relaxed outline-none placeholder:text-muted-foreground"
          />
        </div>
        <p
          class="shrink-0 border-t border-border px-3 py-2 text-xs leading-relaxed text-muted-foreground"
        >
          {{ formatHint }}
        </p>

        <!-- GS1 分隔条 + 参数区 -->
        <div
          v-if="gs1Visible"
          class="h-2 shrink-0 cursor-row-resize touch-none bg-border/50 hover:bg-border"
          title="拖动调整 GS1 参数区的高度"
          @pointerdown="onGs1DividerPointerDown"
        />
        <div
          v-if="gs1Visible"
          :style="gs1PanelStyle"
          class="flex min-h-0 flex-col border-t border-border"
        >
          <div class="flex h-9 shrink-0 items-center gap-2 px-3">
            <span class="text-sm font-medium">GS1 参数</span>
            <span class="text-xs text-muted-foreground"
              >{{ gs1Params.length }} 个参数</span
            >
            <span class="flex-1" />
            <button
              type="button"
              :class="btnGhostSm"
              title="把所有 AI 的显示名称恢复成默认"
              @click="onResetGs1Names"
            >
              恢复默认名称
            </button>
            <button
              type="button"
              :class="btnGhostSm"
              title="收起 GS1 参数"
              @click="closeGs1"
            >
              收起
            </button>
          </div>
          <div class="flex shrink-0 items-center gap-2 px-3 pb-2">
            <input
              v-model="templateInput"
              type="text"
              placeholder="粘贴模板 URL 导入，如 https://…/01/…"
              aria-label="GS1 模板 URL"
              spellcheck="false"
              class="h-8 min-w-0 flex-1 rounded-md border border-input bg-background px-2 font-mono text-xs outline-none placeholder:text-muted-foreground"
            />
            <button type="button" :class="[btnBase, 'h-8']" @click="importGs1Template">
              导入模板
            </button>
          </div>
          <div class="min-h-0 flex-1 overflow-y-auto px-2 pb-1">
            <div
              v-for="p in gs1Params"
              :key="p.id"
              :class="[
                'grid grid-cols-[auto_4.25rem_minmax(0,1fr)_minmax(0,1fr)_auto] items-center gap-2 rounded-md px-1 py-1',
                p.enabled ? '' : 'opacity-50',
              ]"
            >
              <input
                v-model="p.enabled"
                type="checkbox"
                class="h-4 w-4 accent-primary"
                aria-label="启用此参数"
                @change="gs1TableChanged"
              />
              <input
                v-model="p.ai"
                type="text"
                class="h-8 w-full rounded-md border border-input bg-background px-1.5 font-mono text-xs outline-none"
                aria-label="AI 代码"
                @change="onGs1AiChange(p)"
              />
              <span class="flex min-w-0 items-center gap-1.5">
                <input
                  :value="gs1NameFor(p)"
                  type="text"
                  class="h-8 min-w-0 flex-1 rounded-md border border-transparent bg-transparent px-1.5 text-xs outline-none hover:border-input focus:border-input"
                  aria-label="AI 显示名称，点一下可改"
                  title="点一下可改这个 AI 的显示名称"
                  @change="(e) => onGs1NameChange(p, e)"
                />
                <span
                  v-if="gs1DateFor(p)"
                  class="shrink-0 font-mono text-[11px] tabular-nums text-muted-foreground"
                  >{{ gs1DateFor(p) }}</span
                >
              </span>
              <input
                v-model="p.value"
                type="text"
                class="h-8 w-full rounded-md border border-input bg-background px-1.5 font-mono text-xs outline-none"
                aria-label="参数值"
                @change="gs1TableChanged"
              />
              <button
                type="button"
                class="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                title="删除此参数"
                @click="deleteGs1Param(p.id)"
              >
                <X class="h-4 w-4" />
              </button>
            </div>
          </div>
          <div class="flex shrink-0 items-center gap-2 border-t border-border px-3 py-2">
            <input
              v-model="newAi"
              type="text"
              placeholder="AI，如 10"
              aria-label="新参数的 AI 代码"
              spellcheck="false"
              class="h-8 w-20 rounded-md border border-input bg-background px-2 font-mono text-xs outline-none placeholder:text-muted-foreground"
            />
            <input
              v-model="newValue"
              type="text"
              placeholder="值"
              aria-label="新参数的值"
              spellcheck="false"
              class="h-8 min-w-0 flex-1 rounded-md border border-input bg-background px-2 font-mono text-xs outline-none placeholder:text-muted-foreground"
            />
            <button type="button" :class="[btnBase, 'h-8']" @click="addGs1Param">
              <Plus class="h-4 w-4" />
              添加
            </button>
          </div>
        </div>

        <!-- 生成历史 -->
        <div v-if="historyItems.length" class="shrink-0 border-t border-border">
          <div class="flex h-9 items-center gap-2 px-3">
            <History class="h-4 w-4 text-muted-foreground" />
            <span class="text-sm font-medium">生成历史</span>
            <span class="flex-1" />
            <button
              type="button"
              :class="btnGhostSm"
              title="清空生成历史"
              @click="onClearHistory"
            >
              清空
            </button>
          </div>
          <div class="max-h-32 overflow-y-auto px-2 pb-2">
            <button
              v-for="item in historyItems"
              :key="item.t + item.v"
              type="button"
              :title="item.v + '（点击重新生成）'"
              class="block w-full truncate rounded px-1 py-1 text-left font-mono text-xs tabular-nums text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              @click="applyHistoryItem(item.v)"
            >
              {{ item.v }}
            </button>
          </div>
        </div>
      </div>

      <!-- 左右分隔条 -->
      <div
        class="h-2 shrink-0 cursor-row-resize touch-none bg-border/50 hover:bg-border lg:h-auto lg:w-2 lg:cursor-col-resize"
        title="拖动调整左右宽度"
        @pointerdown="onDividerPointerDown"
      />

      <!-- 右：预览 -->
      <div class="flex min-h-0 min-w-0 flex-1 flex-col">
        <div class="flex h-10 shrink-0 items-center gap-2 border-b border-border px-3">
          <span class="text-sm font-medium">预览</span>
          <span class="flex-1" />
          <span class="font-mono text-xs tabular-nums text-muted-foreground">{{
            statsText
          }}</span>
        </div>
        <div
          class="flex min-h-0 flex-1 items-center justify-center overflow-auto bg-muted/30 p-4"
        >
          <canvas
            v-show="generated"
            ref="canvasRef"
            class="h-auto w-auto max-w-full"
            style="image-rendering: pixelated"
          />
          <p v-show="!generated" class="text-sm text-muted-foreground">
            输入内容后自动生成
          </p>
        </div>
      </div>
    </section>

    <!-- 状态栏 -->
    <footer
      class="flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-sm shadow-sm"
    >
      <span :class="['h-2.5 w-2.5 shrink-0 rounded-full', statusDotClass]" />
      <span>{{ statusMessage }}</span>
      <span class="flex-1" />
      <span class="font-mono text-xs tabular-nums text-muted-foreground">{{
        detailStats
      }}</span>
    </footer>
  </div>
</template>
