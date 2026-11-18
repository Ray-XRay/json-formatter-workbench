/** Lightweight SQL formatter + one-line collapse (ported from 1.x formatSql /
 *  collapseSql). Used only when the real sql-formatter parser rejects the
 *  input (fallback, flagged as 「轻量模式」 in the status bar). */

export type SqlTokenType = 'comment' | 'string' | 'word' | 'num' | 'op' | 'punct'

export interface SqlToken {
  t: SqlTokenType
  v: string
}

const SQL_CLAUSES = new Set([
  'SELECT', 'FROM', 'WHERE', 'GROUP BY', 'ORDER BY', 'HAVING', 'LIMIT', 'OFFSET',
  'UNION', 'UNION ALL', 'INTERSECT', 'EXCEPT', 'INSERT INTO', 'VALUES', 'UPDATE',
  'SET', 'DELETE FROM', 'CREATE TABLE', 'ALTER TABLE', 'DROP TABLE',
])

const SQL_JOINS = new Set([
  'JOIN', 'LEFT JOIN', 'RIGHT JOIN', 'INNER JOIN', 'FULL JOIN', 'CROSS JOIN',
  'LEFT OUTER JOIN', 'RIGHT OUTER JOIN', 'FULL OUTER JOIN',
])

const SQL_KEYWORDS = new Set([
  'SELECT', 'FROM', 'WHERE', 'GROUP', 'BY', 'ORDER', 'HAVING', 'LIMIT', 'OFFSET',
  'UNION', 'INTERSECT', 'EXCEPT', 'ALL', 'DISTINCT', 'AS', 'AND', 'OR', 'NOT',
  'IN', 'IS', 'NULL', 'LIKE', 'BETWEEN', 'EXISTS', 'CASE', 'WHEN', 'THEN', 'ELSE',
  'END', 'JOIN', 'LEFT', 'RIGHT', 'INNER', 'FULL', 'CROSS', 'OUTER', 'ON', 'INTO',
  'VALUES', 'SET', 'UPDATE', 'DELETE', 'INSERT', 'CREATE', 'TABLE', 'ALTER', 'DROP',
  'ADD', 'PRIMARY', 'KEY', 'FOREIGN', 'REFERENCES', 'INDEX', 'VIEW', 'ASC', 'DESC',
  'COUNT', 'SUM', 'AVG', 'MIN', 'MAX', 'CAST', 'WITH', 'OVER', 'PARTITION', 'TRUE', 'FALSE',
])

export function tokenizeSql(text: string): SqlToken[] {
  const tokens: SqlToken[] = []
  let i = 0
  const n = text.length
  while (i < n) {
    const c = text[i]
    if (c === ' ' || c === '\t' || c === '\n' || c === '\r') {
      i++
      continue
    }
    if (c === '-' && text[i + 1] === '-') {
      let j = text.indexOf('\n', i)
      if (j === -1) j = n
      tokens.push({ t: 'comment', v: text.slice(i, j) })
      i = j
      continue
    }
    if (c === '/' && text[i + 1] === '*') {
      let k = text.indexOf('*/', i + 2)
      if (k === -1) k = n - 2
      tokens.push({ t: 'comment', v: text.slice(i, k + 2) })
      i = k + 2
      continue
    }
    if (c === "'" || c === '"' || c === '`') {
      const q = c
      let p = i + 1
      while (p < n) {
        if (text[p] === q) {
          if (text[p + 1] === q) {
            p += 2
            continue
          }
          p++
          break
        }
        p++
      }
      tokens.push({ t: 'string', v: text.slice(i, p) })
      i = p
      continue
    }
    if (c === '[') {
      let b = text.indexOf(']', i)
      if (b === -1) b = n - 1
      tokens.push({ t: 'string', v: text.slice(i, b + 1) })
      i = b + 1
      continue
    }
    if (/[A-Za-z_]/.test(c)) {
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
    const two = text.substr(i, 2)
    if (two === '>=' || two === '<=' || two === '<>' || two === '!=' || two === '||') {
      tokens.push({ t: 'op', v: two })
      i += 2
      continue
    }
    tokens.push({ t: 'punct', v: c })
    i++
  }
  return tokens
}

/** Merge multi-word keywords (GROUP BY, LEFT OUTER JOIN, …) into one token. */
export function combineSqlKeywords(tokens: SqlToken[]): SqlToken[] {
  const PAIRS = new Set([
    'GROUP BY', 'ORDER BY', 'LEFT JOIN', 'RIGHT JOIN', 'INNER JOIN', 'FULL JOIN',
    'CROSS JOIN', 'UNION ALL', 'INSERT INTO', 'DELETE FROM', 'CREATE TABLE',
    'ALTER TABLE', 'DROP TABLE',
  ])
  const TRIPLES = new Set(['LEFT OUTER JOIN', 'RIGHT OUTER JOIN', 'FULL OUTER JOIN'])
  const out: SqlToken[] = []
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i]
    if (
      t.t === 'word' &&
      i + 2 < tokens.length &&
      tokens[i + 1].t === 'word' &&
      tokens[i + 2].t === 'word'
    ) {
      const tri = (t.v + ' ' + tokens[i + 1].v + ' ' + tokens[i + 2].v).toUpperCase()
      if (TRIPLES.has(tri)) {
        out.push({ t: 'word', v: tri })
        i += 2
        continue
      }
    }
    if (t.t === 'word' && i + 1 < tokens.length && tokens[i + 1].t === 'word') {
      const pair = (t.v + ' ' + tokens[i + 1].v).toUpperCase()
      if (PAIRS.has(pair)) {
        out.push({ t: 'word', v: pair })
        i++
        continue
      }
    }
    out.push(t)
  }
  return out
}

function repeatStr(s: string, n: number): string {
  let r = ''
  for (let i = 0; i < n; i++) r += s
  return r
}

export function formatSql(text: string, indentStr: string): string {
  const tokens = combineSqlKeywords(tokenizeSql(text))
  const lines: string[] = []
  let cur = ''
  let level = 0
  const parenStack: string[] = [] // 'func' function-call parens | 'block' subquery / list parens
  let betweenPending = false
  const ind = (lv: number): string => repeatStr(indentStr, lv)
  const contIndent = (): number => level + (parenStack.length === 0 ? 1 : 0)
  const trimEnd = (s: string): string => s.replace(/\s+$/, '')
  const newline = (lv: number): void => {
    if (trimEnd(cur) !== '') lines.push(trimEnd(cur))
    cur = ind(lv)
  }
  const append = (tok: SqlToken, prev: SqlToken | null): void => {
    let sp = false
    if (trimEnd(cur) !== '') {
      if (tok.v === ',' || tok.v === ';' || tok.v === ')' || tok.v === '.') sp = false
      else if (prev && (prev.v === '(' || prev.v === '.')) sp = false
      else sp = true
    }
    cur += (sp ? ' ' : '') + tok.v
  }
  for (let i = 0; i < tokens.length; i++) {
    const tok = tokens[i]
    const prev = i > 0 ? tokens[i - 1] : null
    const up = tok.t === 'word' ? tok.v.toUpperCase() : null
    if (up && SQL_KEYWORDS.has(up)) tok.v = up
    if (tok.t === 'comment') {
      if (tok.v.indexOf('--') === 0) {
        if (trimEnd(cur) !== '') cur += ' '
        cur += tok.v
        newline(level)
      } else {
        append(tok, prev)
      }
      continue
    }
    if (up && SQL_CLAUSES.has(up)) {
      newline(level)
      cur += tok.v
      betweenPending = false
      continue
    }
    if (up && SQL_JOINS.has(up)) {
      newline(level)
      cur += tok.v
      betweenPending = false
      continue
    }
    if (up === 'ON') {
      newline(contIndent())
      cur += 'ON'
      betweenPending = false
      continue
    }
    if (up === 'AND' || up === 'OR') {
      if (betweenPending) {
        append(tok, prev)
        betweenPending = false
      } else {
        newline(contIndent())
        cur += tok.v
      }
      continue
    }
    if (up === 'BETWEEN') {
      append(tok, prev)
      betweenPending = true
      continue
    }
    if (up === 'WHEN') {
      newline(contIndent())
      cur += 'WHEN'
      continue
    }
    if (up === 'ELSE') {
      newline(contIndent())
      cur += 'ELSE'
      continue
    }
    if (up === 'END') {
      if (trimEnd(cur) !== '') newline(level)
      else cur = ind(level)
      cur += 'END'
      continue
    }
    if (tok.v === '(') {
      // Function call: COUNT(, CAST(…; anything else is a subquery or list, a block
      const isFunc =
        prev &&
        prev.t === 'word' &&
        !SQL_CLAUSES.has(prev.v) &&
        !SQL_JOINS.has(prev.v) &&
        prev.v !== 'ON' &&
        prev.v !== 'IN' &&
        prev.v !== 'EXISTS'
      if (isFunc) {
        append(tok, prev)
        parenStack.push('func')
      } else {
        if (trimEnd(cur) !== '') cur += ' '
        cur += '('
        parenStack.push('block')
        level++
        newline(level)
      }
      continue
    }
    if (tok.v === ')') {
      const kind = parenStack.pop() || 'block'
      if (kind === 'func') {
        cur += ')'
      } else {
        level = Math.max(0, level - 1)
        if (trimEnd(cur) !== '') newline(level)
        else cur = ind(level)
        cur += ')'
      }
      continue
    }
    if (tok.v === ',') {
      cur += ','
      const top = parenStack.length ? parenStack[parenStack.length - 1] : 'block'
      if (top === 'block') newline(contIndent())
      continue
    }
    if (tok.v === ';') {
      cur += ';'
      newline(0)
      continue
    }
    append(tok, prev)
  }
  if (trimEnd(cur) !== '') lines.push(trimEnd(cur))
  return lines.join('\n')
}

/** SQL minify: collapse whitespace to single spaces, drop comments, one line. */
export function collapseSql(text: string): string {
  const tokens = combineSqlKeywords(tokenizeSql(text))
  let out = ''
  let prev: SqlToken | null = null
  tokens.forEach((tok) => {
    if (tok.t === 'comment') return
    if (tok.t === 'word') {
      const up = tok.v.toUpperCase()
      if (SQL_KEYWORDS.has(up)) tok.v = up
    }
    if (out === '') out = tok.v
    else if (tok.v === ',' || tok.v === ';' || tok.v === ')' || tok.v === '.') out += tok.v
    else if (prev && (prev.v === '(' || prev.v === '.')) out += tok.v
    else out += ' ' + tok.v
    prev = tok
  })
  return out
}
