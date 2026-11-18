/** Syntax highlighting (ported from 1.x app.js: highlight / highlightSql).
 *  Output is escaped first, then wrapped in <span class="wb-*"> tokens;
 *  render it only via v-html from our own escaped output.
 *  Colours live in the <style> block of JsonSqlView.vue (.wb-k etc.). */

export function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

/** Punctuation ({ } [ ] , :) gets its own colour for depth. */
function punctHtml(s: string): string {
  return escapeHtml(s).replace(/([{}[\],:])/g, '<span class="wb-p">$1</span>')
}

export function highlight(json: string): string {
  const re =
    /("(?:\\.|[^"\\])*")(\s*:)?|\b(true|false)\b|\bnull\b|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?/g
  let out = ''
  let last = 0
  let m: RegExpExecArray | null
  while ((m = re.exec(json))) {
    out += punctHtml(json.slice(last, m.index))
    if (m[1] !== undefined) {
      out += m[2]
        ? '<span class="wb-k">' +
          escapeHtml(m[1]) +
          '</span>' +
          m[2].replace(':', '<span class="wb-p">:</span>')
        : '<span class="wb-s">' + escapeHtml(m[1]) + '</span>'
    } else if (m[3] !== undefined) {
      out += '<span class="wb-b">' + m[3] + '</span>'
    } else if (m[0] === 'null') {
      out += '<span class="wb-u">null</span>'
    } else {
      out += '<span class="wb-n">' + m[0] + '</span>'
    }
    last = re.lastIndex
  }
  out += punctHtml(json.slice(last))
  return out
}

const SQL_KEYWORDS = new Set([
  'SELECT', 'FROM', 'WHERE', 'GROUP', 'BY', 'ORDER', 'HAVING', 'LIMIT', 'OFFSET',
  'UNION', 'INTERSECT', 'EXCEPT', 'ALL', 'DISTINCT', 'AS', 'AND', 'OR', 'NOT',
  'IN', 'IS', 'NULL', 'LIKE', 'BETWEEN', 'EXISTS', 'CASE', 'WHEN', 'THEN', 'ELSE',
  'END', 'JOIN', 'LEFT', 'RIGHT', 'INNER', 'FULL', 'CROSS', 'OUTER', 'ON', 'INTO',
  'VALUES', 'SET', 'UPDATE', 'DELETE', 'INSERT', 'CREATE', 'TABLE', 'ALTER', 'DROP',
  'ADD', 'PRIMARY', 'KEY', 'FOREIGN', 'REFERENCES', 'INDEX', 'VIEW', 'ASC', 'DESC',
  'COUNT', 'SUM', 'AVG', 'MIN', 'MAX', 'CAST', 'WITH', 'OVER', 'PARTITION', 'TRUE', 'FALSE',
])

export { SQL_KEYWORDS }

/** SQL highlighting. Token kinds reuse the JSON classes: keyword k, string s,
 *  number n, function b, punctuation p; comments get c. Identifiers that are
 *  not keywords are left unwrapped. */
export function highlightSql(sql: string): string {
  const re =
    /(--[^\n]*)|(\/\*[\s\S]*?\*\/)|('(?:[^']|'')*')|("(?:[^"]|"")*")|(`(?:[^`]|``)*`)|(\b\d+(?:\.\d+)?\b)|([A-Za-z_][A-Za-z0-9_$]*)|(\S)/g
  let out = ''
  let last = 0
  let m: RegExpExecArray | null
  while ((m = re.exec(sql))) {
    out += escapeHtml(sql.slice(last, m.index))
    if (m[1] !== undefined || m[2] !== undefined) {
      out += '<span class="wb-c">' + escapeHtml(m[0]) + '</span>'
    } else if (m[3] !== undefined || m[4] !== undefined || m[5] !== undefined) {
      out += '<span class="wb-s">' + escapeHtml(m[0]) + '</span>'
    } else if (m[6] !== undefined) {
      out += '<span class="wb-n">' + m[0] + '</span>'
    } else if (m[7] !== undefined) {
      const w = m[7]
      if (SQL_KEYWORDS.has(w.toUpperCase())) {
        out += '<span class="wb-k">' + w + '</span>'
      } else if (/^\s*\(/.test(sql.slice(re.lastIndex))) {
        out += '<span class="wb-b">' + w + '</span>' // function name: identifier followed by (
      } else {
        out += escapeHtml(w)
      }
    } else {
      out += '<span class="wb-p">' + escapeHtml(m[0]) + '</span>'
    }
    last = re.lastIndex
  }
  out += escapeHtml(sql.slice(last))
  return out
}
