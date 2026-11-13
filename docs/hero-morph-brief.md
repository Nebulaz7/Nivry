# Hero Morph — Code-Generated Brief

Supersedes the earlier AI-video brief (`docs/hero-video-brief.md`, now replaced).
Applies to the landing hero (`docs/frontend-plan.md` §4.1).

---

## 1. The honest answer

**Yes, we can build this entirely in code — and it will probably look better than
the video would have.**

The morph was never the hard part. The hard part was the *photorealistic ape*: no
library, and no amount of clever rendering, produces a convincing 2021 BAYC-style
PFP. That asset needed a generative image model, and you don't have one right now.

Everything else in the effect is ordinary canvas work:

- a shape dissolving into particles — ~80 lines
- particles converging onto a rounded-rect outline — ~60 lines
- scroll-linked progress, DPR-correct rendering, adaptive particle count — ~100 lines

Compared with the video, code wins on almost every axis that matters:

| | AI video | Code |
| --- | --- | --- |
| Asset dependency | blocks the hero | none |
| Weight | ~2.5 MB | ~0 KB (code we already ship) |
| Resolution | 1080p, compressed | infinite, DPI-crisp |
| Scrub accuracy | needs all-keyframe encoding | exact |
| Reduced-motion | poster frame hack | same component, `p=1` |
| Licensing | model-dependent | none |
| **Photoreal ape** | **yes** | **no** |

That last row is the only real loss, and §3 is how we deal with it.

---

## 2. What changes

**Before:** photoreal ape → glowing card, via generated video.
**Now:** procedural "generic PFP" → glowing card, via canvas particles.

This is a genuine upgrade for a different reason: an AI video would have been
*fighting* the design. The whole site is flat, hairline, vector. A photoreal ape
morphing into a render would have been the one photoreal thing on the page and
would read as pasted in. A vector avatar dissolving into a vector card is
cohesive by construction.

---

## 3. The "before" image

We still need something that reads as *an old NFT*. Three options, in order of my
preference:

### Option A — seeded procedural PFP (recommended)

A tiny generator that composes a cartoon character from primitives:

| Trait | Variants |
| --- | --- |
| background | 6 flat/gradient values from the site palette |
| fur | 5 tones |
| eyes | 4 shapes |
| mouth | 3 shapes |
| headwear | none / cap / beanie / headband |
| accessory | none / glasses / earring / chain |

- Deterministic from a seed (`tokenId`), so it is **reusable** as placeholder art
  in the dashboard and market cards.
- Output SVG (~2 KB) or canvas. No external images, no licensing questions.
- **Deliberately not an ape clone.** A generic cartoon mascot. It parodies the PFP
  era without borrowing anyone's IP.
- Keep it **small in frame** (280–360 px). Detail is not the point; the
  transformation is. A small avatar cannot look cheap, because nobody is
  inspecting it.

### Option B — 16×16 pixel-grid portrait (lowest risk)

A procedural pixel portrait, rendered at 16×16 then scaled with crisp edges.

- Unmistakably "old NFT", zero artistic risk, ~40 lines of code.
- Reads as an avatar from any distance, and pixel-art dissolving into particles
  is a *better* visual metaphor than a photo dissolving.
- If the hero has to be done in an afternoon, this is the safe pick.

### Option C — one still image you supply later

The code path accepts any image. If you later produce or find a single usable
avatar (any tool, any source you have rights to), we swap it in and the morph
keeps working. **No video needed — one still is enough.**

This is the important structural point: **the code is asset-agnostic.** Options A
and B mean we never wait on anything. Option C means we can upgrade later without
touching the animation.

My recommendation: **build Option B first** (it ships today), then upgrade to A if
the hero feels thin.

---

## 4. The technique

### 4.1 Sampling the source shape

1. Render the avatar to an offscreen canvas at its display size.
2. Read the alpha channel.
3. Keep points where `alpha > 128`, sampled on a grid with jitter (~1 point per
   6–8 px²).
4. Cap at **1,200–2,500 points**, weighted by area so dense regions aren't
   over-represented.

### 4.2 Target positions

Two sets, blended:

- **Outline points** along the card's rounded rectangle (dense on the corners).
- **Interior points**, sparse, slight random offset, so the cloud has depth and
  doesn't collapse into a ring.

Each particle gets `(start, end, delay, jitter)` where `delay` is randomised per
particle so the dissolve doesn't move as one rigid block.

### 4.3 Progress

`p ∈ [0,1]` from scroll position. Per particle:

```
local = clamp((p - delay) / (1 - delay), 0, 1)
eased = easeInOutCubic(local)
pos   = lerp(start, end, eased) + jitter * sin(local * PI)
```

### 4.4 Drawing order

| Phase | What renders |
| --- | --- |
| `p < 0.15` | avatar at full opacity; particles hidden |
| `0.15–0.75` | avatar fades out; particles draw as 1–2 px dots, violet tint lerping from fur tone |
| `0.75–0.95` | card outline stroke fades in; interior stays `#05060a` |
| `> 0.95` | outline holds; **DOM card overlay fades in on top** |

The DOM overlay is unchanged from the original brief: real `3.03 NEAR`, real
`authority_epoch`, real code hash. Still no text inside the canvas.

---

## 5. Why this beats the video

- **No asset blocker.** The hero is finishable today.
- **0 KB** versus 2.5 MB in the critical path.
- **Exact scrubbing.** No keyframe encoding, no iOS `currentTime` jank, no poster
  fallback.
- **`prefers-reduced-motion` is first-class.** Render the same component at
  `p = 1`. Not a degraded path — the same code.
- **Reusable.** The same particle routine can power card hover states, the
  dashboard's mint transition, and placeholder art.
- **Data-reactive.** The final card is built from `agent_info`, so the hero shows
  a state that actually exists on chain.

---

## 6. Effort, risk, and mitigation

Roughly **half a day**: ~150 lines for the avatar generator, ~250–350 for the
morph component.

| Risk | Mitigation |
| --- | --- |
| Avatar looks cheap | keep it 280–360 px and flat; nobody inspects it. Option B removes the risk entirely. |
| Too many particles on low-end devices | adaptive count: `min(2200, cores * 300, area / 900)`; drop to 800 under reduced-motion |
| Hero copy unreadable over the particle phase | copy fades in only after `p > 0.85`, plus a radial scrim behind text |
| Scroll handler jank | drive `p` from a single `requestAnimationFrame` loop reading one scroll value; never render in the scroll event |
| Canvas blurry on retina | size the backing store to `cssSize * devicePixelRatio`, scale the context |
| Looks like every other particle site | the card outline + single teal pulse at `p ≈ 0.9` is the signature; keep it, and keep it once |

---

## 7. Fallback (and it's not a downgrade)

If the animation misbehaves on a device, the same component renders at `p = 1`
with no rAF loop: the card, the outline, the avatar gone. That is a complete
hero, not a placeholder. There is no "video failed to load" state, because there
is no video.

---

## 8. Acceptance checklist

- [ ] Avatar renders identically from the same seed (deterministic)
- [ ] Particle count adapts down on low-core devices and the result still reads
- [ ] Scrub forward and backward slowly — no popping, no tearing
- [ ] `p = 0` looks like a static NFT card, `p = 1` looks finished on its own
- [ ] `prefers-reduced-motion` renders `p = 1` and mounts no animation loop
- [ ] Canvas backing store matches `devicePixelRatio` (crisp on retina)
- [ ] Card overlay numbers come from `agent_info`, not literals
- [ ] Background is `#05060a` at both ends (no seam against the page)
- [ ] Hero copy stays legible at every `p`
- [ ] No canvas text rendering anywhere

---

## 9. What we give up, stated plainly

The "wait, that's a real ape" recognition. A vector mascot will not trigger the
PFP nostalgia reflex the way a photo would.

If that recognition turns out to matter for the pitch, the fix is cheap and does
not require a model: **one still image**, from anywhere you have rights to, drops
into `Option C` and the existing code dissolves it. We are never blocked on video
again — only, at worst, on a single picture.
