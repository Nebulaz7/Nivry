# Explainer video — do this in this order

**Total time: about 45 minutes.** The trick is that your landing page is already
animated. The hero morph, the statement scroll, the bento counters, the market
cards — that is motion design you already paid for. Record it, put a voiceover on
it, cut on the beats. Do not try to learn a new tool tonight.

You cannot skip step 1. **Voiceover first, visuals second.** Every first-timer does
it backwards and spends three hours nudging clips.

---

## 1. Generate the voiceover (10 min)

Open ElevenLabs. Use **one voice** for all six paragraphs, and generate **six
separate MP3s** — not one long file. Separate files are what makes cutting easy.

Save them as `01.mp3` … `06.mp3`.

Settings: stability ~50, similarity ~75, speed ~1.0. Do not add reverb.

### The script

**01 — the problem (7s)**

> Every NFT you own is a picture. It cannot sign. It cannot spend. It cannot earn.

**02 — the gap (10s)**

> Meanwhile, AI agents hold money and pay for their own work. There is no honest
> way to sell one, because the wallet stays behind when the token moves.

**03 — the idea (12s)**

> Nivry makes the token the title. One NFT owns an agent's identity and a treasury
> account that has no keys. Whoever holds the token controls both.

**04 — the guarantee (12s)**

> A sale moves them together, in one transaction. The seller is cut off before the
> buyer begins. Anything the seller started in flight fails, instead of finishing
> under the new owner.

**05 — the proof (10s)**

> And the buyer sees exactly what they are buying: the balance, the version, the
> manifest hash. If any of it changed, the purchase aborts.

**06 — the close (7s)**

> Live on NEAR testnet today. NEP six sixty-nine. Mint it. Budget it. Sell it.
> Nivry.

Total: ~58 seconds. If any line runs long, cut words from 02 — it is the least
load-bearing.

---

## 2. Record the B-roll (10 min)

Use **OBS** (free) or **Windows Game Bar** (`Win` + `G`). 1920×1080, 30 or 60 fps,
browser at 100% zoom, bookmarks bar hidden, `http://localhost:3000`.

Record **one clip per section**, each 10–15 seconds. Scroll slowly and steadily —
slow scrolling reads as expensive; fast scrolling reads as amateur. Pause half a
second at each section so you have handles to cut on.

| Clip | Where | What to capture |
| --- | --- | --- |
| `a` | Landing hero | The pixel portrait dissolving into the agent card. Start on black. |
| `b` | Statement section | The background going black → emerald as the lines reveal. |
| `c` | Bento grid | The `45 → 0` access-key counter and the epoch strike-through. |
| `d` | Action rows | The mint / operate / sell diagrams. |
| `e` | `/app/market` | A listing card with price and treasury balance. |
| `f` | Standard section | The galaxy section and the `NEP-669` status bar. |

If the market is empty when you record, point `e` at an agent passport instead —
the MONEY panel does the same job.

---

## 3. Assemble (20 min)

Use **Clipchamp** — it is already on Windows 11, free, no watermark at 1080p, and
it needs no tutorial. **CapCut desktop** is the alternative if you want better text
presets.

1. New 1920×1080 project.
2. Drop `01.mp3` … `06.mp3` on the timeline so they play back to back.
3. Now lay visuals underneath, matching each audio block:

   | Audio | Visual |
   | --- | --- |
   | 01 | `a` — the morph |
   | 02 | `b` — the statement scroll |
   | 03 | `c` — the bento counters |
   | 04 | `d` — the action rows |
   | 05 | `e` — market or passport |
   | 06 | `f` — galaxy + NEP-669 |

4. Cut the start of each visual to the first syllable of its line. **Hard cuts
   only.** No cross-dissolves, no zoom transitions — the brand is squared-off and
   precise, and a dissolve makes it look like a Canva template.
5. Add on-screen text per block, bottom-left, mono font (Consolas or JetBrains
   Mono), uppercase, 32–40px, white:

   - `NFTS CAN'T ACT`
   - `AGENTS CAN. YOU CAN'T SELL ONE.`
   - `TOKEN = TITLE`
   - `ONE TRANSACTION`
   - `VERIFIED BEFORE YOU PAY`
   - `LIVE ON TESTNET · NEP-669`

6. Music: optional. If you use it, drop it to about -22 dB — it should be felt,
   not heard. YouTube Audio Library is free and safe.

Do **not** put the demo footage inside this. This is the cold open only. Export it,
then join it in front of the demo the backend dev sends you, with a one-second
black gap and a simple `DEMO` card if the tone shifts.

---

## 4. Export

- 1920×1080, 30 fps, H.264, ~10 Mbps
- Filename: `nivry-explainer.mp4`
- Watch it once at full screen **with sound off**. If the story does not land
  without audio, the text is doing too little.

---

## If you are out of time

Cut to 30 seconds: keep 01, 03, 05, 06. Drop 02 and 04. It still tells the whole
story — problem, mechanism, proof, call to action — and it takes ten minutes.

## Do not

- Do not use an AI video generator. Free tiers watermark, and generic AI b-roll
  under a dev-tool explainer reads as filler. Your own UI is the better footage.
- Do not narrate the contracts. Nobody watching a 60-second video wants to hear
  about epochs.
- Do not claim the agent writes poetry on chain, or that selling it un-copies the
  agent. Say: *you buy the identity and the money, not the brain.*
