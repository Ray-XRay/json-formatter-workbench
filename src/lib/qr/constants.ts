/** QR / 条码工具的共享常量：格式、尺寸档、localStorage 键名。
 * localStorage 键名与 1.x 完全一致，升级后沿用用户本机已存的数据。 */

export type QrFormat = 'qrcode' | 'code128'
export type QrSize = 'small' | 'medium' | 'large'
export type QrEcLevel = 'L' | 'M' | 'Q' | 'H'

export interface QrFormatInfo {
  label: string
  hint: string
  sample: string
  oneDim?: boolean
}

export const FORMATS: Record<QrFormat, QrFormatInfo> = {
  qrcode: {
    label: 'QR Code',
    hint: '网址、文字都行，中文也可以。纠错级别越高越耐脏、耐遮挡，但码点越密。生成尺寸精确固定为小 200 / 中 300 / 大 400 px，内容再多也不会变。粘贴 GS1 Digital Link 链接（如 …/01/…/10/…）可在下方解析各参数。',
    sample: 'https://example.com',
  },
  code128: {
    label: '条码',
    hint: '字母、数字和符号都行，最常用的一维条码。',
    sample: 'HELLO-12345',
    oneDim: true,
  },
}

/** 大小档：二维码按目标尺寸精确固定输出；条码的宽度天生随内容变长，只固定模块宽度。 */
export const SIZE_MAP: Record<QrSize, { qr: number; barcodeScale: number }> = {
  small: { qr: 200, barcodeScale: 3 },
  medium: { qr: 300, barcodeScale: 4 },
  large: { qr: 400, barcodeScale: 6 },
}

export const SIZE_OPTIONS: Array<{ value: QrSize; label: string }> = [
  { value: 'small', label: '小' },
  { value: 'medium', label: '中' },
  { value: 'large', label: '大' },
]

export const EC_OPTIONS: Array<{ value: QrEcLevel; label: string }> = [
  { value: 'L', label: 'L · 7%' },
  { value: 'M', label: 'M · 15%' },
  { value: 'Q', label: 'Q · 25%' },
  { value: 'H', label: 'H · 30%' },
]

export const SIZE_KEY = 'qr-wb-size'
export const SPLIT_KEY = 'qr-wb-split'
export const SPLIT_V_KEY = 'qr-wb-split-v'
export const GS1_SPLIT_KEY = 'qr-wb-gs1-split'
export const GS1_NAMES_KEY = 'qr-wb-gs1-ai-names'
export const GS1_TEMPLATE_KEY = 'qr-wb-gs1-template'
export const QR_HISTORY_KEY = 'qr-wb-qr-history'

export function isQrSize(v: string): v is QrSize {
  return v === 'small' || v === 'medium' || v === 'large'
}
