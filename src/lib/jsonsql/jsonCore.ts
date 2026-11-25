/** JSON core operations (ported from 1.x): deep key sort, stats, error
 *  position, repair, JSONPath, YAML conversion, LCS diff, share-link codec,
 *  and tree-search match counting. */

import { isRecord, type DiffOp, type JsonPathMatch, type JsonPathToken, type JsonValue } from './types'

/** Recursively sort object keys. */
export function sortDeep(value: JsonValue): JsonValue {
  if (Array.isArray(value)) return value.map(sortDeep)
  if (isRecord(value)) {
    const out: { [key: string]: JsonValue } = {}
    Object.keys(value)
      .sort()
      .forEach((k) => {
        out[k] = sortDeep(value[k])
      })
    return out
  }
  return value
}

/** Count keys and max depth. */
export function analyze(value: JsonValue): { keys: number; depth: number } {
  let keys = 0
  let depth = 0
  const walk = (v: JsonValue, d: number): void => {
    if (d > depth) depth = d
    if (Array.isArray(v)) {
      v.forEach((item) => walk(item, d + 1))
    } else if (isRecord(v)) {
      Object.keys(v).forEach((k) => {
        keys++
        walk(v[k], d + 1)
      })
    }
  }
  walk(value, 1)
  return { keys, depth }
}

/** Locate a JSON.parse error as line/column. */
export function errorPosition(
  text: string,
  err: unknown,
): { line: number; col: number; pos: number } | null {
  const message = err instanceof Error ? err.message : String(err)
  let m = /position (\d+)/.exec(message)
  if (m) {
    const pos = Number(m[1])
    const before = text.slice(0, pos)
    const lines = before.split('\n')
    return { line: lines.length, col: lines[lines.length - 1].length + 1, pos }
  }
  m = /line (\d+) column (\d+)/.exec(message)
  if (m) return { line: Number(m[1]), col: Number(m[2]), pos: -1 }
  // V8 has a class of errors with no position ("Unexpected token '}', … is
  // not valid JSON"): for } / ] take its first occurrence in the text —
  // usually the error point
  const t = /Unexpected token '(.)'/.exec(message)
  if (t && (t[1] === '}' || t[1] === ']')) {
    const idx = text.indexOf(t[1])
    if (idx !== -1) {
      const b = text.slice(0, idx).split('\n')
      return { line: b.length, col: b[b.length - 1].length + 1, pos: idx }
    }
  }
  return null
}

/** Repair common JSON mistakes: single quotes, unquoted keys, trailing
 *  commas, // and block comments. Throws if still unparseable. */
export function repairJson(text: string): JsonValue {
  let out = ''
  let i = 0
  const n = text.length
  let state: 'normal' | 'dstr' | 'sstr' | 'lineComment' | 'blockComment' = 'normal'
  while (i < n) {
    const c = text[i]
    const nx = text[i + 1]
    if (state === 'normal') {
      if (c === '"') {
        state = 'dstr'
        out += c
        i++
      } else if (c === "'") {
        state = 'sstr'
        out += '"'
        i++
      } else if (c === '/' && nx === '/') {
        state = 'lineComment'
        i += 2
      } else if (c === '/' && nx === '*') {
        state = 'blockComment'
        i += 2
      } else {
        out += c
        i++
      }
    } else if (state === 'dstr') {
      out += c
      if (c === '\\' && i + 1 < n) {
        out += text[i + 1]
        i += 2
      } else if (c === '"') {
        state = 'normal'
        i++
      } else i++
    } else if (state === 'sstr') {
      if (c === '\\' && i + 1 < n) {
        const e = text[i + 1]
        if (e === "'") {
          out += "'"
          i += 2
        } else if (e === '"') {
          out += '\\"'
          i += 2
        } else {
          out += c + e
          i += 2
        }
      } else if (c === '"') {
        out += '\\"'
        i++
      } else if (c === "'") {
        out += '"'
        state = 'normal'
        i++
      } else {
        out += c
        i++
      }
    } else if (state === 'lineComment') {
      if (c === '\n') {
        out += c
        state = 'normal'
      }
      i++
    } else {
      // blockComment
      if (c === '*' && nx === '/') {
        state = 'normal'
        i += 2
      } else i++
    }
  }
  // Unquoted keys get quotes
  out = out.replace(/([{,]\s*)([A-Za-z_$][A-Za-z0-9_$]*)(\s*:)/g, '$1"$2"$3')
  // Trailing commas
  out = out.replace(/,\s*([}\]])/g, '$1')
  return JSON.parse(out) as JsonValue
}

/* ---------- JSONPath ---------- */

/** Parse $.a.b[0], $..key, $.* — returns null when unsupported. */
export function parseJsonPath(expr: string): JsonPathToken[] | null {
  const trimmed = expr.trim()
  if (!trimmed || trimmed[0] !== '$') return null
  const tokens: JsonPathToken[] = []
  const rest = trimmed.slice(1)
  const re =
    /\.\.([A-Za-z_$][A-Za-z0-9_$]*)|\.([A-Za-z_$][A-Za-z0-9_$]*)|\.\*|\['([^'\]]+)'\]|\["([^"\]]+)"\]|\[(\d+)\]|\[\*\]/g
  let m: RegExpExecArray | null
  let lastIdx = 0
  while ((m = re.exec(rest))) {
    if (m.index !== lastIdx) return null
    lastIdx = re.lastIndex
    if (m[1] !== undefined) tokens.push({ t: 'recursive', key: m[1] })
    else if (m[2] !== undefined) tokens.push({ t: 'key', key: m[2] })
    else if (m[0] === '.*') tokens.push({ t: 'wildcard' })
    else if (m[3] !== undefined) tokens.push({ t: 'key', key: m[3] })
    else if (m[4] !== undefined) tokens.push({ t: 'key', key: m[4] })
    else if (m[5] !== undefined) tokens.push({ t: 'index', idx: Number(m[5]) })
    else if (m[0] === '[*]') tokens.push({ t: 'wildcard' })
  }
  if (lastIdx !== rest.length) return null
  return tokens
}

export function evalJsonPath(root: JsonValue, tokens: JsonPathToken[]): JsonPathMatch[] {
  let current: JsonPathMatch[] = [{ path: '$', value: root }]
  tokens.forEach((tok) => {
    const next: JsonPathMatch[] = []
    current.forEach((item) => {
      const v = item.value
      if (tok.t === 'key') {
        if (isRecord(v) && tok.key in v) {
          next.push({ path: item.path + '.' + tok.key, value: v[tok.key] })
        }
      } else if (tok.t === 'index') {
        if (Array.isArray(v) && tok.idx < v.length) {
          next.push({ path: item.path + '[' + tok.idx + ']', value: v[tok.idx] })
        }
      } else if (tok.t === 'wildcard') {
        if (Array.isArray(v)) {
          v.forEach((el, idx) => {
            next.push({ path: item.path + '[' + idx + ']', value: el })
          })
        } else if (isRecord(v)) {
          Object.keys(v).forEach((k) => {
            next.push({ path: item.path + '.' + k, value: v[k] })
          })
        }
      } else if (tok.t === 'recursive') {
        const walk = (node: JsonValue, p: string): void => {
          if (node && typeof node === 'object') {
            if (isRecord(node) && tok.key in node) {
              next.push({ path: p + '.' + tok.key, value: node[tok.key] })
            }
            if (Array.isArray(node)) {
              node.forEach((el, idx) => walk(el, p + '[' + idx + ']'))
            } else {
              Object.keys(node).forEach((k) => walk(node[k], p + '.' + k))
            }
          }
        }
        walk(v, item.path)
      }
    })
    current = next
  })
  return current
}

/* ---------- YAML ---------- */

function yamlScalar(v: JsonValue): string {
  if (v === null) return 'null'
  if (typeof v === 'boolean') return v ? 'true' : 'false'
  if (typeof v === 'number') return String(v)
  const s = String(v)
  if (
    s === '' ||
    /^\s|\s$/.test(s) ||
    /^(true|false|null|~|yes|no|on|off)$/i.test(s) ||
    /^-?\d+(\.\d+)?([eE][+-]?\d+)?$/.test(s) ||
    /[:#{}[\],&*?|>'"%@`!]/.test(s) ||
    s.indexOf('\n') !== -1
  ) {
    return JSON.stringify(s)
  }
  return s
}

function yamlKey(k: string): string {
  return /[:#{}[\],&*?|>'"%@`!]/.test(k) || /^\s|\s$/.test(k) || k === ''
    ? JSON.stringify(k)
    : k
}

export function toYamlLines(v: JsonValue, indent: number): string[] {
  const pad = '  '.repeat(indent)
  if (Array.isArray(v)) {
    if (v.length === 0) return [pad + '[]']
    const lines: string[] = []
    v.forEach((el) => {
      if (el && typeof el === 'object') {
        const sub = toYamlLines(el, indent + 1)
        lines.push(pad + '- ' + sub[0].slice((indent + 1) * 2))
        for (let i = 1; i < sub.length; i++) lines.push(sub[i])
      } else {
        lines.push(pad + '- ' + yamlScalar(el))
      }
    })
    return lines
  }
  if (isRecord(v)) {
    const keys = Object.keys(v)
    if (keys.length === 0) return [pad + '{}']
    const out: string[] = []
    keys.forEach((k) => {
      const val = v[k]
      const key = yamlKey(k)
      if (val && typeof val === 'object') {
        if (Array.isArray(val) && val.length === 0) out.push(pad + key + ': []')
        else if (!Array.isArray(val) && Object.keys(val).length === 0)
          out.push(pad + key + ': {}')
        else {
          out.push(pad + key + ':')
          out.push(...toYamlLines(val, indent + 1))
        }
      } else {
        out.push(pad + key + ': ' + yamlScalar(val))
      }
    })
    return out
  }
  return [pad + yamlScalar(v)]
}

/* ---------- Diff (LCS over lines) ---------- */

export function diffLines(aLines: string[], bLines: string[]): DiffOp[] {
  const n = aLines.length
  const m = bLines.length
  const dp: Int32Array[] = []
  for (let i = 0; i <= n; i++) dp.push(new Int32Array(m + 1))
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] =
        aLines[i] === bLines[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1])
    }
  }
  const ops: DiffOp[] = []
  let i = 0
  let j = 0
  while (i < n && j < m) {
    if (aLines[i] === bLines[j]) {
      ops.push({ t: 'same', line: aLines[i] })
      i++
      j++
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      ops.push({ t: 'del', line: aLines[i] })
      i++
    } else {
      ops.push({ t: 'add', line: bLines[j] })
      j++
    }
  }
  while (i < n) {
    ops.push({ t: 'del', line: aLines[i] })
    i++
  }
  while (j < m) {
    ops.push({ t: 'add', line: bLines[j] })
    j++
  }
  return ops
}

/* ---------- Share-link codec (#j= base64url) ---------- */

export function toBase64Url(str: string): string {
  const bytes = new TextEncoder().encode(str)
  let bin = ''
  bytes.forEach((b) => {
    bin += String.fromCharCode(b)
  })
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export function fromBase64Url(s: string): string {
  let b64 = s.replace(/-/g, '+').replace(/_/g, '/')
  while (b64.length % 4) b64 += '='
  const bin = atob(b64)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return new TextDecoder().decode(bytes)
}

/* ---------- Tree search (alpha.13: multi-keyword, fuzzy, highlight) ---------- */

import { escapeHtml } from './highlight'

/** Split a query into keywords: whitespace-separated, lowercased, deduped.
 *  Empty query yields []. */
export function parseSearchKeywords(query: string): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  query
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .forEach((kw) => {
      if (kw && !seen.has(kw)) {
        seen.add(kw)
        out.push(kw)
      }
    })
  return out
}

export interface SearchRange {
  start: number
  end: number
}

/** Tree-search match mode (alpha.14): 'exact' matches a keyword only as a
 *  contiguous substring; 'fuzzy' also accepts a subsequence. Exact wins
 *  tree-wide — see resolveSearchMode. */
export type SearchMode = 'exact' | 'fuzzy'

/** Ranges of `text` matched by `keyword` (case-insensitive).
 *  In 'exact' mode only contiguous-substring occurrences count. In 'fuzzy'
 *  mode an exact substring wins and returns every occurrence; otherwise a
 *  subsequence match (e.g. `usrnm` hits `userName`) returns the positions of
 *  the matched characters, adjacent ones merged. Null when no match. */
export function findKeywordRanges(
  text: string,
  keyword: string,
  mode: SearchMode = 'fuzzy',
): SearchRange[] | null {
  const t = text.toLowerCase()
  const kw = keyword.toLowerCase()
  if (!kw) return null
  // Exact substring: all occurrences.
  const ranges: SearchRange[] = []
  let idx = t.indexOf(kw)
  while (idx !== -1) {
    ranges.push({ start: idx, end: idx + kw.length })
    idx = t.indexOf(kw, idx + kw.length)
  }
  if (ranges.length > 0) return ranges
  if (mode === 'exact') return null
  // Fuzzy: greedy subsequence scan.
  const positions: number[] = []
  let p = 0
  for (let i = 0; i < kw.length; i++) {
    const at = t.indexOf(kw[i], p)
    if (at === -1) return null
    positions.push(at)
    p = at + 1
  }
  positions.forEach((pos) => {
    const last = ranges[ranges.length - 1]
    if (last && last.end === pos) last.end = pos + 1
    else ranges.push({ start: pos, end: pos + 1 })
  })
  return ranges
}

export function keywordMatchesText(
  text: string,
  keyword: string,
  mode: SearchMode = 'fuzzy',
): boolean {
  return findKeywordRanges(text, keyword, mode) !== null
}

/** The node's own searchable text: its key (if any) and its leaf value text
 *  (strings without surrounding quotes; numbers / booleans / null as shown).
 *  Branch nodes have key text only. */
function nodeOwnParts(value: JsonValue, key: string | number | undefined): string[] {
  const parts: string[] = []
  if (key !== undefined) parts.push(String(key))
  if (value === null || typeof value !== 'object') {
    parts.push(typeof value === 'string' ? value : String(value))
  }
  return parts
}

/** Whether this node is a hit: every keyword appears somewhere on the path
 *  from the root to this node (ancestor keys + own key + own leaf value),
 *  and at least one keyword matches the node's own text — the second clause
 *  keeps a matching branch from counting its whole subtree. With a single
 *  keyword this reduces to the old own-text-contains count. `mode` selects
 *  exact-substring vs subsequence matching for every keyword. */
export function nodeSearchHit(
  value: JsonValue,
  keywords: string[],
  key: string | number | undefined,
  ancestorKeys: (string | number)[],
  mode: SearchMode = 'fuzzy',
): boolean {
  if (keywords.length === 0) return false
  const ownParts = nodeOwnParts(value, key)
  const pathText = [...ancestorKeys.map(String), ...ownParts].join(' ')
  const ownText = ownParts.join(' ')
  return (
    keywords.every((kw) => keywordMatchesText(pathText, kw, mode)) &&
    keywords.some((kw) => keywordMatchesText(ownText, kw, mode))
  )
}

function childAncestorKeys(
  key: string | number | undefined,
  ancestorKeys: (string | number)[],
): (string | number)[] {
  return key === undefined ? ancestorKeys : [...ancestorKeys, key]
}

function countTreeMatchesKw(
  value: JsonValue,
  keywords: string[],
  key: string | number | undefined,
  ancestorKeys: (string | number)[],
  mode: SearchMode,
): number {
  if (keywords.length === 0) return 0
  let count = nodeSearchHit(value, keywords, key, ancestorKeys, mode) ? 1 : 0
  const next = childAncestorKeys(key, ancestorKeys)
  if (Array.isArray(value)) {
    value.forEach((el) => {
      count += countTreeMatchesKw(el, keywords, undefined, next, mode)
    })
  } else if (isRecord(value)) {
    Object.keys(value).forEach((k) => {
      count += countTreeMatchesKw(value[k], keywords, k, next, mode)
    })
  }
  return count
}

function treeHasMatchKw(
  value: JsonValue,
  keywords: string[],
  key: string | number | undefined,
  ancestorKeys: (string | number)[],
  mode: SearchMode,
): boolean {
  if (keywords.length === 0) return true
  if (nodeSearchHit(value, keywords, key, ancestorKeys, mode)) return true
  const next = childAncestorKeys(key, ancestorKeys)
  if (Array.isArray(value)) return value.some((el) => treeHasMatchKw(el, keywords, undefined, next, mode))
  if (isRecord(value))
    return Object.keys(value).some((k) => treeHasMatchKw(value[k], keywords, k, next, mode))
  return false
}

/** Alpha.14 exact-first rule: the whole query runs in 'exact' mode whenever
 *  at least one node matches exactly; fuzzy is only the fallback when the
 *  tree has zero exact matches. Empty keywords resolve to 'fuzzy' (no search
 *  is active, so the mode is never displayed). */
export function resolveSearchMode(value: JsonValue, keywords: string[]): SearchMode {
  if (keywords.length === 0) return 'fuzzy'
  return treeHasMatchKw(value, keywords, undefined, [], 'exact') ? 'exact' : 'fuzzy'
}

/** Count hit nodes under the resolved mode. Mirrors the old signature
 *  (query is the raw search string); ancestorKeys is the path above `value`. */
export function countTreeMatches(
  value: JsonValue,
  query: string,
  key?: string | number,
  ancestorKeys: (string | number)[] = [],
  mode: SearchMode = 'fuzzy',
): number {
  const keywords = parseSearchKeywords(query)
  return countTreeMatchesKw(value, keywords, key, ancestorKeys, mode)
}

/** Whether this node or any descendant is a hit. */
export function treeHasMatch(
  value: JsonValue,
  query: string,
  key?: string | number,
  ancestorKeys: (string | number)[] = [],
  mode: SearchMode = 'fuzzy',
): boolean {
  const keywords = parseSearchKeywords(query)
  return treeHasMatchKw(value, keywords, key, ancestorKeys, mode)
}

/** Ordered hit paths (root-first pre-order, the same order the tree renders),
 *  for match navigation: each entry is the segment array from the root to a
 *  hit node. The root itself never hits (a branch has no own text). */
export function collectMatchPaths(
  value: JsonValue,
  keywords: string[],
  mode: SearchMode = 'fuzzy',
): (string | number)[][] {
  const out: (string | number)[][] = []
  function walk(
    v: JsonValue,
    key: string | number | undefined,
    ancestorKeys: (string | number)[],
    path: (string | number)[],
  ): void {
    if (nodeSearchHit(v, keywords, key, ancestorKeys, mode)) out.push([...path])
    const next = childAncestorKeys(key, ancestorKeys)
    if (Array.isArray(v)) {
      // Array elements have no key (same as JsonTreeNode's node-key); the
      // index still belongs in the path for DOM lookup.
      v.forEach((el, i) => walk(el, undefined, next, [...path, i]))
    } else if (isRecord(v)) {
      Object.keys(v).forEach((k) => walk(v[k], k, next, [...path, k]))
    }
  }
  if (keywords.length > 0) walk(value, undefined, [], [])
  return out
}

/** Keywords that match no searchable text anywhere in the tree (any key or
 *  leaf value, under `mode`) — used to tell the user which keyword missed,
 *  instead of a bare "no matches". */
export function missingKeywords(
  value: JsonValue,
  keywords: string[],
  mode: SearchMode = 'fuzzy',
): string[] {
  if (keywords.length === 0) return []
  const texts: string[] = []
  function walk(v: JsonValue, key: string | number | undefined): void {
    if (key !== undefined) texts.push(String(key))
    if (v === null || typeof v !== 'object') {
      texts.push(typeof v === 'string' ? v : String(v))
      return
    }
    if (Array.isArray(v)) v.forEach((el) => walk(el, undefined))
    else Object.keys(v).forEach((k) => walk(v[k], k))
  }
  walk(value, undefined)
  return keywords.filter((kw) => !texts.some((t) => keywordMatchesText(t, kw, mode)))
}

/** Escape `text` and wrap every matched fragment in <mark>. Keywords claim
 *  characters in order (first keyword wins an overlap); the class alternates
 *  by keyword index so two keywords are distinguishable. `mode` selects
 *  exact-substring vs subsequence matching — in exact mode fuzzy-only
 *  fragments are never marked. Render only via v-html from this function's
 *  own escaped output. */
export function highlightSearchHtml(
  text: string,
  keywords: string[],
  mode: SearchMode = 'fuzzy',
): string {
  if (keywords.length === 0) return escapeHtml(text)
  const claim = new Array<number>(text.length).fill(-1)
  keywords.forEach((kw, ki) => {
    const ranges = findKeywordRanges(text, kw, mode)
    if (!ranges) return
    ranges.forEach(({ start, end }) => {
      for (let i = start; i < end; i++) {
        if (claim[i] === -1) claim[i] = ki
      }
    })
  })
  let out = ''
  let i = 0
  while (i < text.length) {
    if (claim[i] === -1) {
      out += escapeHtml(text[i])
      i++
    } else {
      const ki = claim[i]
      let j = i
      while (j < text.length && claim[j] === ki) j++
      out += `<mark class="wb-mark-${ki % 2 === 0 ? 'a' : 'b'}">${escapeHtml(
        text.slice(i, j),
      )}</mark>`
      i = j
    }
  }
  return out
}
