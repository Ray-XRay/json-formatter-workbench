/** Language detection + per-language placeholders and samples (ported from 1.x). */

import type { Lang, LangMode } from './types'

export const LANGS: Record<Lang, string> = {
  json: 'JSON',
  sql: 'SQL',
  python: 'Python',
  go: 'Go',
  java: 'Java',
}

export function isLangMode(v: string): v is LangMode {
  return v === 'auto' || v in LANGS
}

export const LANG_PLACEHOLDERS: Record<Lang, string> = {
  json: '在此粘贴 JSON，例如：{"name": "Muse", "version": 1}',
  sql: '在此粘贴 SQL，例如：SELECT id, name FROM users WHERE age > 18 ORDER BY id',
  python: '在此粘贴 Python 代码，例如：def hello():\n    print("hi")',
  go: '在此粘贴 Go 代码，例如：package main\n\nfunc main() {\n\tfmt.Println("hi")\n}',
  java: '在此粘贴 Java 代码，例如：public class Hello {\n    public static void main(String[] args) {}\n}',
}

/** Guess the language from content. Only used in "auto" mode. */
export function detectLanguage(text: string): Lang | null {
  if (!text || text.length > 200000) return null
  const t = text.replace(/^\s+/, '')
  if (!t) return null
  if (t[0] === '{' || t[0] === '[') {
    try {
      JSON.parse(text)
      return 'json'
    } catch {
      /* not valid JSON — keep guessing */
    }
  }
  if (
    /^(SELECT|WITH|INSERT\s+INTO|UPDATE\s|DELETE\s+FROM|CREATE\s+(TABLE|INDEX|VIEW)|ALTER\s+TABLE|DROP\s+TABLE)\b/i.test(
      t,
    )
  )
    return 'sql'
  if (/^package\s+[\w/]+\s*$/m.test(text)) return 'go'
  if (/\bfunc(\s+\w+)?\s*\(/.test(text)) return 'go'
  if (/^\s*import\s+"[^"]+"/m.test(text)) return 'go'
  if (/^\s*(public\s+(final\s+)?(class|interface|enum)|import\s+java\.|package\s+[\w.]+;)/m.test(text))
    return 'java'
  if (/^\s*(public\s+)?(final\s+)?class\s+\w+\s*\{/m.test(text)) return 'java'
  if (/\bSystem\.out\.println\b/.test(text)) return 'java'
  if (
    /^\s*(def\s+\w+\s*\(|class\s+\w+\s*(\(|:)|from\s+[\w.]+\s+import\s|if\s+__name__\s*==|import\s+[a-z_][\w]*\s*$|print\s*\()/m.test(
      text,
    )
  )
    return 'python'
  if (/\bSELECT\b[\s\S]{0,200}?\bFROM\b/i.test(text)) return 'sql'
  return null
}

export const SAMPLE_JSON = {
  name: 'JSON 格式化工作台',
  version: 1,
  features: ['格式化', '压缩', '验证', '树形浏览'],
  options: { indent: 2, sortKeys: false, autoFormatOnPaste: true },
  stats: { keys: 128, depth: 4 },
  active: true,
  note: null,
}

export const SAMPLES: Record<Exclude<Lang, 'json'>, string> = {
  sql: "SELECT id, name, total FROM orders JOIN users ON orders.user_id = users.id WHERE total > 100 AND status = 'paid' GROUP BY id, name ORDER BY total DESC LIMIT 10;",
  python:
    'def total(items):\n    s = 0\n    for it in items:\n          s += it["price"] * it["qty"]\n    return s\n\n\ndef main():\n    cart = [{"price": 9, "qty": 2}, {"price": 5, "qty": 3}]\n    print(total(cart))',
  go: 'package main\nimport "fmt"\nfunc main() {\nfmt.Println("hello")\nif true {\nfmt.Println("yes")\n}\n}',
  java: 'public class Hello {\npublic static void main(String[] args) {\nSystem.out.println("hello");\nif (args.length > 0) {\nSystem.out.println(args[0]);\n} else {\nSystem.out.println("no args");\n}\n}\n}',
}
