/** Conservative Python tidying (ported from 1.x formatPython / checkPythonIndent).
 *  Trims trailing spaces, caps blank runs at 2, re-lays indentation from block
 *  structure (colon-opened blocks; raw indent only signals dedent). It does not
 *  touch operator spacing or semantics — not a black-style full parser. */

import { checkBalance } from './balance'

export function repeatStr(s: string, n: number): string {
  let r = ''
  for (let i = 0; i < n; i++) r += s
  return r
}

function measureIndent(line: string): number {
  const m = line.match(/^[ \t]*/)
  const lead = m ? m[0] : ''
  let w = 0
  for (let i = 0; i < lead.length; i++) w += lead[i] === '\t' ? 4 : 1
  return w
}

function countBrackets(code: string): number {
  let d = 0
  for (let i = 0; i < code.length; i++) {
    const c = code[i]
    if (c === '(' || c === '[' || c === '{') d++
    else if (c === ')' || c === ']' || c === '}') d--
  }
  return d
}

// Replace a line's string contents and comments with spaces (keeping quotes and
// delimiters); returns the scrubbed line plus triple-quote state, for indent
// decisions and bracket counting.
function blankPythonLine(
  line: string,
  triple: string | null,
): { code: string; triple: string | null } {
  let out = ''
  let i = 0
  const n = line.length
  let state: 'code' | 'triple' = triple ? 'triple' : 'code'
  const q3 = triple
  while (i < n) {
    const c = line[i]
    if (state === 'code') {
      if (c === '#') {
        out += repeatStr(' ', n - i)
        break
      }
      if (line.substr(i, 3) === "'''" || line.substr(i, 3) === '"""') {
        const q = line.substr(i, 3)
        out += q
        i += 3
        const j = line.indexOf(q, i)
        if (j === -1) {
          out += repeatStr(' ', n - i)
          return { code: out, triple: q }
        }
        out += repeatStr(' ', j - i) + q
        i = j + 3
        continue
      }
      if (c === "'" || c === '"') {
        const q1 = c
        out += c
        i++
        while (i < n && line[i] !== q1) {
          if (line[i] === '\\') {
            out += '  '
            i += 2
            continue
          }
          out += ' '
          i++
        }
        if (i < n) {
          out += q1
          i++
        }
        continue
      }
      out += c
      i++
    } else {
      const k = line.indexOf(q3 as string, i)
      if (k === -1) {
        out += repeatStr(' ', n - i)
        return { code: out, triple: q3 }
      }
      out += repeatStr(' ', k - i) + q3
      i = k + 3
      state = 'code'
    }
  }
  return { code: out, triple: state === 'triple' ? q3 : null }
}

// The input's own indent unit: width of the first indented line (over 8 is
// treated as abnormal and the configured indent is used instead). Raw indent
// is only used to detect "dedent to outer level", so it must be measured in
// the input's own unit, not the configured one.
function detectIndentUnit(lines: string[], fallback: number): number {
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^ +/)
    if (m) {
      if (m[0].length <= 8) return m[0].length
    } else if (/^\t/.test(lines[i])) {
      return 4
    }
  }
  return fallback
}

export function formatPython(text: string, indentStr: string): string {
  const bal = checkBalance(text, 'python')
  if (bal) throw new Error(bal.message)
  const rawLines = text.replace(/\r\n?/g, '\n').split('\n')
  const unitWidth = detectIndentUnit(rawLines, indentStr === '\t' ? 4 : indentStr.length)
  const out: string[] = []
  let level = 0
  let blanks = 0
  let triple: string | null = null
  let openDepth = 0
  let prevEndsColon = false
  let prevCont = false
  for (let i = 0; i < rawLines.length; i++) {
    const line = rawLines[i]
    const stripped = line.replace(/^\s+/, '').replace(/\s+$/, '')
    if (triple) {
      out.push(line.replace(/\s+$/, ''))
      triple = blankPythonLine(line, triple).triple
      blanks = 0
      continue
    }
    if (stripped === '') {
      blanks++
      if (blanks <= 2) out.push('')
      continue
    }
    blanks = 0
    const scan = blankPythonLine(line, null)
    const code = scan.code
    const lead = measureIndent(line)
    let eff = level
    // Raw indent is only trusted for "dedent to outer level": only when the
    // previous line did not open a new block and we are not in a continuation
    if (openDepth === 0 && !prevCont && !prevEndsColon) {
      const hint = Math.floor(lead / unitWidth)
      if (hint < level) level = hint
      eff = level
    }
    if (/^(elif|else|except|finally)\b/.test(stripped)) eff = Math.max(0, level - 1)
    else if (/^[)\]}]/.test(stripped)) eff = Math.max(0, level - 1)
    const newDepth = openDepth + countBrackets(code)
    const endsBackslash = /\\$/.test(code.replace(/\s+$/, ''))
    if (prevCont) {
      const origLead = line.slice(0, line.length - line.replace(/^\s+/, '').length)
      out.push(origLead + stripped)
    } else {
      out.push(repeatStr(indentStr, eff) + stripped)
    }
    if (/^(elif|else|except|finally)\b/.test(stripped)) level = eff
    else if (/^[)\]}]/.test(stripped)) level = eff
    else level = eff
    const endsColon = /:\s*$/.test(code)
    if (endsColon && openDepth === 0 && newDepth === 0 && !prevCont) level = eff + 1
    prevEndsColon = endsColon
    prevCont = newDepth > 0 || endsBackslash
    openDepth = newDepth
    if (scan.triple) triple = scan.triple
  }
  while (out.length && out[0] === '') out.shift()
  while (out.length && out[out.length - 1] === '') out.pop()
  return out.join('\n')
}

/** Python indent check: mixed tabs/spaces, or indent jumping more than one level. */
export function checkPythonIndent(text: string, indentWidth: number): string | null {
  const lines = text.replace(/\r\n?/g, '\n').split('\n')
  const unit = detectIndentUnit(lines, indentWidth)
  let triple: string | null = null
  let openDepth = 0
  let prevIndent = 0
  let prevEndsColon = false
  let prevCont = false
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const scan = blankPythonLine(line, triple)
    triple = scan.triple
    if (triple) continue
    const stripped = line.replace(/^\s+/, '').replace(/\s+$/, '')
    if (!stripped) continue
    const lead = line.match(/^\s*/)
    const leadStr = lead ? lead[0] : ''
    if (/\t/.test(leadStr) && / /.test(leadStr))
      return `第 ${i + 1} 行缩进混用了 Tab 和空格`
    const spaces = measureIndent(line)
    if (!prevCont && !prevEndsColon && openDepth === 0 && spaces > prevIndent + unit) {
      return `第 ${i + 1} 行缩进异常：比上一行多缩进超过一级`
    }
    const code = scan.code
    openDepth += countBrackets(code)
    prevEndsColon = /:\s*$/.test(code) && openDepth === 0
    prevCont = openDepth > 0 || /\\$/.test(code.replace(/\s+$/, ''))
    prevIndent = spaces
  }
  return null
}
