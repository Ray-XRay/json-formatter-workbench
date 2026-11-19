<script setup lang="ts">
import { computed, onMounted, onUnmounted, reactive, ref, watch } from 'vue'
import CopyButton from '../components/CopyButton.vue'
import WbSpinner from '../components/WbSpinner.vue'
import WbTabs, { type WbTab } from '../components/WbTabs.vue'
import { useToast } from '../composables/useToast'
import { genRandom, randomBits } from '../lib/password/random'
import { analyzePassword, crackTimeText, strengthOf, type PasswordAnalysis, type StrengthTier } from '../lib/password/strength'
import {
  copyMnemonic,
  genMnemonic,
  inspectPastedMnemonic,
  mnemonicBits,
  validateMnemonic,
} from '../lib/password/mnemonic'
import { genNumbers } from '../lib/password/numbers'
import {
  clampOptions,
  restoreOptions,
  saveOptions,
  SPLIT_KEY,
  SPLIT_KEY_V,
  type PasswordMode,
  type PasswordOptions,
} from '../lib/password/options'

const { push } = useToast()

const options = reactive<PasswordOptions>(restoreOptions())

const currentOutput = ref('')
const alts = ref<string[]>([])
const bits = ref(0)
const numInfo = ref<string | null>(null)

type StatusType = 'ok' | 'err' | 'warn' | 'idle'
const status = ref<{ type: StatusType; text: string }>({ type: 'idle', text: '就绪' })

const checkInput = ref('')
const checkShow = ref(false)
const checkAnalysis = ref<PasswordAnalysis | null>(null)

const pasteInput = ref('')
const pasteWords = ref<string[]>([])
const pasteVerdict = ref<{ kind: 'ok' | 'err'; text: string } | null>(null)

let genSeq = 0
let pasteSeq = 0
let checkTimer: number | undefined
let pasteTimer: number | undefined

/* ---------- 移动端：折叠区块开关 + 生成 loading ---------- */
const generating = ref(false)
const pasteOpen = ref(false)
const checkOpen = ref(false)
/* 结果文本每次生成/换备选都重播淡入（输出元素 :key 切换触发 .wb-result-in；
 * 强度条与备选列表不包进 :key，宽度/列表动画才能就地播） */
const resultAnimKey = ref(0)

/* 手机端模式 Tab（WbTabs 发 string，合法值才收）：改 options.mode 即可，
 * 复用下面的 watch(options) 重新生成 */
const passwordModeTabs: WbTab[] = [
  { id: 'random', label: '随机密码' },
  { id: 'mnemonic', label: '助记词' },
  { id: 'number', label: '随机数' },
]

function setMode(mode: string): void {
  if (mode === 'random' || mode === 'mnemonic' || mode === 'number') {
    options.mode = mode
  }
}

/* ---------- 分隔条：横向拖改宽（pw-wb-split），窄屏纵向拖改高（pw-wb-split-v） ---------- */
const panesRef = ref<HTMLElement | null>(null)
const splitPct = ref(50)
const splitPctV = ref(50)

function restoreSplit(): void {
  try {
    const saved = localStorage.getItem(SPLIT_KEY)
    if (saved) {
      const pct = Math.min(75, Math.max(25, Number(saved)))
      if (pct) splitPct.value = pct
    }
    const savedV = localStorage.getItem(SPLIT_KEY_V)
    if (savedV) {
      const pct = Math.min(75, Math.max(25, Number(savedV)))
      if (pct) splitPctV.value = pct
    }
  } catch {
    /* 读不到就用默认 50% */
  }
}
restoreSplit()

function onDividerPointerDown(e: PointerEvent): void {
  e.preventDefault()
  const panes = panesRef.value
  const divider = e.currentTarget as HTMLElement
  if (!panes) return
  const vertical = window.innerWidth < 1024
  const rect = panes.getBoundingClientRect()
  const startX = e.clientX
  const startY = e.clientY
  const startPct = vertical ? splitPctV.value : splitPct.value
  try {
    divider.setPointerCapture(e.pointerId)
  } catch {
    /* 不支持指针捕获时照常拖 */
  }
  function onMove(ev: PointerEvent): void {
    let p: number
    if (vertical) {
      p = startPct + ((ev.clientY - startY) / rect.height) * 100
    } else {
      p = startPct + ((ev.clientX - startX) / rect.width) * 100
    }
    const clamped = Math.min(75, Math.max(25, p))
    if (vertical) splitPctV.value = clamped
    else splitPct.value = clamped
  }
  function onUp(): void {
    divider.removeEventListener('pointermove', onMove)
    divider.removeEventListener('pointerup', onUp)
    try {
      if (vertical) localStorage.setItem(SPLIT_KEY_V, String(splitPctV.value))
      else localStorage.setItem(SPLIT_KEY, String(splitPct.value))
    } catch {
      /* 写不进就下次再用默认 */
    }
  }
  divider.addEventListener('pointermove', onMove)
  divider.addEventListener('pointerup', onUp)
}

/* ---------- 强度 ---------- */
const TIER_STYLE: Record<StrengthTier, { text: string; bar: string }> = {
  weak: { text: 'text-red-500', bar: 'bg-red-500' },
  fair: { text: 'text-amber-500', bar: 'bg-amber-500' },
  strong: { text: 'text-green-500', bar: 'bg-green-500' },
  veryStrong: { text: 'text-sky-500', bar: 'bg-sky-500' },
}

const strength = computed(() => strengthOf(bits.value))
const strengthTextClass = computed(() => TIER_STYLE[strength.value.tier].text)
const strengthBarClass = computed(() => TIER_STYLE[strength.value.tier].bar)
const strengthWidth = computed(() => Math.min(100, Math.round(bits.value)) + '%')

const statusDotClass = computed(() => {
  if (status.value.type === 'ok') return 'bg-green-500'
  if (status.value.type === 'err') return 'bg-red-500'
  if (status.value.type === 'warn') return 'bg-amber-500'
  return 'bg-muted-foreground'
})

function setStatus(type: StatusType, text: string): void {
  status.value = { type, text }
}

/* ---------- 生成 ---------- */
function applyList(list: string[], b: number): void {
  currentOutput.value = list[0] ?? ''
  alts.value = list.slice(1)
  bits.value = b
  numInfo.value = null
  setStatus('ok', '已生成')
}

/* 生成按钮 loading 态：同步模式瞬间完成，只对异步的助记词真正显示；
 * 返回值表示是否有异步任务在跑（true 时由任务完成后再关 loading）。 */
/** 让出两帧再算：生成按钮的 spinner 先画出来，否则同步生成瞬间完成、
 * loading 永远看不到。 */
function nextFrame(): Promise<void> {
  return new Promise<void>((resolve) => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => resolve())
    })
  })
}

async function generate(): Promise<void> {
  generating.value = true
  resultAnimKey.value += 1
  await nextFrame()
  const asyncPending = generateInner()
  if (!asyncPending) generating.value = false
}

function generateInner(): boolean {
  const seq = ++genSeq
  const o = clampOptions(options)
  if (o.mode === 'random' && !o.upper && !o.lower && !o.digits && !o.symbols) {
    options.lower = true
    push('至少要选一种字符，已自动勾上小写字母')
    return false
  }
  if (o.mode === 'number') {
    if (o.numMin > o.numMax) {
      options.numMin = o.numMax
      options.numMax = o.numMin
      push('最小值大于最大值，已自动交换')
      return false
    }
    try {
      const nums = genNumbers(o)
      if (seq !== genSeq) return false
      currentOutput.value = nums.join(', ')
      alts.value = []
      bits.value = 0
      const range = o.numMax - o.numMin + 1
      const perBits = Math.log(range) / Math.log(2)
      numInfo.value =
        '范围 ' +
        o.numMin +
        '–' +
        o.numMax +
        ' · 每个数约 ' +
        perBits.toFixed(1) +
        ' 位熵 · ' +
        nums.length +
        ' 个数共约 ' +
        (perBits * nums.length).toFixed(1) +
        ' 位熵'
      setStatus('ok', '已生成')
    } catch (e: unknown) {
      if (seq !== genSeq) return false
      const msg =
        e instanceof Error && e.message === 'range too big'
          ? '范围太大（超过 2^32），请缩小'
          : '这个浏览器不支持安全随机数，无法生成'
      setStatus('err', msg)
      push(msg)
    }
    return false
  }
  if (o.mode === 'mnemonic') {
    let jobs: Promise<string>[]
    try {
      jobs = Array.from({ length: 5 }, (): Promise<string> => genMnemonic(o.mnemonicWords))
    } catch {
      setStatus('err', '这个浏览器不支持安全随机数，无法生成')
      push('这个浏览器不支持安全随机数')
      return false
    }
    Promise.all(jobs).then(
      (list: string[]): void => {
        if (seq !== genSeq) return
        applyList(list, mnemonicBits(o.mnemonicWords))
        generating.value = false
      },
      (): void => {
        if (seq !== genSeq) return
        setStatus('err', '这个浏览器不支持安全随机数，无法生成')
        push('这个浏览器不支持安全随机数')
        generating.value = false
      },
    )
    return true
  }
  try {
    const list: string[] = []
    for (let j = 0; j < 5; j++) {
      const pw = genRandom(o)
      if (pw !== null) list.push(pw)
    }
    applyList(list, randomBits(o))
  } catch {
    setStatus('err', '这个浏览器不支持安全随机数，无法生成')
    push('这个浏览器不支持安全随机数')
  }
  return false
}

watch(
  options,
  (): void => {
    saveOptions(options)
    generate()
  },
  { deep: true },
)

function setPin(digits: number): void {
  options.numMin = 0
  options.numMax = digits === 4 ? 9999 : 999999
  options.numPad = true
  options.numPadDigits = digits
  saveOptions(options)
  generate()
  push('已设为 ' + digits + ' 位 PIN')
}

function swapAlt(pw: string): void {
  currentOutput.value = pw
  resultAnimKey.value += 1
  setStatus('ok', '已换成备选')
}

/* ---------- 复制 ---------- */
function fallbackCopy(text: string): boolean {
  const ta = document.createElement('textarea')
  ta.value = text
  ta.style.position = 'fixed'
  ta.style.opacity = '0'
  document.body.appendChild(ta)
  ta.select()
  let ok = false
  try {
    ok = document.execCommand('copy')
  } catch {
    ok = false
  }
  document.body.removeChild(ta)
  return ok
}

function copyPlain(text: string, done: (ok: boolean) => void): void {
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(
      (): void => {
        done(true)
      },
      (): void => {
        done(fallbackCopy(text))
      },
    )
  } else {
    done(fallbackCopy(text))
  }
}

const copyLabel = computed((): string => {
  if (options.mode === 'mnemonic') return '复制助记词'
  if (options.mode === 'number') return '复制全部数字'
  return '复制密码'
})

function copyOutput(): void {
  if (!currentOutput.value) {
    push('先生成一个')
    return
  }
  const what = options.mode === 'mnemonic' ? '助记词' : options.mode === 'number' ? '数字' : '密码'
  function done(ok: boolean): void {
    if (ok) {
      push('已复制' + what)
      setStatus('ok', '已复制' + what)
    } else {
      push('复制失败，请手动选中复制')
      setStatus('warn', '复制失败，请手动选中复制')
    }
  }
  if (options.mode === 'mnemonic') {
    copyMnemonic(currentOutput.value, done)
    return
  }
  copyPlain(currentOutput.value, done)
}

function copyPasted(): void {
  const text = pasteWords.value.join(' ')
  if (!text) return
  copyMnemonic(text, (ok: boolean): void => {
    if (ok) {
      push('已复制助记词')
      setStatus('ok', '已复制助记词')
    } else {
      push('复制失败，请手动选中复制')
      setStatus('warn', '复制失败，请手动选中复制')
    }
  })
}

/* ---------- 检查我的密码：输入即算（200ms 防抖），只在浏览器里算 ---------- */
watch(checkInput, (): void => {
  if (checkTimer !== undefined) window.clearTimeout(checkTimer)
  checkTimer = window.setTimeout((): void => {
    checkTimer = undefined
    checkAnalysis.value = checkInput.value ? analyzePassword(checkInput.value) : null
  }, 200)
})

const checkStrength = computed(() => (checkAnalysis.value ? strengthOf(checkAnalysis.value.bits) : null))
const checkStrengthClass = computed(() =>
  checkStrength.value ? TIER_STYLE[checkStrength.value.tier].text : '',
)

/* ---------- 查看我的助记词：粘贴后 200ms 防抖解析 + 校验 ---------- */
watch(pasteInput, (): void => {
  if (pasteTimer !== undefined) window.clearTimeout(pasteTimer)
  pasteTimer = window.setTimeout((): void => {
    pasteTimer = undefined
    runPasteCheck()
  }, 200)
})

function runPasteCheck(): void {
  const insp = inspectPastedMnemonic(pasteInput.value)
  pasteWords.value = insp.words
  if (!insp.words.length) {
    pasteVerdict.value = null
    return
  }
  if (!insp.countOk) {
    pasteVerdict.value = {
      kind: 'err',
      text: '现在是 ' + insp.words.length + ' 个词，助记词应该是 12 / 15 / 18 / 21 / 24 个词',
    }
    return
  }
  if (insp.badWords.length) {
    pasteVerdict.value = {
      kind: 'err',
      text: '第 ' + insp.badWords.join('、') + ' 个词不在 BIP39 词表里，可能是拼错了',
    }
    return
  }
  const seq = ++pasteSeq
  const joined = insp.words.join(' ')
  validateMnemonic(joined).then((ok: boolean): void => {
    if (seq !== pasteSeq) return
    const bitsCount = (insp.words.length * 11 * 32) / 33
    pasteVerdict.value = ok
      ? {
          kind: 'ok',
          text: '校验通过 · ' + insp.words.length + ' 词 · ' + Math.round(bitsCount) + ' 位熵',
        }
      : { kind: 'err', text: '校验和不通过，可能是抄错了某个词' }
  })
}

const mnemonicWords = computed((): string[] =>
  options.mode === 'mnemonic' ? currentOutput.value.split(' ').filter((w: string): boolean => Boolean(w)) : [],
)

const modeLabel = computed((): string => {
  if (options.mode === 'mnemonic') return '助记词（BIP39）'
  if (options.mode === 'number') return '随机数'
  return '随机密码'
})

function onModeChange(e: Event): void {
  const value = (e.target as HTMLSelectElement).value as PasswordMode
  options.mode = value
}

onMounted((): void => {
  generate()
})

onUnmounted((): void => {
  if (checkTimer !== undefined) window.clearTimeout(checkTimer)
  if (pasteTimer !== undefined) window.clearTimeout(pasteTimer)
})
</script>

<template>
  <div class="mx-auto w-full max-w-5xl space-y-4">
    <header class="space-y-1">
      <h1 class="text-xl font-semibold tracking-tight">密码与助记词</h1>
      <p class="text-sm text-muted-foreground">
        随机密码、BIP39 助记词与随机数，另可检查你自己的密码强度。<span class="max-lg:hidden">全部在浏览器本地生成，不上传、不保存。</span>
      </p>
    </header>

    <!-- 桌面端工具栏：模式下拉 + 生成 + 复制；手机上隐藏，改由 Tab / 设置后生成按钮 / 结果区复制按钮承担 -->
    <section class="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-card p-3 shadow-sm max-lg:hidden">
      <label class="flex items-center gap-2 text-sm">
        模式
        <select
          :value="options.mode"
          aria-label="模式"
          class="h-9 rounded-md border border-input bg-background px-2 text-sm"
          @change="onModeChange"
        >
          <option value="random">随机密码</option>
          <option value="mnemonic">助记词（BIP39）</option>
          <option value="number">随机数</option>
        </select>
      </label>
      <button
        type="button"
        :disabled="generating"
        class="inline-flex h-9 items-center gap-2 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 active:scale-95 disabled:opacity-70"
        @click="generate"
      >
        <WbSpinner v-if="generating" size="sm" />
        {{ generating ? '生成中…' : '生成' }}
      </button>
      <CopyButton
        v-if="options.mode !== 'mnemonic' && currentOutput"
        :text="currentOutput"
        :label="copyLabel"
      />
      <button
        v-if="options.mode !== 'mnemonic' && !currentOutput"
        type="button"
        disabled
        class="inline-flex h-8 cursor-not-allowed items-center gap-1.5 rounded-md border border-border bg-background px-2.5 text-sm font-medium opacity-50"
      >
        {{ copyLabel }}
      </button>
      <button
        v-if="options.mode === 'mnemonic'"
        type="button"
        :disabled="!currentOutput"
        class="inline-flex h-8 items-center gap-1.5 rounded-md border border-border bg-background px-2.5 text-sm font-medium transition-all hover:bg-accent active:scale-95 disabled:cursor-not-allowed disabled:opacity-50"
        @click="copyOutput"
      >
        复制助记词
      </button>
      <span class="flex-1" />
      <span class="text-xs text-muted-foreground">只在浏览器里生成，不上传、不保存</span>
    </section>

    <!-- 手机端模式 Tab：WbTabs（共享 Tab 栏，滑动指示条），固定在工具栏下方；
         切 Tab 即改 options.mode，复用 watch(options) 联动重新生成 -->
    <WbTabs
      :model-value="options.mode"
      :tabs="passwordModeTabs"
      aria-label="生成模式"
      class="lg:hidden"
      @update:model-value="setMode"
    />

    <div
      ref="panesRef"
      :style="{ '--pw-split': splitPct + '%', '--pw-split-v': splitPctV + '%' }"
      class="flex flex-col gap-4 lg:flex-row lg:flex-wrap lg:gap-x-0 lg:gap-y-4"
    >
      <!-- 左：设置。手机上 section 本身透明（max-lg:contents），
           其子块成为外层容器的 flex 项，用 order 排成 Tab → 设置 → 生成 → 结果 → 隐私提示；
           桌面端 section 仍是左分栏卡片，不动。
           「查看我的助记词」「检查我的密码」是独立卡片（见结果区下方），
           手机上 order-4、桌面端另起满宽一行，默认收起。 -->
      <section
        class="min-w-0 rounded-lg border border-border bg-card p-4 shadow-sm max-lg:contents lg:w-[var(--pw-split)] lg:shrink-0 lg:space-y-5 lg:overflow-y-auto"
      >
        <!-- 设置卡片：手机上是独立卡片（order-1）；桌面端这层透明（lg:contents） -->
        <div
          class="space-y-5 max-lg:order-1 max-lg:rounded-lg max-lg:border max-lg:border-border max-lg:bg-card max-lg:p-4 max-lg:shadow-sm lg:contents"
        >
          <h2 class="text-sm font-medium">设置</h2>

          <Transition name="wb-fade" mode="out-in">
            <div v-if="options.mode === 'random'" class="space-y-2">
              <label class="flex items-center gap-3 text-sm">
                长度
                <input
                  v-model.number="options.length"
                  type="range"
                  min="8"
                  max="64"
                  step="1"
                  aria-label="密码长度"
                  class="wb-length-slider min-w-0 flex-1 accent-primary"
                />
                <input
                  v-model.number="options.length"
                  type="number"
                  min="8"
                  max="64"
                  step="1"
                  aria-label="密码长度数字"
                  class="h-8 w-16 rounded-md border border-input bg-background px-2 font-mono text-sm tabular-nums"
                />
              </label>
              <p class="text-xs text-muted-foreground">8–64 位，当前 {{ options.length }} 位</p>
            </div>
          </Transition>

          <Transition name="wb-fade" mode="out-in">
            <div v-if="options.mode === 'random'" class="space-y-2">
              <p class="text-sm">字符集</p>
              <div class="grid grid-cols-2 gap-2">
                <label class="flex items-center gap-2 text-sm">
                  <input v-model="options.upper" type="checkbox" class="h-4 w-4 accent-primary" />
                  大写字母 A–Z
                </label>
                <label class="flex items-center gap-2 text-sm">
                  <input v-model="options.lower" type="checkbox" class="h-4 w-4 accent-primary" />
                  小写字母 a–z
                </label>
                <label class="flex items-center gap-2 text-sm">
                  <input v-model="options.digits" type="checkbox" class="h-4 w-4 accent-primary" />
                  数字 0–9
                </label>
                <label class="flex items-center gap-2 text-sm">
                  <input v-model="options.symbols" type="checkbox" class="h-4 w-4 accent-primary" />
                  符号 !@#$%^&amp;*
                </label>
              </div>
            </div>
          </Transition>

          <Transition name="wb-fade" mode="out-in">
            <label v-if="options.mode === 'random'" class="flex items-center gap-2 text-sm">
              <input v-model="options.excludeAmbiguous" type="checkbox" class="h-4 w-4 accent-primary" />
              排除易混淆字符（0 O 1 l I）
            </label>
          </Transition>

          <Transition name="wb-fade" mode="out-in">
            <div v-if="options.mode === 'mnemonic'" class="space-y-2">
              <label class="flex items-center gap-2 text-sm">
                词数
                <select
                  v-model.number="options.mnemonicWords"
                  aria-label="助记词词数"
                  class="h-9 rounded-md border border-input bg-background px-2 text-sm"
                >
                  <option :value="12">12 词（最常用）</option>
                  <option :value="15">15 词</option>
                  <option :value="18">18 词</option>
                  <option :value="21">21 词</option>
                  <option :value="24">24 词（最安全）</option>
                </select>
              </label>
              <p class="text-xs leading-relaxed text-muted-foreground">
                BIP39 助记词：2048 个官方标准单词，带校验和，12/24 词是钱包最常用的两种。<span class="max-lg:hidden">助记词就是私钥，谁拿到谁就能动你的币——别截图、别发给别人，抄在纸上收好。</span>
              </p>
            </div>
          </Transition>

          <Transition name="wb-fade" mode="out-in">
            <div v-if="options.mode === 'number'" class="space-y-3">
              <div class="flex flex-wrap items-center gap-2 text-sm">
                <span>范围</span>
                <input
                  v-model.number="options.numMin"
                  type="number"
                  aria-label="最小值"
                  class="h-8 w-24 rounded-md border border-input bg-background px-2 font-mono text-sm tabular-nums"
                />
                <span class="text-muted-foreground">到</span>
                <input
                  v-model.number="options.numMax"
                  type="number"
                  aria-label="最大值"
                  class="h-8 w-24 rounded-md border border-input bg-background px-2 font-mono text-sm tabular-nums"
                />
              </div>
              <label class="flex items-center gap-2 text-sm">
                个数
                <input
                  v-model.number="options.numCount"
                  type="number"
                  min="1"
                  max="10"
                  step="1"
                  aria-label="随机数个数"
                  class="h-8 w-16 rounded-md border border-input bg-background px-2 font-mono text-sm tabular-nums"
                />
                <span class="text-xs text-muted-foreground">1–10 个</span>
              </label>
              <label class="flex flex-wrap items-center gap-2 text-sm">
                <input v-model="options.numPad" type="checkbox" class="h-4 w-4 accent-primary" />
                补零到固定位数
                <input
                  v-model.number="options.numPadDigits"
                  type="number"
                  min="1"
                  max="10"
                  step="1"
                  :disabled="!options.numPad"
                  aria-label="补零位数"
                  class="h-8 w-16 rounded-md border border-input bg-background px-2 font-mono text-sm tabular-nums disabled:opacity-50"
                />
              </label>
              <div>
                <p class="mb-2 text-sm">PIN 码快捷</p>
                <div class="flex gap-2">
                  <button
                    type="button"
                    class="inline-flex h-8 items-center rounded-md border border-border bg-background px-3 text-sm font-medium transition-colors hover:bg-accent active:scale-95"
                    @click="setPin(4)"
                  >
                    4 位 PIN
                  </button>
                  <button
                    type="button"
                    class="inline-flex h-8 items-center rounded-md border border-border bg-background px-3 text-sm font-medium transition-colors hover:bg-accent active:scale-95"
                    @click="setPin(6)"
                  >
                    6 位 PIN
                  </button>
                </div>
              </div>
            </div>
          </Transition>

        </div>

        <p class="border-t border-border pt-4 text-xs leading-relaxed text-muted-foreground max-lg:order-5">
          生成的密码、助记词、随机数不会保存到任何地方，刷新页面就消失。用完请存到你自己的密码管理器里；助记词抄在纸上。
        </p>
      </section>

      <!-- 手机端生成按钮：紧跟设置区，全宽 h-11；桌面端用工具栏里的生成按钮 -->
      <button
        type="button"
        :disabled="generating"
        class="inline-flex h-11 w-full items-center justify-center gap-2 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 active:scale-[0.98] disabled:opacity-70 max-lg:order-2 lg:hidden"
        @click="generate"
      >
        <WbSpinner v-if="generating" size="sm" />
        {{ generating ? '生成中…' : '生成' }}
      </button>

      <!-- 分隔条 -->
      <div
        role="separator"
        aria-label="拖动调整左右宽度"
        title="拖动调整左右宽度"
        class="h-2 w-full shrink-0 cursor-row-resize touch-none rounded bg-border transition-colors hover:bg-ring/60 max-lg:hidden lg:h-auto lg:w-2 lg:cursor-col-resize"
        @pointerdown="onDividerPointerDown"
      />

      <!-- 右：结果。手机上紧跟生成按钮（order-3）；结果文本每次生成都用 .wb-result-in
           淡入（输出元素 :key 切换触发，main.css 定义） -->
      <section
        class="min-w-0 flex-1 space-y-4 rounded-lg border border-border bg-card p-4 shadow-sm max-lg:order-3 lg:overflow-y-auto"
      >
        <!-- 手机端复制主按钮（h-11，全宽）；桌面端用工具栏里的复制按钮 -->
        <button
          type="button"
          :disabled="!currentOutput"
          class="inline-flex h-11 w-full items-center justify-center gap-2 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 active:scale-[0.98] disabled:opacity-50 lg:hidden"
          @click="copyOutput"
        >
          {{ copyLabel }}
        </button>
        <div class="flex items-center gap-2">
          <h2 class="text-sm font-medium">结果</h2>
          <span class="flex-1" />
          <span v-if="options.mode !== 'number'" class="shrink-0 text-xs text-muted-foreground tabular-nums whitespace-nowrap">
            {{ Math.round(bits) }} 位熵
          </span>
        </div>

        <button
          v-if="options.mode !== 'mnemonic'"
          :key="resultAnimKey"
          type="button"
          :title="options.mode === 'number' ? '点一下复制全部数字' : '点一下复制密码'"
          aria-label="生成的结果，点一下复制"
          class="wb-result-in block w-full overflow-x-auto whitespace-pre-wrap break-all rounded-md bg-muted p-3 text-left font-mono text-[13px] leading-relaxed tabular-nums transition-colors hover:bg-muted/70"
          @click="copyOutput"
        >
          {{ currentOutput || '点「生成」开始' }}
        </button>

        <div
          v-if="options.mode === 'mnemonic'"
          :key="resultAnimKey"
          title="点一下复制整组助记词"
          class="wb-result-in grid cursor-pointer grid-cols-2 gap-2 sm:grid-cols-3"
          @click="copyOutput"
        >
          <div
            v-for="(word, i) in mnemonicWords"
            :key="i"
            class="flex items-center gap-2 rounded-md border border-border bg-muted/50 px-2.5 py-2"
          >
            <span class="w-4 shrink-0 text-right font-mono text-xs text-muted-foreground tabular-nums">{{ i + 1 }}</span>
            <span class="font-mono text-sm">{{ word }}</span>
          </div>
          <p v-if="!mnemonicWords.length" class="col-span-full text-sm text-muted-foreground">
            点「生成」开始
          </p>
        </div>

        <div v-if="options.mode !== 'number'" class="flex flex-wrap items-center gap-3">
          <div class="h-2 min-w-24 flex-1 overflow-hidden rounded-full bg-muted">
            <div :class="strengthBarClass" :style="{ width: strengthWidth }" class="h-full rounded-full transition-all" />
          </div>
          <span :class="strengthTextClass" class="whitespace-nowrap text-sm font-bold">{{ strength.label }}</span>
          <span class="whitespace-nowrap text-xs text-muted-foreground">{{ crackTimeText(bits) }}</span>
        </div>

        <p v-if="numInfo" class="text-xs text-muted-foreground">{{ numInfo }}</p>

        <div v-if="options.mode !== 'number' && alts.length">
          <p class="mb-2 text-xs text-muted-foreground">备选（点一下换成这个）</p>
          <div v-auto-animate class="space-y-2">
            <button
              v-for="(alt, i) in alts"
              :key="i"
              type="button"
              title="点一下换成这个"
              class="block w-full overflow-x-auto whitespace-nowrap rounded-md border border-border bg-background px-3 py-2 text-left font-mono text-[13px] tabular-nums transition-colors hover:bg-accent"
              @click="swapAlt(alt)"
            >
              {{ alt }}
            </button>
          </div>
        </div>

        <p class="flex items-center gap-2 border-t border-border pt-3 text-xs text-muted-foreground">
          <span
            :class="[statusDotClass, generating ? 'motion-safe:animate-pulse' : '']"
            class="inline-block h-2 w-2 shrink-0 rounded-full"
          />
          {{ status.text }}
          <span class="flex-1" />
          <span class="max-lg:hidden">用浏览器内置的安全随机数生成 · 不上传 · 不保存</span>
        </p>
        <p v-if="options.mode === 'mnemonic'" class="text-xs leading-relaxed text-muted-foreground">
          <span class="max-lg:hidden">当前模式：{{ modeLabel }}。</span>助记词就是私钥，别截图、别发给别人，抄在纸上收好。
        </p>
      </section>

        <div
          v-auto-animate
          class="space-y-2 rounded-lg border border-border bg-card p-4 shadow-sm max-lg:order-4 lg:basis-full"
        >
          <button
            type="button"
            class="flex h-11 w-full items-center justify-between text-sm font-medium"
            :aria-expanded="pasteOpen"
            @click="pasteOpen = !pasteOpen"
          >
            <span>查看我的助记词</span>
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
              class="wb-chevron h-4 w-4 shrink-0"
              :class="pasteOpen ? 'wb-chevron--open' : ''"
              aria-hidden="true"
            >
              <path d="m6 9 6 6 6-6" />
            </svg>
          </button>
          <div v-if="pasteOpen" class="space-y-2">
            <textarea
              v-model="pasteInput"
              placeholder="粘贴你的助记词，单词之间用空格隔开…"
              aria-label="要查看的助记词"
              spellcheck="false"
              autocomplete="off"
              rows="3"
              class="w-full resize-y rounded-md border border-input bg-background px-3 py-2 font-mono text-sm leading-relaxed"
            />
            <div
              v-if="pasteWords.length"
              title="点一下复制这组助记词"
              class="grid cursor-pointer grid-cols-2 gap-2 sm:grid-cols-3"
              @click="copyPasted"
            >
              <div
                v-for="(word, i) in pasteWords"
                :key="i"
                class="flex items-center gap-2 rounded-md border border-border bg-muted/50 px-2.5 py-2"
              >
                <span class="w-4 shrink-0 text-right font-mono text-xs text-muted-foreground tabular-nums">{{ i + 1 }}</span>
                <span class="font-mono text-sm">{{ word }}</span>
              </div>
            </div>
            <p
              v-if="pasteVerdict"
              :class="pasteVerdict.kind === 'ok' ? 'text-green-500' : 'text-red-500'"
              class="text-sm"
            >
              {{ pasteVerdict.text }}
            </p>
            <p class="text-xs leading-relaxed text-muted-foreground">
              <span class="max-lg:hidden">只在浏览器里显示，不保存、不上传；</span>粘贴后按钱包样式排成词卡，还会帮你校验是不是有效的 BIP39 助记词。
            </p>
          </div>
        </div>

        <div
          v-auto-animate
          class="space-y-2 rounded-lg border border-border bg-card p-4 shadow-sm max-lg:order-4 lg:basis-full"
        >
          <button
            type="button"
            class="flex h-11 w-full items-center justify-between text-sm font-medium"
            :aria-expanded="checkOpen"
            @click="checkOpen = !checkOpen"
          >
            <span>检查我的密码</span>
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
              class="wb-chevron h-4 w-4 shrink-0"
              :class="checkOpen ? 'wb-chevron--open' : ''"
              aria-hidden="true"
            >
              <path d="m6 9 6 6 6-6" />
            </svg>
          </button>
          <div v-if="checkOpen" class="space-y-2">
            <div class="flex gap-2">
              <input
                v-model="checkInput"
                :type="checkShow ? 'text' : 'password'"
                placeholder="粘贴你正在用的密码…"
                aria-label="要检查的密码"
                spellcheck="false"
                autocomplete="off"
                class="h-9 min-w-0 flex-1 rounded-md border border-input bg-background px-3 font-mono text-sm"
              />
              <button
                type="button"
                class="inline-flex h-9 shrink-0 items-center rounded-md border border-border bg-background px-3 text-sm font-medium transition-colors hover:bg-accent active:scale-95"
                @click="checkShow = !checkShow"
              >
                {{ checkShow ? '隐藏' : '显示' }}
              </button>
            </div>
            <div v-if="checkAnalysis" class="space-y-1 text-sm">
              <p>
                <span :class="checkStrengthClass" class="font-bold">{{ checkStrength?.label }}</span>
                <span class="text-muted-foreground">
                  · {{ Math.round(checkAnalysis.bits) }} 位熵 ·
                  {{ crackTimeText(checkAnalysis.bits) }}
                </span>
              </p>
              <p v-for="w in checkAnalysis.warnings" :key="w" class="text-red-500">{{ w }}</p>
              <p v-if="!checkAnalysis.warnings.length && checkAnalysis.bits >= 60" class="text-green-500">
                这个密码不错
              </p>
            </div>
            <p class="text-xs leading-relaxed text-muted-foreground">
              <span class="max-lg:hidden">只在浏览器里算，不会上传、不会保存；</span>和最常见的弱密码榜单比对过。
            </p>
          </div>
        </div>
    </div>
  </div>
</template>

<style scoped>
/* 手机上长度滑块 thumb 加大到 28px，触控可拖；只在 lg 以下生效，桌面端保持原生样式。 */
@media (max-width: 1023px) {
  .wb-length-slider {
    -webkit-appearance: none;
    appearance: none;
    height: 28px;
    background: transparent;
  }

  .wb-length-slider::-webkit-slider-runnable-track {
    height: 6px;
    border-radius: 9999px;
    background: hsl(var(--muted));
  }

  .wb-length-slider::-webkit-slider-thumb {
    -webkit-appearance: none;
    appearance: none;
    width: 28px;
    height: 28px;
    margin-top: -11px;
    border-radius: 9999px;
    border: 2px solid hsl(var(--background));
    background: hsl(var(--primary));
    cursor: pointer;
  }

  .wb-length-slider::-moz-range-track {
    height: 6px;
    border-radius: 9999px;
    background: hsl(var(--muted));
  }

  .wb-length-slider::-moz-range-thumb {
    width: 28px;
    height: 28px;
    border-radius: 9999px;
    border: 2px solid hsl(var(--background));
    background: hsl(var(--primary));
    cursor: pointer;
  }
}
</style>
