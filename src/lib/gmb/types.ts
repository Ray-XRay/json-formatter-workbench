/** 到站看板共用型別（由 1.x gmb.js 的運行時形狀收斂而來）。 */

export type RoadSrc = 'gmb-NT' | 'gmb-KLN' | 'gmb-HKI' | 'kmb' | 'ctb'
export type Mode = 'road' | 'mtr'
export type RoadKind = '' | 'gmb' | 'bus'
export type BusOp = 'KMB' | 'CTB'
export type MtrDir = 'UP' | 'DOWN'
export type StatusType = 'idle' | 'ok' | 'warn' | 'err'

/** 一班車的到站資訊：min 為分鐘數（0 = 即到），time 已是 HH:MM。 */
export interface EtaItem {
  min: number
  time: string
  remark: string
}

export interface StopItem {
  stop_seq: number
  stop_id: string
  name_tc: string
  name_en: string
}

/** 方向按鈕：小巴用 route_seq（轉字串）、巴士用 outbound / inbound、港鐵用 UP / DOWN。 */
export interface DirItem {
  key: string
  label: string
}

export interface GmbDirection {
  route_seq: number
  orig_tc: string
  dest_tc: string
}

export interface GmbRoute {
  route_id: number
  directions: GmbDirection[]
}

/** 專線小巴候選路線的 payload：地區 + 原始路線物件。 */
export interface GmbPayload {
  region: string
  route: GmbRoute
}

export interface BusDir {
  key: string
  label: string
  serviceType: string
}

/** 九巴 / 城巴候選路線的 payload。 */
export interface BusFound {
  op: BusOp
  dirs: BusDir[]
  serviceType: string
}

export type RoutePayload = GmbPayload | BusFound

/** 同編號多條路線時列出的候選項。 */
export interface RouteCandidate {
  src: RoadSrc
  code: string
  label: string
  summary: string
  payload: RoutePayload
}

/** 最近路線：路線號碼 + 來源（'' = 舊版只存號碼的記錄）。 */
export interface RecentEntry {
  code: string
  src: string
}

/** 巴士狀態（九巴 / 城巴共用）。 */
export interface BusState {
  op: BusOp
  code: string
  dirs: BusDir[]
  dirKey: string
  serviceType: string
  stops: StopItem[]
  stopSeq: number
  stopId: string
}

/** 港鐵狀態。 */
export interface MtrState {
  line: string
  sta: string
  dir: MtrDir
}
