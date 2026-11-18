/** Bracket / quote / comment balance check shared by SQL / Python / Go / Java
 *  (ported from 1.x checkBalance). Returns the first problem, or null. */

import type { BalanceError } from './types'

export type BalanceLang = 'python' | 'sql' | 'c'

interface OpenBracket {
  ch: string
  line: number
  col: number
}

type State =
  | 'code'
  | 'squote'
  | 'dquote'
  | 'bquote'
  | 'bracket'
  | 'lineComment'
  | 'blockComment'
  | 'tripleS'
  | 'tripleD'

export function checkBalance(text: string, lang: BalanceLang): BalanceError | null {
  const stack: OpenBracket[] = []
  let i = 0
  const n = text.length
  let line = 1
  let col = 1
  let state: State = 'code'
  let strLine = 0
  let strCol = 0
  while (i < n) {
    const c = text[i]
    const curLine = line
    const curCol = col
    let step = 1
    if (state === 'code') {
      if (lang === 'python' && c === '#') {
        state = 'lineComment'
      } else if ((lang === 'c' || lang === 'sql') && c === '/' && text[i + 1] === '/') {
        state = 'lineComment'
        step = 2
      } else if ((lang === 'c' || lang === 'sql') && c === '/' && text[i + 1] === '*') {
        state = 'blockComment'
        step = 2
      } else if (
        lang === 'python' &&
        (text.substr(i, 3) === "'''" || text.substr(i, 3) === '"""')
      ) {
        state = text[i] === "'" ? 'tripleS' : 'tripleD'
        strLine = curLine
        strCol = curCol
        step = 3
      } else if (c === "'") {
        state = 'squote'
        strLine = curLine
        strCol = curCol
      } else if (c === '"') {
        state = 'dquote'
        strLine = curLine
        strCol = curCol
      } else if (lang !== 'python' && c === '`') {
        state = 'bquote'
        strLine = curLine
        strCol = curCol
      } else if (lang === 'sql' && c === '[') {
        state = 'bracket'
        strLine = curLine
        strCol = curCol
      } else if (c === '(' || c === '[' || c === '{') {
        stack.push({ ch: c, line: curLine, col: curCol })
      } else if (c === ')' || c === ']' || c === '}') {
        const open = c === ')' ? '(' : c === ']' ? '[' : '{'
        if (!stack.length || stack[stack.length - 1].ch !== open) {
          return {
            line: curLine,
            col: curCol,
            message: `括号不匹配：第 ${curLine} 行第 ${curCol} 列的 ${c} 没有对应的开括号`,
          }
        }
        stack.pop()
      }
    } else if (state === 'lineComment') {
      if (c === '\n') state = 'code'
    } else if (state === 'blockComment') {
      if (c === '*' && text[i + 1] === '/') {
        state = 'code'
        step = 2
      }
    } else if (
      state === 'squote' ||
      state === 'dquote' ||
      state === 'bquote' ||
      state === 'bracket'
    ) {
      const q =
        state === 'squote' ? "'" : state === 'dquote' ? '"' : state === 'bquote' ? '`' : ']'
      if (c === '\\' && state !== 'bracket') {
        step = 2
      } else if (c === q && text[i + 1] === q && (state === 'squote' || state === 'dquote')) {
        step = 2
      } else if (c === q) {
        state = 'code'
      } else if (c === '\n' && state !== 'bquote') {
        return {
          line: strLine,
          col: strCol,
          message: `字符串未闭合：第 ${strLine} 行第 ${strCol} 列的引号没有闭合`,
        }
      }
    } else if (state === 'tripleS' || state === 'tripleD') {
      const q3 = state === 'tripleS' ? "'''" : '"""'
      if (text.substr(i, 3) === q3) {
        state = 'code'
        step = 3
      }
    }
    for (let s = 0; s < step; s++) {
      const ch = text[i + s]
      if (ch === '\n') {
        line++
        col = 1
      } else {
        col++
      }
    }
    i += step
  }
  if (state === 'blockComment')
    return { line, col, message: '注释未闭合：/* 没有对应的 */' }
  if (
    state === 'squote' ||
    state === 'dquote' ||
    state === 'bquote' ||
    state === 'bracket' ||
    state === 'tripleS' ||
    state === 'tripleD'
  ) {
    return {
      line: strLine,
      col: strCol,
      message: `字符串未闭合：第 ${strLine} 行第 ${strCol} 列的引号没有闭合`,
    }
  }
  if (stack.length) {
    const t = stack[stack.length - 1]
    return {
      line: t.line,
      col: t.col,
      message: `括号未闭合：第 ${t.line} 行第 ${t.col} 列的 ${t.ch} 没有对应的闭括号`,
    }
  }
  return null
}
