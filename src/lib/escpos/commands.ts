// ESC/POS thermal printer byte primitives — shared by kitchen and receipt builders

export const ESC = 0x1b
export const GS  = 0x1d

export const cmd = (...bytes: number[]) => new Uint8Array(bytes)
export const enc = (s: string)          => new TextEncoder().encode(s)

export const escpos = {
  init:         () => cmd(ESC, 0x40),
  doubleStrike: (on: boolean) => cmd(ESC, 0x47, on ? 0x01 : 0x00),
  alignLeft:    () => cmd(ESC, 0x61, 0x00),
  alignCenter:  () => cmd(ESC, 0x61, 0x01),
  alignRight:   () => cmd(ESC, 0x61, 0x02),
  boldOn:       () => cmd(ESC, 0x45, 0x01),
  boldOff:      () => cmd(ESC, 0x45, 0x00),
  doubleHeight: () => cmd(ESC, 0x21, 0x10),
  doubleSize:   () => cmd(ESC, 0x21, 0x30),
  normalSize:   () => cmd(ESC, 0x21, 0x00),
  feed:         (n = 3) => cmd(ESC, 0x64, n),
  cut:          () => cmd(GS,  0x56, 0x42, 0x10),
}

export function cols(paperWidth: number): number {
  if (paperWidth <= 58) return 32
  if (paperWidth <= 80) return 42
  return 48
}

// Left-right two-column row — returns encoded Uint8Array
export function rowBytes(left: string, right: string, width: number): Uint8Array {
  const space = width - right.length
  const l = left.length >= space ? left.slice(0, space - 1) + ' ' : left.padEnd(space)
  return enc(l + right + '\n')
}

// Three-column row: Item | Qty | Price
export function threeColBytes(left: string, mid: string, right: string, width: number): Uint8Array {
  const rightW = Math.min(14, Math.floor(width * 0.35))
  const midW   = 6
  const leftW  = width - midW - rightW
  const l = left.length > leftW ? left.slice(0, leftW - 1) + ' ' : left.padEnd(leftW)
  const pad = midW - mid.length
  const lPad = Math.floor(pad / 2)
  const m = ' '.repeat(Math.max(0, lPad)) + mid + ' '.repeat(Math.max(0, pad - lPad))
  const r = right.padStart(rightW)
  return enc(l + m + r + '\n')
}

// Plain ASCII divider
export function divBytes(width: number, char = '-'): Uint8Array {
  return enc(char.repeat(width) + '\n')
}

export function concat(...arrays: Uint8Array[]): Uint8Array {
  const total = arrays.reduce((s, a) => s + a.length, 0)
  const out   = new Uint8Array(total)
  let offset  = 0
  for (const a of arrays) { out.set(a, offset); offset += a.length }
  return out
}
