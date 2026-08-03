# t2000 store — 9a Ember Steel vocabulary

Source of truth for **pass 2**: regenerating `t2000-store-app-v3.dc.html`'s template from a
generator so a "row" is defined once instead of in 200 places.

Direction reference: `t2000-store.dc.html` → `#9a` (frames `9A01 Home`, `9A02 Manage`).
Current app: `t2000-store-app-v3.dc.html` (v2's logic + flows, recoloured to 9a).

---

## Tokens

| role | value | used for |
|---|---|---|
| void | `#0C0F12` | store ground |
| plate | `#161A1E` | desk ground, modal shell |
| raised | `#1E242A` | money blocks only |
| ember | `#FF7A45` | actions, state, settled |
| ember-hover | `#FF9A71` | filled hover |
| ink | `#0C0F12` | text on ember fill |
| paper | `#F2F0EC` | primary text |
| muted | `#8B959C` | secondary text |
| faint | `#646E75` | labels, timestamps, pending |
| destructive | `#E2566B` | destructive fill + text |
| destructive-ink | `#1A0509` | text on destructive fill |

Hairlines: `rgba(242,240,236,0.09)` structure · `rgba(242,240,236,0.16)` controls.
No third weight, no glow, no opacity ramps, no card lift/shadow.

**Atmospheric washes (allowed):** the `.dc.html` top washes — grey
`linear-gradient(172deg,rgba(139,149,156,…))` and ember
`linear-gradient(172deg,rgba(255,122,69,…))` plus the home ember hairline —
are part of the visual SSOT. Do not invent other gradients.

## Type

Space Grotesk display + JetBrains Mono data.

| role | size | tracking |
|---|---|---|
| page eyebrow | 11.5px | 0.18em |
| panel label | 10.5px | 0.14em |
| stat caption | 10px | 0.12em |
| nav | 12.5px | — |
| bracket action | 11.5px | — |

## Components — one definition each

| component | box | notes |
|---|---|---|
| `row(dense)` | `10px 14px` | list rows in dense panels |
| `row(standard)` | `14px 20px` | directory, activity, feed |
| `row(spacious)` | `18px 24px` | jobs board cards |
| `card(dense/standard/spacious)` | `14px` / `20px` / `24px` | panels |
| `section` | `28px 36px` | door cells, hero bands |
| `bracket()` | `6px 11px`, 11.5px ember, `white-space:nowrap`, `flex-shrink:0` | every text action |
| `pill(large)` | `15px 28px`, 15px | page/modal primaries |
| `pill(compact)` | `11px 18px`, 13.5px | desk primaries |
| `chip()` | `10px 14px`, 11.5px | filters, categories, tabs |
| `badge()` | fixed size, no padding | identity tiles, dots |

**Every filled control carries `border:1px solid transparent`** so a fill and an outline of
the same size resolve to the same height under any `align-items`.

Radius 0 everywhere except status dots (`999px`).

## Hover — 5 kinds, nothing else

- filled → brighter fill (`#FF9A71`)
- bracket / text action → ember
- outlined control → ember border + ember text
- row / card → raised
- destructive → `rgba(226,86,107,0.12)`

No transforms, no shadows. State-driven controls take `filter:brightness(1.18)` (a literal —
`style-hover` does **not** resolve `{{ holes }}`).

## Rules the generator must enforce

1. One filled button per band; everything else is a bracket.
2. `raised` appears only on blocks that hold money.
3. Accent marks actions and state — never a static label, eyebrow or section number.
4. Colour derives from **state**, never from verification/connection/selection.
5. Every USDC figure is **ember** — prices, balances, escrow, limits, activity, in and out.
   Credit is not USDC and stays paper. No other treatment for money, anywhere.
6. All text ≥ 3:1 against its *composited* ground, single glyphs included.

## Pass 2 method

Author a `run_script` generator that defines the tokens and component functions above once,
emits the full template, and asserts before writing: no off-palette hex, no off-scale padding,
no bare `cursor:pointer` without a hover, no hole inside `style-hover`.
Keep v2's logic class as-is apart from colour literals — it is the working app.
