<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch, type Ref } from 'vue'
import { Copy } from 'lucide-vue-next'
import CopyButton from '../components/CopyButton.vue'
import JsonTreeNode, { type ToggleSignal } from '../components/JsonTreeNode.vue'
import { useToast } from '../composables/useToast'
import {
  downloadName,
  formatCode,
  indentValue,
  minifySql,
  validateCode,
} from '../lib/jsonsql/codeformat'
import { LANGS, LANG_PLACEHOLDERS, detectLanguage } from '../lib/jsonsql/detect'
import { generateGo, generatePy, generateTs } from '../lib/jsonsql/generate'
import { escapeHtml, highlight, highlightSql } from '../lib/jsonsql/highlight'
import {
  analyze,
  countTreeMatches,
  diffLines,
  evalJsonPath,
  errorPosition,
  fromBase64Url,
  parseJsonPath,
  repairJson,
  sortDeep,
  toBase64Url,
  toYamlLines,
} from '../lib/jsonsql/jsonCore'
import {
  clearDraft,
  clearHistory as clearStoredHistory,
  consumeJsonPageFirstMount,
  isRememberOn,
  loadDraft,
  loadHistory,
  loadLangMode,
  loadSplit,
  loadView,
  saveDraft,
  saveHistory,
  saveLangMode,
  saveSplit,
  saveView,
  setRemember,
} from '../lib/jsonsql/storage'
import { CLEAR_HISTORY_EVENT, useSettings } from '../composables/useSettings'
import { useShortcuts } from '../composables/useShortcuts'
import type {
  DiffOp,
  IndentOption,
  JsonPathMatch,
  JsonValue,
  Lang,
  LangMode,
  OutputMode,
  StatusKind,
  TypeLang,
} from '../lib/jsonsql/types'

const { push } = useToast()

/* ---------- state ---------- */
const inputText = ref('')
const langMode = ref<LangMode>('auto')
const currentLang = ref<Lang>('json')
const indent = ref<IndentOption>('2')
const typeLang = ref<TypeLang>('ts')
const sortKeys = ref(false)
const formatOnPaste = ref(true)
const remember = ref(isRememberOn())
const currentView = ref<'code' | 'tree'>('code')
const lastValue = ref(null) as Ref<JsonValue | null>
const lastFormatted = ref('')
const lastDownloadName = ref('formatted.json')
const outputMode = ref<OutputMode>('json')
const outputStats = ref('等待输入')
const detailStats = ref('')
const statusKind = ref<StatusKind>('idle')
const statusText = ref('就绪')
/** Raw input shown in the output pane after a JSON parse error (1.x wrote the
 *  raw text there without touching lastFormatted). */
const errorRawText = ref<string | null>(null)
const treeSearch = ref('')
const jpBarOpen = ref(false)
const jpResultsOpen = ref(false)
const jpExpr = ref('')
const jpMatches = ref([]) as Ref<JsonPathMatch[]>
const diffPanelOpen = ref(false)
const diffInput = ref('')
const diffOps = ref<DiffOp[] | null>(null)
const diffVisible = ref(false)
const diffStats = ref('')
const moreOpen = ref(false)
/** 手机输出区默认换行显示；关掉则横向滚动（桌面端不受影响）。 */
const wrapOutput = ref(true)
/** 每次出现新结果就 +1，让 <pre> 重建并重播 .wb-result-in 淡入。 */
const resultAnimKey = ref(0)
const historyItems = ref<string[]>([])
const historySelected = ref('')
const splitPct = ref(50)
const sqlFallbackUsed = ref(false)
const treeToggleSignal = ref<ToggleSignal | null>(null)
const treeAllExpanded = ref(true)

const textareaEl = ref<HTMLTextAreaElement | null>(null)
const gutterEl = ref<HTMLDivElement | null>(null)
const panesEl = ref<HTMLDivElement | null>(null)
const dividerEl = ref<HTMLDivElement | null>(null)
const outputEl = ref<HTMLElement | null>(null)
const treeEl = ref<HTMLDivElement | null>(null)
const diffViewEl = ref<HTMLDivElement | null>(null)
const fileInputEl = ref<HTMLInputElement | null>(null)

/* ---------- computed ---------- */
const isJson = computed((): boolean => currentLang.value === 'json')
const canMinify = computed((): boolean => currentLang.value === 'json' || currentLang.value === 'sql')
const minifyTitle = computed((): string =>
  canMinify.value ? '压缩成一行' : `${LANGS[currentLang.value]} 不支持压缩（换行有语法意义）`,
)
const langPlaceholder = computed((): string => LANG_PLACEHOLDERS[currentLang.value])
const outputPlaceholder = computed((): string =>
  currentLang.value === 'json'
    ? '格式化后的 JSON 会显示在这里。'
    : `格式化后的${LANGS[currentLang.value]}代码会显示在这里。`,
)

const outputHtml = computed((): string => {
  if (errorRawText.value !== null)
    return '<code>' + escapeHtml(errorRawText.value) + '</code>'
  if (!lastFormatted.value)
    return '<code>' + escapeHtml(outputPlaceholder.value) + '</code>'
  if (outputMode.value === 'json') return '<code>' + highlight(lastFormatted.value) + '</code>'
  if (outputMode.value === 'text' && currentLang.value === 'sql')
    return '<code>' + highlightSql(lastFormatted.value) + '</code>'
  return '<code>' + escapeHtml(lastFormatted.value) + '</code>'
})

const lineCount = computed((): number => inputText.value.split('\n').length)

/** 新结果出现时重播 .wb-result-in 淡入（<pre> 用 :key 重建触发）。 */
watch(outputHtml, (next: string, prev: string): void => {
  if (next !== prev) resultAnimKey.value++
})
const gutterText = computed((): string => {
  let s = ''
  for (let i = 1; i <= lineCount.value; i++) s += i + '\n'
  return s
})

const treeMatchCount = computed((): number => {
  if (!lastValue.value || !treeSearch.value.trim()) return 0
  return countTreeMatches(lastValue.value, treeSearch.value)
})
const treeSearchHint = computed((): string => {
  if (!treeSearch.value.trim()) return ''
  return treeMatchCount.value > 0 ? `找到 ${treeMatchCount.value} 个匹配` : '没有找到匹配'
})

const statusDotClass = computed((): string => {
  if (statusKind.value === 'ok') return 'bg-green-500'
  if (statusKind.value === 'warn') return 'bg-amber-500'
  if (statusKind.value === 'err') return 'bg-red-500'
  return 'bg-muted-foreground'
})

/* ---------- helpers ---------- */
function setStatus(kind: StatusKind, text: string): void {
  statusKind.value = kind
  statusText.value = text
}

function copyText(text: string, msg = '已复制到剪贴板'): void {
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard
      .writeText(text)
      .then(() => push(msg))
      .catch(() => fallbackCopy(text, msg))
  } else {
    fallbackCopy(text, msg)
  }
}

function fallbackCopy(text: string, msg = '已复制到剪贴板'): void {
  const ta = document.createElement('textarea')
  ta.value = text
  document.body.appendChild(ta)
  ta.select()
  try {
    document.execCommand('copy')
    push(msg)
  } catch {
    push('复制失败，请手动选择复制')
  }
  document.body.removeChild(ta)
}

function setInputValue(v: string): void {
  inputText.value = v
}

let draftTimer: number | undefined
function scheduleDraftSave(): void {
  if (draftTimer !== undefined) window.clearTimeout(draftTimer)
  draftTimer = window.setTimeout((): void => {
    saveDraft(inputText.value)
    draftTimer = undefined
  }, 300)
}

watch(inputText, (): void => {
  scheduleDraftSave()
  // Auto-detect mode: re-guess the language on every input change
  // (typing, paste, file load, draft restore); a manual lock never guesses.
  if (langMode.value === 'auto') {
    const d = detectLanguage(inputText.value)
    if (d && d !== currentLang.value) currentLang.value = d
  }
})

// 树形视图只属于 JSON：语言一切到非 JSON 就强制回代码视图，
// 否则输出区会停在树形占位、看不见格式化结果（1.x 的 updateLangUI 也是这么做的）。
watch(currentLang, (lang: Lang): void => {
  if (lang !== 'json') currentView.value = 'code'
})

function setLang(mode: LangMode): void {
  langMode.value = mode
  saveLangMode(mode)
  if (mode === 'auto') {
    const d = detectLanguage(inputText.value)
    if (d) currentLang.value = d
  } else {
    currentLang.value = mode
  }
}

function onLangModeChange(): void {
  setLang(langMode.value)
  if (inputText.value.trim()) {
    setStatus(
      'idle',
      '已切换到' +
        (langMode.value === 'auto'
          ? '自动检测（当前：' + LANGS[currentLang.value] + '）'
          : LANGS[currentLang.value]) +
        '，点击「格式化」',
    )
  }
}

function onRememberChange(): void {
  setRemember(remember.value)
  if (remember.value) {
    scheduleDraftSave()
    push('已开启记住草稿与历史')
  } else {
    historyItems.value = []
    push('已关闭，已删除本地保存的草稿与历史')
  }
}

function showOutput(
  text: string,
  opts: { mode: OutputMode; download?: string; stats?: string },
): void {
  outputMode.value = opts.mode
  lastFormatted.value = text
  lastDownloadName.value = opts.download ?? 'formatted.json'
  diffVisible.value = false
  errorRawText.value = null
  outputStats.value = opts.stats ?? `${text.length} 字符`
}

function hideDiff(): void {
  diffVisible.value = false
}

/* ---------- core actions ---------- */
function parseInput(): { value: JsonValue; text: string } | null {
  const text = inputText.value
  if (!text.trim()) {
    setStatus('warn', '输入为空，请粘贴 JSON')
    return null
  }
  try {
    return { value: JSON.parse(text) as JsonValue, text }
  } catch (e) {
    const pos = errorPosition(text, e)
    let msg = 'JSON 无效：' + (e instanceof Error ? e.message : String(e))
    if (pos) msg += `（第 ${pos.line} 行，第 ${pos.col} 列）`
    setStatus('err', msg)
    errorRawText.value = text
    outputStats.value = '解析失败'
    detailStats.value = ''
    return null
  }
}

function applyResult(value: JsonValue, mode: 'format' | 'minify'): void {
  const v = sortKeys.value ? sortDeep(value) : value
  const formatted =
    mode === 'minify' ? JSON.stringify(v) : JSON.stringify(v, null, indentValue(indent.value))
  lastValue.value = v
  showOutput(formatted, {
    mode: 'json',
    download: 'formatted.json',
    stats: `${formatted.length} 字符`,
  })
  const st = analyze(v)
  detailStats.value = `键 ${st.keys} 个 · 最大深度 ${st.depth} 层`
  setStatus('ok', mode === 'minify' ? '已压缩' : '格式化成功')
  saveHistory(inputText.value)
  historyItems.value = loadHistory()
}

function doFormat(): void {
  if (currentLang.value !== 'json') {
    const text = inputText.value
    if (!text.trim()) {
      setStatus('warn', '输入为空，请粘贴代码')
      return
    }
    try {
      const res = formatCode(currentLang.value, text, indent.value)
      sqlFallbackUsed.value = res.sqlFallback
      lastValue.value = null
      showOutput(res.text, {
        mode: 'text',
        download: downloadName(currentLang.value),
        stats: `${res.text.length} 字符`,
      })
      // 非 JSON 没有树形视图：格式化成功时强制回代码视图，保证结果可见。
      currentView.value = 'code'
      detailStats.value = `${LANGS[currentLang.value]} · ${res.text.split('\n').length} 行`
      setStatus(
        'ok',
        currentLang.value === 'sql' && sqlFallbackUsed.value
          ? 'SQL 格式化成功（轻量模式：真解析器无法解析这段 SQL，可能是方言语法或语句有误）'
          : `${LANGS[currentLang.value]} 格式化成功`,
      )
      saveHistory(text)
      historyItems.value = loadHistory()
    } catch (e) {
      setStatus('err', e instanceof Error ? e.message : String(e))
    }
    return
  }
  const r = parseInput()
  if (r) applyResult(r.value, 'format')
}

function doMinify(): void {
  if (currentLang.value === 'sql') {
    const sqlText = inputText.value
    if (!sqlText.trim()) {
      push('输入为空，先粘贴 SQL')
      return
    }
    const min = minifySql(sqlText)
    lastValue.value = null
    showOutput(min, { mode: 'text', download: 'query.sql', stats: `${min.length} 字符` })
    // 非 JSON 没有树形视图：压缩成功时强制回代码视图，保证结果可见。
    currentView.value = 'code'
    detailStats.value = 'SQL · 已压成一行'
    setStatus('ok', '已压缩成一行')
    saveHistory(sqlText)
    historyItems.value = loadHistory()
    return
  }
  if (currentLang.value !== 'json') {
    push(`${LANGS[currentLang.value]} 不支持压缩`)
    return
  }
  const r = parseInput()
  if (r) applyResult(r.value, 'minify')
}

function doValidate(): void {
  moreOpen.value = false
  if (currentLang.value !== 'json') {
    const text = inputText.value
    if (!text.trim()) {
      setStatus('warn', '输入为空，请粘贴代码')
      return
    }
    const res = validateCode(currentLang.value, text, indent.value)
    if (res.ok) {
      lastValue.value = null
      lastFormatted.value = text
      outputMode.value = 'text'
      errorRawText.value = null
      diffVisible.value = false
      // 非 JSON 没有树形视图：验证成功时强制回代码视图，保证结果可见。
      currentView.value = 'code'
      setStatus('ok', res.message)
      outputStats.value = '结构正常'
      detailStats.value = `${LANGS[currentLang.value]} · ${text.split('\n').length} 行`
      saveHistory(text)
      historyItems.value = loadHistory()
    } else {
      setStatus('err', res.message)
      outputStats.value = '检查未通过'
      detailStats.value = ''
    }
    return
  }
  const r = parseInput()
  if (!r) return
  const st = analyze(r.value)
  lastValue.value = r.value
  lastFormatted.value = r.text
  outputMode.value = 'json'
  errorRawText.value = null
  diffVisible.value = false
  setStatus('ok', `JSON 有效 · 键 ${st.keys} 个 · 最大深度 ${st.depth} 层`)
  outputStats.value = '有效'
  detailStats.value = `键 ${st.keys} 个 · 最大深度 ${st.depth} 层`
  saveHistory(inputText.value)
  historyItems.value = loadHistory()
}

function doRepair(): void {
  moreOpen.value = false
  const text = inputText.value
  if (!text.trim()) {
    push('输入为空，先粘贴 JSON')
    return
  }
  try {
    const value = repairJson(text)
    setInputValue(JSON.stringify(value, null, indentValue(indent.value)))
    applyResult(value, 'format')
    setStatus('ok', '已修复并格式化')
    push('已修复常见错误并格式化')
  } catch (e) {
    setStatus('err', '修复失败，仍无法解析：' + (e instanceof Error ? e.message : String(e)))
    push('修复失败，请检查输入')
  }
}

function doJsonPath(): void {
  const expr = jpExpr.value
  const r = parseInput()
  if (!r) return
  const tokens = parseJsonPath(expr)
  if (!tokens) {
    setStatus('err', 'JSONPath 表达式不支持，请用 $.a.b[0]、$..key、$.* 这类写法')
    return
  }
  const matches = evalJsonPath(r.value, tokens)
  jpMatches.value = matches
  jpResultsOpen.value = true
  if (matches.length === 0) {
    setStatus('warn', 'JSONPath 查询完成，没有匹配')
    return
  }
  setStatus('ok', `JSONPath 查询完成，${matches.length} 个匹配`)
}

function jpPreview(value: JsonValue): string {
  const preview = JSON.stringify(value)
  if (preview.length > 120) return preview.slice(0, 120) + '…'
  return preview
}

function doGenerateType(): void {
  moreOpen.value = false
  const r = parseInput()
  if (!r) return
  const lang = typeLang.value
  if (lang === 'go') {
    const go = generateGo(r.value)
    showOutput(go, { mode: 'go', download: 'types.go', stats: 'Go 结构体' })
    detailStats.value = '已生成 Go struct'
    setStatus('ok', '已生成 Go 结构体，可复制或下载')
  } else if (lang === 'py') {
    const py = generatePy(r.value)
    showOutput(py, { mode: 'py', download: 'models.py', stats: 'Python dataclass' })
    detailStats.value = '已生成 Python dataclass'
    setStatus('ok', '已生成 Python dataclass，可复制或下载')
  } else {
    const ts = generateTs(r.value)
    showOutput(ts, { mode: 'ts', download: 'types.ts', stats: 'TypeScript 类型' })
    detailStats.value = '已生成类型定义'
    setStatus('ok', '已生成 TypeScript 类型，可复制或下载')
  }
}

function doYaml(): void {
  moreOpen.value = false
  const r = parseInput()
  if (!r) return
  const yaml = toYamlLines(r.value, 0).join('\n')
  showOutput(yaml, { mode: 'yaml', download: 'data.yaml', stats: 'YAML' })
  detailStats.value = '已转为 YAML'
  setStatus('ok', '已转为 YAML，可复制或下载')
}

function doDiff(): void {
  const r = parseInput()
  if (!r) return
  const otherText = diffInput.value
  if (!otherText.trim()) {
    push('请在对比框里粘贴第二份 JSON')
    return
  }
  let other: JsonValue
  try {
    other = JSON.parse(otherText) as JsonValue
  } catch (e) {
    setStatus('err', '第二份 JSON 无效：' + (e instanceof Error ? e.message : String(e)))
    return
  }
  const ind = indentValue(indent.value)
  const a = JSON.stringify(sortKeys.value ? sortDeep(r.value) : r.value, null, ind).split('\n')
  const b = JSON.stringify(sortKeys.value ? sortDeep(other) : other, null, ind).split('\n')
  if (a.length > 2000 || b.length > 2000) {
    push('文件太大，单份请控制在 2000 行以内')
    return
  }
  const ops = diffLines(a, b)
  let add = 0
  let del = 0
  ops.forEach((o) => {
    if (o.t === 'add') add++
    else if (o.t === 'del') del++
  })
  diffOps.value = ops
  diffVisible.value = true
  diffStats.value = `新增 ${add} 行 · 删除 ${del} 行 · 相同 ${ops.length - add - del} 行`
  setStatus('ok', `对比完成：新增 ${add} 行，删除 ${del} 行`)
}

function doEscape(): void {
  moreOpen.value = false
  const text = inputText.value
  if (!text.trim()) {
    push('输入为空，先粘贴内容')
    return
  }
  showOutput(JSON.stringify(text), { mode: 'text', download: 'escaped.txt', stats: '已转义' })
  setStatus('ok', '已转义为 JSON 字符串')
}

function doUnescape(): void {
  moreOpen.value = false
  const text = inputText.value
  if (!text.trim()) {
    push('输入为空，先粘贴内容')
    return
  }
  try {
    const v: unknown = JSON.parse(text)
    if (typeof v !== 'string') {
      push('输入不是一个 JSON 字符串')
      return
    }
    showOutput(v, { mode: 'text', download: 'unescaped.txt', stats: '已还原' })
    setStatus('ok', '已还原转义字符串')
  } catch (e) {
    setStatus('err', '去转义失败：' + (e instanceof Error ? e.message : String(e)))
  }
}

function doShare(): void {
  moreOpen.value = false
  const data = lastFormatted.value || inputText.value
  if (!data.trim()) {
    push('没有可分享的内容，先格式化一次')
    return
  }
  const url = location.origin + location.pathname + '#j=' + toBase64Url(data)
  copyText(url)
  push('分享链接已复制，打开即是这份数据')
}

function loadFromHash(): void {
  const h = location.hash
  if (h.indexOf('#j=') === 0) {
    try {
      const text = fromBase64Url(h.slice(3))
      setInputValue(text)
      doFormat()
      setStatus('ok', '已从分享链接载入数据')
    } catch {
      setStatus('warn', '分享链接解析失败')
    }
  }
}

/* ---------- rich copy (coloured) ---------- */
function isDarkTheme(): boolean {
  return document.documentElement.classList.contains('dark')
}

function buildRichHtml(): string | null {
  if (!lastFormatted.value) return null
  let highlighted: string
  if (outputMode.value === 'json') highlighted = highlight(lastFormatted.value)
  else if (outputMode.value === 'text' && currentLang.value === 'sql')
    highlighted = highlightSql(lastFormatted.value)
  else return null // other languages have no highlighting
  if (
    highlighted.indexOf('<span class="wb-k">') === -1 &&
    highlighted.indexOf('<span class="wb-s">') === -1
  )
    return null
  const dark = isDarkTheme()
  const colors = dark
    ? {
        k: '#82aaff', s: '#ecc48d', n: '#f78c6c', b: '#c792ea', u: '#ff5370',
        p: '#89ddff', c: '#7f8c9b', bg: '#171a21', fg: '#e6e8ec',
      }
    : {
        k: '#1d4ed8', s: '#92400e', n: '#c2410c', b: '#7c3aed', u: '#be123c',
        p: '#475569', c: '#6b7280', bg: '#ffffff', fg: '#1f2937',
      }
  const rich = highlighted
    .replace(/<span class="wb-k">/g, `<span style="color:${colors.k}">`)
    .replace(/<span class="wb-s">/g, `<span style="color:${colors.s}">`)
    .replace(/<span class="wb-n">/g, `<span style="color:${colors.n}">`)
    .replace(/<span class="wb-b">/g, `<span style="color:${colors.b}">`)
    .replace(/<span class="wb-u">/g, `<span style="color:${colors.u}">`)
    .replace(/<span class="wb-p">/g, `<span style="color:${colors.p}">`)
    .replace(/<span class="wb-c">/g, `<span style="color:${colors.c}">`)
  return (
    `<pre style="background:${colors.bg};color:${colors.fg};` +
    `font-family:Menlo,Consolas,'Courier New',monospace;font-size:13px;` +
    `line-height:1.6;margin:0;padding:12px;white-space:pre;"><code>` +
    rich +
    '</code></pre>'
  )
}

function writeRichClipboard(html: string, plain: string, okMsg: string): boolean {
  if (!window.ClipboardItem || !navigator.clipboard || !navigator.clipboard.write) return false
  const item = new ClipboardItem({
    'text/html': new Blob([html], { type: 'text/html' }),
    'text/plain': new Blob([plain], { type: 'text/plain' }),
  })
  navigator.clipboard.write([item]).then(
    () => push(okMsg),
    // 富文本写失败时回落纯文本：如实告诉用户，别用通用提示蒙过去。
    () => copyText(plain, '富文本复制失败，已复制纯文本'),
  )
  return true
}

function copyFormatted(): void {
  if (!lastFormatted.value) {
    push('没有可复制的内容，先格式化一次')
    return
  }
  // JSON and SQL output carry highlighting; everything else is plain text.
  if (outputMode.value !== 'json' && !(outputMode.value === 'text' && currentLang.value === 'sql')) {
    copyText(lastFormatted.value)
    return
  }
  const richHtml = buildRichHtml()
  if (!richHtml || !writeRichClipboard(richHtml, lastFormatted.value, '已复制（带颜色）')) {
    copyText(lastFormatted.value)
  }
}

function fenceLang(): string {
  if (outputMode.value === 'ts') return 'typescript'
  if (outputMode.value === 'yaml') return 'yaml'
  if (outputMode.value === 'go') return 'go'
  if (outputMode.value === 'py') return 'python'
  if (outputMode.value === 'text') return currentLang.value
  return 'json'
}

function copyMarkdown(): void {
  moreOpen.value = false
  if (!lastFormatted.value) {
    push('没有可复制的内容，先格式化一次')
    return
  }
  const lang = fenceLang()
  const fenced = '```' + lang + '\n' + lastFormatted.value + '\n```'
  if (outputMode.value === 'json' || (outputMode.value === 'text' && currentLang.value === 'sql')) {
    const richHtml = buildRichHtml()
    if (richHtml && writeRichClipboard(richHtml, fenced, '已复制 Markdown 代码块')) return
  }
  copyText(fenced)
}

/** 复制到 Jira：只写纯文本 ```lang 围栏，不带 text/html。Jira 编辑器粘贴时优先取
 *  HTML，<pre> 会被转成它自己的无语言代码块、行内颜色被清掉；只有纯文本围栏，
 *  Jira Cloud 粘贴转换才会建成带语言的代码块、由 Jira 自己上色。代码块的颜色是
 *  Jira 自己的高亮，不是粘过去的颜色——这条路本来就带不过去颜色。 */
function copyJira(): void {
  moreOpen.value = false
  if (!lastFormatted.value) {
    push('没有可复制的内容，先格式化一次')
    return
  }
  const lang = fenceLang()
  const fenced = '```' + lang + '\n' + lastFormatted.value + '\n```'
  copyText(fenced, `已复制到 Jira（纯文本）：粘贴后在代码块里选 ${lang} 语言上色`)
}

function downloadJson(): void {
  moreOpen.value = false
  if (!lastFormatted.value) {
    push('没有可下载的内容，先格式化一次')
    return
  }
  const blob = new Blob([lastFormatted.value], { type: 'application/json;charset=utf-8' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = lastDownloadName.value
  a.click()
  window.setTimeout((): void => {
    URL.revokeObjectURL(a.href)
  }, 1000)
  push('已下载 ' + lastDownloadName.value)
}

/* ---------- view / selection / tree ---------- */
function setView(view: 'code' | 'tree'): void {
  currentView.value = view
  saveView(view)
  hideDiff()
}

function onViewTree(): void {
  if (currentLang.value !== 'json') {
    push('树形视图只支持 JSON')
    return
  }
  if (lastValue.value === null) {
    push('先格式化或验证一次，再看树形视图')
    return
  }
  setView('tree')
}

function selectResult(): void {
  if (!lastFormatted.value) return
  let target: HTMLElement | null = null
  if (diffVisible.value) target = diffViewEl.value
  else if (currentView.value === 'tree' && treeEl.value) target = treeEl.value
  else target = outputEl.value?.querySelector('code') ?? outputEl.value
  if (!target || !target.textContent?.trim()) return
  const sel = window.getSelection()
  if (!sel) return
  sel.removeAllRanges()
  const range = document.createRange()
  range.selectNodeContents(target)
  sel.addRange(range)
  push(currentView.value === 'tree' ? '已选中树形内容' : '已选中格式化结果')
}

function toggleAllTree(): void {
  if (currentView.value !== 'tree') return
  treeAllExpanded.value = !treeAllExpanded.value
  treeToggleSignal.value = { id: Date.now(), expand: treeAllExpanded.value }
  push(treeAllExpanded.value ? '已展开全部节点' : '已折叠全部节点')
}

function clearTreeSearchAndFocus(): void {
  treeSearch.value = ''
  const el = document.getElementById('treeSearchInput')
  el?.focus()
}

/* ---------- misc actions ---------- */
function clearAll(): void {
  setInputValue('')
  lastValue.value = null
  lastFormatted.value = ''
  outputMode.value = 'json'
  lastDownloadName.value = 'formatted.json'
  errorRawText.value = null
  diffVisible.value = false
  diffOps.value = null
  outputStats.value = '等待输入'
  detailStats.value = ''
  setStatus('idle', '已清空')
  textareaEl.value?.focus()
}

function pasteClipboard(): void {
  if (navigator.clipboard && navigator.clipboard.readText) {
    navigator.clipboard.readText().then(
      (text) => {
        if (!text) {
          push('剪贴板是空的')
          return
        }
        setInputValue(text)
        scrollPageToTop()
        if (formatOnPaste.value) doFormat()
        else setStatus('idle', '已粘贴，点击「格式化」处理')
      },
      () => {
        push('浏览器不允许直接读取剪贴板，请用 Ctrl+V 粘贴')
        textareaEl.value?.focus()
      },
    )
  } else {
    push('浏览器不支持直接读取剪贴板，请用 Ctrl+V 粘贴')
    textareaEl.value?.focus()
  }
}

function scrollPageToTop(): void {
  // 页面滚动发生在 AppLayout 的 <main>（overflow-y-auto）里，不是 document；
  // 只调 window.scrollTo 滚不动，要把 main 也滚回顶部。
  document.querySelector('main')?.scrollTo(0, 0)
  window.scrollTo(0, 0)
}

function onTextareaPaste(e: ClipboardEvent): void {
  const text = e.clipboardData?.getData('text')
  if (!text) {
    // 拿不到剪贴板文本时走默认粘贴（光标处插入），再按原逻辑自动格式化。
    window.setTimeout((): void => {
      if (formatOnPaste.value) doFormat()
    }, 0)
    return
  }
  // Ctrl+V 整份替换：先清空再粘贴，与「粘贴剪贴板」按钮行为一致，
  // 粘贴后页面滚回顶部。
  e.preventDefault()
  setInputValue(text)
  scrollPageToTop()
  if (formatOnPaste.value) doFormat()
}

function onTextareaScroll(): void {
  if (gutterEl.value && textareaEl.value) gutterEl.value.scrollTop = textareaEl.value.scrollTop
}

function triggerUpload(): void {
  fileInputEl.value?.click()
}

function onFileChange(e: Event): void {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return
  const reader = new FileReader()
  reader.onload = (): void => {
    setInputValue(String(reader.result))
    if (formatOnPaste.value) doFormat()
    else setStatus('idle', '已载入 ' + file.name)
  }
  reader.readAsText(file)
  input.value = ''
}

function onHistorySelect(e: Event): void {
  const idx = (e.target as HTMLSelectElement).value
  if (idx === '') return
  const text = historyItems.value[Number(idx)]
  if (text !== undefined) {
    setInputValue(text)
    doFormat()
  }
  historySelected.value = ''
}

function clearHistory(): void {
  clearStoredHistory()
  historyItems.value = []
  push('已清空历史记录')
}

function onClearHistoryEvent(e: Event): void {
  const scope = (e as CustomEvent<{ scope: string }>).detail?.scope
  if (scope !== 'json' && scope !== 'all') return
  clearStoredHistory()
  clearDraft()
  historyItems.value = []
  historySelected.value = ''
  setInputValue('')
  lastFormatted.value = ''
  push('已清空历史记录与草稿')
}

function openDiffPanel(): void {
  moreOpen.value = false
  diffPanelOpen.value = true
}

function closeDiffPanel(): void {
  diffPanelOpen.value = false
}

function toggleJpBar(): void {
  moreOpen.value = false
  jpBarOpen.value = !jpBarOpen.value
  if (jpBarOpen.value) {
    window.setTimeout((): void => {
      document.getElementById('jsonpathInput')?.focus()
    }, 0)
  }
}

function closeJpResults(): void {
  jpResultsOpen.value = false
  jpMatches.value = []
}

/* ---------- shortcuts ---------- */
/* 注册表与改键逻辑在共享 composable（useShortcuts）；设置弹窗在 AppLayout
 * 里的 WbSettingsDialog，Ctrl+Alt+S 由 AppLayout 全局监听。 */
const {
  shortcuts,
  listeningId,
  shortcutLabel,
  eventCombo,
  captureCombo,
  loadShortcutsIntoRegistry,
} = useShortcuts()
const { open: openSettings } = useSettings()

const footerHint = computed((): string => {
  return `格式化 ${shortcutLabel('format')} · 复制 ${shortcutLabel('copyResult')} · 快捷键设置 ${shortcutLabel('openSettings')}`
})

function runShortcut(id: string): void {
  if (id === 'format') doFormat()
  else if (id === 'selectResult') selectResult()
  else if (id === 'copyResult') copyFormatted()
  else if (id === 'copyMarkdown') copyMarkdown()
  else if (id === 'toggleTree') toggleAllTree()
  // openSettings 由 AppLayout 全局处理，不在这里分发。
}

function onKeydown(e: KeyboardEvent): void {
  // Rebind capture: swallow the next combo, run nothing
  if (listeningId.value) {
    e.preventDefault()
    e.stopPropagation()
    captureCombo(e)
    return
  }
  if (e.key === 'Escape') {
    moreOpen.value = false
    return
  }
  const combo = eventCombo(e)
  if (!combo) return
  const sc = shortcuts.value.find((s) => s.combo === combo)
  if (!sc) return
  // 打开设置由 AppLayout 全局处理（Ctrl+Alt+S 在四页通用）；这里只放行冒泡。
  if (sc.id === 'openSettings') return
  const ae = document.activeElement as HTMLElement | null
  const tag = ae ? ae.tagName : ''
  const editable = !!ae && (ae.isContentEditable || tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT')
  if (editable && !sc.allowEditable) return
  e.preventDefault()
  runShortcut(sc.id)
}

function onDocumentClick(e: MouseEvent): void {
  const target = e.target as HTMLElement | null
  if (moreOpen.value && target && !target.closest('.more-wrap')) moreOpen.value = false
}

/* ---------- more-tools bottom sheet (mobile): swipe down to close ---------- */
let drawerTouchStartY: number | null = null

function onDrawerTouchStart(e: TouchEvent): void {
  drawerTouchStartY = e.touches[0]?.clientY ?? null
}

function onDrawerTouchEnd(e: TouchEvent): void {
  if (drawerTouchStartY === null) return
  const endY = e.changedTouches[0]?.clientY ?? drawerTouchStartY
  const el = e.currentTarget as HTMLElement | null
  // Only a downward swipe from the top of the sheet closes it; scrolling the
  // list itself must not close it.
  if (el && el.scrollTop <= 0 && endY - drawerTouchStartY > 60) moreOpen.value = false
  drawerTouchStartY = null
}

/* ---------- splitter ---------- */
function onDividerDown(e: PointerEvent): void {
  e.preventDefault()
  const divider = dividerEl.value
  const panes = panesEl.value
  if (!divider || !panes) return
  try {
    divider.setPointerCapture(e.pointerId)
  } catch {
    /* pointer capture unsupported — drag still works via move/up listeners */
  }
  const vertical = window.innerWidth < 1024
  const rect = panes.getBoundingClientRect()
  const startX = e.clientX
  const startY = e.clientY
  const startPct = splitPct.value
  const onMove = (ev: PointerEvent): void => {
    let pct: number
    if (vertical) pct = startPct + ((ev.clientY - startY) / rect.height) * 100
    else pct = startPct + ((ev.clientX - startX) / rect.width) * 100
    splitPct.value = Math.min(75, Math.max(25, pct))
  }
  const onUp = (): void => {
    divider.removeEventListener('pointermove', onMove)
    divider.removeEventListener('pointerup', onUp)
    saveSplit(splitPct.value, vertical)
  }
  divider.addEventListener('pointermove', onMove)
  divider.addEventListener('pointerup', onUp)
}

/* ---------- drag & drop ---------- */
function onDragOver(e: DragEvent): void {
  e.preventDefault()
}
function onDrop(e: DragEvent): void {
  e.preventDefault()
  const file = e.dataTransfer?.files?.[0]
  if (!file) return
  const reader = new FileReader()
  reader.onload = (): void => {
    setInputValue(String(reader.result))
    doFormat()
  }
  reader.readAsText(file)
}

/* ---------- lifecycle ---------- */
onMounted((): void => {
  setLang(loadLangMode())
  // 记住上次选的视图：只在当前语言是 JSON 时恢复树形（非 JSON 会强制回代码视图）。
  if (currentLang.value === 'json' && loadView() === 'tree') currentView.value = 'tree'
  loadShortcutsIntoRegistry()
  historyItems.value = loadHistory()
  const split = loadSplit()
  if (split.pct !== null) splitPct.value = split.pct
  document.addEventListener('keydown', onKeydown)
  document.addEventListener('click', onDocumentClick)
  window.addEventListener(CLEAR_HISTORY_EVENT, onClearHistoryEvent)
  // 草稿：新开页面 / 刷新进来时输入框与输出保持空白，不恢复上次草稿；旧草稿
  // 一并清掉，免得会话内切回时又冒出来。分享链接 (#j=) 不受影响，下面照常载入。
  // 同一次会话内切到别的工具再切回 JSON 页时，恢复草稿（旧行为）。
  if (consumeJsonPageFirstMount()) {
    clearDraft()
  } else {
    const draft = loadDraft()
    if (draft && !inputText.value) {
      setInputValue(draft)
      setStatus('idle', '已恢复上次的草稿')
    }
  }
  loadFromHash()
})

onUnmounted((): void => {
  document.removeEventListener('keydown', onKeydown)
  document.removeEventListener('click', onDocumentClick)
  window.removeEventListener(CLEAR_HISTORY_EVENT, onClearHistoryEvent)
  if (draftTimer !== undefined) window.clearTimeout(draftTimer)
})
</script>

<template>
  <div class="flex h-full min-h-0 flex-col gap-3">
    <!-- 工具栏 -->
    <div class="flex flex-wrap items-center gap-2">
      <label class="inline-flex items-center gap-1.5 text-sm">
        <span class="text-muted-foreground">语言</span>
        <select
          v-model="langMode"
          class="h-9 rounded-md border border-input bg-background px-2 text-sm"
          @change="onLangModeChange"
        >
          <option value="auto">自动检测</option>
          <option value="json">JSON</option>
          <option value="sql">SQL</option>
          <option value="python">Python</option>
          <option value="go">Go</option>
          <option value="java">Java</option>
        </select>
      </label>
      <button
        type="button"
        class="inline-flex h-9 items-center rounded-md bg-primary px-3.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 active:scale-95"
        @click="doFormat"
      >
        格式化
      </button>
      <button
        type="button"
        :disabled="!canMinify"
        :title="minifyTitle"
        class="inline-flex h-9 items-center rounded-md border border-border bg-background px-3 text-sm font-medium transition-colors hover:bg-accent active:scale-95 disabled:cursor-not-allowed disabled:opacity-50"
        @click="doMinify"
      >
        压缩
      </button>
      <button
        v-if="isJson"
        type="button"
        title="自动修复常见错误（尾随逗号、单引号、未加引号的键、注释）后格式化"
        class="inline-flex h-9 items-center rounded-md border border-border bg-background px-3 text-sm font-medium transition-colors hover:bg-accent active:scale-95"
        @click="doRepair"
      >
        修复
      </button>

      <!-- 更多工具 -->
      <div class="more-wrap relative">
        <button
          type="button"
          :aria-expanded="moreOpen"
          title="更多工具：验证、缩进、JSONPath、复制 Markdown、复制到 Jira、下载、生成类型、转 YAML、对比、转义、分享、历史"
          class="inline-flex h-9 items-center rounded-md border border-border bg-background px-3 text-sm font-medium transition-colors hover:bg-accent active:scale-95"
          @click.stop="moreOpen = !moreOpen"
        >
          更多工具 ▾
        </button>
        <Transition name="wb-menu">
          <div
            v-if="moreOpen"
            class="absolute left-0 top-full z-30 mt-1 hidden max-h-[70vh] w-72 overflow-y-auto rounded-lg border border-border bg-popover p-1.5 text-sm shadow-lg lg:block"
          >
          <button type="button" class="more-item" @click="doValidate">验证</button>
          <div class="more-row">
            <span class="text-muted-foreground">缩进</span>
            <select v-model="indent" class="h-8 rounded-md border border-input bg-background px-1.5 text-sm">
              <option value="2">2 空格</option>
              <option value="4">4 空格</option>
              <option value="tab">Tab</option>
            </select>
          </div>
          <label v-if="isJson" class="more-row cursor-pointer">
            <input v-model="sortKeys" type="checkbox" class="accent-primary" /> 按键名排序
          </label>
          <label class="more-row cursor-pointer">
            <input v-model="formatOnPaste" type="checkbox" class="accent-primary" /> 粘贴后自动格式化
          </label>
          <button
            v-if="isJson"
            type="button"
            class="more-item"
            title="展开 JSONPath 查询栏"
            @click="toggleJpBar"
          >
            JSONPath 查询
          </button>
          <button
            type="button"
            class="more-item"
            title="复制为 Markdown 代码块（```json），粘到 Notion / Word / 邮件保留颜色；粘到 Jira 请用「复制到 Jira」"
            @click="copyMarkdown"
          >
            复制 Markdown
          </button>
          <button
            type="button"
            class="more-item"
            title="只复制纯文本 ```json 围栏，不带颜色：粘到 Jira Cloud 是它自己的代码块、由 Jira 按所选语言上色；旧版 Jira（wiki 标记）请粘进 {code:json}…{code}"
            @click="copyJira"
          >
            复制到 Jira
          </button>
          <button type="button" class="more-item" @click="downloadJson">下载</button>
          <div v-if="isJson" class="more-row">
            <span class="text-muted-foreground">生成类型</span>
            <select v-model="typeLang" class="h-8 rounded-md border border-input bg-background px-1.5 text-sm">
              <option value="ts">TypeScript</option>
              <option value="go">Go</option>
              <option value="py">Python</option>
            </select>
            <button
              type="button"
              title="根据当前 JSON 生成所选语言的类型定义"
              class="inline-flex h-8 items-center rounded-md border border-border bg-background px-2.5 text-sm font-medium transition-colors hover:bg-accent active:scale-95"
              @click="doGenerateType"
            >
              生成
            </button>
          </div>
          <button v-if="isJson" type="button" class="more-item" title="把当前 JSON 转成 YAML" @click="doYaml">
            转 YAML
          </button>
          <button v-if="isJson" type="button" class="more-item" title="与第二份 JSON 逐行对比差异" @click="openDiffPanel">
            对比 JSON
          </button>
          <button v-if="isJson" type="button" class="more-item" title="把输入转成 JSON 转义字符串" @click="doEscape">
            转义
          </button>
          <button v-if="isJson" type="button" class="more-item" title="把 JSON 转义字符串还原" @click="doUnescape">
            去转义
          </button>
          <button
            type="button"
            class="more-item"
            title="把当前 JSON 编进链接，复制后发给别人打开即是这份数据"
            @click="doShare"
          >
            分享链接
          </button>
          <button type="button" class="more-item" title="查看与修改全部快捷键" @click="openSettings">
            快捷键设置
          </button>
          <div class="more-row">
            <span class="text-muted-foreground">历史</span>
            <select
              v-model="historySelected"
              class="h-8 min-w-0 flex-1 rounded-md border border-input bg-background px-1.5 text-sm"
              @change="onHistorySelect"
            >
              <option value="">最近的输入…</option>
              <option v-for="(item, idx) in historyItems" :key="idx" :value="String(idx)">
                {{ item.replace(/\s+/g, ' ').slice(0, 40) }}{{ item.length > 40 ? '…' : '' }}
              </option>
            </select>
            <button
              type="button"
              title="删掉全部历史记录"
              class="inline-flex h-8 items-center rounded-md border border-border bg-background px-2.5 text-sm font-medium transition-colors hover:bg-accent active:scale-95"
              @click="clearHistory"
            >
              清空
            </button>
          </div>
          <div class="my-1 border-t border-border" />
          <label class="more-row cursor-pointer">
            <input v-model="remember" type="checkbox" class="accent-primary" @change="onRememberChange" />
            记住输入草稿与历史
          </label>
          <p class="px-2 pb-1 text-xs leading-relaxed text-muted-foreground">
            草稿与历史仅保存在本机浏览器，7 天后过期；关闭后立即删除已存内容。
          </p>
          </div>
        </Transition>

      <!-- 手机底部抽屉：与桌面下拉框同一份菜单内容，lg: 断点切换显示 -->
      <Transition name="wb-overlay">
        <div
          v-if="moreOpen"
          class="fixed inset-0 z-40 bg-black/50 lg:hidden"
          @click="moreOpen = false"
        />
      </Transition>
      <Transition name="more-drawer">
        <div
          v-if="moreOpen"
          class="fixed inset-x-3 bottom-3 z-50 max-h-[70dvh] overflow-y-auto overscroll-contain rounded-2xl border border-border bg-popover p-1.5 text-sm shadow-xl lg:hidden"
          @touchstart="onDrawerTouchStart"
          @touchend="onDrawerTouchEnd"
        >
          <div class="mx-auto mb-1 h-1 w-10 rounded-full bg-border" />
          <button type="button" class="more-item" @click="doValidate">验证</button>
          <div class="more-row">
            <span class="text-muted-foreground">缩进</span>
            <select v-model="indent" class="h-8 rounded-md border border-input bg-background px-1.5 text-sm">
              <option value="2">2 空格</option>
              <option value="4">4 空格</option>
              <option value="tab">Tab</option>
            </select>
          </div>
          <label v-if="isJson" class="more-row cursor-pointer">
            <input v-model="sortKeys" type="checkbox" class="accent-primary" /> 按键名排序
          </label>
          <label class="more-row cursor-pointer">
            <input v-model="formatOnPaste" type="checkbox" class="accent-primary" /> 粘贴后自动格式化
          </label>
          <button
            v-if="isJson"
            type="button"
            class="more-item"
            title="展开 JSONPath 查询栏"
            @click="toggleJpBar"
          >
            JSONPath 查询
          </button>
          <button
            type="button"
            class="more-item"
            title="复制为 Markdown 代码块（```json），粘到 Notion / Word / 邮件保留颜色；粘到 Jira 请用「复制到 Jira」"
            @click="copyMarkdown"
          >
            复制 Markdown
          </button>
          <button
            type="button"
            class="more-item"
            title="只复制纯文本 ```json 围栏，不带颜色：粘到 Jira Cloud 是它自己的代码块、由 Jira 按所选语言上色；旧版 Jira（wiki 标记）请粘进 {code:json}…{code}"
            @click="copyJira"
          >
            复制到 Jira
          </button>
          <button type="button" class="more-item" @click="downloadJson">下载</button>
          <div v-if="isJson" class="more-row more-row-stack">
            <span class="text-muted-foreground">生成类型</span>
            <select v-model="typeLang" class="h-8 rounded-md border border-input bg-background px-1.5 text-sm">
              <option value="ts">TypeScript</option>
              <option value="go">Go</option>
              <option value="py">Python</option>
            </select>
            <button
              type="button"
              title="根据当前 JSON 生成所选语言的类型定义"
              class="inline-flex h-8 items-center rounded-md border border-border bg-background px-2.5 text-sm font-medium transition-colors hover:bg-accent active:scale-95"
              @click="doGenerateType"
            >
              生成
            </button>
          </div>
          <button v-if="isJson" type="button" class="more-item" title="把当前 JSON 转成 YAML" @click="doYaml">
            转 YAML
          </button>
          <button v-if="isJson" type="button" class="more-item" title="与第二份 JSON 逐行对比差异" @click="openDiffPanel">
            对比 JSON
          </button>
          <button v-if="isJson" type="button" class="more-item" title="把输入转成 JSON 转义字符串" @click="doEscape">
            转义
          </button>
          <button v-if="isJson" type="button" class="more-item" title="把 JSON 转义字符串还原" @click="doUnescape">
            去转义
          </button>
          <button
            type="button"
            class="more-item"
            title="把当前 JSON 编进链接，复制后发给别人打开即是这份数据"
            @click="doShare"
          >
            分享链接
          </button>
          <button type="button" class="more-item" title="查看与修改全部快捷键" @click="openSettings">
            快捷键设置
          </button>
          <div class="more-row">
            <span class="text-muted-foreground">历史</span>
            <select
              v-model="historySelected"
              class="h-8 min-w-0 flex-1 rounded-md border border-input bg-background px-1.5 text-sm"
              @change="onHistorySelect"
            >
              <option value="">最近的输入…</option>
              <option v-for="(item, idx) in historyItems" :key="idx" :value="String(idx)">
                {{ item.replace(/\s+/g, ' ').slice(0, 40) }}{{ item.length > 40 ? '…' : '' }}
              </option>
            </select>
            <button
              type="button"
              title="删掉全部历史记录"
              class="inline-flex h-8 items-center rounded-md border border-border bg-background px-2.5 text-sm font-medium transition-colors hover:bg-accent active:scale-95"
              @click="clearHistory"
            >
              清空
            </button>
          </div>
          <div class="my-1 border-t border-border" />
          <label class="more-row cursor-pointer">
            <input v-model="remember" type="checkbox" class="accent-primary" @change="onRememberChange" />
            记住输入草稿与历史
          </label>
          <p class="px-2 pb-1 text-xs leading-relaxed text-muted-foreground">
            草稿与历史仅保存在本机浏览器，7 天后过期；关闭后立即删除已存内容。
          </p>
        </div>
      </Transition>
      </div>

      <div class="hidden flex-1 lg:block" />
    </div>

    <!-- JSONPath 查询栏 -->
    <Transition name="wb-fade">
      <div v-if="jpBarOpen" class="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-card p-2.5 shadow-sm max-lg:flex-col max-lg:items-stretch">
      <label class="text-sm text-muted-foreground" for="jsonpathInput">JSONPath</label>
      <input
        id="jsonpathInput"
        v-model="jpExpr"
        type="text"
        placeholder="$.store.book[0].title 或 $..price"
        spellcheck="false"
        class="h-9 min-w-0 flex-1 rounded-md border border-input bg-background px-2.5 font-mono text-sm"
        @keydown.enter="doJsonPath"
      />
      <button
        type="button"
        class="inline-flex h-9 items-center rounded-md border border-border bg-background px-3 text-sm font-medium transition-colors hover:bg-accent active:scale-95"
        @click="doJsonPath"
      >
        查询
      </button>
      <span class="text-xs text-muted-foreground">{{ jpMatches.length ? jpMatches.length + ' 个匹配' : '' }}</span>
      </div>
    </Transition>

    <!-- JSONPath 查询结果 -->
    <Transition name="wb-fade">
      <div v-if="jpResultsOpen" class="rounded-lg border border-border bg-card shadow-sm">
      <div class="flex items-center justify-between border-b border-border px-3 py-2">
        <span class="text-sm font-medium">
          查询结果 <span class="text-xs font-normal text-muted-foreground">共 {{ jpMatches.length }} 个匹配</span>
        </span>
        <button
          type="button"
          class="inline-flex h-7 items-center rounded-md border border-border bg-background px-2 text-xs font-medium transition-colors hover:bg-accent"
          @click="closeJpResults"
        >
          关闭
        </button>
      </div>
      <div v-auto-animate class="max-h-48 overflow-y-auto p-1.5">
        <div v-if="jpMatches.length === 0" class="px-2 py-3 text-sm text-muted-foreground">没有匹配到任何结果。</div>
        <div
          v-for="(m, idx) in jpMatches"
          :key="idx"
          class="flex w-full items-center gap-2 rounded px-2 py-1 font-mono text-[13px] transition-colors hover:bg-accent"
        >
          <span class="shrink-0 text-[hsl(var(--code-key))]">{{ m.path }}</span>
          <span class="min-w-0 flex-1 truncate text-muted-foreground">{{ jpPreview(m.value) }}</span>
          <CopyButton :text="JSON.stringify(m.value, null, 2)" class="shrink-0 !h-7 !px-2" />
        </div>
      </div>
      </div>
    </Transition>

    <!-- 对比面板 -->
    <Transition name="wb-fade">
      <div v-if="diffPanelOpen" class="rounded-lg border border-border bg-card p-3 shadow-sm">
      <div class="mb-2 flex flex-wrap items-center gap-2">
        <span class="text-sm font-medium">对比 JSON</span>
        <span class="text-xs text-muted-foreground max-lg:w-full">左侧输入为第一份，下面粘贴第二份，逐行对比差异</span>
        <div class="flex-1" />
        <button
          type="button"
          class="inline-flex h-7 items-center rounded-md border border-border bg-background px-2 text-xs font-medium transition-colors hover:bg-accent"
          @click="closeDiffPanel"
        >
          关闭
        </button>
      </div>
      <textarea
        v-model="diffInput"
        placeholder="粘贴第二份 JSON…"
        spellcheck="false"
        rows="4"
        class="w-full resize-y rounded-md border border-input bg-background p-2.5 font-mono text-[13px] leading-relaxed"
      />
      <div class="mt-2 flex flex-wrap items-center gap-3">
        <button
          type="button"
          class="inline-flex h-9 items-center rounded-md bg-primary px-3.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 active:scale-95"
          @click="doDiff"
        >
          开始对比
        </button>
        <span class="text-xs text-muted-foreground">{{ diffStats }}</span>
      </div>
      </div>
    </Transition>

    <!-- 左右分栏 -->
    <div
      ref="panesEl"
      class="flex min-h-0 flex-col gap-3 lg:min-h-[480px] lg:flex-1 lg:flex-row lg:gap-0"
      :style="{ '--split': splitPct + '%' }"
      @dragover="onDragOver"
      @drop="onDrop"
    >
      <!-- 输入 -->
      <section
        class="flex min-h-[200px] shrink-0 flex-col rounded-lg border border-border bg-card shadow-sm lg:min-h-[240px] lg:basis-[var(--split)]"
      >
        <div class="flex flex-wrap items-center gap-2 border-b border-border px-3 py-2">
          <span class="text-sm font-medium">输入</span>
          <div class="flex-1" />
          <button type="button" class="pane-btn" @click="triggerUpload">打开文件</button>
          <input
            ref="fileInputEl"
            type="file"
            accept=".json,.sql,.py,.go,.java,.txt,application/json,text/plain"
            hidden
            @change="onFileChange"
          />
          <button type="button" class="pane-btn" @click="pasteClipboard">粘贴剪贴板</button>
          <button type="button" class="pane-btn" @click="clearAll">清空</button>
          <span class="text-xs text-muted-foreground">{{ inputText.length }} 字符</span>
        </div>
        <div class="flex min-h-0 flex-1">
          <div
            ref="gutterEl"
            aria-hidden="true"
            class="w-10 shrink-0 select-none overflow-hidden whitespace-pre border-r border-border bg-muted/40 py-3 pr-2 text-right font-mono text-[13px] leading-6 text-muted-foreground"
          >{{ gutterText }}</div>
          <textarea
            ref="textareaEl"
            v-model="inputText"
            spellcheck="false"
            :placeholder="langPlaceholder"
            class="min-w-0 flex-1 resize-none whitespace-pre bg-transparent p-3 font-mono text-[13px] leading-6 outline-none"
            @paste="onTextareaPaste"
            @scroll="onTextareaScroll"
          />
        </div>
      </section>

      <!-- 分隔条 -->
      <div
        ref="dividerEl"
        title="拖动调整左右宽度"
        class="hidden h-1.5 shrink-0 cursor-row-resize touch-none rounded bg-border/60 transition-colors hover:bg-primary/40 lg:block lg:h-auto lg:w-1.5 lg:cursor-col-resize"
        @pointerdown="onDividerDown"
      />

      <!-- 输出 -->
      <section class="relative flex min-h-0 min-w-0 flex-col rounded-lg border border-border bg-card shadow-sm lg:min-h-[240px] lg:flex-1">
        <div class="flex flex-wrap items-center gap-2 border-b border-border px-3 py-2">
          <span class="text-sm font-medium">输出</span>
          <span class="text-xs text-muted-foreground">{{ outputStats }}</span>
          <div class="flex-1" />
          <label
            v-if="currentView === 'code' && !diffVisible"
            class="inline-flex cursor-pointer items-center gap-1 text-xs text-muted-foreground lg:hidden"
          >
            <input v-model="wrapOutput" type="checkbox" class="accent-primary" /> 换行
          </label>
          <div v-if="isJson" class="inline-flex rounded-md border border-border bg-muted/50 p-0.5" role="tablist" aria-label="输出视图">
            <button
              type="button"
              role="tab"
              :class="[
                'inline-flex h-8 items-center rounded px-3 text-sm font-medium transition-colors',
                currentView === 'code' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
              ]"
              @click="setView('code')"
            >
              代码
            </button>
            <button
              type="button"
              role="tab"
              :class="[
                'inline-flex h-8 items-center rounded px-3 text-sm font-medium transition-colors',
                currentView === 'tree' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
              ]"
              @click="onViewTree"
            >
              树形
            </button>
          </div>
          <button
            v-if="lastFormatted"
            type="button"
            aria-label="复制结果"
            title="复制结果（带颜色）"
            class="inline-flex h-8 items-center gap-1.5 rounded-md border border-border bg-background px-2.5 text-sm font-medium transition-all hover:bg-accent active:scale-95"
            @click="copyFormatted"
          >
            <Copy class="h-4 w-4" />
            <span>复制结果</span>
          </button>
          <button
            v-else
            type="button"
            disabled
            title="先格式化一次"
            class="inline-flex h-8 cursor-not-allowed items-center gap-1.5 rounded-md border border-border bg-background px-2.5 text-sm font-medium opacity-50"
          >
            复制结果
          </button>
          <button
            v-if="currentView === 'tree'"
            type="button"
            class="pane-btn"
            title="展开 / 折叠全部节点"
            @click="toggleAllTree"
          >
            {{ treeAllExpanded ? '全部折叠' : '全部展开' }}
          </button>
        </div>
        <div class="min-h-0 flex-1 overflow-y-auto">
          <div v-if="currentView === 'tree'" class="flex items-center gap-2 border-b border-border px-3 py-2">
            <input
              id="treeSearchInput"
              v-model="treeSearch"
              type="text"
              placeholder="搜索键名或值，多个关键词用空格分开…"
              title="多个关键词用空格分开，全部都要命中（同一条路径上）；支持模糊，如 usrnm 能命中 userName"
              spellcheck="false"
              aria-label="搜索树节点"
              class="h-8 min-w-0 flex-1 rounded-md border border-input bg-background px-2.5 text-sm"
              @keydown.escape.stop="clearTreeSearchAndFocus"
            />
            <span class="shrink-0 text-xs text-muted-foreground">{{ treeSearchHint }}</span>
            <button
              type="button"
              title="清除搜索"
              class="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-border bg-background text-sm transition-colors hover:bg-accent"
              @click="clearTreeSearchAndFocus"
            >
              ×
            </button>
          </div>
          <Transition name="wb-fade">
            <div v-if="diffVisible" ref="diffViewEl" class="wb-result-in p-3 font-mono text-[13px] leading-6 tabular-nums">
            <div
              v-for="(op, idx) in diffOps"
              :key="idx"
              :class="[
                'whitespace-pre-wrap break-all rounded px-1',
                op.t === 'add' ? 'bg-green-500/15 text-green-800 dark:text-green-300' : '',
                op.t === 'del' ? 'bg-red-500/15 text-red-800 dark:text-red-300' : '',
                op.t === 'same' ? 'text-muted-foreground' : '',
              ]"
            >{{ (op.t === 'add' ? '+ ' : op.t === 'del' ? '− ' : '  ') + op.line }}</div>
          </div>
          <div v-else-if="currentView === 'tree'" ref="treeEl" tabindex="0" class="wb-result-in p-3 outline-none">
            <JsonTreeNode
              v-if="lastValue !== null"
              :value="lastValue"
              :query="treeSearch"
              :toggle-signal="treeToggleSignal"
              :all-expanded="treeAllExpanded"
            />
            <p v-else class="text-sm text-muted-foreground">先格式化或验证一次，再看树形视图。</p>
          </div>
          <pre
            v-else
            ref="outputEl"
            tabindex="0"
            :key="resultAnimKey"
            :class="[
              'wb-result-in p-3 font-mono text-[13px] leading-6 tabular-nums outline-none',
              wrapOutput
                ? 'max-lg:whitespace-pre-wrap max-lg:break-all max-lg:overflow-x-hidden lg:overflow-x-auto'
                : 'overflow-x-auto',
            ]"
            v-html="outputHtml"
          />
          </Transition>
        </div>
        <div
          v-if="!wrapOutput && currentView === 'code' && !diffVisible"
          class="pointer-events-none absolute bottom-2 right-2 rounded bg-muted/90 px-2 py-1 text-[11px] text-muted-foreground shadow-sm lg:hidden"
        >
          ← 左右滑动查看 →
        </div>
      </section>
    </div>

    <!-- 状态栏 -->
    <footer class="flex flex-wrap items-center gap-2 text-sm">
      <span :class="['h-2.5 w-2.5 shrink-0 rounded-full', statusDotClass]" />
      <span class="min-w-0 break-words">{{ statusText }}</span>
      <span class="flex-1" />
      <span class="hidden text-xs text-muted-foreground md:inline">{{ footerHint }}</span>
      <span class="text-xs text-muted-foreground">{{ detailStats }}</span>
    </footer>

  </div>
</template>

<style>
/* Syntax highlight colours for v-html output (plain <style>: v-html content
 * carries no scoped data attribute, so scoped CSS would not apply). */
.wb-k { color: #1d4ed8; }
.wb-s { color: #92400e; }
.wb-n { color: #c2410c; }
.wb-b { color: #7c3aed; }
.wb-u { color: #be123c; }
.wb-p { color: #475569; }
.wb-c { color: #6b7280; font-style: italic; }
/* Tree search hits: <mark> alternates by keyword index (1st/3rd/5th yellow,
 * 2nd/4th/6th green). Backgrounds are light in light themes and dark in dark
 * themes; worst-case contrast against all five leaf-value colours is
 * 4.59:1 (dark rose on yellow-900) / 4.72:1 (light orange on green-100). */
.wb-mark-a { background-color: #fef9c3; border-radius: 2px; }
.wb-mark-b { background-color: #dcfce7; border-radius: 2px; }
.dark .wb-mark-a { background-color: #713f12; }
.dark .wb-mark-b { background-color: #14532d; }
.dark .wb-k { color: #82aaff; }
.dark .wb-s { color: #ecc48d; }
.dark .wb-n { color: #f78c6c; }
.dark .wb-b { color: #c792ea; }
.dark .wb-u { color: #ff5370; }
.dark .wb-p { color: #89ddff; }
.dark .wb-c { color: #7f8c9b; font-style: italic; }
/* Signature dark themes — official editor palettes (light / dark /
 * tokyonight above stay exactly as they were). */
html[data-theme='catppuccin'] .wb-k { color: #cba6f7; }
html[data-theme='catppuccin'] .wb-s { color: #a6e3a1; }
html[data-theme='catppuccin'] .wb-n { color: #fab387; }
html[data-theme='catppuccin'] .wb-b { color: #f5c2e7; }
html[data-theme='catppuccin'] .wb-u { color: #f38ba8; }
html[data-theme='catppuccin'] .wb-p { color: #9399b2; }
html[data-theme='catppuccin'] .wb-c { color: #6c7086; font-style: italic; }
html[data-theme='gruvbox'] .wb-k { color: #83a598; }
html[data-theme='gruvbox'] .wb-s { color: #b8bb26; }
html[data-theme='gruvbox'] .wb-n { color: #d3869b; }
html[data-theme='gruvbox'] .wb-b { color: #fe8019; }
html[data-theme='gruvbox'] .wb-u { color: #fb4934; }
html[data-theme='gruvbox'] .wb-p { color: #a89984; }
html[data-theme='gruvbox'] .wb-c { color: #928374; font-style: italic; }
html[data-theme='dracula'] .wb-k { color: #8be9fd; }
html[data-theme='dracula'] .wb-s { color: #f1fa8c; }
html[data-theme='dracula'] .wb-n { color: #bd93f9; }
html[data-theme='dracula'] .wb-b { color: #ff79c6; }
html[data-theme='dracula'] .wb-u { color: #ffb86c; }
html[data-theme='dracula'] .wb-p { color: #6272a4; }
html[data-theme='dracula'] .wb-c { color: #6272a4; font-style: italic; }
/* Light companions — text-safe syntax colours (same values as the
 * --code-* tokens in main.css; code areas sit on card surfaces). */
html[data-theme='tokyonight-light'] .wb-k { color: #155fc5; }
html[data-theme='tokyonight-light'] .wb-s { color: #506b34; }
html[data-theme='tokyonight-light'] .wb-n { color: #984f00; }
html[data-theme='tokyonight-light'] .wb-b { color: #7847bd; }
html[data-theme='tokyonight-light'] .wb-u { color: #c40940; }
html[data-theme='tokyonight-light'] .wb-p { color: #4f609e; }
html[data-theme='tokyonight-light'] .wb-c { color: #576090; font-style: italic; }
html[data-theme='catppuccin-latte'] .wb-k { color: #145ff5; }
html[data-theme='catppuccin-latte'] .wb-s { color: #327c21; }
html[data-theme='catppuccin-latte'] .wb-n { color: #bc4501; }
html[data-theme='catppuccin-latte'] .wb-b { color: #8839ef; }
html[data-theme='catppuccin-latte'] .wb-u { color: #d20f39; }
html[data-theme='catppuccin-latte'] .wb-p { color: #686b7e; }
html[data-theme='catppuccin-latte'] .wb-c { color: #676a7f; font-style: italic; }
html[data-theme='gruvbox-light'] .wb-k { color: #076678; }
html[data-theme='gruvbox-light'] .wb-s { color: #74700d; }
html[data-theme='gruvbox-light'] .wb-n { color: #af3a03; }
html[data-theme='gruvbox-light'] .wb-b { color: #8f3f71; }
html[data-theme='gruvbox-light'] .wb-u { color: #9d0006; }
html[data-theme='gruvbox-light'] .wb-p { color: #665c54; }
html[data-theme='gruvbox-light'] .wb-c { color: #766a5f; font-style: italic; }
html[data-theme='dracula-light'] .wb-k { color: #8b41f4; }
html[data-theme='dracula-light'] .wb-s { color: #047f23; }
html[data-theme='dracula-light'] .wb-n { color: #ae5a00; }
html[data-theme='dracula-light'] .wb-b { color: #da007d; }
html[data-theme='dracula-light'] .wb-u { color: #e40000; }
html[data-theme='dracula-light'] .wb-p { color: #5f6fa2; }
html[data-theme='dracula-light'] .wb-c { color: #5f6fa2; font-style: italic; }
</style>

<style scoped>
.more-item {
  display: block;
  width: 100%;
  border-radius: 0.375rem;
  padding: 0.5rem 0.5rem;
  text-align: left;
  transition: background-color 0.15s ease;
}
.more-item:hover {
  background-color: hsl(var(--accent));
}
.more-row {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  border-radius: 0.375rem;
  padding: 0.5rem 0.5rem;
}
.pane-btn {
  display: inline-flex;
  height: 1.75rem;
  align-items: center;
  border-radius: 0.375rem;
  border: 1px solid hsl(var(--border));
  background-color: hsl(var(--background));
  padding-left: 0.5rem;
  padding-right: 0.5rem;
  font-size: 0.75rem;
  font-weight: 500;
  transition: background-color 0.15s ease;
}
.pane-btn:hover {
  background-color: hsl(var(--accent));
}
/* 手机「更多工具」底部抽屉：上滑出现（共享动效 token，220ms ease-out） */
.more-drawer-enter-active,
.more-drawer-leave-active {
  transition:
    transform var(--wb-dur-drawer, 220ms) var(--wb-ease-out, cubic-bezier(0.22, 1, 0.36, 1)),
    opacity var(--wb-dur-drawer, 220ms) var(--wb-ease-out, cubic-bezier(0.22, 1, 0.36, 1));
}
.more-drawer-enter-from,
.more-drawer-leave-to {
  opacity: 0;
  transform: translateY(32px);
}
/* Phase 3：本页新加的共享过渡在减弱动效下全部停用（wb-* 本体在
 * main.css 里也有对应的 reduce 兜底，这里是本页内的双保险）。 */
@media (prefers-reduced-motion: reduce) {
  .wb-menu-enter-active,
  .wb-menu-leave-active,
  .wb-overlay-enter-active,
  .wb-overlay-leave-active,
  .wb-dialog-enter-active,
  .wb-dialog-leave-active,
  .wb-fade-enter-active,
  .wb-fade-leave-active,
  .more-drawer-enter-active,
  .more-drawer-leave-active {
    transition: none;
  }
}
/* 抽屉里「生成类型」一行：手机上标签独占一行，选择器与生成按钮在下一行 */
@media (max-width: 1023.5px) {
  .more-row-stack {
    flex-wrap: wrap;
  }
  .more-row-stack > :first-child {
    flex-basis: 100%;
  }
}
</style>
