/** 生成历史：只记文本，点一条重新生成（本机保存，最多 5 条，7 天过期）。 */
import { QR_HISTORY_KEY } from './constants'
import { safeGet, safeRemove, safeSet } from './storage'

export interface QrHistoryItem {
  t: number
  v: string
}

const QR_HISTORY_TTL = 7 * 24 * 3600 * 1000
const QR_HISTORY_MAX = 5

function isHistoryRecord(it: unknown): it is QrHistoryItem {
  if (typeof it !== 'object' || it === null) return false
  const rec = it as Record<string, unknown>
  return typeof rec.v === 'string' && typeof rec.t === 'number'
}

export function loadQrHistory(): QrHistoryItem[] {
  try {
    const raw = safeGet(QR_HISTORY_KEY)
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    const items: unknown[] = parsed
    const now = Date.now()
    const out: QrHistoryItem[] = []
    for (const it of items) {
      if (typeof it === 'string') {
        out.push({ t: now, v: it })
      } else if (isHistoryRecord(it) && now - it.t <= QR_HISTORY_TTL) {
        out.push(it)
      }
    }
    return out
  } catch {
    return []
  }
}

/** 记一条历史（去重后放最前，最多 5 条），返回更新后的列表。 */
export function saveQrHistory(text: string): QrHistoryItem[] {
  if (!text || !text.trim()) return loadQrHistory()
  const items = loadQrHistory().filter((it) => it.v !== text)
  items.unshift({ t: Date.now(), v: text })
  const trimmed = items.slice(0, QR_HISTORY_MAX)
  safeSet(QR_HISTORY_KEY, JSON.stringify(trimmed))
  return trimmed
}

export function clearQrHistory(): void {
  safeRemove(QR_HISTORY_KEY)
}
