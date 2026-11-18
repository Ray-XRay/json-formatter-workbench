/** Type generation from JSON (ported from 1.x generateTs / generateGo /
 *  generatePy). Object arrays are merged: keys missing from some elements
 *  become optional (TS '?', Go '*', Python Optional). */

import { isRecord, type JsonValue } from './types'

function tsTypeName(raw: string): string {
  let s = String(raw).replace(/[^A-Za-z0-9_$]/g, '_')
  if (/^\d/.test(s)) s = '_' + s
  return s.charAt(0).toUpperCase() + s.slice(1) || 'Item'
}

function validIdent(k: string): boolean {
  return /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(k)
}

export function generateTs(root: JsonValue): string {
  const defs: string[] = []
  const used: Record<string, boolean> = {}
  const uniqueName = (base: string): string => {
    let name = base
    let i = 2
    while (used[name]) {
      name = base + i
      i++
    }
    used[name] = true
    return name
  }
  const infer = (v: JsonValue, name: string): string => {
    if (v === null) return 'null'
    if (Array.isArray(v)) {
      if (v.length === 0) return 'unknown[]'
      const elemTypes: string[] = []
      v.forEach((el) => {
        const t = infer(el, name + 'Item')
        if (elemTypes.indexOf(t) === -1) elemTypes.push(t)
      })
      return elemTypes.length === 1 ? elemTypes[0] + '[]' : '(' + elemTypes.join(' | ') + ')[]'
    }
    if (isRecord(v)) {
      const iface = uniqueName(name)
      const keys = Object.keys(v)
      const lines = keys.map((k) => {
        const t = infer(v[k], iface + tsTypeName(k))
        return '  ' + (validIdent(k) ? k : JSON.stringify(k)) + ': ' + t + ';'
      })
      defs.push('interface ' + iface + ' {\n' + lines.join('\n') + '\n}')
      return iface
    }
    if (typeof v === 'string') return 'string'
    if (typeof v === 'number') return 'number'
    if (typeof v === 'boolean') return 'boolean'
    return 'unknown'
  }
  const inferArrayOfObjects = (arr: JsonValue[], name: string): string => {
    const allKeys: string[] = []
    arr.forEach((el) => {
      if (isRecord(el)) {
        Object.keys(el).forEach((k) => {
          if (allKeys.indexOf(k) === -1) allKeys.push(k)
        })
      }
    })
    const iface = uniqueName(name)
    const lines = allKeys.map((k) => {
      const present = arr.filter((el) => isRecord(el) && k in el).length
      const types: string[] = []
      arr.forEach((el) => {
        if (isRecord(el) && k in el) {
          const t = infer(el[k], iface + tsTypeName(k))
          if (types.indexOf(t) === -1) types.push(t)
        }
      })
      const optional = present < arr.length ? '?' : ''
      return (
        '  ' +
        (validIdent(k) ? k : JSON.stringify(k)) +
        optional +
        ': ' +
        (types.join(' | ') || 'unknown') +
        ';'
      )
    })
    defs.push('interface ' + iface + ' {\n' + lines.join('\n') + '\n}')
    return iface
  }
  // Top level is an object array: merged logic
  if (
    Array.isArray(root) &&
    root.length > 0 &&
    root.every((el) => isRecord(el))
  ) {
    const itemType = inferArrayOfObjects(root, 'Item')
    return defs.join('\n\n') + '\n\ntype Root = ' + itemType + '[];'
  }
  const top = infer(root, 'Root')
  if (top === 'Root') return defs.join('\n\n')
  return defs.join('\n\n') + (defs.length ? '\n\n' : '') + 'type Root = ' + top + ';'
}

/* ---------- Go ---------- */

function goPascal(raw: string): string {
  const parts = String(raw)
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean)
  let s = parts.map((p) => p.charAt(0).toUpperCase() + p.slice(1)).join('')
  if (!s) s = 'Field'
  if (/^\d/.test(s)) s = 'N' + s
  return s
}

export function generateGo(root: JsonValue): string {
  const defs: string[] = []
  const used: Record<string, boolean> = {}
  const uniqueName = (base: string): string => {
    let name = base
    let i = 2
    while (used[name]) {
      name = base + i
      i++
    }
    used[name] = true
    return name
  }
  const infer = (v: JsonValue, name: string): string => {
    if (v === null) return 'interface{}'
    if (Array.isArray(v)) {
      if (v.length === 0) return '[]interface{}'
      const ts: string[] = []
      v.forEach((el) => {
        const t = infer(el, name + 'Item')
        if (ts.indexOf(t) === -1) ts.push(t)
      })
      return ts.length === 1 ? '[]' + ts[0] : '[]interface{}'
    }
    if (isRecord(v)) {
      const st = uniqueName(name)
      const lines = Object.keys(v).map(
        (k) => '  ' + goPascal(k) + ' ' + infer(v[k], st + goPascal(k)) + ' `json:"' + k + '"`',
      )
      defs.push('type ' + st + ' struct {\n' + lines.join('\n') + '\n}')
      return st
    }
    if (typeof v === 'string') return 'string'
    if (typeof v === 'number') return Number.isInteger(v) ? 'int' : 'float64'
    if (typeof v === 'boolean') return 'bool'
    return 'interface{}'
  }
  const inferArrayOfObjects = (arr: JsonValue[], name: string): string => {
    const allKeys: string[] = []
    arr.forEach((el) => {
      if (isRecord(el)) {
        Object.keys(el).forEach((k) => {
          if (allKeys.indexOf(k) === -1) allKeys.push(k)
        })
      }
    })
    const st = uniqueName(name)
    const lines = allKeys.map((k) => {
      let present = 0
      let t = 'interface{}'
      arr.forEach((el) => {
        if (isRecord(el) && k in el) {
          present++
          if (t === 'interface{}') t = infer(el[k], st + goPascal(k))
        }
      })
      if (present < arr.length) t = '*' + t
      return '  ' + goPascal(k) + ' ' + t + ' `json:"' + k + '"`'
    })
    defs.push('type ' + st + ' struct {\n' + lines.join('\n') + '\n}')
    return st
  }
  if (
    Array.isArray(root) &&
    root.length > 0 &&
    root.every((el) => isRecord(el))
  ) {
    const item = inferArrayOfObjects(root, 'Item')
    return 'package main\n\n' + defs.join('\n\n') + '\n\ntype Root []' + item + '\n'
  }
  const top = infer(root, 'Root')
  if (top === 'Root') return 'package main\n\n' + defs.join('\n\n')
  return (
    'package main\n\n' + defs.join('\n\n') + (defs.length ? '\n\n' : '') + 'type Root ' + top + '\n'
  )
}

/* ---------- Python dataclass ---------- */

function pyClassName(raw: string): string {
  const parts = String(raw)
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean)
  let s = parts.map((p) => p.charAt(0).toUpperCase() + p.slice(1)).join('')
  if (!s) s = 'Item'
  if (/^\d/.test(s)) s = '_' + s
  return s
}

function pyFieldName(raw: string): string {
  let s = String(raw).replace(/[^A-Za-z0-9_]/g, '_')
  if (/^\d/.test(s)) s = '_' + s
  if (!s) s = 'field'
  return s
}

export function generatePy(root: JsonValue): string {
  const defs: string[] = []
  const used: Record<string, boolean> = {}
  const needs = { List: false, Optional: false, Any: false }
  const uniqueName = (base: string): string => {
    let name = base
    let i = 2
    while (used[name]) {
      name = base + i
      i++
    }
    used[name] = true
    return name
  }
  const infer = (v: JsonValue, name: string): string => {
    if (v === null) {
      needs.Any = true
      return 'Any'
    }
    if (Array.isArray(v)) {
      needs.List = true
      if (v.length === 0) {
        needs.Any = true
        return 'List[Any]'
      }
      const ts: string[] = []
      v.forEach((el) => {
        const t = infer(el, name + 'Item')
        if (ts.indexOf(t) === -1) ts.push(t)
      })
      return ts.length === 1 ? 'List[' + ts[0] + ']' : 'List[Any]'
    }
    if (isRecord(v)) {
      const cls = uniqueName(name)
      const keys = Object.keys(v)
      const lines = keys.map(
        (k) => '    ' + pyFieldName(k) + ': ' + infer(v[k], cls + pyClassName(k)),
      )
      if (lines.length === 0) lines.push('    pass')
      defs.push('@dataclass\nclass ' + cls + ':\n' + lines.join('\n'))
      return cls
    }
    if (typeof v === 'string') return 'str'
    if (typeof v === 'number') return Number.isInteger(v) ? 'int' : 'float'
    if (typeof v === 'boolean') return 'bool'
    needs.Any = true
    return 'Any'
  }
  const inferArrayOfObjects = (arr: JsonValue[], name: string): string => {
    const allKeys: string[] = []
    arr.forEach((el) => {
      if (isRecord(el)) {
        Object.keys(el).forEach((k) => {
          if (allKeys.indexOf(k) === -1) allKeys.push(k)
        })
      }
    })
    const cls = uniqueName(name)
    const lines = allKeys.map((k) => {
      let present = 0
      let t = 'Any'
      arr.forEach((el) => {
        if (isRecord(el) && k in el) {
          present++
          if (t === 'Any') t = infer(el[k], cls + pyClassName(k))
        }
      })
      if (t === 'Any') needs.Any = true
      if (present < arr.length) {
        needs.Optional = true
        t = 'Optional[' + t + ']'
      }
      return '    ' + pyFieldName(k) + ': ' + t
    })
    if (lines.length === 0) lines.push('    pass')
    defs.push('@dataclass\nclass ' + cls + ':\n' + lines.join('\n'))
    return cls
  }
  let header = 'from dataclasses import dataclass\n'
  const typing: string[] = []
  if (
    Array.isArray(root) &&
    root.length > 0 &&
    root.every((el) => isRecord(el))
  ) {
    const item = inferArrayOfObjects(root, 'Item')
    if (needs.List) typing.push('List')
    if (needs.Optional) typing.push('Optional')
    if (needs.Any) typing.push('Any')
    if (typing.length) header += 'from typing import ' + typing.join(', ') + '\n'
    return header + '\n' + defs.join('\n\n') + '\n\nRoot = List[' + item + ']\n'
  }
  const top = infer(root, 'Root')
  if (needs.List) typing.push('List')
  if (needs.Optional) typing.push('Optional')
  if (needs.Any) typing.push('Any')
  if (typing.length) header += 'from typing import ' + typing.join(', ') + '\n'
  if (top === 'Root') return header + '\n' + defs.join('\n\n') + '\n'
  return (
    header + '\n' + defs.join('\n\n') + (defs.length ? '\n\n' : '') + 'Root = ' + top + '\n'
  )
}
