/** 最近路線：只存本機，記住路線號碼 + 來源，點一下直達同一條。
 *  鍵名與 1.x 完全一致：寫入用 'gmb-wb-recent'，讀取時把舊版分開存的
 *  'gmb-wb-recent-bus' 也合併進來（舊記錄可能是純字串）。 */
import type { RecentEntry } from './types'

const RECENT_KEYS = ['gmb-wb-recent', 'gmb-wb-recent-bus'] as const
const RECENT_MAX = 5

function parseEntry(value: unknown): RecentEntry | null {
  if (typeof value === 'string') return { code: value, src: '' }
  if (typeof value === 'object' && value !== null && typeof (value as { code?: unknown }).code === 'string') {
    const code = (value as { code: string }).code
    const src = (value as { src?: unknown }).src
    return { code, src: typeof src === 'string' ? src : '' }
  }
  return null
}

export function getRecent(): RecentEntry[] {
  const out: RecentEntry[] = []
  const seen = new Set<string>()
  for (const key of RECENT_KEYS) {
    try {
      const raw: unknown = JSON.parse(localStorage.getItem(key) ?? '[]')
      if (!Array.isArray(raw)) continue
      for (const item of raw) {
        const entry = parseEntry(item)
        if (!entry) continue
        const k = `${entry.code}|${entry.src}`
        if (seen.has(k)) continue
        seen.add(k)
        out.push(entry)
      }
    } catch {
      // 損壞的記錄直接跳過
    }
  }
  return out.slice(0, RECENT_MAX)
}

export function saveRecent(code: string, src: string): RecentEntry[] {
  const list = getRecent().filter((x) => !(x.code === code && x.src === (src ?? '')))
  list.unshift({ code, src: src ?? '' })
  const trimmed = list.slice(0, RECENT_MAX)
  try {
    localStorage.setItem('gmb-wb-recent', JSON.stringify(trimmed))
  } catch {
    // 私隱模式等寫入失敗時忽略
  }
  return trimmed
}
