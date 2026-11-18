/** 强度评估与「检查我的密码」本地分析（1.x password.js 的同名逻辑迁移）。 */

export type StrengthTier = 'weak' | 'fair' | 'strong' | 'veryStrong'

export interface StrengthInfo {
  tier: StrengthTier
  label: string
}

export function strengthOf(bits: number): StrengthInfo {
  if (bits < 40) return { tier: 'weak', label: '弱' }
  if (bits < 60) return { tier: 'fair', label: '一般' }
  if (bits < 80) return { tier: 'strong', label: '强' }
  return { tier: 'veryStrong', label: '很强' }
}

/** 按每秒 100 亿次猜测估算破解时间（离线暴力破解的量级）。 */
export function humanTime(seconds: number): string {
  if (seconds < 1) return '不到 1 秒'
  if (seconds < 60) return '约 ' + Math.round(seconds) + ' 秒'
  if (seconds < 3600) return '约 ' + Math.round(seconds / 60) + ' 分钟'
  if (seconds < 86400) return '约 ' + Math.round(seconds / 3600) + ' 小时'
  if (seconds < 31536000) return '约 ' + Math.round(seconds / 86400) + ' 天'
  const years = seconds / 31536000
  if (years < 10000) return '约 ' + Math.round(years) + ' 年'
  return '超过 1 万年'
}

export function crackTimeText(bits: number): string {
  return '按每秒 100 亿次猜测，' + humanTime(Math.pow(2, bits) / 1e10) + '可破解'
}

/* 最常见的弱密码（RockYou / NCSC 公开榜单前列），只在浏览器里比对，不上传。 */
export const COMMON_PASSWORDS: readonly string[] = (
  '123456 123456789 qwerty password 1234567 12345678 12345 111111 123123 1234567890 ' +
  'qwerty123 000000 1qaz2wsx 123321 666666 121212 112233 555555 123qwe 1q2w3e4r admin letmein welcome ' +
  'monkey dragon football iloveyou sunshine master shadow superman michael ashley bailey passw0rd ' +
  '1234 123 0000000 123456789a password1 abc123 aaa123 qwertyuiop asdfghjkl zxcvbnm qazwsx qwe123 ' +
  '1q2w3e 123456a 987654321 654321 222222 333333 444444 777777 888888 999999 123123123 12345678910 ' +
  'iloveyou1 football1 baseball soccer hockey charlie thomas daniel jessica nicole jasmine chelsea ' +
  'summer winter autumn spring cookie peanut buster hunter jordan tigger robert william richard ' +
  'donald george kenneth steven edward brian ronald anthony kevin jason jeffrey ryan jacob gary ' +
  'nicholas eric jonathan stephen larry justin scott brandon benjamin samuel gregory frank alexander ' +
  'patrick raymond jack dennis jerry tyler aaron jose adam henry nathan douglas zachary kyle noah ' +
  'ethan jeremy harold keith christian roger noel terry gerald harold sean austin carl arthur lawrence'
).split(' ')

export interface PasswordAnalysis {
  bits: number
  classes: number
  warnings: string[]
}

/** 只在浏览器里算：字符种类、池大小、熵、弱密码警告。不上传、不保存。 */
export function analyzePassword(pw: string): PasswordAnalysis {
  const hasUpper = /[A-Z]/.test(pw)
  const hasLower = /[a-z]/.test(pw)
  const hasDigit = /[0-9]/.test(pw)
  const hasSymbol = /[^A-Za-z0-9]/.test(pw)
  const classes = (hasUpper ? 1 : 0) + (hasLower ? 1 : 0) + (hasDigit ? 1 : 0) + (hasSymbol ? 1 : 0)
  const pool = (hasUpper ? 26 : 0) + (hasLower ? 26 : 0) + (hasDigit ? 10 : 0) + (hasSymbol ? 32 : 0)
  const bits = pool ? pw.length * (Math.log(pool) / Math.log(2)) : 0
  const warnings: string[] = []
  if (pw && COMMON_PASSWORDS.indexOf(pw.toLowerCase()) !== -1) {
    warnings.push('这是最常见的密码之一，网上几秒钟就能猜出来')
  }
  if (pw.length > 0 && pw.length < 8) warnings.push('太短了，至少 8 位')
  if (pw.length > 0 && classes === 1) warnings.push('只用了一种字符，大小写字母、数字、符号混着用更难猜')
  if (/^[0-9]+$/.test(pw)) warnings.push('全是数字，换成字母 + 数字 + 符号')
  if (/^(.)\1+$/.test(pw)) warnings.push('同一个字符重复，等于只有 1 位')
  return { bits, classes, warnings }
}
