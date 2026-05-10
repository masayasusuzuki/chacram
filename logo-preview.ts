#!/usr/bin/env bun
const ESC = '\x1b['
const RESET = `${ESC}0m`
type RGB = [number, number, number]
const rgb = (r: number, g: number, b: number) => `${ESC}38;2;${r};${g};${b}m`

// Sunset gradient: orange → pink → purple
const GRAD: RGB[] = [
  [255, 140, 0],   // オレンジ
  [255, 100, 50],  // レッドオレンジ
  [255, 70, 100],  // ピンク寄り
  [220, 50, 150],  // マゼンタ
  [150, 40, 200],  // パープル
  [100, 30, 180],  // ディープパープル
]

function paint(text: string, t: number): string {
  const lerp = (a: RGB, b: RGB, n: number): RGB =>
    [Math.round(a[0]+(b[0]-a[0])*n), Math.round(a[1]+(b[1]-a[1])*n), Math.round(a[2]+(b[2]-a[2])*n)]
  let o = ''
  for (let i = 0; i < text.length; i++) {
    const lt = text.length > 1 ? t*0.5+(i/(text.length-1))*0.5 : t
    const s = lt*(GRAD.length-1); const j = Math.floor(s)
    const c = j>=GRAD.length-1 ? GRAD[GRAD.length-1] : lerp(GRAD[j], GRAD[j+1], s-j)
    o += `${rgb(...c)}${text[i]}`
  }
  return o + RESET
}

function norm(r: string[]): string[] {
  const mw = Math.max(...r.map(l=>l.length))
  return r.map(l=>l.padEnd(mw,' '))
}

function joinChars(chars: string[][]): string[] {
  const result: string[] = []
  if (chars.length === 0) return result
  for (let row = 0; row < chars[0].length; row++) {
    result.push(chars.map(c => row < c.length ? c[row] : ' '.repeat(c[0]?.length || 1)).join(' '))
  }
  return result
}

// ══════════════ 文字ライブラリ ══════════════

const CHARS: Record<string, Record<string,string[]>> = {
  c: {
    v1: norm([' ██████╗','██╔════╝','██║     ','██║     ','███████╗','╚══════╝']),
  },
  h: {
    v1: norm(['██╗  ██╗','██║  ██║','████████╣','██║  ██║','██║  ██║','╚═╝  ╚═╝']),
  },
  a: {
    v2: norm([' ██████╗ ','██╔═══██╗','████████║','██╔═══██║','██║   ██║','╚═╝   ╚═╝']),
  },
  r: {
    v1: norm(['████████╗','██╔══╗██║','████████╣','██╔══██╗ ','██║  ██║ ','╚═╝  ╚═╝ ']),
  },
  m: {
    v1: norm(['████╗ ████╗','██╔████╔██║','██║╚██╔╝██║','██║ ╚═╝ ██║','██║     ██║','╚═╝     ╚═╝']),
  },
}

const word = process.argv[2] || 'chacram'
const chars = word.toLowerCase().split('')
const designs = chars.map(c => {
  const vars = CHARS[c]
  if (!vars) { console.log(`Unknown: ${c}`); process.exit(1) }
  return vars[Object.keys(vars)[0]]
})

const logo = joinChars(designs)

console.log(`\n  ${word.toUpperCase()}\n`)
logo.forEach((l, i) => console.log(`  ${paint(l, i/5)}`))
console.log('')
