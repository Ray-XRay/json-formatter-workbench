/** 港鐵站表（10 條綫，照搬 1.x gmb.js 的 MTR_LINES，資料不變）。 */

export interface MtrLine {
  name: string
  /** 東鐵綫上行終點有兩個（羅湖 / 落馬洲），方向名不用尾站名。 */
  upName?: string
  /** [車站代碼, 中文站名]，按綫路順序排列。 */
  stations: [string, string][]
}

export const MTR_LINES: Record<string, MtrLine> = {
  TWL: { name: '荃灣綫', stations: [['CEN', '中環'], ['ADM', '金鐘'], ['TST', '尖沙咀'], ['JOR', '佐敦'], ['YMT', '油麻地'], ['MOK', '旺角'], ['PRC', '太子'], ['SSP', '深水埗'], ['CSW', '長沙灣'], ['LAK', '荔枝角'], ['MEF', '美孚'], ['LCK', '荔景'], ['KWF', '葵芳'], ['KWH', '葵興'], ['TWH', '大窩口'], ['TSW', '荃灣']] },
  KTL: { name: '觀塘綫', stations: [['WHA', '黃埔'], ['HOM', '何文田'], ['YMT', '油麻地'], ['MOK', '旺角'], ['PRC', '太子'], ['SKM', '石硤尾'], ['KOT', '九龍塘'], ['LOF', '樂富'], ['WTS', '黃大仙'], ['DIH', '鑽石山'], ['CHH', '彩虹'], ['KOB', '九龍灣'], ['NTK', '牛頭角'], ['KWT', '觀塘'], ['LTI', '藍田'], ['YAT', '油塘'], ['TIK', '調景嶺']] },
  ISL: { name: '港島綫', stations: [['KET', '堅尼地城'], ['HKU', '香港大學'], ['SYP', '西營盤'], ['SHW', '上環'], ['CEN', '中環'], ['ADM', '金鐘'], ['WAC', '灣仔'], ['CAB', '銅鑼灣'], ['TIH', '天后'], ['FOH', '炮台山'], ['NOP', '北角'], ['QUB', '鰂魚涌'], ['TAW', '太古'], ['SWH', '西灣河'], ['SKW', '筲箕灣'], ['HFC', '杏花邨'], ['CHW', '柴灣']] },
  TCL: { name: '東涌綫', stations: [['HOK', '香港'], ['KOW', '九龍'], ['OLY', '奧運'], ['NAC', '南昌'], ['LAK', '荔枝角'], ['TSY', '青衣'], ['SUN', '欣澳'], ['TUC', '東涌']] },
  TKL: { name: '將軍澳綫', stations: [['NOP', '北角'], ['QUB', '鰂魚涌'], ['YAT', '油塘'], ['TIK', '調景嶺'], ['TKO', '將軍澳'], ['HAH', '坑口'], ['POA', '寶琳'], ['LHP', '康城']] },
  EAL: { name: '東鐵綫', upName: '羅湖 / 落馬洲', stations: [['ADM', '金鐘'], ['EXC', '會展'], ['HUH', '紅磡'], ['MKK', '旺角東'], ['KOT', '九龍塘'], ['TAW', '大圍'], ['SHT', '沙田'], ['FOT', '火炭'], ['RAC', '馬場'], ['UNI', '大學'], ['TAF', '大埔墟'], ['TWO', '太和'], ['FAN', '粉嶺'], ['SHS', '上水'], ['LOW', '羅湖'], ['LMC', '落馬洲']] },
  TML: { name: '屯馬綫', stations: [['TUM', '屯門'], ['SIH', '兆康'], ['HIK', '洪水橋'], ['TIS', '天水圍'], ['LOP', '朗屏'], ['YUL', '元朗'], ['KSR', '錦上路'], ['TSW', '荃灣西'], ['MEF', '美孚'], ['NAC', '南昌'], ['AUS', '柯士甸'], ['HUH', '紅磡'], ['HOM', '何文田'], ['TKW', '土瓜灣'], ['SUW', '宋皇臺'], ['KAT', '啟德'], ['DIH', '鑽石山'], ['HIN', '顯徑'], ['TAW', '大圍'], ['CKT', '車公廟'], ['STW', '沙田圍'], ['CIT', '第一城'], ['STO', '石門'], ['DIT', '大水坑'], ['HHS', '恆安'], ['MAO', '馬鞍山'], ['WKS', '烏溪沙']] },
  SIL: { name: '南港島綫', stations: [['ADM', '金鐘'], ['OCP', '海洋公園'], ['WCH', '黃竹坑'], ['LET', '利東'], ['SOH', '海怡半島']] },
  DRL: { name: '迪士尼綫', stations: [['SUN', '欣澳'], ['DIS', '迪士尼']] },
  AEX: { name: '機場快綫', stations: [['HOK', '香港'], ['KOW', '九龍'], ['TSY', '青衣'], ['AIR', '機場'], ['AWE', '博覽館']] },
}

export const MTR_LINE_ORDER: string[] = ['TWL', 'KTL', 'ISL', 'TCL', 'TKL', 'EAL', 'TML', 'SIL', 'DRL', 'AEX']

export function mtrStationName(line: string, code: string): string {
  const stations = MTR_LINES[line]?.stations ?? []
  for (const [c, name] of stations) {
    if (c === code) return name
  }
  return code
}
