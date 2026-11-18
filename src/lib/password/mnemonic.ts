/** BIP39 助记词：生成、校验、富文本复制（1.x password.js 的同名逻辑迁移）。 */

import { BIP39_WORDS } from '../../vendor/bip39-words'

export const MNEMONIC_WORD_COUNTS: readonly number[] = [12, 15, 18, 21, 24]

function sha256(bytes: Uint8Array): Promise<Uint8Array> {
  if (!window.crypto || !window.crypto.subtle) {
    return Promise.reject(new Error('no subtle crypto'))
  }
  /* subtle.digest 要 BufferSource；拷一份带确定 ArrayBuffer 的副本才合类型。 */
  const copy = new Uint8Array(bytes)
  return window.crypto.subtle.digest('SHA-256', copy).then((buf: ArrayBuffer): Uint8Array => {
    return new Uint8Array(buf)
  })
}

function bytesToBits(bytes: Uint8Array): number[] {
  const bits: number[] = []
  for (let i = 0; i < bytes.length; i++) {
    for (let j = 7; j >= 0; j--) bits.push((bytes[i] >> j) & 1)
  }
  return bits
}

function bitsToBytes(bits: number[]): Uint8Array {
  const bytes: number[] = []
  for (let i = 0; i < bits.length; i += 8) {
    let b = 0
    for (let j = 0; j < 8; j++) b = (b << 1) | (bits[i + j] || 0)
    bytes.push(b)
  }
  return new Uint8Array(bytes)
}

/** 熵 -> 助记词：熵位 + SHA-256 前 ENT/32 位校验和，每 11 位取一个词。 */
export function mnemonicFromEntropy(entropy: Uint8Array): Promise<string> {
  return sha256(entropy).then((hash: Uint8Array): string => {
    const entBits = bytesToBits(entropy)
    const csBits = entBits.length / 32
    const hashBits = bytesToBits(hash)
    const bits = entBits.concat(hashBits.slice(0, csBits))
    const words: string[] = []
    for (let i = 0; i < bits.length; i += 11) {
      let idx = 0
      for (let j = 0; j < 11; j++) idx = (idx << 1) | bits[i + j]
      words.push(BIP39_WORDS[idx])
    }
    return words.join(' ')
  })
}

/** 校验助记词：词都在表里、词数合规、校验和对得上。 */
export function validateMnemonic(mnemonic: string): Promise<boolean> {
  const words = mnemonic.trim().split(/\s+/)
  if (MNEMONIC_WORD_COUNTS.indexOf(words.length) === -1) return Promise.resolve(false)
  const bits: number[] = []
  for (let i = 0; i < words.length; i++) {
    const idx = BIP39_WORDS.indexOf(words[i])
    if (idx === -1) return Promise.resolve(false)
    for (let j = 10; j >= 0; j--) bits.push((idx >> j) & 1)
  }
  const entLen = Math.floor((bits.length * 32) / 33)
  const entropy = bitsToBytes(bits.slice(0, entLen))
  const csBits = bits.slice(entLen)
  return sha256(entropy).then((hash: Uint8Array): boolean => {
    const hashBits = bytesToBits(hash)
    for (let k = 0; k < csBits.length; k++) {
      if (csBits[k] !== hashBits[k]) return false
    }
    return true
  })
}

/** 词数 -> 熵字节数：12 词 16 字节、15 词 20 字节、18 词 24 字节、21 词 28 字节、24 词 32 字节。 */
export function genMnemonic(wordCount: number): Promise<string> {
  const byteLen = (wordCount * 11 * 32) / 33 / 8
  const entropy = new Uint8Array(byteLen)
  window.crypto.getRandomValues(entropy)
  return mnemonicFromEntropy(entropy)
}

export function mnemonicBits(wordCount: number): number {
  return (wordCount * 11 * 32) / 33
}

export function splitMnemonicWords(mnemonic: string): string[] {
  return mnemonic
    .toLowerCase()
    .split(/[\s,]+/)
    .filter((w: string): boolean => Boolean(w))
}

/** 粘贴的助记词的同步检查：词数 + 逐词是否在词表里。校验和是异步的，见 validateMnemonic。 */
export interface PasteInspection {
  words: string[]
  countOk: boolean
  badWords: string[]
}

export function inspectPastedMnemonic(raw: string): PasteInspection {
  const words = splitMnemonicWords(raw)
  const badWords: string[] = []
  words.forEach((w: string, i: number): void => {
    if (BIP39_WORDS.indexOf(w) === -1) badWords.push(i + 1 + '（' + w + '）')
  })
  return {
    words,
    countOk: MNEMONIC_WORD_COUNTS.indexOf(words.length) !== -1,
    badWords,
  }
}

/** 助记词复制成带格式的表格：粘贴到备忘录/Word 这类富文本里仍是带序号的小格子；
    同时保留纯文本，粘贴到钱包还是空格隔开的单词。 */
export function buildMnemonicHtml(mnemonic: string): string {
  const words = mnemonic.split(' ')
  let html = '<table style="border-collapse:collapse;font-family:monospace;font-size:14px">'
  for (let r = 0; r < words.length; r += 3) {
    html += '<tr>'
    for (let c = 0; c < 3 && r + c < words.length; c++) {
      html +=
        '<td style="border:1px solid #c8c8c8;padding:8px 12px"><span style="color:#888888">' +
        (r + c + 1) +
        '</span>&nbsp;&nbsp;<b>' +
        words[r + c] +
        '</b></td>'
    }
    html += '</tr>'
  }
  return html + '</table>'
}

function fallbackCopyHtml(html: string, done: (ok: boolean) => void): void {
  const div = document.createElement('div')
  div.contentEditable = 'true'
  div.innerHTML = html
  div.style.position = 'fixed'
  div.style.opacity = '0'
  document.body.appendChild(div)
  const range = document.createRange()
  range.selectNodeContents(div)
  const sel = window.getSelection()
  if (sel) {
    sel.removeAllRanges()
    sel.addRange(range)
  }
  let ok = false
  try {
    ok = document.execCommand('copy')
  } catch {
    ok = false
  }
  if (sel) sel.removeAllRanges()
  document.body.removeChild(div)
  done(ok)
}

/** 用 ClipboardItem 同时写 text/html 与 text/plain；不支持时回退到 execCommand。 */
export function copyMnemonic(text: string, done: (ok: boolean) => void): void {
  const html = buildMnemonicHtml(text)
  if (navigator.clipboard && navigator.clipboard.write && window.ClipboardItem) {
    const item = new ClipboardItem({
      'text/html': new Blob([html], { type: 'text/html' }),
      'text/plain': new Blob([text], { type: 'text/plain' }),
    })
    navigator.clipboard.write([item]).then(
      (): void => {
        done(true)
      },
      (): void => {
        fallbackCopyHtml(html, done)
      },
    )
  } else {
    fallbackCopyHtml(html, done)
  }
}
