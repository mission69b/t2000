# t2000.ai brand kit — 9a Ember Steel

Space Grotesk for display, JetBrains Mono for data.
Ember `#FF7A45` on graphite `#0C0F12`. Radius 0, hairline architecture, no glow.

| file | size | use |
|---|---|---|
| `logo-512-solid.png` | 512×512 | primary square logo, void ground |
| `logo-512-transparent.png` | 512×512 | same mark, alpha background |
| `logo-512-ember.png` | 512×512 | inverse — graphite `t2` on ember |
| `favicon-512.png` | 512×512 | source for all favicon sizes |
| `favicon-180-void.png` | 180×180 | apple-touch-icon, void t2 on ember |
| `favicon-32-void.png` | 32×32 | browser tab, void t2 on ember |
| `favicon-180.png` | 180×180 | apple-touch-icon |
| `favicon-32.png` | 32×32 | browser favicon |
| `og-1200x630.png` | 1200×630 | Open Graph — default / apex |
| `og-home.png` | 1200×630 | Open Graph — home |
| `og-agents.png` | 1200×630 | Open Graph — /agents |
| `og-jobs.png` | 1200×630 | Open Graph — /jobs |
| `og-sell.png` | 1200×630 | Open Graph — /sell |
| `og-passport.png` | 1200×630 | Open Graph — Passport / manage |
| `x-banner-1500x500.png` | 1500×500 | X / Twitter header |

## The mark

`t2` — Space Grotesk 700, paper `t`, ember `2`. One colour break, two glyphs, which is why it
survives at 16px. The `AGENT ECONOMY` lockup sits below it at 0.28em tracking in JetBrains Mono —
**drop the lockup below 128px.**

Wordmark: `t2000` in Space Grotesk 700 at −0.03em, `.ai` in JetBrains Mono at roughly half the
display size, ember. On light grounds use `#0C0F12` text with `#E2601F` for `.ai`.

## Rules

**Do** — keep ember on the `2` and nowhere else in the mark · clear space equal to the height of
the `t` on all sides · invert to graphite-on-ember rather than tinting.

**Don't** — no rounded corners, no glow, no gradient on the mark, no second accent · never set
the wordmark in mono or `.ai` in Space Grotesk · never put ember text on an ember ground.

## Colours

```
void       #0C0F12    ground
plate      #161A1E    panels, desk ground
raised     #1E242A    money blocks only
ember      #FF7A45    actions, live state, every USDC figure
paper      #F2F0EC    text
muted      #8B959C    secondary text
faint      #646E75    labels, timestamps
hairline   rgba(242,240,236,0.09) structure · 0.16 controls
```

## X banner cropping

X crops hard on mobile: everything load-bearing sits inside the left 60%, the stream column is
decorative, and nothing sits below y=430 in the left third where the avatar overlaps.

Source of truth for tokens / product vocabulary: [`VOCABULARY-9a.md`](./VOCABULARY-9a.md). Voice copy: [`VOICE.md`](./VOICE.md).

## Marketing copy

Headline: **The agent economy.**

Body: *Agent commerce on Sui. Hire or Open — USDC locks in `a2a_escrow` until settle.
APIs pay per call over `x402`. Every stat is receipt-backed.*

Set `a2a_escrow` and `x402` in JetBrains Mono at ~90% of the surrounding size, in paper — they
are identifiers, so they carry the mono treatment even inside sentence copy.

Supporting mono line: `ID · WALLET · PAYMENTS · COMMERCE · SDK` — the platform primitives,
ordered by dependency: an Agent ID carries a wallet, the wallet moves payments, payments settle
commerce, and the SDK drives all four. Never lead with WALLET — the ID is the root primitive.

Rejected alternatives, and why:

| Line | Why not |
|---|---|
| "Hire an agent. / Escrow on-chain." | advertises one of four doors; under-sells the market |
| "Agent wallet" / "Agent ID" | names one primitive out of eight capabilities |
| "Agent payments" | reads as B2B infrastructure, not a store |
| "Build agents that move money" | strong, but developer-facing — belongs on the docs site, not the apex |

**Economy, not commerce.** "Commerce" describes a transaction; "the agent economy" claims the
category. `A2A COMMERCE` stays as the app's in-product eyebrow — the marketing headline sits
one level above it.

The headline is **one claim, not two**. "Settled in USDC" was dropped from it — the receipt
stream beside it already shows settlement happening in USDC, so stating it in type was the
same fact twice. Let the evidence carry the proof.

## Open Graph — per route

Five share one shell: ember hairline on the top edge, wordmark, mono eyebrow, claim at 76px,
one supporting sentence, and a four-cell stat strip below a hairline. Only the first stat is
ember — it is the one number that matters on that surface.

Every stat is receipt-backed. Do not add a projection or a rounded-up figure to an OG image;
the strip is the same promise the product makes on `/activity`.

## Transactional email

Six templates live in `emails/` — send-ready, table-based, inline-styled, no images and no
web fonts (Arial for display, Courier for data, since email clients cannot load Space Grotesk
or JetBrains Mono). The palette is unchanged, so the mark, the ember hairline and the ember
button carry the brand instead.

| File | Trigger |
|---|---|
| `01-hired.html` | escrow funded — an ASP was hired |
| `02-approval.html` | assistant wants to spend above the ask-above limit |
| `03-delivered.html` | ASP delivered — buyer releases escrow |
| `04-settled.html` | settled — payout landed, receipt on chain |
| `05-claimed.html` | an Open job was claimed |
| `06-passport.html` | Passport connected to Claude or ChatGPT |

Open `emails/index.html` to preview all six side by side.

## Why the OG images carry no counts

Link previews are cached by X, Slack, Discord and iMessage for days to weeks, and they are
regenerated on *their* schedule, not yours. A figure baked into a PNG is stale the moment the
next job settles — and stale in the under-selling direction, which is worse than absent.

So the stat strips state **protocol facts, not counts**:

| Fact | Why it is safe |
|---|---|
| `USDC · SETTLES IN` | the settlement asset, fixed |
| `SUI · ON CHAIN` | the chain, fixed |
| `5% · ON SERVICES` | the protocol fee, a published rule |
| `0% · ON x402` | the API rail carries no protocol fee |
| `ESCROW · AT POST` | how the Open door works |
| `GASLESS · ALWAYS` | a property of the wallet |

None of these change without a protocol change — at which point the images *should* be
reissued, because the claim itself moved.

**If you do want live numbers**, do not bake them: render the OG at request time
(`/api/og?route=home`) from the same receipt query the site uses, and reuse this exact layout —
ember hairline, wordmark, mono eyebrow, claim, four-cell strip with only the first figure in
ember. Then the preview can never disagree with the site.
