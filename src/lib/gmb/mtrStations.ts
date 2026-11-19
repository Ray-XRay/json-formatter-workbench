/** 港鐵站表（10 條綫，照搬 1.x gmb.js 的 MTR_LINES，資料不變，另補經緯度）。
 *
 *  經緯度來源：中文維基百科各站條目座標（zh.wikipedia.org），個別站以英文維基百科核對／補齊
 *  （九龍、柴灣、東涌、機場、荃灣、荔景、荔枝角、洪水橋，見下方註記）；另以 OpenStreetMap
 *  （Nominatim）交叉核對，相鄰站距全部合理，無一站需要插值。
 *  注意：站表沿用 1.x 的車站代碼，TAW 同時指太古（港島綫）與大圍（東鐵／屯馬綫）、
 *  TSW 同時指荃灣（荃灣綫）與荃灣西（屯馬綫），兩組代碼重用是原表的既有狀況，
 *  各自座標按站名區分，未改代碼。洪水橋站為規劃中車站，座標取自英文維基百科該站條目。
 */

export interface MtrLine {
  name: string
  /** 東鐵綫上行終點有兩個（羅湖 / 落馬洲），方向名不用尾站名。 */
  upName?: string
  /** [車站代碼, 中文站名, 緯度, 經度]，按綫路順序排列。 */
  stations: [string, string, number, number][]
}

export const MTR_LINES: Record<string, MtrLine> = {
  TWL: { name: '荃灣綫', stations: [['CEN', '中環', 22.2816, 114.159], ['ADM', '金鐘', 22.278817, 114.164586], ['TST', '尖沙咀', 22.2975, 114.172], ['JOR', '佐敦', 22.304306, 114.171694], ['YMT', '油麻地', 22.3128, 114.170694], ['MOK', '旺角', 22.31925, 114.169361], ['PRC', '太子', 22.3245, 114.168], ['SSP', '深水埗', 22.331306, 114.163556], ['CSW', '長沙灣', 22.335619, 114.156], ['LAK', '荔枝角', 22.3374, 114.148], ['MEF', '美孚', 22.338, 114.139028], ['LCK', '荔景', 22.348258, 114.12615], ['KWF', '葵芳', 22.356853, 114.127872], ['KWH', '葵興', 22.363133, 114.131261], ['TWH', '大窩口', 22.370611, 114.125028], ['TSW', '荃灣', 22.373611, 114.117806]] },
  KTL: { name: '觀塘綫', stations: [['WHA', '黃埔', 22.305064, 114.189492], ['HOM', '何文田', 22.309406, 114.182678], ['YMT', '油麻地', 22.3128, 114.170694], ['MOK', '旺角', 22.31925, 114.169361], ['PRC', '太子', 22.3245, 114.168], ['SKM', '石硤尾', 22.332025, 114.168889], ['KOT', '九龍塘', 22.3375, 114.1754], ['LOF', '樂富', 22.337861, 114.187444], ['WTS', '黃大仙', 22.3415, 114.194278], ['DIH', '鑽石山', 22.340025, 114.201675], ['CHH', '彩虹', 22.3349, 114.208694], ['KOB', '九龍灣', 22.3233, 114.214], ['NTK', '牛頭角', 22.315444, 114.218944], ['KWT', '觀塘', 22.312225, 114.226444], ['LTI', '藍田', 22.306861, 114.232861], ['YAT', '油塘', 22.2979, 114.237083], ['TIK', '調景嶺', 22.3042, 114.2522]] },
  ISL: { name: '港島綫', stations: [['KET', '堅尼地城', 22.281214, 114.128642], ['HKU', '香港大學', 22.284167, 114.135556], ['SYP', '西營盤', 22.285556, 114.142778], ['SHW', '上環', 22.286172, 114.151764], ['CEN', '中環', 22.2816, 114.159], ['ADM', '金鐘', 22.278817, 114.164586], ['WAC', '灣仔', 22.277256, 114.172847], ['CAB', '銅鑼灣', 22.280289, 114.183964], ['TIH', '天后', 22.282656, 114.191667], ['FOH', '炮台山', 22.288144, 114.193636], ['NOP', '北角', 22.290944, 114.200056], ['QUB', '鰂魚涌', 22.288194, 114.208861], ['TAW', '太古', 22.284589, 114.216119], ['SWH', '西灣河', 22.282375, 114.221917], ['SKW', '筲箕灣', 22.2792, 114.228889], ['HFC', '杏花邨', 22.276856, 114.239778], ['CHW', '柴灣', 22.2644, 114.2368]] },
  TCL: { name: '東涌綫', stations: [['HOK', '香港', 22.284764, 114.158017], ['KOW', '九龍', 22.3049, 114.1614], ['OLY', '奧運', 22.317806, 114.160222], ['NAC', '南昌', 22.326497, 114.153089], ['LAK', '荔枝角', 22.3374, 114.148], ['TSY', '青衣', 22.3585, 114.107494], ['SUN', '欣澳', 22.3321, 114.028881], ['TUC', '東涌', 22.2893, 113.9416]] },
  TKL: { name: '將軍澳綫', stations: [['NOP', '北角', 22.290944, 114.200056], ['QUB', '鰂魚涌', 22.288194, 114.208861], ['YAT', '油塘', 22.2979, 114.237083], ['TIK', '調景嶺', 22.3042, 114.2522], ['TKO', '將軍澳', 22.30745, 114.259953], ['HAH', '坑口', 22.3156, 114.264278], ['POA', '寶琳', 22.322769, 114.257694], ['LHP', '康城', 22.296389, 114.2697]] },
  EAL: { name: '東鐵綫', upName: '羅湖 / 落馬洲', stations: [['ADM', '金鐘', 22.278817, 114.164586], ['EXC', '會展', 22.281667, 114.175278], ['HUH', '紅磡', 22.302583, 114.182167], ['MKK', '旺角東', 22.3219, 114.1725], ['KOT', '九龍塘', 22.3375, 114.1754], ['TAW', '大圍', 22.373025, 114.17845], ['SHT', '沙田', 22.382222, 114.187222], ['FOT', '火炭', 22.394847, 114.197892], ['RAC', '馬場', 22.400417, 114.202778], ['UNI', '大學', 22.413353, 114.210172], ['TAF', '大埔墟', 22.444633, 114.170592], ['TWO', '太和', 22.451019, 114.161169], ['FAN', '粉嶺', 22.492064, 114.138733], ['SHS', '上水', 22.501319, 114.128361], ['LOW', '羅湖', 22.529, 114.113031], ['LMC', '落馬洲', 22.514558, 114.065783]] },
  TML: { name: '屯馬綫', stations: [['TUM', '屯門', 22.3941, 113.973194], ['SIH', '兆康', 22.412414, 113.978611], ['HIK', '洪水橋', 22.4319, 113.9884], ['TIS', '天水圍', 22.4481, 114.0048], ['LOP', '朗屏', 22.447594, 114.0256], ['YUL', '元朗', 22.4462, 114.0355], ['KSR', '錦上路', 22.434789, 114.0635], ['TSW', '荃灣西', 22.3682, 114.1098], ['MEF', '美孚', 22.338, 114.139028], ['NAC', '南昌', 22.326497, 114.153089], ['AUS', '柯士甸', 22.303625, 114.166767], ['HUH', '紅磡', 22.302583, 114.182167], ['HOM', '何文田', 22.309406, 114.182678], ['TKW', '土瓜灣', 22.317222, 114.1875], ['SUW', '宋皇臺', 22.3258, 114.1914], ['KAT', '啟德', 22.330278, 114.199444], ['DIH', '鑽石山', 22.340025, 114.201675], ['HIN', '顯徑', 22.363889, 114.170833], ['TAW', '大圍', 22.373025, 114.17845], ['CKT', '車公廟', 22.374806, 114.186417], ['STW', '沙田圍', 22.376944, 114.194833], ['CIT', '第一城', 22.383, 114.203639], ['STO', '石門', 22.387861, 114.208472], ['DIT', '大水坑', 22.408278, 114.222667], ['HHS', '恆安', 22.417861, 114.225861], ['MAO', '馬鞍山', 22.4249, 114.232], ['WKS', '烏溪沙', 22.429167, 114.243917]] },
  SIL: { name: '南港島綫', stations: [['ADM', '金鐘', 22.278817, 114.164586], ['OCP', '海洋公園', 22.248706, 114.174317], ['WCH', '黃竹坑', 22.247925, 114.167647], ['LET', '利東', 22.241992, 114.156044], ['SOH', '海怡半島', 22.242308, 114.149297]] },
  DRL: { name: '迪士尼綫', stations: [['SUN', '欣澳', 22.3321, 114.028881], ['DIS', '迪士尼', 22.3155, 114.045106]] },
  AEX: { name: '機場快綫', stations: [['HOK', '香港', 22.284764, 114.158017], ['KOW', '九龍', 22.3049, 114.1614], ['TSY', '青衣', 22.3585, 114.107494], ['AIR', '機場', 22.3159, 113.9365], ['AWE', '博覽館', 22.3219, 113.9423]] },
}

export const MTR_LINE_ORDER: string[] = ['TWL', 'KTL', 'ISL', 'TCL', 'TKL', 'EAL', 'TML', 'SIL', 'DRL', 'AEX']

/** 車站→綫路反查表（站先行 UI 用）：由 line→stations 反轉而來。
 *  轉車站（如金鐘、鑽石山、大圍）只列一次，lines 按 MTR_LINE_ORDER 排列；
 *  代碼重用的站（TAW 太古／大圍、TSW 荃灣／荃灣西）以「代碼|站名」區分，
 *  順序按各綫首次出現（荃灣綫在前，餘綫照 MTR_LINE_ORDER）。 */
export interface MtrStationEntry {
  code: string
  name: string
  lat: number
  lng: number
  lines: string[]
}

export function mtrStationKey(code: string, name: string): string {
  return `${code}|${name}`
}

export const MTR_STATIONS: MtrStationEntry[] = (() => {
  const map = new Map<string, MtrStationEntry>()
  for (const line of MTR_LINE_ORDER) {
    const def = MTR_LINES[line]
    if (!def) continue
    for (const [code, name, lat, lng] of def.stations) {
      const key = mtrStationKey(code, name)
      const existing = map.get(key)
      if (existing) {
        if (!existing.lines.includes(line)) existing.lines.push(line)
      } else {
        map.set(key, { code, name, lat, lng, lines: [line] })
      }
    }
  }
  return [...map.values()]
})()

/** 按代碼找站：優先取當前綫有停的那一站（TAW / TSW 代碼重用時才有歧義）。 */
export function findStationEntry(code: string, line?: string): MtrStationEntry | undefined {
  return (
    MTR_STATIONS.find(
      (e) => e.code === code && (line === undefined || e.lines.includes(line)),
    ) ?? MTR_STATIONS.find((e) => e.code === code)
  )
}

/** 港鐵各綫官方路線圖顏色（英文維基百科各綫條目 infobox「Color on map」欄位核對）。
 *  只做品牌點綴用：綫路徽章、色點、結果卡左邊框、當前綫高亮；絕不用作正文顏色或版面底色。 */
export const MTR_LINE_COLORS: Record<string, string> = {
  TWL: '#ED1D24', // 荃灣綫紅
  KTL: '#00AB4E', // 觀塘綫綠
  ISL: '#007DC5', // 港島綫深藍
  TCL: '#F7943E', // 東涌綫橙
  TKL: '#7D499D', // 將軍澳綫紫
  EAL: '#53B7E8', // 東鐵綫淺藍
  TML: '#923011', // 屯馬綫啡
  SIL: '#BAC429', // 南港島綫石灰綠
  DRL: '#F173AC', // 迪士尼綫粉紅
  AEX: '#00888A', // 機場快綫青
}

/** 綫路徽章上的文字色：白字對比 ≥ 4.0 用白，否則用深灰 #262626（WCAG 實測：
 *  白字：TWL 4.37、ISL 4.43、TKL 6.34、TML 7.92、AEX 4.30；
 *  深灰字：KTL 5.00、TCL 6.67、EAL 6.71、SIL 7.94、DRL 5.61）。 */
export function lineChipText(code: string): string {
  const hex = MTR_LINE_COLORS[code]
  if (!hex) return '#262626'
  const c = (i: number): number => {
    const v = parseInt(hex.slice(i, i + 2), 16) / 255
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)
  }
  const lum = 0.2126 * c(1) + 0.7152 * c(3) + 0.0722 * c(5)
  return 1.05 / (lum + 0.05) >= 4 ? '#ffffff' : '#262626'
}

export function mtrStationName(line: string, code: string): string {
  const stations = MTR_LINES[line]?.stations ?? []
  for (const [c, name] of stations) {
    if (c === code) return name
  }
  return code
}

/** Haversine 公式算兩點間大圓距離（米）。 */
export function haversineM(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000
  const toRad = (d: number): number => (d * Math.PI) / 180
  const dLat = toRad(lat2 - lat1)
  const dLng = toRad(lng2 - lng1)
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) * Math.sin(dLng / 2)
  return 2 * R * Math.asin(Math.sqrt(a))
}

export interface NearestMtrStation {
  line: string
  lineName: string
  code: string
  name: string
  lat: number
  lng: number
  distM: number
}

/** 在瀏覽器本地用 Haversine 算最近的港鐵站（同站多綫只算一次）。
 *  位置不出瀏覽器；回傳不含使用者座標。 */
export function findNearestMtrStation(lat: number, lng: number): NearestMtrStation | null {
  let best: NearestMtrStation | null = null
  const seen = new Set<string>()
  for (const [lineCode, line] of Object.entries(MTR_LINES)) {
    for (const [code, name, sla, slo] of line.stations) {
      const key = `${code}|${name}`
      if (seen.has(key)) continue
      seen.add(key)
      const distM = haversineM(lat, lng, sla, slo)
      if (!best || distM < best.distM) {
        best = { line: lineCode, lineName: line.name, code, name, lat: sla, lng: slo, distM }
      }
    }
  }
  return best
}
