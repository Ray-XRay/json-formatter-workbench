/** 二维码 / 条码渲染：bwip-js（本地 npm 打包）渲染到 canvas。
 * 尺寸精确性是本工具的硬性要求，见 renderQrExact 的注释。 */
import bwipjs, { type BwipRenderOptions } from 'bwip-js'

import { SIZE_MAP, type QrEcLevel, type QrFormat, type QrSize } from './constants'

export interface QrRenderSettings {
  format: QrFormat
  text: string
  size: QrSize
  ec: QrEcLevel
  showText: boolean
  fgColor: string
  bgColor: string
}

function hexNoHash(v: string): string {
  return v.replace('#', '')
}

export function buildOpts(s: QrRenderSettings): BwipRenderOptions {
  const opts: BwipRenderOptions = {
    bcid: s.format,
    text: s.text,
    backgroundcolor: hexNoHash(s.bgColor),
    barcolor: hexNoHash(s.fgColor),
    textcolor: hexNoHash(s.fgColor),
  }
  if (s.format === 'code128') {
    opts.height = 10
    opts.includetext = s.showText
    opts.scale = SIZE_MAP[s.size].barcodeScale
  }
  if (s.format === 'qrcode') opts.eclevel = s.ec
  return opts
}

/**
 * 二维码精确固定尺寸：先以 1 倍率量出模块数（含静区），再以刚好 ≥ 目标尺寸的
 * 整数倍率渲染到离屏 canvas，最后最近邻重采样到精确的目标尺寸
 * （200 / 300 / 400 px），内容再多尺寸也不变。返回量出的模块数。
 */
export function renderQrExact(
  canvas: HTMLCanvasElement,
  opts: BwipRenderOptions,
  target: number,
): number {
  const base: BwipRenderOptions = {
    bcid: 'qrcode',
    text: opts.text,
    eclevel: opts.eclevel,
    backgroundcolor: opts.backgroundcolor,
    barcolor: opts.barcolor,
    textcolor: opts.textcolor,
  }
  const probe = document.createElement('canvas')
  bwipjs.toCanvas(probe, { ...base, scale: 1 })
  const modules = probe.width
  const scale = Math.max(1, Math.ceil(target / modules))
  bwipjs.toCanvas(probe, { ...base, scale })
  canvas.width = target
  canvas.height = target
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('无法获取画布上下文')
  ctx.imageSmoothingEnabled = false
  ctx.drawImage(probe, 0, 0, target, target)
  return modules
}

/** SVG 下载也要精确尺寸：矢量图按 viewBox 缩放无损，直接写死宽高。 */
export function qrSvgExact(opts: BwipRenderOptions, target: number): string {
  const svg = bwipjs.toSVG({
    bcid: 'qrcode',
    text: opts.text,
    scale: 1,
    eclevel: opts.eclevel,
    backgroundcolor: opts.backgroundcolor,
    barcolor: opts.barcolor,
    textcolor: opts.textcolor,
  })
  return svg.replace('<svg ', `<svg width="${target}" height="${target}" `)
}

/** bwip-js 的报错自带 "bwipp.xxx#nnnn:" 前缀，先去掉；常见的翻成中文。 */
export function friendlyError(e: unknown): string {
  const msg = (e instanceof Error ? e.message : String(e)).replace(
    /^(bwipp?\.[\w]+#\d+:\s*|bwip-js:\s*)/,
    '',
  )
  if (/text not specified/i.test(msg)) return '内容为空，先输入要编码的内容'
  if (/Maximum length exceeded/i.test(msg)) return '内容太长，超出该类型的容量上限'
  return msg
}

export function fileName(format: QrFormat, ext: string): string {
  return (format === 'qrcode' ? 'qrcode' : 'barcode') + '.' + ext
}

export function downloadBlob(blob: Blob, name: string): void {
  const a = document.createElement('a')
  const url = URL.createObjectURL(blob)
  a.href = url
  a.download = name
  a.click()
  window.setTimeout((): void => {
    URL.revokeObjectURL(url)
  }, 1000)
}
