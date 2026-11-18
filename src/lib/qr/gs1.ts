/** GS1 参数表（Postman Params 风格）：
 * 输入是 GS1 Digital Link 链接（如 https://…/01/…/10/…?17=…）或元素串
 * （如 (01)…(10)…）时，把每个 AI 解析成一行参数：勾选 / AI / 名称 / 值 / 删除。
 * 改表格会回写输入框并重新生成；改输入框会重新解析表格。 */
import { GS1_NAMES_KEY } from './constants'
import { safeGet, safeRemove, safeSet } from './storage'

export interface Gs1Param {
  /** 行内唯一 id，仅供 Vue 的 v-for :key 用，不进入重建的文本。 */
  id: number
  ai: string
  value: string
  from: 'element' | 'path' | 'query'
  enabled: boolean
}

export interface Gs1Data {
  kind: 'url' | 'element'
  base: string
  prefix: string[]
  params: Gs1Param[]
  extraQuery: Array<{ k: string; v: string }>
}

export const GS1_AI: Record<string, string> = {
  '00': 'SSCC',
  '01': 'GTIN',
  '02': '内含项目 GTIN',
  '10': '批号',
  '11': '生产日期',
  '12': '到期日',
  '13': '包装日期',
  '15': '最佳使用日期',
  '17': '有效期至',
  '21': '序列号',
  '30': '数量',
  '37': '数量',
  '400': '客户订单号',
  '414': 'GLN',
  '8003': 'GRAI',
  '8004': 'GIAI',
  '8005': '单价',
  '8010': 'CPID',
  '8011': 'CPID 序列号',
  '8018': 'GSRN',
  '8020': '付款单号',
  '8200': '产品网址',
}

export const GS1_DATE_AI: string[] = ['11', '12', '13', '15', '17']

/** GS1 示例：用一组真实参数载入示例链接，参数表与二维码一起生成，方便测试。 */
export const GS1_SAMPLE =
  'https://example.com/01/09506000134352/10/LOT2026A/21/SN100001?17=261231&30=12'

let nextParamId = 1

export function createGs1Param(
  ai: string,
  value: string,
  from: Gs1Param['from'],
): Gs1Param {
  return { id: nextParamId++, ai, value, from, enabled: true }
}

export function gs1AiName(
  ai: string,
  customNames: Readonly<Record<string, string>>,
): string {
  const custom = customNames[ai]
  if (custom) return custom
  const known = GS1_AI[ai]
  if (known) return known
  const pre3 = ai.slice(0, 3)
  if (['310', '311', '312', '313'].includes(pre3)) return '净重'
  if (['320', '321'].includes(pre3)) return '净重（磅）'
  if (['330', '331'].includes(pre3)) return '毛重'
  if (['390', '391', '392', '393'].includes(pre3)) return '应付金额'
  return '未知 AI'
}

/** AI 显示名称可自定义：用户改过的名字存在本机，优先于默认名。 */
export function loadGs1CustomNames(): Record<string, string> {
  try {
    const raw = safeGet(GS1_NAMES_KEY)
    if (!raw) return {}
    const parsed: unknown = JSON.parse(raw)
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
    const out: Record<string, string> = {}
    for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof v === 'string') out[k] = v
    }
    return out
  } catch {
    return {}
  }
}

export function saveGs1CustomName(ai: string, name: string): void {
  try {
    const map = loadGs1CustomNames()
    const def = GS1_AI[ai]
    if (!name || name === def) delete map[ai]
    else map[ai] = name
    safeSet(GS1_NAMES_KEY, JSON.stringify(map))
  } catch {
    /* 忽略 */
  }
}

export function resetGs1CustomNames(): void {
  safeRemove(GS1_NAMES_KEY)
}

/** 日期类 AI 的 6 位值（YYMMDD）显示成 YYYY-MM-DD；不合法返回 null。 */
export function gs1FormatDate(v: string): string | null {
  if (!/^\d{6}$/.test(v)) return null
  const mm = Number(v.slice(2, 4))
  const dd = Number(v.slice(4, 6))
  if (mm < 1 || mm > 12 || dd < 1 || dd > 31) return null
  return `20${v.slice(0, 2)}-${v.slice(2, 4)}-${v.slice(4, 6)}`
}

export function parseGs1(text: string): Gs1Data | null {
  const trimmed = text.trim()
  if (!trimmed) return null
  if (trimmed.includes('(')) {
    const params: Gs1Param[] = []
    const re = /\((\d{2,4})\)([^()]*)/g
    let m: RegExpExecArray | null
    while ((m = re.exec(trimmed)) !== null) {
      if (m[2] !== '') params.push(createGs1Param(m[1], m[2], 'element'))
    }
    return params.length
      ? { kind: 'element', base: '', prefix: [], params, extraQuery: [] }
      : null
  }
  let u: URL
  try {
    u = new URL(trimmed)
  } catch {
    return null
  }
  if (!/^https?:$/.test(u.protocol)) return null
  const segs = u.pathname.split('/').filter((s) => s !== '')
  const params: Gs1Param[] = []
  const prefix: string[] = []
  let i = 0
  let inAi = false
  while (i < segs.length) {
    const key = segs[i]
    if (/^\d{2,4}$/.test(key) && i + 1 < segs.length) {
      params.push(createGs1Param(key, decodeURIComponent(segs[i + 1]), 'path'))
      i += 2
      inAi = true
    } else {
      if (!inAi) prefix.push(key)
      i += 1
    }
  }
  const extraQuery: Array<{ k: string; v: string }> = []
  u.searchParams.forEach((v, k) => {
    if (/^\d{2,4}$/.test(k)) params.push(createGs1Param(k, v, 'query'))
    else extraQuery.push({ k, v })
  })
  if (!params.length) return null
  return { kind: 'url', base: `${u.protocol}//${u.host}`, prefix, params, extraQuery }
}

export function rebuildGs1(data: Gs1Data): string {
  const enabled = data.params.filter((p) => p.enabled)
  if (data.kind === 'element') {
    return enabled.map((p) => `(${p.ai})${p.value}`).join('')
  }
  const parts: string[] = []
  if (data.prefix.length) parts.push(data.prefix.map(encodeURIComponent).join('/'))
  enabled
    .filter((p) => p.from === 'path')
    .forEach((p) => {
      parts.push(`${p.ai}/${encodeURIComponent(p.value)}`)
    })
  let out = data.base
  if (parts.length) out += `/${parts.join('/')}`
  const q: string[] = []
  enabled
    .filter((p) => p.from === 'query')
    .forEach((p) => {
      q.push(`${p.ai}=${encodeURIComponent(p.value)}`)
    })
  data.extraQuery.forEach((e) => {
    q.push(`${encodeURIComponent(e.k)}=${encodeURIComponent(e.v)}`)
  })
  if (q.length) out += `?${q.join('&')}`
  return out
}
