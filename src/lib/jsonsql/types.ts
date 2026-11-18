/** Shared value types for the JSON / SQL workbench (2.0 migration of 1.x app.js). */

export type JsonValue =
  | null
  | boolean
  | number
  | string
  | JsonValue[]
  | { [key: string]: JsonValue }

export function isRecord(v: JsonValue): v is { [key: string]: JsonValue } {
  return v !== null && typeof v === 'object' && !Array.isArray(v)
}

export type Lang = 'json' | 'sql' | 'python' | 'go' | 'java'
export type LangMode = 'auto' | Lang
export type IndentOption = '2' | '4' | 'tab'
export type TypeLang = 'ts' | 'go' | 'py'
export type OutputMode = 'json' | 'text' | 'ts' | 'yaml' | 'go' | 'py'
export type StatusKind = 'idle' | 'ok' | 'warn' | 'err'

export interface DiffOp {
  t: 'same' | 'del' | 'add'
  line: string
}

export interface JsonPathMatch {
  path: string
  value: JsonValue
}

export type JsonPathToken =
  | { t: 'key' | 'recursive'; key: string }
  | { t: 'index'; idx: number }
  | { t: 'wildcard' }

export interface CheckResult {
  ok: boolean
  message: string
}

export interface BalanceError {
  line: number
  col: number
  message: string
}
