// Local typings for the bwip-js browser build.
//
// Why this file exists:
// - bwip-js 4.11.4 ships bundled browser types (dist/bwip-js.d.ts), but they
//   are not reachable through the package's exports map under TypeScript's
//   bundler module resolution (vue-tsc reports TS2307).
// - @types/bwip-js is Node-oriented and incomplete for our use: it lacks
//   toSVG and the qrcode `eclevel` option.
// - Vite bundles the browser ESM build (dist/bwip-js.mjs) at runtime, which
//   does expose toCanvas / toSVG. Keep this declaration in sync with the
//   options actually used in src/lib/qr/.

declare module 'bwip-js' {
  export interface BwipRenderOptions {
    bcid: string
    text: string
    scale?: number
    scaleX?: number
    scaleY?: number
    /** QR error-correction level: L | M | Q | H (qrcode only). */
    eclevel?: string
    backgroundcolor?: string
    barcolor?: string
    textcolor?: string
    includetext?: boolean
    [key: string]: unknown
  }

  export function toCanvas(
    canvas: string | HTMLCanvasElement,
    opts: BwipRenderOptions,
  ): HTMLCanvasElement
  export function toSVG(opts: BwipRenderOptions): string

  const bwipjs: {
    toCanvas: typeof toCanvas
    toSVG: typeof toSVG
  }
  export default bwipjs
}
