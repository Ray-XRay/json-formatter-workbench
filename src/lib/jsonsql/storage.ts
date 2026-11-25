/** localStorage persistence (ported from 1.x). Key names are kept identical to
 *  1.x so existing user data carries over:
 *  - json-wb-draft / json-wb-history / json-wb-remember / json-wb-lang-mode
 *  - json-wb-shortcuts / json-wb-split / json-wb-split-v */

import { isLangMode } from './detect'
import type { LangMode } from './types'

export const DRAFT_KEY = 'json-wb-draft'
export const HISTORY_KEY = 'json-wb-history'
export const REMEMBER_KEY = 'json-wb-remember'
export const LANG_MODE_KEY = 'json-wb-lang-mode'
export const SHORTCUTS_KEY = 'json-wb-shortcuts'
export const SPLIT_KEY = 'json-wb-split'
export const SPLIT_V_KEY = 'json-wb-split-v'
export const VIEW_KEY = 'json-wb-view'

const DRAFT_MAX = 1000000 // over 1 MB is not stored
const TTL_MS = 7 * 24 * 3600 * 1000 // draft + history expire after 7 days

function read(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

function write(key: string, value: string): void {
  try {
    localStorage.setItem(key, value)
  } catch {
    /* storage full / unavailable — keep working without persistence */
  }
}

function remove(key: string): void {
  try {
    localStorage.removeItem(key)
  } catch {
    /* ignore */
  }
}

/* ---------- Remember switch ---------- */

export function isRememberOn(): boolean {
  return read(REMEMBER_KEY) !== '0'
}

export function setRemember(on: boolean): void {
  if (on) {
    remove(REMEMBER_KEY)
  } else {
    write(REMEMBER_KEY, '0')
    remove(DRAFT_KEY)
    remove(HISTORY_KEY)
  }
}

/* ---------- Draft (300 ms debounce lives in the view) ---------- */

export function saveDraft(text: string): void {
  if (!isRememberOn()) return
  if (text.length > DRAFT_MAX) return
  if (text) write(DRAFT_KEY, JSON.stringify({ k: DRAFT_KEY, t: Date.now(), v: text }))
  else remove(DRAFT_KEY)
}

/** Returns the saved draft, or null. Handles the 7-day expiry and the old
 *  plain-text format (kept once, rewritten on next save). */
export function loadDraft(): string | null {
  const raw = read(DRAFT_KEY)
  if (!raw) return null
  let parsed: unknown = null
  try {
    parsed = JSON.parse(raw)
  } catch {
    parsed = null
  }
  if (
    parsed &&
    typeof parsed === 'object' &&
    (parsed as { k?: unknown }).k === DRAFT_KEY &&
    typeof (parsed as { v?: unknown }).v === 'string'
  ) {
    const t = (parsed as { t?: unknown }).t
    if (typeof t === 'number' && Date.now() - t > TTL_MS) {
      remove(DRAFT_KEY)
      return null
    }
    return (parsed as { v: string }).v
  }
  return raw // old plain-text format
}

export function clearDraft(): void {
  remove(DRAFT_KEY)
}

/* ---------- History (max 5, 7-day expiry) ---------- */

export interface HistoryItem {
  k: string
  t: number
  v: string
}

export function loadHistoryRaw(): HistoryItem[] {
  const raw = read(HISTORY_KEY)
  if (!raw) return []
  let arr: unknown
  try {
    arr = JSON.parse(raw)
  } catch {
    return []
  }
  if (!Array.isArray(arr)) return []
  const now = Date.now()
  const out: HistoryItem[] = []
  arr.forEach((it: unknown) => {
    if (typeof it === 'string') {
      out.push({ k: HISTORY_KEY, t: now, v: it }) // old format: kept once, expiry counts from migration
      return
    }
    if (
      it &&
      typeof it === 'object' &&
      (it as { k?: unknown }).k === HISTORY_KEY &&
      typeof (it as { v?: unknown }).v === 'string' &&
      typeof (it as { t?: unknown }).t === 'number' &&
      now - (it as { t: number }).t <= TTL_MS
    ) {
      out.push(it as HistoryItem)
    }
  })
  return out
}

export function loadHistory(): string[] {
  return loadHistoryRaw().map((it) => it.v)
}

export function saveHistory(text: string): void {
  if (!text || !text.trim() || text.length > 200000) return
  if (!isRememberOn()) return
  const items = loadHistoryRaw().filter((it) => it.v !== text)
  items.unshift({ k: HISTORY_KEY, t: Date.now(), v: text })
  write(HISTORY_KEY, JSON.stringify(items.slice(0, 5)))
}

export function clearHistory(): void {
  remove(HISTORY_KEY)
}

/* ---------- View (code / tree) ---------- */

export function loadView(): 'code' | 'tree' {
  const raw = read(VIEW_KEY)
  return raw === 'tree' ? 'tree' : 'code'
}

export function saveView(view: 'code' | 'tree'): void {
  write(VIEW_KEY, view)
}

/* ---------- Page-session flag (in-memory only) ---------- */

/** Whether the JSON page has mounted before in this page load. Lives only in
 *  memory, so a reload / fresh visit resets it while switching tools inside
 *  the same SPA session does not. Used to tell a fresh visit (do not restore
 *  the draft) from coming back to the tool mid-session (restore it). */
let jsonPageMountedBefore = false

/** True only on the first mount of this page load. */
export function consumeJsonPageFirstMount(): boolean {
  if (jsonPageMountedBefore) return false
  jsonPageMountedBefore = true
  return true
}

/* ---------- Language mode ---------- */

export function loadLangMode(): LangMode {
  const raw = read(LANG_MODE_KEY)
  if (raw && isLangMode(raw)) return raw
  return 'auto'
}

export function saveLangMode(mode: LangMode): void {
  write(LANG_MODE_KEY, mode)
}

/* ---------- Shortcuts ---------- */

export function loadShortcuts(): Record<string, string> {
  const raw = read(SHORTCUTS_KEY)
  if (!raw) return {}
  try {
    const parsed: unknown = JSON.parse(raw)
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      const out: Record<string, string> = {}
      Object.entries(parsed as Record<string, unknown>).forEach(([k, v]) => {
        if (typeof v === 'string') out[k] = v
      })
      return out
    }
  } catch {
    /* corrupted — fall through to defaults */
  }
  return {}
}

export function saveShortcuts(map: Record<string, string>): void {
  write(SHORTCUTS_KEY, JSON.stringify(map))
}

/* ---------- Splitter ---------- */

export function loadSplit(): { pct: number | null; vertical: boolean } {
  const h = read(SPLIT_KEY)
  if (h) {
    const pct = Math.min(75, Math.max(25, Number(h)))
    if (pct) return { pct, vertical: false }
  }
  const v = read(SPLIT_V_KEY)
  if (v) {
    const pct = Math.min(75, Math.max(25, parseFloat(v)))
    if (pct) return { pct, vertical: true }
  }
  return { pct: null, vertical: false }
}

export function saveSplit(pct: number, vertical: boolean): void {
  if (vertical) write(SPLIT_V_KEY, pct + '%')
  else write(SPLIT_KEY, String(pct))
}
