# DESIGN.md: The Wish Garden frontend

> Location note: the assignment's write scope allows only `web/**`, `dist/**` and `docs/**`, so this
> document lives at `docs/DESIGN.md` rather than at the repository root.

## Overview

The site is a dark fantasy candle garden on Ethereum. The live garden is the product: a midnight canvas
where only confirmed onchain candles give off light. Everything else is quiet, gold-edged panels on deep navy,
following the requester's visual reference (midnight sky, dim moon, stone arches, flower beds, frog sculptures,
gold accents). The garden canvas fills the first screen. The buy controls sit beside it on desktop and directly
below it on phones. Content pages (My candles, Treasury, How it works) are a single column of panels with at
most two columns on wide screens.

## Colors

Tokens are CSS custom properties in `web/src/styles.css` (`:root`), hex notation.

| Token | Value | Use |
| --- | --- | --- |
| `--bg` | `#070d18` | page, header, inputs |
| `--surface` | `#0d1724` | panels, connect sheet |
| `--surface-raised` | `#13202f` | quiet buttons, current nav item, tx status, swatches |
| `--line` | `#3b3424` | panel borders, table rules, section dividers |
| `--line-strong` | `#6b5a32` | control borders, note rule |
| `--accent` | `#f2b84b` | primary button, selected swatch, selected candle ring |
| `--accent-hover` | `#ffcf73` | primary hover, h1, links, totals |
| `--accent-ink` | `#1a1206` | text on accent |
| `--text` | `#efe6d2` | body text |
| `--text-muted` | `#b5ae9e` | hints, labels, secondary values |
| `--ok` / `--warn` | `#8fdcaa` / `#ffb38a` | status text and the tx status edge |
| `--focus` | `#ffe7a8` | 2px focus ring |

The canvas uses its own scene colors (sky `#050a14` to `#0a1220`, terraces `#111b29`, pedestals `#18243a`)
and the seven style colors in `STYLES` (`web/src/config.ts`). Contrast was not measured in a browser
(see validation limits).

## Typography

- Display: Cormorant Garamond 600, bundled locally (`@fontsource/cormorant-garamond/latin-600.css`, woff2 + woff).
  Used for h1, h2, the brand and the purchase total.
- UI: `system-ui` stack, weights 400 (body) and 500 (buttons, nav), 600 on the primary button.
- Code and data: `ui-monospace` for `code` only. Numbers use `tabular-nums`.
- Scale (`--fs-*`): 13 (hints, mobile nav), 15 (body), 17 (lead, stepper), 22 (h2, total), 30 (h1; 26 under 900px).
- Headings use `text-wrap: balance`; paragraphs use `pretty`. No uppercase transforms and no tracked labels.

## Layout

- Header: a grid of brand | nav | wallet. Under 820px the nav becomes a full-width second row of four equal
  columns (44px targets).
- Garden page (`.garden-page`): a grid of `minmax(0,1fr) 380px` filling the viewport height on desktop. Under 900px
  it becomes a column: canvas `max(240px, 38svh)`, then the stage footer, then the buy panel, so the main
  action stays on the first screen at 390×844.
- Content pages: `.page` max 1100px, 16px gutters; `.grid2` uses `auto-fit, minmax(min(100%, 420px), 1fr)`.
- Spacing is a 16px base (`--space`), with 4/6/8/10/12px gaps inside controls.
- Overflow: body hides horizontal overflow as a safety net. Long hashes and messages use `overflow-wrap: anywhere`.

## Elevation & Depth

The interface is flat: panels have a 1px `--line` border and no shadow. Depth lives only in the canvas
(additive glow sprites). Overlays: the connect sheet backdrop `rgba(2,5,10,.72)` with z-index 40, the account
menu z 20, the header z 5. Inset `box-shadow` appears only as a single edge marker on the current nav item and tx states.

## Shapes

`--radius` 10px for panels, inputs, swatches and the tx status. `--radius-pill` for buttons, nav items, chips and
icon buttons. The connect sheet is 16px, square at the bottom on phones (bottom sheet).

## Components

| Component | Source | Notes |
| --- | --- | --- |
| Buttons `.btn .btn-primary / .btn-quiet / .btn-wide`, `.icon-btn`, `.chip`, `.link`, `.x` | `styles.css` | 44px min height; hover gated by `(hover: hover)`; `:active` lighter; disabled at 60% opacity; `:focus-visible` ring |
| ConnectSheet | `web/src/components/Wallet.tsx` | EIP-6963 rows, "Open in" rows on phones, Coinbase; Escape, backdrop and × close; shows `0x1234…abcd` and Disconnect; wrong chain shows "Switch to Ethereum" |
| SwitchButton | same | `wallet_switchEthereumChain`, then `wallet_addEthereumChain` with the manifest's `walletAddChain` on 4902 |
| StylePicker | `components/StylePicker.tsx` | native radio group in a fieldset; candle previews labeled "preview" |
| TxStatus | `components/TxStatus.tsx` | stable `role=status` live region; checking, waiting for wallet, pending, confirmed, reverted, rejected, not sent; explorer link |
| GardenCanvas | `garden/GardenCanvas.tsx` | focusable canvas (arrows pan, +/- zoom), zoom / fit buttons, click to select |
| Panel `.panel`, key-value table `.kv`, list `.candle-list` | `styles.css` | panels never nest; tables right-align numbers |
| Notes `.note`, `.hint`, `.fixture-banner` | `styles.css` | disabled reasons sit next to the control they explain |

## Do's and Don'ts

- Start a new page from `<div className="page">` with `.panel` sections and an `h1`. Use `.grid2` for pairs.
- One primary action per panel (`.btn-primary`). Everything else is `.btn-quiet` or `.link`.
- Show a disabled control with its reason beside it. Never hide an action that is waiting for owner setup.
- Report outcomes only from receipts or re-reads (`useTx` in `chain.ts`).
- Don't add borders plus shadows, nested cards, uppercase labels or new font sizes outside the `--fs-*` scale.
- Don't hard-code addresses or chain data. Read them from the runtime manifest (`useRuntime()`).
