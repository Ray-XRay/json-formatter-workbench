/** 安全随机数与随机密码生成（1.x password.js 的同名逻辑迁移）。 */

export const AMBIGUOUS = '0O1lI'
export const SYMBOLS = '!@#$%^&*'

export interface PasswordCharsetOptions {
  upper: boolean
  lower: boolean
  digits: boolean
  symbols: boolean
  excludeAmbiguous: boolean
}

/** 拒绝采样：用 crypto.getRandomValues 取 [0, n) 的均匀整数，避免取模偏差。 */
export function randInt(n: number): number {
  if (!window.crypto || !window.crypto.getRandomValues) {
    throw new Error('no crypto')
  }
  if (n <= 0 || n > 4294967296) throw new Error('bad range')
  const max = Math.floor(4294967296 / n) * n
  const arr = new Uint32Array(1)
  let v: number
  do {
    window.crypto.getRandomValues(arr)
    v = arr[0]
  } while (v >= max)
  return v % n
}

export function buildPool(o: PasswordCharsetOptions): string {
  let pool = ''
  if (o.upper) pool += 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
  if (o.lower) pool += 'abcdefghijklmnopqrstuvwxyz'
  if (o.digits) pool += '0123456789'
  if (o.symbols) pool += SYMBOLS
  if (o.excludeAmbiguous) {
    pool = pool
      .split('')
      .filter((c: string): boolean => AMBIGUOUS.indexOf(c) === -1)
      .join('')
  }
  return pool
}

/** 生成一个随机密码；字符集为空时返回 null（调用方负责兜底）。 */
export function genRandom(o: PasswordCharsetOptions & { length: number }): string | null {
  const pool = buildPool(o)
  if (!pool) return null
  let out = ''
  for (let i = 0; i < o.length; i++) out += pool.charAt(randInt(pool.length))
  return out
}

/** 当前选项下的密码熵（位）。 */
export function randomBits(o: PasswordCharsetOptions & { length: number }): number {
  const pool = buildPool(o)
  if (!pool) return 0
  return o.length * (Math.log(pool.length) / Math.log(2))
}
