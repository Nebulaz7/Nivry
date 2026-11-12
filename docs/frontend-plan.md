# Nivry Frontend — Implementation Plan

Status: **planning only. Nothing implemented.**
Scaffold: `app/` — Next **16.4.6**, React **19.3**, Tailwind **4.3** (Turbopack), pnpm.

---

## 0. Decisions locked

| # | Question | Decision |
| --- | --- | --- |
| 1 | Mint entry point | **Modal** on the dashboard. No `/app/mint` route. |
| 2 | Marketplace discovery | **Enumerate token ids** via `next_token_id()` + batched `agent_info`. No indexer dependency. |
| 3 | Wallet | **HOT connector UI** (one modal → any supported NEAR wallet, Privy-style). |
| 4 | Hero morph | **AI-generated video**, scroll-scrubbed. |
| 5 | Routing | **`/app`** path on one deployment. |
| 6 | Shared types | **Single workspace** (see §11 for the migration and its one risk). |
| 7 | Logo | **You** are designing the mark and wordmark. |

Consequences worth stating out loud:

- Decision 4 means the morph is a **video asset you must produce**, not something
  I can build around a placeholder forever. Until it exists, the hero uses two
  stills with a cross-fade, and the layout must not depend on the video's aspect
  ratio.
- Decision 6 is the only one that touches Dev B's territory (§11).

---

## 1. Two surfaces, two tones

| Surface | Job | Feel |
| --- | --- | --- |
| Landing `/` | Explain an unfamiliar idea in 20 seconds | Cinematic, galaxy, motion-led |
| App `/app/**` | Do real things with real contracts | Calm, dense, legible |

The failure mode to avoid is making the app look like the landing page. A demo is
judged on whether the transaction lands.

---

## 2. Copy spine

Everything ladders up to:

> **You are buying the agent's on-chain identity and treasury — exclusive,
> unbackdoorable, revocable. You are not buying its brain, its memory, or the
> seller's runtime.**

Hero headline — pick one, never ship two:

1. `NFTs that hold a wallet.`
2. `An NFT you can sell without being robbed.`
3. `The token is the title. The treasury is the asset.`

`NEP-XXXX` is a **single exported constant**. One string changes when the number
lands.

Runtimes named in the "plug in your agent" line: Hermes, OpenAI Agents, OpenCode,
Codex, Claude-based agents. The implication is *bring the runtime you already
use*, never *we host your agents*.

---

## 3. Routing

```
/                       landing        static, no wallet
/app                    dashboard      wallet-gated
/app/agent/[tokenId]    passport       every action for one agent
/app/market             marketplace    browse + buy
```

**Four routes.** Sign-in is a `<ConnectGate>` overlay with `?next=`, not a page —
NEAR has no session to render. Mint is a modal on `/app` (decision 1). Settings
is not built; if it appears later it is a fifth route, not the fourth.

---

## 4. Landing — five sections + nav + footer

Scroll budget: ~4–5 viewports of content. Every section earns its place.

### 4.1 Hero

- Full-bleed **starfield** with a slow drift, plus a **horizon grid** in the
  bottom third.
- `NEP-XXXX` eyebrow → headline → one subline → `Launch app` + `Read the NEP`.
- **The morph**: 2021 ape JPEG on the left becomes an agent card on the right —
  same silhouette, but the card now shows a treasury balance, an
  `authority_epoch` and a `frozen` flag. That single image is the pitch.
- Parallax: three layers maximum (stars, horizon, content).
- **Stat strip** under the hero — real numbers only:

  | Stat | Value | Why it is honest |
  | --- | --- | --- |
  | Access keys on a treasury | `0` | verifiable on explorer |
  | Cost to mint | `3.03 NEAR` | `provisioning_cost()` |
  | Treasury code | `ce3b675e…` | `wallet_code_hash()` |
  | Agents minted (testnet) | `1` | do not inflate this |

### 4.2 Statement

Big type, scroll-linked opacity: ~15% → 100% by the time it centres, fading as it
leaves. Two or three lines, ≤10 words each.

> `An agent can hold money.`
> `So an NFT can be a title.`
> `And a title can be sold.`

### 4.3 Capabilities bento

Six tiles, one claim + one proof each:

| Tile | Claim | Proof shown |
| --- | --- | --- |
| Keyless | The treasury has no keys | `0 access keys` |
| Bounded | Payouts are capped and time-boxed | `cap · budget · ≤90d` |
| Revocable | A sale kills the operator | `authority_epoch++` |
| Inspectable | Verify the bytecode yourself | `wallet_code_hash()` |
| Atomic sale | Price, version, manifest — all or nothing | `expected_version` |
| Boring settlement | Failures are not retried blindly | `status = uncertain` |

### 4.4 In action — three alternating rows

Visual left / copy right, reversed, then left again. One verb each:

1. **Mint** — "3.03 NEAR, one receipt, no keys." Show `provisioning → ready`,
   because it is async and that is the truth.
2. **Put it to work** — "Give it a budget. Revoke it in one call." Show a grant
   with cap + expiry, then a freeze.
3. **Sell it** — "The buyer gets exactly what they inspected." Show a version
   check *failing* on a tampered listing.

### 4.5 FAQ + disclaimer

Max six accordion items. Must include, in plain words:

- What exactly do I own? (the identity + treasury, not the brain)
- Does the buyer get my prompts and memory? (no)
- Can I use the agent after listing? (no — listing requires `frozen`)
- Can I withdraw while a sale is in flight? (blocked)
- Is this mainnet? (no)
- What if there is a bug? (honest answer)

Disclaimer block, visually distinct: **testnet only, unaudited, NEP not accepted,
do not put real value in a testnet treasury.**

### 4.6 Footer

Logo, one line, three link columns, contract ids with copy buttons
(`nivry.testnet`, `00000001.nivry.testnet`), `TESTNET` badge, one restrained
motion flourish. No particles.

---

## 5. App pages

### 5.1 Dashboard `/app`

- Connect gate if no wallet.
- **Create agent** button → modal (see §6.1).
- **My agents** grid from `nft_tokens_for_owner`, each card showing lifecycle
  badge, balance, `frozen`, `version`, `authority_epoch`.
- **Provisioning card** after a mint, polling until `lifecycle == ready`.

### 5.2 Agent passport `/app/agent/[tokenId]`

Identity, money, authority, market, history — in that order.

Disabled actions must carry a **reason**, not just grey out. The contract returns
specific panics; the UI should say "freeze the agent before listing".

### 5.3 Market `/app/market`

Listing cards: art/placeholder, name, price, treasury balance, `version`, seller,
`Buy`. Buy re-reads the agent immediately before signing and aborts cleanly if
anything changed.

---

## 6. Flows that must be right

### 6.1 Mint (modal, 4 steps)

1. **Manifest** — name, description, runtime hint, task kind, manifest URI,
   bundle SHA-256. Inline limits, live canonical-JSON hash preview.
2. **Cost** — read `provisioning_cost()` live; show `3.03 NEAR` and what it buys
   (3 NEAR code stake + 0.03 registry storage). Never hardcode the number.
3. **Sign** — wallet modal, exact deposit, 300 TGas.
4. **Provision** — "reserved token `n`", spinner, poll `agent_info(n)` until
   `ready`. On `failed` → refund message. On `uncertain` → explain, offer
   `reconcile_provisioning`.

The modal must be closable and the provisioning job must keep running in the
dashboard after it closes. A modal you can close into a black hole is worse than
a page.

### 6.2 List

Two steps, because the contract requires it:

1. `set_frozen(true)` — explain: outflows stop, deposits still land.
2. `list_agent(token_id, version, price)` — exact `0.02 NEAR` deposit.

`cancel_listing` also unfreezes. Say so on the button: **"Delist and resume
spending."**

### 6.3 Buy

Re-read `agent_info` → compare `version`, `listing_id`, `manifest_hash` → sign
exact price. If anything moved, refresh instead of sending a doomed transaction.

### 6.4 Grant

Recipients 1–8, per-payment cap, total budget, expiry ≤90 days. Constrain the
inputs to these bounds; do not validate after the fact.

---

## 7. Contract-driven constraints

| Constraint | UI consequence |
| --- | --- |
| `create_agent` mints in a callback | never say "minted" until the title exists |
| Deposits must be **exact** | read `provisioning_cost()` / `listing_deposit()` / `listing.price_yocto` |
| `list_agent` requires `frozen` | two-step list, explained |
| `cancel_listing` unfreezes | button copy says it |
| `set_frozen` rejected while an op is pending | disable + "operation in flight" |
| Frozen blocks outflows, allows deposits | banner on frozen agents |
| `buy_agent` needs `expected_version` + `expected_manifest_hash` | re-read before signing |
| `version` ignores inflows | do not invalidate caches on balance change |
| no `nft_approve` | our market is inline; third-party pull is impossible |
| nonce must equal `next_command_nonce` | read fresh, never cache |
| manifest charset: no quotes/backslashes; strict lengths | mirror validation client-side |
| errors are panic strings | map known strings to human copy |

---

## 8. Marketplace discovery (decision 2)

The contract has **no listing index**. Implementation:

1. `next_token_id()` → `n`.
2. Batch `agent_info(i)` for `i in 1..n` over one RPC batch request.
3. Keep `listing != null`; render.
4. Cap at 200 tokens with an explicit "showing first 200" note; the page must not
   silently truncate.

Cost is linear, which is fine for a testnet demo and honest to state. Optional
escape hatch: if `NEXT_PUBLIC_INDEXER_URL` is set, fetch from it instead.

---

## 9. Theme — our system, in the Monad *pattern*

### 9.1 What I could and could not verify

I fetched `monad.xyz` and got the **content structure**, not the stylesheet. So
the section below separates observation from invention:

**Observed structure** (worth copying, because it works):

- Nav: logo · `Explore Apps` · `Get in Touch` — three items, no mega-menu.
- Hero: one big sentence + one subline + two CTAs.
- **Stat strip immediately under the hero** — four numbers, each with a 3–5 word
  label.
- Use cases as **three equal columns**, each heading + one paragraph.
- **Spec cards with "Show details" expanders** (block time, finality, cost).
- Alternating case-study grid with small **category chips** (`defi`, `news`,
  `payments`).
- Long, dense footer with a newsletter block.

**Not verified:** their exact fonts, colors, easing curves, and button
micro-interactions. I am not going to pretend otherwise. If you want their
specific look, screenshot the hero and I'll match it by eye — but a hommage that
is ours will age better than a copy that is 80% right.

### 9.2 Our interpretation

The Monad lesson is not "purple". It is: **one accent, enormous type, hairline
structure, almost no chrome, and numbers treated as content.**

```css
@theme {
  /* canvas */
  --color-void:      #05060a;  /* page background, not pure black */
  --color-deep:      #0a0c14;  /* section alternation */
  --color-elevated:  #12151f;  /* cards, modals */
  --color-hairline:  #1e2230;  /* 1px borders, grid lines */

  /* text */
  --color-ink:       #f4f5f8;
  --color-muted:     #8b90a3;
  --color-faint:     #565b6e;

  /* one accent, used sparingly */
  --color-accent:    #7c6cff;  /* violet — links, focus, active */
  --color-accent-2:  #37e0c8;  /* teal — success, "ready" states only */

  /* semantic */
  --color-warn:      #e2b341;  /* frozen / pending */
  --color-danger:    #e2585f;  /* failed / uncertain */

  /* type */
  --font-display: var(--font-geist-sans);
  --font-mono:    var(--font-geist-mono);
}
```

Rules that make it feel designed rather than decorated:

1. **Two type sizes do 80% of the work** — display `clamp(2.5rem, 6vw, 5rem)` and
   body `1rem/1.6`. Section headings sit in between; resist inventing five sizes.
2. **Mono for anything a machine said**: addresses, hashes, numbers, epochs,
   badges. Mono is the "this is data" signal.
3. **Hairlines, not shadows.** `1px solid var(--color-hairline)`. Shadows on a
   near-black canvas read as smudge.
4. **Radius 8px on cards, 999px on pills.** Nothing else. Sharp corners only in
   the starfield grid.
5. **One accent per viewport.** If a section has two violet elements competing,
   one of them is wrong.

### 9.3 Buttons

| Variant | Look | Use |
| --- | --- | --- |
| `primary` | solid accent, ink text, 999px pill | one per screen — `Launch app`, `Mint` |
| `secondary` | hairline border, transparent, ink text | `Read the NEP`, `Cancel` |
| `ghost` | text + 8px hover lift of background | nav, inline actions |
| `danger-ghost` | danger text, hairline on hover | `Revoke`, `Delist` |

Interaction spec (this is the "button effect" part, written down so it is
consistent):

- hover: `background-color` and `border-color` transition over **120ms
  `cubic-bezier(.2,.8,.2,1)`**; **no scale** on primary buttons.
- active: `transform: translateY(1px)` only.
- focus-visible: `outline: 2px solid var(--color-accent); outline-offset: 2px` —
  never removed.
- disabled: `opacity .45; cursor: not-allowed`, and a tooltip carrying the
  *reason*.
- loading: label stays, spinner replaces the leading icon, width is locked so the
  button does not jump.

### 9.4 Motion tokens

```css
--ease-out:   cubic-bezier(.2, .8, .2, 1);
--ease-inout: cubic-bezier(.4, 0, .2, 1);
--dur-fast:   120ms;
--dur-base:   240ms;
--dur-slow:   600ms;
```

- Reveals: `opacity 0→1` + `translateY(12px→0)` over `--dur-slow`.
- Parallax: scroll-linked, no independent animation loops.
- Starfield: 150 canvas particles, paused when the tab is hidden.
- `prefers-reduced-motion: reduce` → all of the above collapse to opacity only,
  video renders its poster frame.

### 9.5 Type scale

| Token | Size | Use |
| --- | --- | --- |
| display | `clamp(2.5rem, 6vw, 5rem)` | hero, statement |
| h2 | `clamp(1.75rem, 3vw, 2.5rem)` | section heads |
| h3 | `1.25rem` | card titles |
| body | `1rem / 1.6` | prose |
| small | `0.875rem` | labels, captions |
| mono-sm | `0.8125rem` | addresses, hashes, stat labels |

Letter-spacing: `-0.02em` on display only. Nowhere else.

---

## 10. Motion stack

| Library | Role | Cost | Verdict |
| --- | --- | --- | --- |
| **Motion** (`motion`) | scroll-linked opacity, parallax, reveals | ~35 KB gz | **primary** |
| **React Bits** | take 2–3 components: split text, scroll reveal | free, code lands in repo | **selective** |
| Canvas 2D starfield | hero background | ~2 KB | **build it** |
| GSAP + ScrollTrigger | only if the video scrub needs a real timeline | ~70 KB | **avoid unless forced** |
| Rive | alternative to video for the morph | small runtime | **fallback if video fails** |
| Lottie | only if you already have a file | ~50 KB + JSON | no |
| Three.js / R3F | 3D starfield | 150 KB+ | **no** |
| Lenis | smooth scroll | 10 KB | **no** — fights pinned sections |

One animation engine is a budget; two is a debugging tax.

---

## 11. Workspace (decision 6)

Current state, verified:

- root `package.json` declares npm `workspaces: [backend, packages/*]` but there
  is **no root lockfile** — those workspaces were never installed from root.
- `backend/` has its own **`pnpm-lock.yaml`**.
- `app/` has its own **`pnpm-lock.yaml`** and `pnpm-workspace.yaml`.
- `packages/shared` is `@nivry/shared`, building to `dist/` with `tsc -b`.

So the repo is **de facto pnpm** already. Recommendation:

1. Root `pnpm-workspace.yaml`:
   ```yaml
   packages:
     - app
     - backend
     - packages/*
   ```
2. Root `package.json`: drop `workspaces`, scripts become `pnpm -r build` etc.
3. `app/package.json`: add `"@nivry/shared": "workspace:*"`.
4. Delete the nested lockfiles; install once at root.

**The one risk:** this changes Dev B's install commands. Do it with him in the
loop, or accept `file:../packages/shared` in `app/package.json` as the
zero-blast-radius option (two lockfiles, no migration).

Do not import `@nivry/shared` for the *first* screen; the landing page should
have zero coupling to the app.

---

## 12. Data layer

- **Reads:** direct RPC `view` calls, typed by hand against the contract structs.
  Batch via the RPC's `query` batch for the marketplace.
- **Writes:** HOT connector → signed transaction.
- **Wallet caveat:** MyNearWallet's dapp login is currently broken (we hit it
  during deploy). If the HOT modal lists it as the default, the first click a
  judge makes fails. Test every listed wallet on **testnet** before shipping.
- I fetched `github.com/hot-dao/near-connect` and got a 404, so **the package
  name is unconfirmed** — verify `@hot-labs/near-connect` (or the current name)
  from HOT's own docs before installing.
- Network badge is functional, not decorative.

---

## 13. Assets

- Ape and agent-card stills must share lighting and framing, or the morph reads
  as a cut.
- Video: `webm` (VP9) + `mp4` fallback + `poster`. `muted playsInline preload="none"`.
- **No GIFs.** A 3 MB GIF is ~300 KB as video.
- `next/image` for stills (AVIF/WebP), explicit sizes to avoid CLS.
- Total `public/` under ~6 MB.
- Naming: `public/hero/ape-01.webp`, `public/hero/agent-01.webp`,
  `public/loops/mint.webm`, `public/brand/logo.svg`.

---

## 14. Structure (not created yet)

```
app/
  app/
    page.tsx                     landing
    app/page.tsx                 dashboard
    app/agent/[tokenId]/page.tsx
    app/market/page.tsx
    layout.tsx  globals.css
  components/
    marketing/  nav hero stat-strip statement bento action-rows faq footer
    app/        connect-gate agent-card mint-modal passport grant-form
                freeze-toggle listing-card buy-dialog tx-toast
    ui/         button card input dialog badge skeleton accordion
  lib/
    near/       rpc.ts views.ts txs.ts wallet.ts types.ts
    format.ts   yocto, relative time, address shortening
    manifest.ts client-side mirror of the contract's validation
  public/       brand/ hero/ loops/ icons/
```

---

## 15. Milestones (deadline 14 Nov 23:59 UTC)

| Slot | Deliverable | Cut if late |
| --- | --- | --- |
| **11 Nov** | tokens, layout shell, nav, footer, hero + starfield, stat strip | morph → two stills, cross-fade |
| **12 Nov** | statement, bento, three action rows, FAQ, mobile + reduced-motion | action rows → two |
| **13 Nov** | app shell, HOT connect, dashboard, mint modal | market |
| **14 Nov** | passport actions, market, polish, deploy, demo video | history |

Landing is what judges see for 60 seconds; the app is what makes it credible. If
forced to choose, the **mint modal survives and the bento dies**.

---

## 16. Out of scope

- No hosted runtime, no inference, no keys in the browser.
- No database; reads are on-chain.
- No mainnet, no real funds.
- No third-party marketplace integration (`nft_approve` does not exist).
- No fake data in any path a user could mistake for real state.

---

## 17. Still open

1. **Hero video**: who generates it, and to what brief? Needs the ape and the
   agent card to share a camera, a light direction, and a frame. Without that
   spec, the two clips will not cut together.
2. **HOT package**: confirm the current name and its testnet wallet list.
3. **Workspace migration**: do it with Dev B, or take the `file:` shortcut?
4. **Final copy** for the statement section and FAQ answers.
5. **Whether the landing shows the real testnet balance** in the agent card, or a
   sanitised figure.
6. **Logo timing**: the hero composition depends on the wordmark's proportions.
   If the mark lands late, design the hero around a text-only lockup first.
