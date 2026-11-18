/** Go / Java formatting, C style (ported from 1.x formatCStyle / tokenizeC).
 *  Brace-driven indent, semicolon line breaks, space after commas, space after
 *  control keywords; keeps the user's blank lines (max 1); strings, chars and
 *  comments are preserved verbatim. Operator spacing is conservative (unary
 *  *, & - ! get no space) — no full semantic analysis. */

import { checkBalance } from './balance'
import { repeatStr } from './python'

export type CTokenType =
  | 'nl'
  | 'blank'
  | 'comment'
  | 'string'
  | 'word'
  | 'num'
  | 'op'
  | 'punct'

export interface CToken {
  t: CTokenType
  v: string
}

export function tokenizeC(text: string, lang: 'go' | 'java'): CToken[] {
  const tokens: CToken[] = []
  let i = 0
  const n = text.length
  while (i < n) {
    const c = text[i]
    if (c === ' ' || c === '\t' || c === '\r') {
      i++
      continue
    }
    if (c === '\n') {
      let j = i
      let newlines = 0
      while (
        j < n &&
        (text[j] === ' ' || text[j] === '\t' || text[j] === '\r' || text[j] === '\n')
      ) {
        if (text[j] === '\n') newlines++
        j++
      }
      // A single newline is a statement separator (Go relies on newlines,
      // Java imports too) and must survive as an nl token; two or more
      // newlines count as a blank line
      if (newlines >= 2) tokens.push({ t: 'blank', v: '' })
      else tokens.push({ t: 'nl', v: '' })
      i = j
      continue
    }
    if (c === '/' && text[i + 1] === '/') {
      let lc = text.indexOf('\n', i)
      if (lc === -1) lc = n
      tokens.push({ t: 'comment', v: text.slice(i, lc) })
      i = lc
      continue
    }
    if (c === '/' && text[i + 1] === '*') {
      let bc = text.indexOf('*/', i + 2)
      if (bc === -1) bc = n - 2
      tokens.push({ t: 'comment', v: text.slice(i, bc + 2) })
      i = bc + 2
      continue
    }
    if (c === '"') {
      if (lang === 'java' && text.substr(i, 3) === '"""') {
        let tb = text.indexOf('"""', i + 3)
        if (tb === -1) tb = n - 3
        tokens.push({ t: 'string', v: text.slice(i, tb + 3) })
        i = tb + 3
        continue
      }
      let s = i + 1
      while (s < n && text[s] !== '"' && text[s] !== '\n') {
        if (text[s] === '\\') s++
        s++
      }
      if (s < n && text[s] === '"') s++
      tokens.push({ t: 'string', v: text.slice(i, s) })
      i = s
      continue
    }
    if (c === "'") {
      let ch = i + 1
      while (ch < n && text[ch] !== "'" && text[ch] !== '\n') {
        if (text[ch] === '\\') ch++
        ch++
      }
      if (ch < n && text[ch] === "'") ch++
      tokens.push({ t: 'string', v: text.slice(i, ch) })
      i = ch
      continue
    }
    if (c === '`' && lang === 'go') {
      let bt = text.indexOf('`', i + 1)
      if (bt === -1) bt = n - 1
      tokens.push({ t: 'string', v: text.slice(i, bt + 1) })
      i = bt + 1
      continue
    }
    if (/[A-Za-z_$]/.test(c)) {
      let w = i
      while (w < n && /[A-Za-z0-9_$]/.test(text[w])) w++
      tokens.push({ t: 'word', v: text.slice(i, w) })
      i = w
      continue
    }
    if (/[0-9]/.test(c)) {
      let d = i
      while (d < n && /[0-9A-Za-z_.]/.test(text[d])) d++
      tokens.push({ t: 'num', v: text.slice(i, d) })
      i = d
      continue
    }
    const three = text.substr(i, 3)
    if (three === '...' || three === '<<=' || three === '>>=') {
      tokens.push({ t: 'op', v: three })
      i += 3
      continue
    }
    const two = text.substr(i, 2)
    if (
      two === '++' || two === '--' || two === '+=' || two === '-=' || two === '*=' ||
      two === '/=' || two === '%=' || two === '==' || two === '!=' || two === '<=' ||
      two === '>=' || two === '&&' || two === '||' || two === '->' || two === '::' ||
      two === '<<' || two === '>>' || two === '&=' || two === '|=' || two === '^=' ||
      two === '=>'
    ) {
      tokens.push({ t: 'op', v: two })
      i += 2
      continue
    }
    tokens.push({ t: 'punct', v: c })
    i++
  }
  return tokens
}

export function formatCStyle(text: string, indentStr: string, lang: 'go' | 'java'): string {
  const bal = checkBalance(text, 'c')
  if (bal) throw new Error(bal.message)
  const tokens = tokenizeC(text, lang)
  const lines: string[] = []
  let cur = ''
  let level = 0
  let paren = 0
  let inCase = false
  let casePending = false
  let breakPending = false
  let anno = 0 // 0 none | 1 saw @ | 2 after annotation name | 3 inside annotation parens
  const CONTROL: Record<string, boolean> = {
    if: true, for: true, while: true, switch: true, catch: true, return: true,
    func: true, synchronized: true,
  }
  const ind = (lv: number): string => repeatStr(indentStr, lv)
  const stmtLevel = (): number => level + (inCase ? 1 : 0)
  const hasContent = (): boolean => cur.replace(/\s+$/, '') !== ''
  const newline = (lv: number): void => {
    if (hasContent()) lines.push(cur)
    cur = ind(lv)
  }
  // Whether a space is needed before this token
  const isUnaryContext = (tok: CToken | null): boolean => {
    if (!tok) return true
    if (tok.t === 'op' && tok.v !== '++' && tok.v !== '--') return true
    const v = tok.v
    return (
      v === '(' || v === '[' || v === ',' || v === '=' || v === ':' || v === '{' ||
      v === ';' || v === 'return' || v === 'case'
    )
  }
  const spaceBefore = (
    tok: CToken,
    prev: CToken | null,
    prevPrev: CToken | null,
  ): boolean => {
    if (!prev) return false
    const v = tok.v
    if (
      v === ',' || v === ';' || v === ')' || v === ']' || v === '.' || v === '::' ||
      v === '...' || v === ':'
    )
      return false
    if (v === '++' || v === '--')
      return !(
        prev.t === 'word' || prev.t === 'num' || prev.v === ')' || prev.v === ']' ||
        prev.v === '++' || prev.v === '--'
      )
    if (prev.v === '(' || prev.v === '[' || prev.v === '.' || prev.v === '::' || prev.v === '...' || prev.v === '++' || prev.v === '--')
      return false
    if ((v === '*' || v === '&' || v === '-' || v === '!') && isUnaryContext(prev))
      return false
    if (
      (prev.v === '*' || prev.v === '&' || prev.v === '-' || prev.v === '!' || prev.v === '+') &&
      isUnaryContext(prevPrev)
    )
      return false
    if (v === '(') return !!CONTROL[prev.v]
    if (v === '[')
      return !(prev.t === 'word' || prev.t === 'num' || prev.v === ')' || prev.v === ']')
    return true
  }
  // Raw append with newlines: a string token may itself contain newlines
  // (Go backquotes, Java text blocks)
  const appendRaw = (v: string): void => {
    const parts = v.split('\n')
    cur += parts[0]
    for (let k = 1; k < parts.length; k++) {
      lines.push(cur)
      cur = parts[k]
    }
  }
  let lastTok: CToken | null = null
  let lastLastTok: CToken | null = null
  let annoParen = 0
  // Whether a newline is only a continuation (don't break the line): the
  // previous token is an operator / comma / open bracket, or the next token
  // is an operator / comma / dot / close bracket / else …
  const isContPrev = (tok: CToken | null): boolean => {
    if (!tok) return false
    if (tok.t === 'op' && tok.v !== '++' && tok.v !== '--') return true
    return (
      tok.v === ',' || tok.v === '.' || tok.v === '(' || tok.v === '[' ||
      tok.v === '{' || tok.v === '?' || tok.v === ':'
    )
  }
  const isContNext = (tok: CToken | undefined): boolean => {
    if (!tok) return false
    if (tok.t === 'op' && tok.v !== '++' && tok.v !== '--') return true
    return (
      tok.v === ',' || tok.v === '.' || tok.v === '?' || tok.v === ':' ||
      tok.v === ')' || tok.v === ']' || tok.v === '}' || tok.v === 'else' ||
      tok.v === 'catch' || tok.v === 'finally' || tok.v === 'while'
    )
  }
  for (let ti = 0; ti < tokens.length; ti++) {
    const tok = tokens[ti]
    if (tok.t === 'nl') {
      // Newline breaks the statement: only break when the line has content
      // and this is not a continuation
      if (!hasContent()) continue
      if (isContPrev(lastTok)) continue
      if (isContNext(tokens[ti + 1])) continue
      newline(stmtLevel())
      continue
    }
    if (tok.t === 'blank') {
      if (hasContent()) {
        newline(stmtLevel())
        lines.push('')
      }
      continue
    }
    if (breakPending) {
      if (
        tok.v !== 'else' && tok.v !== 'catch' && tok.v !== 'finally' &&
        tok.v !== 'while' && tok.v !== ';' && tok.v !== ',' && tok.v !== '.'
      ) {
        newline(stmtLevel())
      }
      breakPending = false
    }
    // Java annotation: @Override and friends go on their own line
    if (anno === 2 && tok.v !== '(') {
      newline(stmtLevel())
      anno = 0
    }
    if (tok.v === '{') {
      if (!hasContent()) cur += '{'
      else cur += ' {'
      level++
      newline(level)
      lastLastTok = lastTok
      lastTok = tok
      continue
    }
    if (tok.v === '}') {
      level = Math.max(0, level - 1)
      inCase = false
      if (hasContent()) newline(level)
      cur = ind(level)
      appendRaw('}')
      breakPending = true
      lastLastTok = lastTok
      lastTok = tok
      continue
    }
    if (tok.v === 'case' || tok.v === 'default') {
      inCase = false
      if (hasContent()) newline(level)
      cur = ind(level)
      appendRaw(tok.v)
      casePending = true
      lastLastTok = lastTok
      lastTok = tok
      continue
    }
    if (tok.v === ':' && casePending) {
      appendRaw(':')
      casePending = false
      newline(level + 1)
      inCase = true
      lastLastTok = lastTok
      lastTok = tok
      continue
    }
    if (tok.v === ';') {
      appendRaw(';')
      if (paren === 0) newline(stmtLevel())
      lastLastTok = lastTok
      lastTok = tok
      continue
    }
    if (tok.v === '(') paren++
    if (tok.v === ')') paren = Math.max(0, paren - 1)
    if (tok.v === '@') anno = 1
    else if (anno === 1 && tok.t === 'word') anno = 2
    if (tok.t === 'comment' && tok.v.indexOf('//') === 0) {
      if (!hasContent()) cur = ind(stmtLevel())
      else cur += ' '
      appendRaw(tok.v)
      newline(stmtLevel())
      lastLastTok = lastTok
      lastTok = tok
      continue
    }
    if (!hasContent() && tok.v !== '{') {
      // Line start: cur is already the indent, append directly
      appendRaw(tok.v)
    } else {
      if (spaceBefore(tok, lastTok, lastLastTok)) cur += ' '
      appendRaw(tok.v)
    }
    if (anno === 3 && tok.v === ')' && paren === annoParen - 1) {
      anno = 0
      newline(stmtLevel())
    } else if (anno === 1 && tok.v === '(') {
      anno = 3
      annoParen = paren
    }
    lastLastTok = lastTok
    lastTok = tok
  }
  if (hasContent()) lines.push(cur)
  while (lines.length && lines[0] === '') lines.shift()
  while (lines.length && lines[lines.length - 1] === '') lines.pop()
  return lines.join('\n')
}
