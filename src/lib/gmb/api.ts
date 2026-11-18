/** 到站數據 API：全部來自政府公開接口、無需 key、瀏覽器直接請求（CORS: *）。
 *  - 專線小巴 https://data.etagmb.gov.hk（新界 / 九龍 / 港島）
 *  - 九巴 https://data.etabus.gov.hk/v1/transport/kmb
 *  - 城巴 https://rt.data.gov.hk/v2/transport/citybus
 *  - 港鐵 https://rt.data.gov.hk/v1/transport/mtr/getSchedule.php（ttnt 欄位就是分鐘數）
 *  fetch 一律加 10 秒超時（AbortController）。回應先收窄成型別再用，不用 any。 */
import { mtrStationName } from './mtrStations'
import type {
  BusFound,
  BusOp,
  EtaItem,
  GmbDirection,
  GmbRoute,
  MtrDir,
  RoadSrc,
  StopItem,
} from './types'

export const GMB_API = 'https://data.etagmb.gov.hk'
export const KMB_API = 'https://data.etabus.gov.hk/v1/transport/kmb'
export const CTB_API = 'https://rt.data.gov.hk/v2/transport/citybus'
export const MTR_API = 'https://rt.data.gov.hk/v1/transport/mtr/getSchedule.php'
export const REGIONS = ['NT', 'KLN', 'HKI'] as const

/** 候選路線來源：gmb-NT / gmb-KLN / gmb-HKI / kmb / ctb */
export const SRC_LABEL: Record<RoadSrc, string> = {
  'gmb-NT': '專線小巴 · 新界',
  'gmb-KLN': '專線小巴 · 九龍',
  'gmb-HKI': '專線小巴 · 港島',
  kmb: '九巴',
  ctb: '城巴',
}
export const SRC_SHORT: Record<string, string> = {
  'gmb-NT': '小巴·新界',
  'gmb-KLN': '小巴·九龍',
  'gmb-HKI': '小巴·港島',
  kmb: '九巴',
  ctb: '城巴',
}

/* ---------- 輕量收窄工具 ---------- */

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

function str(v: unknown, fallback = ''): string {
  return typeof v === 'string' ? v : fallback
}

function num(v: unknown, fallback = 0): number {
  if (typeof v === 'number' && Number.isFinite(v)) return v
  if (typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v))) return Number(v)
  return fallback
}

function asArray(v: unknown): unknown[] {
  return Array.isArray(v) ? v : []
}

/* ---------- 共用 ---------- */

export async function fetchJson(url: string): Promise<unknown> {
  const ctrl = new AbortController()
  const timer = window.setTimeout(() => ctrl.abort(), 10000)
  try {
    const res = await fetch(url, { signal: ctrl.signal })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    return (await res.json()) as unknown
  } finally {
    window.clearTimeout(timer)
  }
}

export function fmtTime(iso: string): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  const h = d.getHours()
  const m = d.getMinutes()
  return `${h < 10 ? '0' + h : h}:${m < 10 ? '0' + m : m}`
}

export function fmtNow(): string {
  const d = new Date()
  const h = d.getHours()
  const m = d.getMinutes()
  const s = d.getSeconds()
  return `${h < 10 ? '0' + h : h}:${m < 10 ? '0' + m : m}:${s < 10 ? '0' + s : s}`
}

export function minsFrom(iso: string): number | null {
  const t = new Date(iso).getTime()
  if (Number.isNaN(t)) return null
  return Math.max(0, Math.round((t - Date.now()) / 60000))
}

/* ---------- 專線小巴 ---------- */

export async function fetchGmbRoute(region: string, code: string): Promise<GmbRoute | null> {
  const json = await fetchJson(`${GMB_API}/route/${region}/${encodeURIComponent(code)}`)
  const data = asArray(isRecord(json) ? json.data : undefined)
  if (data.length === 0) return null
  const r = data[0]
  if (!isRecord(r)) return null
  const routeId = num(r.route_id, 0)
  if (!routeId) return null
  const directions: GmbDirection[] = []
  for (const d of asArray(r.directions)) {
    if (!isRecord(d)) continue
    directions.push({
      route_seq: num(d.route_seq, 0),
      orig_tc: str(d.orig_tc),
      dest_tc: str(d.dest_tc),
    })
  }
  return { route_id: routeId, directions }
}

export async function fetchGmbStops(routeId: number, routeSeq: number): Promise<StopItem[]> {
  const json = await fetchJson(`${GMB_API}/route-stop/${routeId}/${routeSeq}`)
  const data = isRecord(json) ? json.data : undefined
  const raw = isRecord(data) ? asArray(data.route_stops) : []
  const stops: StopItem[] = []
  for (const s of raw) {
    if (!isRecord(s)) continue
    stops.push({ stop_seq: num(s.stop_seq, 0), stop_id: '', name_tc: str(s.name_tc), name_en: str(s.name_en) })
  }
  return stops
}

export async function fetchGmbEta(
  routeId: number,
  routeSeq: number,
  stopSeq: number,
): Promise<{ enabled: boolean; items: EtaItem[] }> {
  const json = await fetchJson(`${GMB_API}/eta/route-stop/${routeId}/${routeSeq}/${stopSeq}`)
  const data = isRecord(json) ? json.data : undefined
  if (!isRecord(data)) return { enabled: false, items: [] }
  const enabled = data.enabled === true
  const items: EtaItem[] = []
  for (const e of asArray(data.eta)) {
    if (!isRecord(e)) continue
    items.push({ min: num(e.diff, 0), time: fmtTime(str(e.timestamp)), remark: str(e.remarks_tc) })
  }
  return { enabled, items }
}

/* ---------- 九巴 / 城巴 ---------- */

/** 九巴：去程 / 回程逐個查，有資料的方向才算一條。 */
export async function fetchKmbRoute(code: string): Promise<BusFound | null> {
  const dirs: BusFound['dirs'] = []
  for (const bound of ['outbound', 'inbound'] as const) {
    try {
      const json = await fetchJson(`${KMB_API}/route/${encodeURIComponent(code)}/${bound}/1`)
      const d = isRecord(json) ? json.data : undefined
      if (isRecord(d) && str(d.route)) {
        dirs.push({
          key: bound,
          label: `${str(d.orig_tc)} → ${str(d.dest_tc)}`,
          serviceType: str(d.service_type, '1'),
        })
      }
    } catch {
      // 單一方向查不到就跳過
    }
  }
  return dirs.length ? { op: 'KMB', dirs, serviceType: dirs[0].serviceType } : null
}

/** 城巴：/route 一次拿齊頭尾站，去程 / 回程方向名直接寫對。 */
export async function fetchCtbRoute(code: string): Promise<BusFound | null> {
  const json = await fetchJson(`${CTB_API}/route/CTB/${encodeURIComponent(code)}`)
  const d = isRecord(json) ? json.data : undefined
  if (!isRecord(d) || !str(d.route)) return null
  return {
    op: 'CTB',
    dirs: [
      { key: 'outbound', label: `${str(d.orig_tc)} → ${str(d.dest_tc)}`, serviceType: '1' },
      { key: 'inbound', label: `${str(d.dest_tc)} → ${str(d.orig_tc)}`, serviceType: '1' },
    ],
    serviceType: '1',
  }
}

/** 巴士站表：先拿站序，再逐站並行查站名（九巴 /stop/{id}、城巴 /stop/{id}）。 */
export async function fetchBusStops(
  op: BusOp,
  code: string,
  dirKey: string,
  serviceType: string,
): Promise<StopItem[]> {
  const url =
    op === 'KMB'
      ? `${KMB_API}/route-stop/${encodeURIComponent(code)}/${dirKey}/${serviceType}`
      : `${CTB_API}/route-stop/CTB/${encodeURIComponent(code)}/${dirKey}`
  const json = await fetchJson(url)
  const raw = asArray(isRecord(json) ? json.data : undefined)
  const stops: StopItem[] = []
  for (const r of raw) {
    if (!isRecord(r)) continue
    stops.push({ stop_seq: num(r.seq, 0), stop_id: str(r.stop), name_tc: '', name_en: '' })
  }
  const nameUrl = (id: string): string =>
    op === 'KMB' ? `${KMB_API}/stop/${id}` : `${CTB_API}/stop/${id}`
  const filled = await Promise.all(
    stops.map(async (s) => {
      try {
        const j = await fetchJson(nameUrl(s.stop_id))
        const d = isRecord(j) ? j.data : undefined
        if (isRecord(d)) {
          s.name_tc = str(d.name_tc)
          s.name_en = str(d.name_en)
        }
      } catch {
        // 單站站名查不到就留空，稍後過濾掉
      }
      return s
    }),
  )
  return filled.filter((s) => s.name_tc)
}

export async function fetchKmbEta(code: string, serviceType: string, stopSeq: number): Promise<EtaItem[]> {
  const json = await fetchJson(`${KMB_API}/route-eta/${encodeURIComponent(code)}/${serviceType}`)
  const raw = asArray(isRecord(json) ? json.data : undefined)
  const list: EtaItem[] = []
  for (const e of raw) {
    if (!isRecord(e)) continue
    if (num(e.seq, -1) !== stopSeq || !str(e.eta)) continue
    const min = minsFrom(str(e.eta))
    if (min === null) continue
    list.push({ min, time: fmtTime(str(e.eta)), remark: str(e.rmk_tc) })
  }
  return list.slice(0, 3)
}

export async function fetchCtbEta(stopId: string, code: string, dirKey: string): Promise<EtaItem[]> {
  const json = await fetchJson(`${CTB_API}/eta/CTB/${stopId}/${encodeURIComponent(code)}`)
  const raw = asArray(isRecord(json) ? json.data : undefined)
  const dirCode = dirKey === 'outbound' ? 'O' : 'I'
  const list: EtaItem[] = []
  for (const e of raw) {
    if (!isRecord(e)) continue
    if (str(e.dir) !== dirCode || !str(e.eta)) continue
    const min = minsFrom(str(e.eta))
    if (min === null) continue
    list.push({
      min,
      time: fmtTime(str(e.eta)),
      remark: str(e.rmk_tc) + (str(e.dest_tc) ? ` · 往 ${str(e.dest_tc)}` : ''),
    })
  }
  return list.slice(0, 3)
}

/* ---------- 港鐵 ---------- */

/** ttnt 欄位就是分鐘數；time 是 'YYYY-MM-DD HH:MM:SS'，取 11–16 位得 HH:MM。 */
export async function fetchMtrEta(line: string, sta: string, dir: MtrDir): Promise<EtaItem[]> {
  const json = await fetchJson(`${MTR_API}?line=${line}&sta=${sta}`)
  const data = isRecord(json) ? json.data : undefined
  const d = isRecord(data) ? data[`${line}-${sta}`] : undefined
  const trains = isRecord(d) ? asArray(d[dir]) : []
  const list: EtaItem[] = []
  for (const t of trains) {
    if (!isRecord(t)) continue
    if (str(t.valid) !== 'Y' || t.ttnt === undefined) continue
    list.push({
      min: Number.parseInt(str(t.ttnt), 10) || 0,
      time: str(t.time).slice(11, 16),
      remark: `往 ${mtrStationName(line, str(t.dest))} · ${str(t.plat)}號月台`,
    })
  }
  return list.slice(0, 3)
}
