# Bharat Pulse design language: "Bahi-Khata"

Source of truth for the UI theme. Tokens and classes live in `app/globals.css`; panels in `components/hud/`; map in `components/map/`. Follow this doc; do not invent new colours, fonts or motifs.

## 1. Concept

The traditional red-cloth Indian merchant ledger (bahi-khata) treated as a database console. Paper pages, ruled lines, a red margin, numbered records, totals rows, rubber stamps. Indian classical craft (block-print bands, jaali lattice, toran scallops, lotus, chakra) frames the data but never covers it. Light theme only. Density stays high: ornament lives on chrome edges, gutters and dividers, never inside data.

Mental model: page = paper; panel = a ledger page (account); list = register; row = record; figure = entry; section header = account head (`खाता 02 · THEATER`).

## 2. Tokens (CSS variables in `:root`, exposed to Tailwind)

Use the Tailwind utility (`bg-surface`, `text-maroon`, `border-rule`...) or `var(--token)` in CSS/charts. Never raw hex in components (exceptions: map layer paint and per-category colours, which come from `lib/categories.ts` / `india-style.ts`).

| Token | Hex | Use |
|---|---|---|
| `background` / `paper` | `#f6efe0` | Page. Has paper grain + jaali lattice (body background). |
| `surface` | `#fbf6ea` | Ledger page (panels, cards). |
| `surface-2` / `paper-2` | `#efe5cd` | Header strips, table heads, totals rows, wells. |
| `border` | `#d8c9a6` | Hairlines, dividers. |
| `border-strong` | `#a8915a` | Panel outlines, input borders, chip borders. |
| `rule` | `#e3d7b8` | Faint row separators. |
| `foreground` / `ink` | `#1d2550` | Body text (indigo ink). 12.8:1 on paper. |
| `ink-soft` | `#3a4170` | Secondary body text. |
| `muted` | `#565b78` | Labels, captions. 5.8:1 on paper, 5.3:1 on surface-2. |
| `maroon` | `#7a1e1e` | Kumkum cloth: chrome, panel titles, table heads, primary button, record ids. |
| `maroon-deep` | `#5a1414` | Pressed/active states on cloth, print band base. |
| `cream` | `#f6efe0` | Text on maroon (9:1). |
| `gold` | `#b8862b` | Brass hairlines, ornaments. Decorative only: 2.8:1, never for small text on paper. |
| `gold-soft` | `#e6bf68` | Gold text/icons on maroon (5.9:1). |
| `haldi` | `#d99a1e` | Turmeric fills, highlights, bars, small accents. Not for text on paper. |
| `accent` / `teal` | `#0f6e6e` | Peacock teal: links, active toggles, key figures, focus ring. 5.3:1 on paper. |
| `accent-dim` | `#0a5555` | Hover/dim teal. |
| `warn` | `#8f5a00` | Haldi-dark: warning text, S3 (5.0:1). |
| `danger` | `#b0231c` | Kumkum red: errors, severe (5.9:1). |
| `ok` | `#346c25` | Neem green: success. Fine on paper/surface; avoid small text on `surface-2`. |

Selection highlight is haldi. Tints: `bg-danger/10`, `bg-teal/10`, `bg-haldi/15` for banners and hover.

Contrast rule: body text must be `ink`, `ink-soft` or `muted` on `background`/`surface`/`surface-2`. `text-accent`, `text-warn`, `text-danger`, `text-maroon` pass AA on those. `text-gold`, `text-haldi` do not: use as fills or on maroon only (`gold-soft`).

Radii are tiny: `rounded-sm` 2px, `md` 3px, `lg` 4px. Use `rounded-full` only for chips, dots.

## 3. Type

Loaded in `app/layout.tsx` via `next/font/google`; CSS vars `--font-mukta`, `--font-rozha`, `--font-plex-mono`.

| Role | Face | Utility | Use |
|---|---|---|---|
| Display | Rozha One (Latin + Devanagari), 400 only | `font-display` | Wordmark, page `h1`, panel titles, big KPI numerals. Never bold it. |
| Body | Mukta 400/500/600/700 (Latin + Devanagari) | default (`font-sans`) | All running text, buttons, labels. Body default is sans, not mono. |
| Data | IBM Plex Mono 400/500/600 | `font-mono tabular-nums` or `.num` | Record ids, timestamps, coordinates, counts, table figures, codes. |

Scale (px): page title 24-28 display, panel title 14 display uppercase tracking .06em, body 13-14, table 13, label/column head 10.5 uppercase tracking .1em weight 600, record id 11 mono. Hindi: letter-spacing is automatically tightened under `html:lang(hi)`; do not add `uppercase` assumptions to Hindi strings.

## 4. Motifs (CSS variables hold the inline SVG; each under 1 KB)

| Motif | Where | How |
|---|---|---|
| Paper grain + jaali lattice | Page background (`body`) | Already applied. Visible only in gutters, because panels are opaque. |
| Block-print band (gold chain on deep maroon) | Under nav, above page bottom | `<div aria-hidden className="band-print" />` (`band-print--thin` for footers). Only on chrome edges. |
| Toran scallops | Hanging under the nav | `<div aria-hidden className="toran absolute inset-x-0 top-full" />` inside a `relative` header. One per page (already in `nav.tsx`). |
| Lotus divider | Between sections inside a page or panel | `<div className="ornament-divider" />`. |
| Chakra | Wordmark mark | `<Chakra className="h-6 w-6 text-gold-soft" />` from `components/hud/ornaments.tsx`. `<Lotus />` is the same lotus as inline SVG. |
| Red margin rule | Every ledger panel | Built into `.ledger-panel` (3px maroon left border). |
| Ruled lines | Ledger panel background | Built into `.ledger-panel` (faint, 28px). |

Removed for good: CRT scanlines, glow/text-shadow, phosphor gradients, grid background, bracket corners, slanted tab headers. Do not reintroduce.

## 5. Component classes (`@layer components` in globals.css)

### Panels and headers
```tsx
// Preferred: the wrapper. code="02" renders "खाता 02 ·" before the title.
<HudPanel title="India Theater" code="02" right={<span className="label">Plotted 0</span>} cloth={false}>
  ...body...
</HudPanel>

// Hand-built:
<section className="ledger-panel">
  <header className="ledger-header">
    <h2 className="ledger-title"><span className="acct">खाता 04 ·</span>Sources</h2>
    <span className="label">where events came from</span>
  </header>
  <div>...</div>
</section>
```
- `.ledger-panel`: surface, 3px maroon left rule, brass outline, faint ruled lines, small offset shadow.
- `.ledger-header`: paper-2 strip with a maroon double rule underneath. `.ledger-header--cloth` (or `cloth` prop on HudPanel): maroon band with gold hairline; use at most once per page for the hero panel.
- `.ledger-title`: display face, uppercase, maroon. `.acct` child is the bilingual account number.
- Section headers: `खाता NN · ENGLISH TITLE`. Number panels per page 01, 02, ... in reading order.
- Legacy aliases still work: `.hud-panel`, `.hud-header`, `.hud-tab`, `.hud-label` map to the ledger styles; `.glow` now only sets the display face. Replace them when you touch a file.

### Labels, ids, figures
- `.label`: small-caps field/column label (muted, sans 10.5px, uppercase). Bilingual: `<span className="label">शीर्षक / Title</span>`.
- `.record-id`: `<span className="record-id">#0042</span>` zero-padded to 4, mono, maroon. Use the row index or the event id.
- `.num`: mono + tabular-nums for any figure.
- Big KPI numeral: `<div className="font-display text-3xl text-accent tabular-nums">128</div>`; danger values `text-danger`.

### Tables and registers
```tsx
<table className="ledger-table">
  <thead><tr><th>ID</th><th>Event / घटना</th><th className="num">Sev</th></tr></thead>
  <tbody>
    <tr><td><span className="record-id">#0001</span></td><td>Flood alert, Assam</td><td className="num">4</td></tr>
  </tbody>
  <tfoot><tr><td colSpan={2}>Total / कुल</td><td className="num">1</td></tr></tfoot>
</table>

// Div registers (feeds, lists):
<ul>
  <li className="ledger-row is-selected"><span className="record-id">#0042</span><span className="min-w-0 flex-1">...</span></li>
</ul>
<div className="ledger-total"><span>Total / कुल</span><span className="num">42</span></div>
```
Heads: small caps maroon on paper-2 with a 2px maroon underline. Rows: 1px `rule` separators, haldi tint on hover, teal tint + left teal bar when selected. Totals: double maroon top rule.

### Stamp (rubber-stamp badge)
```tsx
<span className="stamp stamp-danger">Severe</span>   // variants: (default maroon) stamp-ok stamp-warn stamp-danger stamp-teal; stamp-flat removes the tilt
```
Use for status/severity/threat labels. One or two per panel at most.

### Ornament
`<div className="ornament-divider" />` full-width lotus rule. Add `!my-1.5` to tighten.

### Controls
- `.btn-primary` maroon cloth with gold inset hairline, cream text. `.btn-ghost` outlined maroon text.
- `.chip` pill filter; selected via `aria-pressed="true"` or `.is-on` (maroon fill, cream text).
- `.input` paper-white field with a maroon ruled bottom edge; `aria-invalid="true"` turns the border red.
- Focus: teal 2px outline (`outline: 2px solid var(--teal)`) on all of the above. On maroon chrome use `focus-visible:ring-2 ring-gold-soft`.
- Solid teal fills (`bg-accent`) take `text-cream`, never `text-black`.

### Page chrome
- Nav (`components/nav.tsx`): maroon cloth, chakra + "Bharat Pulse" + "भारत पल्स" wordmark in display face, tabs numbered 01..05 (active = maroon-deep + gold-soft + brass underline), `.band-print` then `.toran` beneath. Root layout ends with a thin `.band-print`.
- Page heading pattern for full pages: `<h1 className="font-display text-2xl uppercase tracking-[0.08em] text-maroon">Stats</h1>` followed by a `.ornament-divider` or `.label` subtitle. Replaces the old `glow ... text-accent` h1.

## 6. Charts (Recharts)

Colours must come from tokens or `lib/categories.ts`; `components/stats/chart-theme.ts` already maps tooltip/axis/grid to tokens.
- Axes/ticks: `fill: var(--muted)`, axis line and grid `var(--border)` (dashed `3 3` for grid).
- Single-series bars/areas: `var(--maroon)` fill; highlight/current series `var(--teal)`; secondary `var(--haldi)`.
- Categorical series: `CATEGORY_META[cat].color` only.
- Severity: S1-2 `var(--teal)`, S3 `var(--warn)`, S4+ `var(--danger)` (matches map clusters).
- Bar track (empty portion): `var(--surface-2)`. Tooltip: `TOOLTIP_CONTENT` (surface-2, brass border, offset maroon shadow).
- Donut: separate slices with `stroke: var(--surface)` 2px. No gradients, no glow, no drop shadows.
- Figures in tooltips/labels: mono + tabular.

## 7. Map

- Basemap (`india-style.ts`): parchment land `#e9dcbc` outside India, vellum `#f8f1dc` inside (india-fill sits just above the background so water draws over it), pale indigo water `#c6d1e6`, sepia roads, kumkum maroon India outline, brass dashed state lines, maroon/sepia uppercase labels with a vellum halo. OSM boundary layers stay omitted.
- `map.css`: parchment container with a double brass neat-line frame (`.pulse-map::before`), ledger-style controls, popups as ledger slips (`.pulse-tip`, `.pulse-info`: cream slip, maroon left rule, display-face title).
- Marker colours: `CATEGORY_META` (re-tuned for light backgrounds, markers outlined in `#fbf6ea`). Cluster colour by max severity: teal (S1-2), `#c77d00` (S3), `#b0231c` (S4+). Overlay layers use maroon (pincodes/seats), brass (wards), cyan/magenta/ochre for infra kinds.
- Overlays on the map (layer toggles, legend, who-represents panel) use `bg-surface/95` + `border-border-strong`, or `.ledger-panel`. No `backdrop-blur`.

## 8. Do / Don't

Do: use tokens; keep ids `#0001` style and mono; give every panel a `खाता NN ·` head; keep one hero cloth header per page; keep ornament on chrome edges and between sections; keep touch targets at least 32px on phones; check text on `surface-2` for AA.

Don't: raw hex or `text-green-*`/`emerald`; `text-black`/`bg-black`; glow, text-shadow, blur, gradients on data; uppercase Hindi strings; gold or haldi as small text on paper; mono for running text; place ornaments over data or behind text; add images (SVG data URIs under ~1 KB only); dark mode (not supported).

## 9. Phase-2 checklist (restyle a page)
1. Replace `glow`/`hud-*`/`blink` leftovers (see grep: `rg "glow|hud-(tab|header|label|panel)"`).
2. Swap raw hex and `shadow-[0_0_..var(--accent)]` for tokens; `text-black` becomes `text-cream` on teal/maroon fills.
3. Add `खाता NN ·` heads, `.record-id` on rows, `.label` column heads, `.stamp` for statuses, `.ledger-total` where a list has a count.
4. Data (ids, times, numbers) in `.num`; text stays Mukta.
5. Verify at 390px and 1440px, EN and हिन्दी.
