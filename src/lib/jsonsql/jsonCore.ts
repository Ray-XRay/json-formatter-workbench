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

/* ---------- Tree search ---------- */

/** Text a tree node matches against: its key, or its leaf value as shown.
 *  Mirrors 1.x, where a leaf row's text is `"key": value`. */
function nodeOwnText(value: JsonValue, key: string | number | undefined): string {
  if (value !== null && typeof value === 'object') {
    return key === undefined ? '' : `"${key}"`
  }
  const leaf = typeof value === 'string' ? `"${value}"` : String(value)
  return key === undefined ? leaf : `"${key}": ${leaf}`
}

/** Count nodes whose own key / leaf text contains the query (case-insensitive).
 *  Mirrors 1.x filterTree's match count. */
export function countTreeMatches(
  value: JsonValue,
  query: string,
  key?: string | number,
): number {
  const q = query.trim().toLowerCase()
  if (!q) return 0
  let count = nodeOwnText(value, key).toLowerCase().includes(q) ? 1 : 0
  if (Array.isArray(value)) {
    value.forEach((el) => {
      count += countTreeMatches(el, q)
    })
  } else if (isRecord(value)) {
    Object.keys(value).forEach((k) => {
      count += countTreeMatches(value[k], q, k)
    })
  }
  return count
}

/** Whether this node or any descendant matches the query. */
export function treeHasMatch(
  value: JsonValue,
  query: string,
  key?: string | number,
): boolean {
  const q = query.trim().toLowerCase()
  if (!q) return true
  if (nodeOwnText(value, key).toLowerCase().includes(q)) return true
  if (Array.isArray(value)) return value.some((el) => treeHasMatch(el, q))
  if (isRecord(value))
    return Object.keys(value).some((k) => treeHasMatch(value[k], q, k))
  return false
}
