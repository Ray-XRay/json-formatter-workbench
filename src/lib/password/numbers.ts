/** 随机数生成（1.x password.js 的同名逻辑迁移）。 */

import { randInt } from './random'

export interface NumberOptions {
  numMin: number
  numMax: number
  numCount: number
  numPad: boolean
  numPadDigits: number
}

/** 生成 numCount 个 [numMin, numMax] 内的随机数；范围超 2^32 时抛错。 */
export function genNumbers(o: NumberOptions): string[] {
  const range = o.numMax - o.numMin + 1
  if (range <= 0) throw new Error('bad range')
  if (range > 4294967296) throw new Error('range too big')
  const out: string[] = []
  for (let i = 0; i < o.numCount; i++) {
    const n = o.numMin + randInt(range)
    let s = String(n)
    if (o.numPad) {
      while (s.length < o.numPadDigits) s = '0' + s
    }
    out.push(s)
  }
  return out
}
