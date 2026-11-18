/** Multi-language dispatch (ported from 1.x formatCode / validateCode).
 *  SQL goes through the real sql-formatter parser first; when it rejects the
 *  input we fall back to the lightweight formatter and flag it — a formatter
 *  is not a strict validator, so strict errors surface via the Validate
 *  action instead. Python / Go / Java use the conservative local formatters
 *  and say so in their status messages. */

import { format as sqlFormat } from 'sql-formatter'
import { checkBalance } from './balance'
import { formatCStyle } from './cstyle'
import { checkPythonIndent, formatPython } from './python'
import { collapseSql, formatSql } from './sql'
import { LANGS } from './detect'
import type { CheckResult, IndentOption, Lang } from './types'

export function indentString(opt: IndentOption): string {
  if (opt === 'tab') return '\t'
  return opt === '4' ? '    ' : '  '
}

export function indentValue(opt: IndentOption): number | '\t' {
  return opt === 'tab' ? '\t' : Number(opt)
}

export function sqlParseError(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e)
  const first = msg.split('\n')[0]
  const m = /Parse error at token: (.*?) at line (\d+) column (\d+)/.exec(first)
  if (m)
    return `SQL 语法错误：第 ${m[2]} 行第 ${m[3]} 列附近，意外的 ${m[1] || '内容'}`
  return 'SQL 语法错误：' + first
}

export interface FormatResult {
  text: string
  /** True when SQL fell back to the lightweight formatter. */
  sqlFallback: boolean
}

export function formatCode(lang: Lang, text: string, indent: IndentOption): FormatResult {
  const u = indentString(indent)
  if (lang === 'sql') {
    try {
      const opts: Parameters<typeof sqlFormat>[1] = {
        language: 'sql',
        keywordCase: 'upper',
      }
      if (u === '\t') opts.useTabs = true
      else opts.tabWidth = u.length
      return { text: sqlFormat(text, opts), sqlFallback: false }
    } catch {
      // Real parser rejected it (dialect syntax or a malformed statement):
      // fall back to the lightweight version and keep going; the status bar
      // says so. Strict errors go through Validate.
      return { text: formatSql(text, u), sqlFallback: true }
    }
  }
  if (lang === 'python') return { text: formatPython(text, u), sqlFallback: false }
  if (lang === 'go') return { text: formatCStyle(text, u, 'go'), sqlFallback: false }
  if (lang === 'java') return { text: formatCStyle(text, u, 'java'), sqlFallback: false }
  return { text, sqlFallback: false }
}

export function validateCode(lang: Lang, text: string, indent: IndentOption): CheckResult {
  const bal = checkBalance(text, lang === 'python' ? 'python' : lang === 'sql' ? 'sql' : 'c')
  if (bal) return { ok: false, message: bal.message }
  if (lang === 'python') {
    const ind = checkPythonIndent(text, indent === 'tab' ? 4 : Number(indent))
    if (ind) return { ok: false, message: ind }
    return {
      ok: true,
      message: 'Python 结构检查通过：括号、引号、缩进正常（非完整语法校验）',
    }
  }
  if (lang === 'sql') {
    try {
      sqlFormat(text, { language: 'sql', keywordCase: 'upper' })
      return { ok: true, message: 'SQL 语法检查通过：sql-formatter 解析成功（标准 SQL 方言）' }
    } catch (e) {
      return { ok: false, message: sqlParseError(e) }
    }
  }
  return {
    ok: true,
    message: `${LANGS[lang]} 结构检查通过：括号、引号配对正常（非完整语法校验）`,
  }
}

export function minifySql(text: string): string {
  return collapseSql(text)
}

export function downloadName(lang: Lang): string {
  return (
    { json: 'formatted.json', sql: 'query.sql', python: 'main.py', go: 'main.go', java: 'Main.java' }[
      lang
    ] || 'formatted.txt'
  )
}
