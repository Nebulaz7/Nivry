# 45-second motion video — prompt for Claude

**Set expectations before you paste:** no model outputs an MP4. What Claude can
one-shot is a **single self-contained `index.html`** that plays a deterministic
45-second animation. You capture it with OBS. That is genuinely the better
artifact — it re-renders instantly when you change a word, and it captures at 60fps
without a render queue.

Everything below the line is the prompt. Paste it in one message, then attach
nothing else — it is written to be self-sufficient.

---

## PROMPT

You are a senior motion designer and creative developer. Produce a **45-second,
silent, brand-accurate motion piece** for a developer product, as a **single
self-contained HTML file** that I will screen-record.

### Deliverable format (non-negotiable)

- One file: `nivry-45s.html`. No build step, no bundler, no npm, no external JS
  libraries. Inline `<style>` and `<script>` only. Under 60 KB.
- A fixed **1920×1080 stage**, scaled with CSS transform to fit any viewport,
  letterboxed on black.
- The timeline is driven by a single `requestAnimationFrame` clock reading
  `performance.now()`, so playback is **frame-accurate and restartable**. Do not
  chain CSS transitions whose total duration defines the runtime — everything must
  derive from the one clock.
- **Deterministic.** No `Math.random()`. If you need noise, use a seeded PRNG with a
  hardcoded seed. Two playbacks must be pixel-identical.
- Keyboard `Space` restarts. Query param `?t=12.4` seeks to that second (so I can
  grab stills). Query param `?capture=1` hides all UI and any frame counter.
- No audio, no video, no images, no fonts from the network. Use a monospace stack:
  `ui-monospace, "JetBrains Mono", "SF Mono", Menlo, Consolas, monospace`.

### Brand system — obey exactly

Colors (flat fills only):

| token | hex | use |
| --- | --- | --- |
| canvas | `#07130f` | background, always |
| panel | `#0b1d16` | raised blocks |
| line | `#16382c` | 1px hairlines |
| ink | `#e8fdf4` | primary text |
| dim | `#8aa89d` | labels, metadata |
| accent | `#34d399` | the one attention color |
| sand | `#e9b872` | money and locked states |
| clay | `#e29b9b` | failure only, use once at most |

Rules:
- **No gradients.** Solid fills only. No glow, no blur, no drop shadows, no neon.
- **No rounded corners.** Zero border-radius everywhere.
- **No 3D, no perspective, no particles, no stock imagery, no AI imagery.**
- Typography is **monospace, uppercase**, letter-spacing `0.16em`–`0.24em`.
  Sizes: eyebrow 14px, body 30px, statement 56px, hero 128px. Hierarchy comes from
  size and color, never from weight or decoration.
- Layout grid: 12 columns, 120px side margins, hard alignment. Anything that moves
  must land on the grid.
- Motion language: **hard cuts between beats**, 120–200ms `ease-out` for entering
  elements, clip-path reveals, numeric count-ups, 1px rules drawing across. No
  bounces, no overshoot springs, no wipes that look like PowerPoint.

### The story — exact timing and on-screen copy

Silent, so the text carries everything. Use these strings verbatim, uppercase.

| time | visual | text |
| --- | --- | --- |
| 0:00–0:05 | A 5×5 grid of identical flat squares, like profile pictures. They are inert. | `EVERY NFT IS A PICTURE` |
| 0:05–0:09 | The grid desaturates and goes dim. | `IT CAN'T SIGN. IT CAN'T SPEND.` |
| 0:09–0:14 | The grid clears. One square remains, centered, with a thin accent ring. | `AN AGENT CAN` |
| 0:14–0:19 | Two blocks slide in and lock together: a small square labelled `TOKEN`, a wider block labelled `TREASURY`, joined by a 1px accent line. | `NIVRY MAKES THE TOKEN THE TITLE` |
| 0:19–0:23 | Inside the treasury block a balance counts up `0.00 → 3.00 NEAR`. Under it, a second counter stays pinned at `0`. | `3.00 NEAR · 0 ACCESS KEYS` |
| 0:23–0:28 | The two blocks move as one unit, left to right. On the left a `SELLER` tag dims and is struck through; on the right a `BUYER` tag lights. | `A SALE MOVES BOTH` then `ONE TRANSACTION` |
| 0:28–0:33 | Three thin rows write in sequence, each with a check mark: `VERSION 1 → 2`, `EPOCH 1 → 2`, `MANIFEST VERIFIED`. | `THE BUYER GETS WHAT THEY INSPECTED` |
| 0:33–0:38 | Full-width hairline draws across. Above it, small mono metadata. | `LIVE ON NEAR TESTNET · nivry.testnet` |
| 0:38–0:42 | The wordmark assembles from individual letters, left to right, 40ms apart. | `NEP-669` sits small beneath it |
| 0:42–0:45 | Everything but the wordmark fades to canvas. Hold. | `NIVRY` |

End on a still frame. The last 300ms must be completely static so the capture has a
clean tail.

### Product facts — do not invent anything beyond these

- Nivry is a NEAR blockchain standard, **NEP-669**, and a working implementation.
- An NFT **is the title** to an agent's treasury account.
- The treasury has **no access keys**. Nobody can sign for it.
- Selling the token transfers control of the treasury in one transaction.
- The buyer can verify the version and manifest hash before paying.
- It is live on testnet: `nivry.testnet`.

Never claim the token contains the agent's code, memory or model. Never say "trustless".

### Quality bar

- Every element must sit on the grid; no visual center-of-mass drift.
- Text must never reflow or shift position once placed.
- Transitions must feel machined: precise, quiet, no decoration.
- If a beat looks busy, remove elements until it doesn't.

Return only the full `index.html`. No explanation, no commentary, no markdown fence.

---

## After it generates

1. Save as `nivry-45s.html`, open in Chrome at 100% zoom.
2. Press `Space`, watch it twice. If any beat feels rushed, change the numbers in the
   timeline table at the top of the script — the clock derives from it.
3. Capture with OBS: 1920×1080, 60fps, 45s, window capture on the browser. Hide the
   cursor. Play once and stop recording at 45s.
4. Export H.264 at ~12 Mbps.

## If the output is weak

The usual failure is decoration creep — glowing rings, easing that overshoots,
particles. Reply with exactly: *"Remove every glow, shadow and radius. Re-time the
cuts to land on hard boundaries. Re-output the full file."* That fixes it more often
than a rewrite.

If it insists on external libraries, tell it: *"No network requests. Inline
everything or implement the timeline yourself."*
