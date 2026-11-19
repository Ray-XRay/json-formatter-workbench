/** 到站看板業務邏輯（由 1.x gmb.js 遷移而來，狀態全部進 Vue 的 ref/computed）。
 *  模式：road（巴士 · 小巴合併：同時查五個來源）/ mtr（港鐵）。
 *  預設 87M 四號貨櫃碼頭 → 葵芳站（小巴 route_id 2006681、方向 2、第 1 站）。
 *  動效沿用 1.x v1.17.0：renderEtaCards + lastEtaMin 比對，只有分鐘數真的變了的卡
 *  才播上升動畫；迴圈裡的異步回調用 const 綁定序號，不用 var（1.x 踩過的閉包坑）。 */
import { computed, onMounted, onUnmounted, ref, watch, type ComputedRef, type Ref } from 'vue'
import { useRoute } from 'vue-router'
import { useToast } from '../../composables/useToast'
import {
  fetchBusStops,
  fetchCtbEta,
  fetchCtbRoute,
  fetchGmbEta,
  fetchGmbRoute,
  fetchGmbStops,
  fetchKmbEta,
  fetchKmbRoute,
  fetchMtrEta,
  fmtNow,
  REGIONS,
  SRC_LABEL,
  SRC_SHORT,
} from './api'
import { MTR_LINES, MTR_LINE_ORDER, findNearestMtrStation, mtrStationName } from './mtrStations'
import { clearRecent, getRecent, saveRecent } from './recent'
import { CLEAR_HISTORY_EVENT } from '../../composables/useSettings'
import type {
  BusFound,
  BusState,
  DirItem,
  EtaItem,
  GmbRoute,
  Mode,
  MtrDir,
  MtrState,
  RecentEntry,
  RoadKind,
  RoadSrc,
  RouteCandidate,
  StatusType,
  StopItem,
} from './types'

const ETA_LABELS = ['下一班', '再下一班', '第三班'] as const
const AUTO_REFRESH_MS = 30000
/** 港鐵「找最近車站」：自動定位開關（可關）與已授權標記。只存標記，不存經緯度。 */
const MTR_AUTOLOCATE_KEY = 'wb20-mtr-autolocate'
const MTR_AUTHORIZED_KEY = 'wb20-mtr-authorized'

function readAutoLocate(): boolean {
  try {
    return window.localStorage.getItem(MTR_AUTOLOCATE_KEY) !== '0'
  } catch {
    return true
  }
}

function readMtrAuthorized(): boolean {
  try {
    return window.localStorage.getItem(MTR_AUTHORIZED_KEY) === '1'
  } catch {
    return false
  }
}

function saveMtrAuthorized(): void {
  try {
    window.localStorage.setItem(MTR_AUTHORIZED_KEY, '1')
  } catch {
    // 隱私模式等寫不進去也不影響定位本身
  }
}

export interface EtaCardView {
  label: string
  minText: string
  showUnit: boolean
  timeText: string
  remark: string
  soon: boolean
}

export interface StatusView {
  type: StatusType
  message: string
}


/** 一條「巴士 · 小巴」查詢面板的全部狀態與操作。useGmb 建兩個實例：
 *  roadA（主面板；狀態行與港鐵共用）與 roadB（第二條路線，預設不查）。 */
export interface RoadPanel {
  routeInput: Ref<string>
  stopFilter: Ref<string>
  roadKind: Ref<RoadKind>
  roadSrc: Ref<string>
  roadCode: Ref<string>
  candidates: Ref<RouteCandidate[]>
  loading: Ref<boolean>
  status: Ref<StatusView>
  updatedAt: Ref<string>
  etaItems: Ref<(EtaItem | null)[]>
  etaAnim: Ref<boolean[]>
  etaNumKey: Ref<string[]>
  etaCards: ComputedRef<EtaCardView[]>
  dirOptions: ComputedRef<DirItem[]>
  activeDirKey: ComputedRef<string>
  currentStops: ComputedRef<StopItem[]>
  filteredStops: ComputedRef<StopItem[]>
  stopSeqModel: ComputedRef<number>
  routeTitle: ComputedRef<string>
  routeRegionLabel: ComputedRef<string>
  statusDotClass: ComputedRef<string>
  detailStats: ComputedRef<string>
  bus: Ref<BusState>
  setStatus: (type: StatusType, message: string) => void
  stampUpdated: () => void
  renderEtaCards: (items: EtaItem[]) => void
  onEtaAnimEnd: (index: number) => void
  search: (
    code: string,
    opts?: { dir?: number | string; stop?: number; src?: string },
  ) => Promise<boolean>
  loadCurrentEta: () => Promise<void>
  onSearch: () => void
  onRouteKeydown: (e: KeyboardEvent) => void
  onCandidatePick: (cand: RouteCandidate) => void
  onRecentClick: (entry: RecentEntry) => void
  onDirPick: (key: string) => void
  onStopPick: (seq: number) => void
}

export function useGmb(): {
  mode: Ref<Mode>
  loading: Ref<boolean>
  refreshing: Ref<boolean>
  autoRefresh: Ref<boolean>
  routeInput: Ref<string>
  stopFilter: Ref<string>
  roadKind: Ref<RoadKind>
  roadSrc: Ref<string>
  roadCode: Ref<string>
  candidates: Ref<RouteCandidate[]>
  recent: Ref<RecentEntry[]>
  bus: Ref<BusState>
  mtr: Ref<MtrState>
  locating: Ref<boolean>
  nearestInfo: Ref<string>
  autoLocate: Ref<boolean>
  status: Ref<StatusView>
  updatedAt: Ref<string>
  etaItems: Ref<(EtaItem | null)[]>
  etaAnim: Ref<boolean[]>
  etaNumKey: Ref<string[]>
  etaCards: ComputedRef<EtaCardView[]>
  dirOptions: ComputedRef<DirItem[]>
  activeDirKey: ComputedRef<string>
  currentStops: ComputedRef<StopItem[]>
  filteredStops: ComputedRef<StopItem[]>
  stopSeqModel: ComputedRef<number>
  routeTitle: ComputedRef<string>
  routeRegionLabel: ComputedRef<string>
  mtrLineOptions: ComputedRef<{ code: string; name: string }[]>
  mtrStations: ComputedRef<[string, string, number, number][]>
  statusDotClass: ComputedRef<string>
  detailStats: ComputedRef<string>
  srcShort: (src: string) => string
  setMode: (next: Mode) => void
  onSearch: () => void
  onRouteKeydown: (e: KeyboardEvent) => void
  onCandidatePick: (cand: RouteCandidate) => void
  onRecentClick: (entry: RecentEntry) => void
  onDirPick: (key: string) => void
  onStopPick: (seq: number) => void
  onMtrLineChange: () => void
  onMtrStationChange: () => void
  onEtaAnimEnd: (index: number) => void
  locateNearest: () => Promise<void>
  loadCurrentEta: () => Promise<void>
  refreshNow: () => Promise<void>
  clearRecentHistory: () => void
  road2: RoadPanel
} {
  const route = useRoute()
  const { push } = useToast()

  /* ---------- 狀態 ---------- */
  const mode = ref<Mode>('road')
  const refreshing = ref(false)
  const autoRefresh = ref(true)
  const recent = ref<RecentEntry[]>([])

  // 港鐵（預設荃灣綫葵芳站）
  const mtr = ref<MtrState>({ line: 'TWL', sta: 'KWF', dir: 'UP' })

  // 「找最近車站」：定位中 / 最近站說明 / 下次進港鐵模式是否自動定位（預設開，可關）
  const locating = ref(false)
  const nearestInfo = ref('')
  const autoLocate = ref(readAutoLocate())


  // 減弱動態偏好：即時監聽 matchMedia，作業階段改系統設定也生效（不只載入時快照）。
  const reducedMotionQuery =
    typeof window !== 'undefined'
      ? window.matchMedia('(prefers-reduced-motion: reduce)')
      : null
  const reducedMotion = ref(reducedMotionQuery?.matches ?? false)

  function onReducedMotionChange(e: MediaQueryListEvent): void {
    reducedMotion.value = e.matches
  }

  // 進行中的資料請求計數：狀態點在有請求在飛時呼吸脈衝（見 statusDotClass）。
  const working = ref(false)
  let workingCount = 0

  function markWorkingStart(): void {
    workingCount += 1
    working.value = true
  }

  function markWorkingEnd(): void {
    workingCount = Math.max(0, workingCount - 1)
    if (workingCount === 0) working.value = false
  }

  let etaTimer: number | undefined
  const animTimers: number[] = []


  /* ---------- 巴士 · 小巴面板工廠：roadA（主）與 roadB（第二條路線）共用 ----------
   *  每個面板自帶一套路線/站點/ETA 狀態；共用的只有最近路線（recent）、
   *  減弱動態（reducedMotion）、請求計數（markWorking*）與動畫計時器。 */
  function createRoadPanel(defaultInput: string): RoadPanel {
  const routeInput = ref(defaultInput)
  const stopFilter = ref('')
  const loading = ref(false)
  const roadKind = ref<RoadKind>('')
  const roadSrc = ref('')
  const roadCode = ref('')
  const candidates = ref<RouteCandidate[]>([])
  const status = ref<StatusView>({ type: 'idle', message: '就緒' })
  const updatedAt = ref('')


  // 小巴
  const gmbRouteCode = ref('')
  const gmbRegion = ref('')
  const gmbRouteId = ref(0)
  const gmbDirections = ref<GmbRoute['directions']>([])
  const gmbRouteSeq = ref(0)
  const gmbStops = ref<StopItem[]>([])
  const gmbStopSeq = ref(0)

  // 巴士
  const bus = ref<BusState>({
    op: 'KMB',
    code: '',
    dirs: [],
    dirKey: '',
    serviceType: '1',
    stops: [],
    stopSeq: 0,
    stopId: '',
  })


  // ETA 卡：三格，null = 暫無班次
  const etaItems = ref<(EtaItem | null)[]>([null, null, null])
  const etaAnim = ref<boolean[]>([false, false, false])
  // 到站數字掉落動效的 :key：只有分鐘數真的變了（renderEtaCards 的 changed）才換 key、
  // 舊數字離場、新數字落下；沒變時 key 不動，不播。
  const etaNumKey = ref<string[]>(['k0', 'k1', 'k2'])
  let numKeySeq = 0
  const lastEtaMin: (number | null)[] = [null, null, null]

  function setStatus(type: StatusType, message: string): void {
    status.value = { type, message }
  }

  /* ---------- ETA 卡渲染 + v1.17.0 動效 ---------- */
  function renderEtaCards(items: EtaItem[]): void {
    for (let i = 0; i < 3; i++) {
      const item = items[i] ?? null
      const newMin = item !== null && Number.isFinite(item.min) ? item.min : null
      const changed = newMin !== lastEtaMin[i]
      lastEtaMin[i] = newMin
      etaItems.value[i] = item
      if (changed && !reducedMotion.value) {
        // 數字掉落動效：換 :key 觸發舊數字離場、新數字落下；三卡錯開在模板裡按序加 delay
        numKeySeq += 1
        etaNumKey.value[i] = `n${numKeySeq}`
        // 先摘掉再加回，動畫才能重新觸發；序號用 const 綁定，不重蹈 var 閉包串位的坑
        etaAnim.value[i] = false
        const idx = i
        animTimers.push(window.setTimeout(() => {
          etaAnim.value[idx] = true
        }, 0))
      }
    }
  }

  function onEtaAnimEnd(index: number): void {
    etaAnim.value[index] = false
  }

  function stampUpdated(): void {
    const stamp = fmtNow()
    updatedAt.value = stamp
    setStatus('ok', `更新於 ${stamp}`)
  }


  const etaCards = computed<EtaCardView[]>(() =>
    ETA_LABELS.map((label, i) => {
      const item = etaItems.value[i] ?? null
      if (!item) {
        return { label, minText: '—', showUnit: false, timeText: '暫無班次', remark: '', soon: false }
      }
      return {
        label,
        minText: item.min <= 0 ? '即到' : String(item.min),
        showUnit: item.min > 0,
        timeText: `${item.time || '—'} 到站`,
        remark: item.remark,
        soon: item.min <= 0,
      }
    }),
  )


  const roadDirOptions = computed<DirItem[]>(() => {
    if (roadKind.value === 'gmb') {
      return gmbDirections.value.map((d) => ({
        key: String(d.route_seq),
        label: `${d.orig_tc} → ${d.dest_tc}`,
      }))
    }
    if (roadKind.value === 'bus') {
      return bus.value.dirs.map((d) => ({ key: d.key, label: d.label }))
    }
    return []
  })


  /* ---------- 派生（只看本面板的路線） ---------- */
  const activeDirKey = computed<string>(() => {
    if (roadKind.value === 'gmb') return String(gmbRouteSeq.value)
    return bus.value.dirKey
  })

  const currentStops = computed<StopItem[]>(() =>
    roadKind.value === 'bus' ? bus.value.stops : gmbStops.value,
  )

  const filteredStops = computed<StopItem[]>(() => {
    const q = stopFilter.value.trim().toLowerCase()
    if (!q) return currentStops.value
    return currentStops.value.filter(
      (s) => s.name_tc.includes(q) || s.name_en.toLowerCase().includes(q),
    )
  })

  const stopSeqModel = computed<number>({
    get: () => (roadKind.value === 'bus' ? bus.value.stopSeq : gmbStopSeq.value),
    set: (v: number) => {
      if (!v) return
      if (roadKind.value === 'bus') busSetStop(v)
      else setStop(v)
    },
  })

  const routeTitle = computed<string>(() => roadCode.value || '巴士 · 小巴')

  const routeRegionLabel = computed<string>(() => {
    if (roadKind.value === 'gmb')
      return SRC_LABEL[`gmb-${gmbRegion.value}` as RoadSrc] ?? gmbRegion.value
    if (roadKind.value === 'bus') return bus.value.op === 'KMB' ? '九巴' : '城巴'
    return ''
  })

  const statusDotClass = computed<string>(() => {
    let cls: string
    if (status.value.type === 'ok') cls = 'bg-green-500'
    else if (status.value.type === 'err') cls = 'bg-red-500'
    else if (status.value.type === 'warn') cls = 'bg-amber-500'
    else cls = 'bg-muted-foreground/50'
    // 查資料進行中：狀態點呼吸脈衝（動畫本身在 GmbView.vue，減弱動態時不播）。
    return working.value ? `${cls} gmb-status-pulse` : cls
  })

  // 更新時間只在底部狀態行出現一次（status.message 的「更新於 HH:MM:SS」）；
  // 這裡只留「每分鐘更新」，不再重複時間戳。
  const detailStats = computed<string>(() => (updatedAt.value ? '每分鐘更新' : ''))


  /* ---------- 巴士 · 小巴（合併）：同時查五個來源，同編號多條路線任選 ---------- */
  async function roadSearch(
    code: string,
    opts: { dir?: number | string; stop?: number; src?: string } = {},
  ): Promise<boolean> {
    const clean = code.trim().toUpperCase()
    if (!clean) {
      setStatus('warn', '請先輸入路線號碼')
      return false
    }
    if (loading.value) return false
    loading.value = true
    setStatus('idle', `正在找 ${clean}…`)
    routeInput.value = clean
    candidates.value = []
    markWorkingStart()
    try {
      const probes: Promise<RouteCandidate | null>[] = []
      for (const region of REGIONS) {
        probes.push(
          fetchGmbRoute(region, clean)
            .then((r): RouteCandidate | null => {
              if (!r) return null
              const d0 = r.directions[0]
              return {
                src: `gmb-${region}` as RoadSrc,
                code: clean,
                label: SRC_LABEL[`gmb-${region}` as RoadSrc],
                summary: d0 ? `${d0.orig_tc} ↔ ${d0.dest_tc}` : '',
                payload: { region, route: r },
              }
            })
            .catch(() => null),
        )
      }
      probes.push(
        fetchKmbRoute(clean)
          .then((f): RouteCandidate | null =>
            f
              ? { src: 'kmb', code: clean, label: '九巴', summary: f.dirs[0]?.label ?? '', payload: f }
              : null,
          )
          .catch(() => null),
      )
      probes.push(
        fetchCtbRoute(clean)
          .then((f): RouteCandidate | null =>
            f
              ? { src: 'ctb', code: clean, label: '城巴', summary: f.dirs[0]?.label ?? '', payload: f }
              : null,
          )
          .catch(() => null),
      )
      const found = await Promise.all(probes)
      const cands = found.filter((c): c is RouteCandidate => c !== null)
      candidates.value = cands
      if (!cands.length) {
        setStatus('err', `找不到路線 ${clean}`)
        push(`找不到 ${clean}，檢查一下號碼`)
        return false
      }
      let pick: RouteCandidate | null = null
      if (opts.src) pick = cands.find((c) => c.src === opts.src) ?? null
      // 只有一條就直接載入；多條就列出來等用戶自己選
      if (cands.length === 1) pick = cands[0]
      if (pick) {
        roadLoadCandidate(pick, opts)
        return true
      }
      setStatus('idle', `找到 ${cands.length} 條同編號路線，請選一條`)
      return true
    } catch (err) {
      setStatus('err', '查不到，請檢查網絡後再試')
      push(`請求失敗：${err instanceof Error ? err.message : '網絡錯誤'}`)
      return false
    } finally {
      loading.value = false
      markWorkingEnd()
    }
  }

  function roadLoadCandidate(
    cand: RouteCandidate,
    opts: { dir?: number | string; stop?: number } = {},
  ): void {
    roadSrc.value = cand.src
    roadCode.value = cand.code
    if ('region' in cand.payload) {
      roadKind.value = 'gmb'
      applyGmbRoute(cand.code, cand.payload.region, cand.payload.route, opts)
    } else {
      roadKind.value = 'bus'
      applyBusRoute(cand.code, cand.payload, opts)
    }
  }

  // 最近路線點回來：只查當時那個來源，查不到才退回全來源搜尋
  async function roadLoadBySrc(code: string, src: string): Promise<void> {
    if (loading.value) return
    setStatus('idle', `正在找 ${code}…`)
    let probe: Promise<RouteCandidate | null>
    if (src.startsWith('gmb-')) {
      const region = src.slice(4)
      probe = fetchGmbRoute(region, code)
        .then((r): RouteCandidate | null => {
          if (!r) return null
          const d0 = r.directions[0]
          return {
            src: src as RoadSrc,
            code,
            label: SRC_LABEL[src as RoadSrc] ?? region,
            summary: d0 ? `${d0.orig_tc} ↔ ${d0.dest_tc}` : '',
            payload: { region, route: r },
          }
        })
        .catch(() => null)
    } else if (src === 'kmb') {
      probe = fetchKmbRoute(code)
        .then((f): RouteCandidate | null =>
          f
            ? { src: 'kmb', code, label: '九巴', summary: f.dirs[0]?.label ?? '', payload: f }
            : null,
        )
        .catch(() => null)
    } else if (src === 'ctb') {
      probe = fetchCtbRoute(code)
        .then((f): RouteCandidate | null =>
          f
            ? { src: 'ctb', code, label: '城巴', summary: f.dirs[0]?.label ?? '', payload: f }
            : null,
        )
        .catch(() => null)
    } else {
      await roadSearch(code, {})
      return
    }
    markWorkingStart()
    try {
      const cand = await probe
      if (cand) {
        candidates.value = [cand]
        roadLoadCandidate(cand, {})
      } else {
        await roadSearch(code, {})
      }
    } finally {
      markWorkingEnd()
    }
  }

  /* ---------- 專線小巴 ---------- */
  function applyGmbRoute(
    code: string,
    region: string,
    route: GmbRoute,
    opts: { dir?: number | string; stop?: number } = {},
  ): void {
    gmbRouteCode.value = code
    gmbRegion.value = region
    gmbRouteId.value = route.route_id
    gmbDirections.value = route.directions
    recent.value = saveRecent(code, `gmb-${region}`)
    renderGmbDirections(typeof opts.dir === 'number' ? opts.dir : undefined, opts.stop)
  }

  function renderGmbDirections(preferSeq?: number, preferStop?: number): void {
    let seq = preferSeq
    if (!seq || !gmbDirections.value.some((d) => d.route_seq === seq)) {
      seq = gmbDirections.value.length ? gmbDirections.value[0].route_seq : 0
    }
    setDirection(seq, preferStop)
  }

  function setDirection(seq: number, preferStop?: number): void {
    if (!seq) return
    gmbRouteSeq.value = seq
    void loadStops(preferStop)
  }

  async function loadStops(preferStop?: number): Promise<void> {
    if (!gmbRouteId.value || !gmbRouteSeq.value) return
    setStatus('idle', '正在載入站點…')
    markWorkingStart()
    try {
      const stops = await fetchGmbStops(gmbRouteId.value, gmbRouteSeq.value)
      gmbStops.value = stops
      let stop = preferStop
      if (!stop || !stops.some((s) => s.stop_seq === stop)) {
        stop = stops.length ? stops[0].stop_seq : 0
      }
      setStop(stop)
    } catch {
      setStatus('err', '站點載入失敗，請再試一次')
    } finally {
      markWorkingEnd()
    }
  }

  function setStop(seq: number): void {
    if (!seq) return
    gmbStopSeq.value = seq
    void loadEta()
  }

  async function loadEta(): Promise<void> {
    if (!gmbRouteId.value || !gmbRouteSeq.value || !gmbStopSeq.value) return
    setStatus('idle', '正在查到站時間…')
    markWorkingStart()
    try {
      const { enabled, items } = await fetchGmbEta(
        gmbRouteId.value,
        gmbRouteSeq.value,
        gmbStopSeq.value,
      )
      if (!enabled) {
        renderEtaCards([])
        setStatus('warn', '這站暫無實時到站資料')
        return
      }
      renderEtaCards(items)
      stampUpdated()
    } catch {
      setStatus('err', '到站時間查不到，請再試一次')
    } finally {
      markWorkingEnd()
    }
  }

  /* ---------- 巴士：九巴 / 城巴 ---------- */
  function applyBusRoute(
    code: string,
    found: BusFound,
    opts: { dir?: number | string; stop?: number } = {},
  ): void {
    bus.value = {
      op: found.op,
      code,
      dirs: found.dirs,
      dirKey: '',
      serviceType: found.serviceType || '1',
      stops: [],
      stopSeq: 0,
      stopId: '',
    }
    recent.value = saveRecent(code, found.op === 'KMB' ? 'kmb' : 'ctb')
    renderBusDirections(typeof opts.dir === 'string' ? opts.dir : undefined, opts.stop)
  }

  function renderBusDirections(preferKey?: string, preferStop?: number): void {
    let key = preferKey
    if (!key || !bus.value.dirs.some((d) => d.key === key)) {
      key = bus.value.dirs.length ? bus.value.dirs[0].key : ''
    }
    busSetDirection(key, preferStop)
  }

  function busSetDirection(key: string, preferStop?: number): void {
    if (!key) return
    bus.value.dirKey = key
    void busLoadStops(preferStop)
  }

  async function busLoadStops(preferStop?: number): Promise<void> {
    const b = bus.value
    if (!b.code || !b.dirKey) return
    setStatus('idle', '正在載入巴士站…')
    markWorkingStart()
    try {
      const stops = await fetchBusStops(b.op, b.code, b.dirKey, b.serviceType)
      // 查詢期間用戶可能已切走：只在仍是同一條路線、同一方向時寫回
      if (bus.value.code !== b.code || bus.value.dirKey !== b.dirKey) return
      bus.value.stops = stops
      let stop = preferStop
      if (!stop || !stops.some((s) => s.stop_seq === stop)) {
        stop = stops.length ? stops[0].stop_seq : 0
      }
      busSetStop(stop)
    } catch {
      setStatus('err', '巴士站載入失敗，請再試一次')
    } finally {
      markWorkingEnd()
    }
  }

  function busSetStop(seq: number): void {
    if (!seq) return
    const b = bus.value
    b.stopSeq = seq
    const stop = b.stops.find((s) => s.stop_seq === seq)
    b.stopId = stop ? stop.stop_id : ''
    void busLoadEta()
  }

  async function busLoadEta(): Promise<void> {
    const b = bus.value
    if (!b.code || !b.stopSeq) return
    setStatus('idle', '正在查巴士到站時間…')
    markWorkingStart()
    try {
      const list =
        b.op === 'KMB'
          ? await fetchKmbEta(b.code, b.serviceType, b.stopSeq)
          : await fetchCtbEta(b.stopId, b.code, b.dirKey)
      renderEtaCards(list)
      stampUpdated()
    } catch {
      setStatus('err', '到站時間查不到，請再試一次')
    } finally {
      markWorkingEnd()
    }
  }


  /* ---------- 本面板的事件（只看路線，不分模式） ---------- */
  function onSearch(): void {
    void roadSearch(routeInput.value, {})
  }

  function onRouteKeydown(e: KeyboardEvent): void {
    if (e.key === 'Enter') void roadSearch(routeInput.value, {})
  }

  function onCandidatePick(cand: RouteCandidate): void {
    roadLoadCandidate(cand, {})
  }

  function onRecentClick(entry: RecentEntry): void {
    routeInput.value = entry.code
    if (entry.src) void roadLoadBySrc(entry.code, entry.src)
    else void roadSearch(entry.code, {})
  }

  function onDirPick(key: string): void {
    if (roadKind.value === 'bus') busSetDirection(key)
    else setDirection(Number(key))
  }

  function onStopPick(seq: number): void {
    if (roadKind.value === 'bus') busSetStop(seq)
    else setStop(seq)
  }

  async function loadCurrentEtaRoad(): Promise<void> {
    if (roadKind.value === 'bus') await busLoadEta()
    else if (roadKind.value === 'gmb') await loadEta()
    // 還沒查過路線：什麼都不做
  }


  return {
    routeInput,
    stopFilter,
    roadKind,
    roadSrc,
    roadCode,
    candidates,
    loading,
    status,
    updatedAt,
    etaItems,
    etaAnim,
    etaNumKey,
    etaCards,
    dirOptions: roadDirOptions,
    activeDirKey,
    currentStops,
    filteredStops,
    stopSeqModel,
    routeTitle,
    routeRegionLabel,
    statusDotClass,
    detailStats,
    bus,
    setStatus,
    stampUpdated,
    renderEtaCards,
    onEtaAnimEnd,
    search: roadSearch,
    loadCurrentEta: loadCurrentEtaRoad,
    onSearch,
    onRouteKeydown,
    onCandidatePick,
    onRecentClick,
    onDirPick,
    onStopPick,
  }
  }

  const roadA = createRoadPanel('87M')
  const roadB = createRoadPanel('')
  // 板面共用的狀態行是主面板的（港鐵也用它）。
  const { setStatus, stampUpdated, renderEtaCards } = roadA


  const mtrLineOptions = computed<{ code: string; name: string }[]>(() =>
    MTR_LINE_ORDER.map((code) => ({ code, name: MTR_LINES[code]?.name ?? code })),
  )

  const mtrStations = computed<[string, string, number, number][]>(
    () => MTR_LINES[mtr.value.line]?.stations ?? [],
  )

  const mtrDirOptions = computed<DirItem[]>(() => {
    const line = MTR_LINES[mtr.value.line]
    if (!line || line.stations.length === 0) return []
    const first = line.stations[0][1]
    const last = line.upName ?? line.stations[line.stations.length - 1][1]
    return [
      { key: 'UP', label: `往 ${last}` },
      { key: 'DOWN', label: `往 ${first}` },
    ]
  })


  /* ---------- 派生（模式相關：港鐵 vs 主面板） ---------- */
  const dirOptions = computed<DirItem[]>(() =>
    mode.value === 'mtr' ? mtrDirOptions.value : roadA.dirOptions.value,
  )

  const activeDirKey = computed<string>(() =>
    mode.value === 'mtr' ? mtr.value.dir : roadA.activeDirKey.value,
  )

  const routeTitle = computed<string>(() =>
    mode.value === 'mtr' ? '港鐵' : roadA.routeTitle.value,
  )

  const routeRegionLabel = computed<string>(() => {
    if (mode.value === 'mtr') {
      const line = MTR_LINES[mtr.value.line]
      return line ? `${line.name} · ${mtrStationName(mtr.value.line, mtr.value.sta)}` : ''
    }
    return roadA.routeRegionLabel.value
  })


  function srcShort(src: string): string {
    return SRC_SHORT[src] ?? ''
  }


  /* ---------- 港鐵 ---------- */
  function onMtrLineChange(): void {
    nearestInfo.value = ''
    mtr.value.dir = 'UP'
    const line = MTR_LINES[mtr.value.line]
    if (line && !line.stations.some(([code]) => code === mtr.value.sta)) {
      mtr.value.sta = line.stations.length ? line.stations[0][0] : ''
    }
    void mtrLoadEta()
  }

  function onMtrStationChange(): void {
    nearestInfo.value = ''
    void mtrLoadEta()
  }

  async function mtrLoadEta(): Promise<void> {
    const m = mtr.value
    if (!m.line || !m.sta) return
    setStatus('idle', '正在查港鐵班次…')
    markWorkingStart()
    try {
      const list = await fetchMtrEta(m.line, m.sta, m.dir)
      renderEtaCards(list)
      if (!list.length) setStatus('warn', '這個站暫無班次')
      else stampUpdated()
    } catch {
      setStatus('err', '港鐵班次查不到，請再試一次')
    } finally {
      markWorkingEnd()
    }
  }

  /* ---------- 港鐵：找最近車站（位置只在瀏覽器本地算，不上傳；不存經緯度） ---------- */
  async function locateNearest(): Promise<void> {
    if (locating.value) return
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      push('你的瀏覽器不支援定位，保留目前車站')
      return
    }
    locating.value = true
    try {
      const pos = await new Promise<GeolocationPosition>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: true,
          timeout: 8000,
          maximumAge: 60000,
        })
      })
      saveMtrAuthorized()
      const nearest = findNearestMtrStation(pos.coords.latitude, pos.coords.longitude)
      if (!nearest) {
        push('找不到附近車站，保留目前車站')
        return
      }
      if (nearest.distM > 5000) {
        push(`最近的港鐵站也在 5 公里外（距你約 ${(nearest.distM / 1000).toFixed(1)} 公里），保留目前車站`)
        return
      }
      const distText =
        nearest.distM < 1000
          ? `${Math.round(nearest.distM)} 米`
          : `${(nearest.distM / 1000).toFixed(1)} 公里`
      mtr.value.line = nearest.line
      mtr.value.sta = nearest.code
      nearestInfo.value = `距你約 ${distText} · 最近：${nearest.lineName} ${nearest.name}`
      await mtrLoadEta()
    } catch (err) {
      if (err instanceof GeolocationPositionError) {
        if (err.code === err.PERMISSION_DENIED) push('已拒絕定位授權，保留目前車站')
        else if (err.code === err.TIMEOUT) push('定位逾時，保留目前車站')
        else push('定位失敗，保留目前車站')
      } else {
        push('定位失敗，保留目前車站')
      }
    } finally {
      locating.value = false
    }
  }

  /** 已授權過且自動定位開著時，進港鐵模式自動定位一次；首次進入不請求權限。 */
  function maybeAutoLocate(): void {
    if (readMtrAuthorized() && autoLocate.value) void locateNearest()
  }


  /* ---------- 模式切換 / 自動刷新 ---------- */
  function setMode(next: Mode): void {
    mode.value = next
    if (next === 'mtr') {
      void mtrLoadEta()
      maybeAutoLocate()
    } else if (roadA.roadKind.value) {
      void roadA.loadCurrentEta()
    } else {
      // 還沒查過路線：預設就是 87M 四號碼頭出發（方向 2、站 1）
      void roadA.search('87M', { dir: 2, stop: 1 })
    }
  }

  async function loadCurrentEta(): Promise<void> {
    if (mode.value === 'mtr') await mtrLoadEta()
    else {
      // 巴士 · 小巴模式：兩條路線同一個 30 秒 tick 一起刷新
      await roadA.loadCurrentEta()
      await roadB.loadCurrentEta()
    }
  }

  /** 手動刷新：按鈕轉圈 + 禁用；三卡保持舊數字，等新數據回來才換（不先清空）。 */
  async function refreshNow(): Promise<void> {
    if (refreshing.value) return
    refreshing.value = true
    try {
      await loadCurrentEta()
    } finally {
      refreshing.value = false
    }
  }


  /** 設定弹窗的「清除历史记录」：删掉最近路线两个键，刷新芯片。 */
  function clearRecentHistory(): void {
    recent.value = clearRecent()
    push('最近路線已清空')
  }

  function onClearHistoryEvent(e: Event): void {
    const scope = (e as CustomEvent<{ scope: string }>).detail?.scope
    if (scope !== 'gmb' && scope !== 'all') return
    clearRecentHistory()
  }


  function startAutoRefresh(): void {
    stopAutoRefresh()
    if (!autoRefresh.value) return
    etaTimer = window.setInterval(() => {
      if (!document.hidden) loadCurrentEta()
    }, AUTO_REFRESH_MS)
  }

  function stopAutoRefresh(): void {
    if (etaTimer !== undefined) {
      window.clearInterval(etaTimer)
      etaTimer = undefined
    }
  }

  watch(autoRefresh, () => startAutoRefresh())

  watch(autoLocate, (v) => {
    try {
      window.localStorage.setItem(MTR_AUTOLOCATE_KEY, v ? '1' : '0')
    } catch {
      // 寫不進去也不影響當次使用
    }
  })


  /* ---------- 事件（模式相關：港鐵 vs 主面板） ---------- */
  function onSearch(): void {
    if (mode.value !== 'mtr') roadA.onSearch()
  }

  function onRouteKeydown(e: KeyboardEvent): void {
    if (e.key === 'Enter' && mode.value !== 'mtr') roadA.onSearch()
  }

  function onCandidatePick(cand: RouteCandidate): void {
    roadA.onCandidatePick(cand)
  }

  function onRecentClick(entry: RecentEntry): void {
    roadA.onRecentClick(entry)
  }

  function onDirPick(key: string): void {
    if (mode.value === 'mtr') {
      mtr.value.dir = key as MtrDir
      void mtrLoadEta()
      return
    }
    roadA.onDirPick(key)
  }

  function onStopPick(seq: number): void {
    roadA.onStopPick(seq)
  }


  /* ---------- 啟動 ---------- */
  function init(): void {
    recent.value = getRecent()
    const q = route.query
    const modeParam = typeof q.mode === 'string' ? q.mode : ''
    if (modeParam === 'mtr') {
      const line = typeof q.line === 'string' && MTR_LINES[q.line] ? q.line : 'TWL'
      let sta = typeof q.sta === 'string' ? q.sta : 'KWF'
      const lineStations = MTR_LINES[line]?.stations ?? []
      if (!lineStations.some(([code]) => code === sta)) {
        sta = lineStations.length ? lineStations[0][0] : 'KWF'
      }
      mtr.value = {
        line,
        sta,
        dir: q.dir === 'DOWN' ? 'DOWN' : 'UP',
      }
      mode.value = 'mtr'
      void mtrLoadEta()
      maybeAutoLocate()
      return
    }
    // mode=gmb / mode=bus 都是舊地址，統一併入 road
    const initRoute = (typeof q.route === 'string' && q.route ? q.route : '87M')
      .trim()
      .toUpperCase()
    const initDir = Number(typeof q.dir === 'string' ? q.dir : '') || undefined
    const initStop = Number(typeof q.stop === 'string' ? q.stop : '') || undefined
    const hasParams = Boolean(q.route ?? q.dir ?? q.stop)
    roadA.routeInput.value = initRoute
    void roadA.search(initRoute, {
      // 預設就是 87M 四號碼頭出發：方向 2、站 1（不用再輸一次）
      dir: hasParams ? initDir : 2,
      stop: hasParams ? initStop : 1,
      src: typeof q.src === 'string' ? q.src : '',
    })
  }


  onMounted(() => {
    init()
    startAutoRefresh()
    reducedMotionQuery?.addEventListener('change', onReducedMotionChange)
    window.addEventListener(CLEAR_HISTORY_EVENT, onClearHistoryEvent)
  })

  onUnmounted(() => {
    stopAutoRefresh()
    reducedMotionQuery?.removeEventListener('change', onReducedMotionChange)
    window.removeEventListener(CLEAR_HISTORY_EVENT, onClearHistoryEvent)
    for (const t of animTimers) window.clearTimeout(t)
    animTimers.length = 0
  })

  return {
    mode,
    loading: roadA.loading,
    refreshing,
    autoRefresh,
    routeInput: roadA.routeInput,
    stopFilter: roadA.stopFilter,
    roadKind: roadA.roadKind,
    roadSrc: roadA.roadSrc,
    roadCode: roadA.roadCode,
    candidates: roadA.candidates,
    recent,
    bus: roadA.bus,
    mtr,
    locating,
    nearestInfo,
    autoLocate,
    status: roadA.status,
    updatedAt: roadA.updatedAt,
    etaItems: roadA.etaItems,
    etaAnim: roadA.etaAnim,
    etaNumKey: roadA.etaNumKey,
    etaCards: roadA.etaCards,
    dirOptions,
    activeDirKey,
    currentStops: roadA.currentStops,
    filteredStops: roadA.filteredStops,
    stopSeqModel: roadA.stopSeqModel,
    routeTitle,
    routeRegionLabel,
    mtrLineOptions,
    mtrStations,
    statusDotClass: roadA.statusDotClass,
    detailStats: roadA.detailStats,
    srcShort,
    setMode,
    onSearch,
    onRouteKeydown,
    onCandidatePick,
    onRecentClick,
    onDirPick,
    onStopPick,
    onMtrLineChange,
    onMtrStationChange,
    onEtaAnimEnd: roadA.onEtaAnimEnd,
    locateNearest,
    loadCurrentEta,
    refreshNow,
    clearRecentHistory,
    road2: roadB,
  }
}
