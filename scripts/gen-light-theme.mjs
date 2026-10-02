// Regenerates the light-theme block in src/app/globals.css (between the
// @light-theme:start / @light-theme:end markers). The block re-points the
// white-on-dark utilities the screens are built from (bg-white/5,
// border-white/10, text-amber-400 …) when html.app-light is set — see the
// comment at the top of the block for how it works.
//
// It scans src/ for the utilities actually in use, so rerun it after adding
// a new white/colour utility (e.g. the first bg-white/9) or the light
// background won't know about it:
//
//   node scripts/gen-light-theme.mjs           rewrite the block
//   node scripts/gen-light-theme.mjs --check   exit 1 if the block is stale
import { readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')
const CSS  = join(ROOT, 'src/app/globals.css')
const START = '/* @light-theme:start'
const END   = '/* @light-theme:end */'

// ── Source scan ────────────────────────────────────────────────────
const files = []
;(function walk(dir) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name)
    if (e.isDirectory()) walk(p)
    else if (/\.(tsx?|jsx?)$/.test(e.name)) files.push(p)
  }
})(join(ROOT, 'src'))
const source = files.map(f => readFileSync(f, 'utf8')).join('\n')

const tokens = re => [...new Set([...source.matchAll(re)].map(m => m[0]))].sort()
const BOUND_L = String.raw`(?<![\w:\/\[-])`
const BOUND_R = String.raw`(?![\w\/\[-])`
const VARIANT = String.raw`(?:(hover|focus|active|focus-within|group-hover):)?`
const ALPHA   = String.raw`\/(\d+|\[0?\.\d+\])`

const BS  = String.fromCharCode(92)
const esc = s => s.replace(/[/.[\]:#]/g, m => BS + m)
const num = n => String(+n.toFixed(4)).replace(/^0\./, '.')
const alphaOf = a => a.startsWith('[') ? +a.slice(1, -1) : +a / 100
const variantOf = tok => tok.match(/^([a-z-]+):/)?.[1]

// ── Palette (Tailwind) ─────────────────────────────────────────────
const HUES = ['red','orange','amber','yellow','lime','green','emerald','teal','cyan','sky','blue','indigo','violet','purple','fuchsia','pink','rose']
const PAL = {
  red:     { 200: '#fecaca', 300: '#fca5a5', 400: '#f87171', 500: '#ef4444', 600: '#dc2626', 700: '#b91c1c', 800: '#991b1b' },
  orange:  { 200: '#fed7aa', 300: '#fdba74', 400: '#fb923c', 500: '#f97316', 600: '#ea580c', 700: '#c2410c', 800: '#9a3412' },
  amber:   { 200: '#fde68a', 300: '#fcd34d', 400: '#fbbf24', 500: '#f59e0b', 600: '#d97706', 700: '#b45309', 800: '#92400e' },
  yellow:  { 200: '#fef08a', 300: '#fde047', 400: '#facc15', 500: '#eab308', 600: '#ca8a04', 700: '#a16207', 800: '#854d0e' },
  lime:    { 200: '#d9f99d', 300: '#bef264', 400: '#a3e635', 500: '#84cc16', 600: '#65a30d', 700: '#4d7c0f', 800: '#3f6212' },
  green:   { 200: '#bbf7d0', 300: '#86efac', 400: '#4ade80', 500: '#22c55e', 600: '#16a34a', 700: '#15803d', 800: '#166534' },
  emerald: { 200: '#a7f3d0', 300: '#6ee7b7', 400: '#34d399', 500: '#10b981', 600: '#059669', 700: '#047857', 800: '#065f46' },
  teal:    { 200: '#99f6e4', 300: '#5eead4', 400: '#2dd4bf', 500: '#14b8a6', 600: '#0d9488', 700: '#0f766e', 800: '#115e59' },
  cyan:    { 200: '#a5f3fc', 300: '#67e8f9', 400: '#22d3ee', 500: '#06b6d4', 600: '#0891b2', 700: '#0e7490', 800: '#155e75' },
  sky:     { 200: '#bae6fd', 300: '#7dd3fc', 400: '#38bdf8', 500: '#0ea5e9', 600: '#0284c7', 700: '#0369a1', 800: '#075985' },
  blue:    { 200: '#bfdbfe', 300: '#93c5fd', 400: '#60a5fa', 500: '#3b82f6', 600: '#2563eb', 700: '#1d4ed8', 800: '#1e40af' },
  indigo:  { 200: '#c7d2fe', 300: '#a5b4fc', 400: '#818cf8', 500: '#6366f1', 600: '#4f46e5', 700: '#4338ca', 800: '#3730a3' },
  violet:  { 200: '#ddd6fe', 300: '#c4b5fd', 400: '#a78bfa', 500: '#8b5cf6', 600: '#7c3aed', 700: '#6d28d9', 800: '#5b21b6' },
  purple:  { 200: '#e9d5ff', 300: '#d8b4fe', 400: '#c084fc', 500: '#a855f7', 600: '#9333ea', 700: '#7e22ce', 800: '#6b21a8' },
  fuchsia: { 200: '#f5d0fe', 300: '#f0abfc', 400: '#e879f9', 500: '#d946ef', 600: '#c026d3', 700: '#a21caf', 800: '#86198f' },
  pink:    { 200: '#fbcfe8', 300: '#f9a8d4', 400: '#f472b6', 500: '#ec4899', 600: '#db2777', 700: '#be185d', 800: '#9d174d' },
  rose:    { 200: '#fecdd3', 300: '#fda4af', 400: '#fb7185', 500: '#f43f5e', 600: '#e11d48', 700: '#be123c', 800: '#9f1239' },
  // greys: 200/300 text is too faint on white; 400 already reads
  slate:   { 200: '#e2e8f0', 300: '#cbd5e1', deep: '#64748b' },
  gray:    { 200: '#e5e7eb', 300: '#d1d5db', deep: '#6b7280' },
  stone:   { 200: '#e7e5e4', 300: '#d6d3d1', deep: '#78716c' },
}
const GREYS = ['slate','gray','zinc','neutral','stone']

// ── Rules ──────────────────────────────────────────────────────────
const util = []    // @layer utilities, plain
const hover = []   // @layer utilities, inside @media (hover: hover)
const skipped = new Set()
const SCOPE = ':where(html.app-light)'

function stateSelector(tok, v) {
  const s = `${SCOPE} .${esc(tok)}`
  if (!v)                   return s
  if (v === 'group-hover')  return `${s}:is(:where(.group):hover *)`
  return `${s}:${v}`
}
function push(tok, decl) {
  const v = variantOf(tok)
  const rule = `${stateSelector(tok, v)} { ${decl}; }`
  if (v === 'hover' || v === 'group-hover') hover.push(`  ${rule}`)
  else util.push(rule)
}

// bg-white/N: ≤5% are see-through cards → white surfaces; the rest are
// tints → ink. Interaction states always darken.
for (const tok of tokens(new RegExp(`${BOUND_L}${VARIANT}bg-white${ALPHA}${BOUND_R}`, 'g'))) {
  const a = alphaOf(tok.split('/')[1])
  if (!variantOf(tok) && a <= 0.05) {
    const level = a <= 0.015 ? 1 : a <= 0.025 ? 2 : a <= 0.035 ? 3 : a <= 0.045 ? 4 : 5
    push(tok, `background-color: rgb(255 255 255 / var(--s${level}))`)
  } else if (variantOf(tok)) {
    push(tok, `background-color: rgb(var(--ov) / calc(${num(a)} * var(--hk) + var(--hb)))`)
  } else {
    push(tok, `background-color: rgb(var(--ov) / calc(${num(a)} * var(--tk) + var(--tb)))`)
  }
}
for (const tok of tokens(new RegExp(`${BOUND_L}${VARIANT}border-white${ALPHA}${BOUND_R}`, 'g')))
  push(tok, `border-color: rgb(var(--ov) / calc(${num(alphaOf(tok.split('/')[1]))} * var(--bk) + var(--bb)))`)
for (const tok of tokens(new RegExp(`${BOUND_L}${VARIANT}ring-white${ALPHA}${BOUND_R}`, 'g')))
  push(tok, `--tw-ring-color: rgb(var(--ov) / calc(${num(alphaOf(tok.split('/')[1]))} * var(--bk) + var(--bb)))`)
for (const tok of tokens(new RegExp(`${BOUND_L}${VARIANT}outline-white${ALPHA}${BOUND_R}`, 'g')))
  push(tok, `outline-color: rgb(var(--ov) / calc(${num(alphaOf(tok.split('/')[1]))} * var(--bk) + var(--bb)))`)
for (const tok of tokens(new RegExp(`${BOUND_L}divide-white${ALPHA}${BOUND_R}`, 'g')))
  util.push(`:where(html.app-light .${esc(tok)} > :not(:last-child)) { border-color: rgb(var(--ov) / calc(${num(alphaOf(tok.split('/')[1]))} * var(--bk) + var(--bb))); }`)

// bg-black/10–30 wells → faint
for (const tok of tokens(new RegExp(`${BOUND_L}bg-black\\/(10|20|30)${BOUND_R}`, 'g')))
  push(tok, `background-color: rgb(0 0 0 / calc(${num(alphaOf(tok.split('/')[1]))} * var(--dk)))`)

// text-{hue}-200–400 → deeper shade of the same hue (islands keep the original via --dm)
for (const tok of tokens(new RegExp(`${BOUND_L}${VARIANT}text-(${HUES.join('|')}|slate|gray|stone)-(200|300|400)(?:\\/(\\d+))?${BOUND_R}`, 'g'))) {
  const [, hue, sh, op] = tok.replace(/^[a-z-]+:/, '').match(/^text-([a-z]+)-(\d+)(?:\/(\d+))?$/)
  const p = PAL[hue]
  if (p.deep && sh === '400') continue
  const deep = p.deep ?? p[{ 400: 600, 300: 700, 200: 800 }[sh]]
  const mix = `color-mix(in srgb, ${p[sh]} calc(var(--dm) * 100%), ${deep})`
  push(tok, `color: ${op ? `color-mix(in srgb, ${mix} ${op}%, transparent)` : mix}`)
}

// bg-{hue}-500/600 at 60–70% (section headers) wash out over white → near-solid
for (const tok of tokens(new RegExp(`${BOUND_L}bg-(${HUES.join('|')})-(500|600)\\/(60|70)${BOUND_R}`, 'g'))) {
  const [, hue, sh] = tok.match(/^bg-([a-z]+)-(\d+)/)
  push(tok, `background-color: ${PAL[hue][sh]}eb`)
}

// Report variants we don't remap (sm:, md:, disabled: …) so they can be checked by hand
for (const tok of tokens(new RegExp(`${BOUND_L}(?:[a-z-]+:)+(?:bg|border|ring|outline|divide)-white${ALPHA}${BOUND_R}`, 'g')))
  if (!/^(hover|focus|active|focus-within|group-hover):[a-z]+-white/.test(tok)) skipped.add(tok)

// ── Islands: solid colour fills keep white text and white overlays ─
const islandTokens = new Set([
  ...tokens(new RegExp(`${BOUND_L}(?:bg|from)-(?:${HUES.join('|')})-(?:400|500|600|700|800|900|950)(?:\\/(?:[5-9]\\d|100))?${BOUND_R}`, 'g')),
  ...tokens(new RegExp(`${BOUND_L}bg-(?:${GREYS.join('|')})-(?:700|800|900|950)${BOUND_R}`, 'g')),
  ...tokens(new RegExp(`${BOUND_L}bg-black(?:\\/(?:[4-9]\\d|100))?${BOUND_R}`, 'g')),
  ...tokens(/(?<![\w:\/-])bg-\[#(?:1DAA61|25D366)\](?![\w\/-])/g),
])
for (const h of HUES) for (const s of [500, 600, 700]) { islandTokens.add(`bg-${h}-${s}`); islandTokens.add(`from-${h}-${s}`) }
const islands = [...[...islandTokens].sort().map(t => `html.app-light .${esc(t)}`), 'html.app-light .on-color']
const SCRIM = 'html.app-light :has(> [class*="from-black/"])'

// ── Light panels: dark surfaces that turn white, and light the inside again ─
const panels = [
  'html.app-light [class*="bg-[#0"]',
  'html.app-light .bg-white',
  'html.app-light [style*="--app-bg"]',
  'html.app-light [style*="--app-anchor"]',
  'html.app-light [style*="--app-panel"]',
  'html.app-light [style*="--app-card"]',
  'html.app-light [style*="--app-well"]',
]

const list = (sels, pad = '  ') => sels.map(s => pad + s).join(',\n')
const DARK_KNOBS = `    --ov: 255 255 255;
    --s1: 0.01; --s2: 0.02; --s3: 0.03; --s4: 0.04; --s5: 0.05;
    --tk: 1; --tb: 0;
    --hk: 1; --hb: 0;
    --bk: 1; --bb: 0;
    --dk: 1;
    --dm: 1;
    --app-text:       #ffffff;
    --app-text-muted: #94a3b8;`

const block = `${START} — generated by scripts/gen-light-theme.mjs, don't edit by hand */
/* ── Light theme ("White" in Settings → Appearance) ──────────────
   html.app-light is toggled by AppearanceBgProvider whenever the chosen
   background is light (the White preset, or a light custom colour).
   The screens are built from white-on-dark utilities — bg-white/5 cards,
   border-white/10 lines, text-white — so here those are re-pointed and
   the same markup reads on a light page:
     bg-white/1–5            → white surfaces (cards, inputs)
     bg-white/6+, hover etc. → slate-900 tints (chips, selected, hover)
     border/divide/ring      → slate-900 lines
     text-amber-400 & co.    → deeper shades (600–800) of the same hue
     bg-[#0…] dark panels    → white panels
     text-white              → --app-text (dark with this background)
   Islands — solid colour fills (bg-amber-500 buttons, bg-black/60
   overlays, photo captions, .on-color for inline-coloured fills) — keep
   white text and white overlays exactly as on the dark backgrounds.
   Light panels nested inside an island (a modal over its backdrop)
   switch back to the light values.

   Every remap reads its strength from these knobs, so an island or a
   panel only has to reset them:
     --ov       ink colour (RGB channels)
     --s1…--s5  alpha of the bg-white/1–5 surfaces
     --tk --tb  bg tints:     alpha = n × tk + tb
     --hk --hb  hover/focus:  alpha = n × hk + hb
     --bk --bb  lines:        alpha = n × bk + bb
     --dk       bg-black/10–30 wells
     --dm       1 keeps text-{hue}-200–400 as designed, 0 deepens it

   The remaps live in the utilities layer behind :where(), so they tie
   with the utility they replace and any state variant on the same
   element (hover:bg-rose-500/10, focus:border-amber-500/50 …) still wins.
   ---------------------------------------------------------------- */
html.app-light {
  color-scheme: light;
  --background: #eef2f7;
  --lt-text:  var(--app-text);
  --lt-muted: var(--app-text-muted);
  --app-panel: rgb(255 255 255 / 0.97);
  --app-card:  rgb(255 255 255 / 0.9);
  --app-well:  rgb(255 255 255 / 0.75);
}
html.app-light ::-webkit-scrollbar-thumb { background: rgb(15 23 42 / 0.15); }
html.app-light ::-webkit-scrollbar-thumb:hover { background: rgb(15 23 42 / 0.28); }
html.app-light .scrollbar-touch::-webkit-scrollbar-track { background: rgb(15 23 42 / 0.04); }
html.app-light .scrollbar-touch::-webkit-scrollbar-thumb { background: rgb(15 23 42 / 0.18); }
html.app-light .scrollbar-touch::-webkit-scrollbar-thumb:hover { background: rgb(15 23 42 / 0.3); }
html.app-light .scrollbar-touch { scrollbar-color: rgb(15 23 42 / 0.18) rgb(15 23 42 / 0.04); }
html.app-light select option { background: #ffffff; color: #0f172a; }
html.app-light input[type="time"]::-webkit-calendar-picker-indicator { filter: opacity(0.45); }
html.app-light .skeleton-shimmer {
  background-image: linear-gradient(90deg, #e2e8f0 0%, #edf1f6 30%, #f8fafc 50%, #edf1f6 70%, #e2e8f0 100%);
}

@layer overrides {
  /* Knobs: light values on the page and on light panels… */
  html.app-light,
${list(panels)} {
    --ov: 15 23 42;
    --s1: 0.5; --s2: 0.6; --s3: 0.78; --s4: 0.85; --s5: 0.9;
    --tk: 0.55; --tb: 0.005;
    --hk: 0.5;  --hb: 0.015;
    --bk: 1.15; --bb: 0.015;
    --dk: 0.3;
    --dm: 0;
  }
${list(panels)} {
    --app-text:       var(--lt-text);
    --app-text-muted: var(--lt-muted);
  }

  /* …and the dark-background values inside islands */
${list(islands)} {
${DARK_KNOBS}
  }
  /* Photo with a black scrim: the caption is the scrim's sibling */
  ${SCRIM} {
${DARK_KNOBS}
  }
}

@layer utilities {
  :where(html.app-light) [class*="bg-[#0"] { background-color: var(--app-panel); }
  :where(html.app-light) [class*="border-[#0"] { border-color: #ffffff; }
  :where(html.app-light) .from-\\[\\#0d1220\\]\\/90 { --tw-gradient-from: rgb(255 255 255 / 0.9); }
  :where(html.app-light) .via-\\[\\#0d1220\\]\\/30 { --tw-gradient-via: rgb(255 255 255 / 0.3); }
  :where(html.app-light) .\\[color-scheme\\:dark\\] { color-scheme: light; }

${util.map(r => '  ' + r).join('\n')}

  @media (hover: hover) {
${hover.map(r => '  ' + r).join('\n')}
  }
}

/* Text without a colour class of its own inherits: white inside islands,
   the theme text on light panels. In the components layer so a text-*
   utility on the same element still wins. */
@layer components {
${list(islands)} {
    color: #ffffff;
  }
  ${SCRIM} {
    color: #ffffff;
  }
${list(panels)} {
    color: var(--app-text);
  }
}
${END}`

// ── Write ──────────────────────────────────────────────────────────
const css = readFileSync(CSS, 'utf8')
const a = css.indexOf(START)
const b = css.indexOf(END)
if (a < 0 || b < a) { console.error(`markers not found in ${CSS}`); process.exit(1) }
// Keep the file's own line endings (CRLF in a Windows checkout with autocrlf)
const eol = css.includes('\r\n') ? '\r\n' : '\n'
const next = css.slice(0, a) + block.replace(/\n/g, eol) + css.slice(b + END.length)
if (process.argv.includes('--check')) {
  if (next !== css) { console.error('light-theme block is stale — run: node scripts/gen-light-theme.mjs'); process.exit(1) }
  console.log('light-theme block is up to date')
} else {
  writeFileSync(CSS, next)
  console.log(`light-theme block: ${util.length + hover.length} remaps, ${islands.length} island selectors`)
}
if (skipped.size) console.warn('not remapped (check by hand):', [...skipped].join(' '))
