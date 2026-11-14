# NIVRY: 60-Second Demo Video

**Format:** 16:9, 1080p, 30fps. Screen capture of the web UI, terminal/CLI, and NEAR Explorer is the hero, with clean live-action/POV framing.  
**VO pace:** ~145 words, brisk, technical, confident, and direct. Record VO separately and cut visuals to the voice track.

## Visual system

| Element | Spec |
|---|---|
| Background | Deep Void `#0A0E17` |
| Text | Crisp Off-white `#F8FAFC` |
| Green / Verified | Emerald `#10B981` |
| Amber / Pending | Warm Amber `#F59E0B` |
| Red / Rejected | Vivid Red `#EF4444` |
| Brand accent | Electric NEAR Teal `#00EC97`, used for brand marks, active epochs, and verified hashes |
| Headline type | Bold geometric sans (Inter Display / Satoshi), tight tracking |
| Data type | Monospace (JetBrains Mono) for NEAR accounts (`*.testnet`), `authority_epoch`, token IDs, tx hashes |
| Rule | Red appears strictly when an unauthorized transaction is blocked or revoked. |

---

## SCENE 1: The Hook (0:00–0:07)

**Visual:** Pitch-black screen. A high-contrast terminal window snaps in. A single prompt cursor blinks. A transfer transaction completes: `NFT #1 transferred to buyer.testnet`. Below it, a line blinks in red monospace: `treasury balance: 0 NEAR`.  
**Camera:** Slow push-in (5%) directly toward the zero balance.  
**Sound:** Low room tone, one sharp digital sub-bass drop.  
**On-screen text:** Types character-by-character in the lower third: `Access Key Count: 1 (seller.testnet)`. Beat. Flashes red.

> **VO:** "You just bought an autonomous AI agent NFT. And five seconds later, the seller’s script drained its treasury."

**Cut:** Hard cut on the word "drained".

---

## SCENE 2: The Problem (0:07–0:14)

**Visual:** Split screen. Left: standard wallet with lingering private keys and admin backdoors. Right: Nivry’s architecture diagram highlighting an immutable registry pointing to a child treasury with zero access keys.  
**Camera:** Overhead flat perspective. A red cross out appears over the seller's leftover signing key on the left.  
**On-screen text:** Bold white headline slams in: **"An agent identity with a backdoored wallet."**  
**Sound:** Low rhythmic pulse. Metallic lock snap on the right side.

> **VO:** "Most agent NFTs are just metadata badges. If the creator keeps a private key, ownership transfer is an illusion."

---

## SCENE 3: Keyless Provisioning → Locked Release (0:14–0:24)

**Visual:** Over-the-shoulder POV to crisp screen capture of the Nivry UI. Mint an agent NFT (`agent-01.testnet`). As the registry deploys the child treasury, the inspector runs live RPC checks: `access_keys: 0` and `wallet_code_hash: MATCH`.  
**Camera:** Smooth punch-in on the inspection card.  
**On-screen text:**
- Mono pill: `RPC: view_access_key_list → 0 keys`
- Badge transition: Amber `PROVISIONING` → Glowing Emerald `LOCKED RELEASE`
- Latency stamp: `~1.8s testnet finality`

**Sound:** Light keystrokes, followed by an emerald confirmation chime.

> **VO:** "Nivry deploys a permanent, keyless NEAR treasury per NFT. No master keys. No upgrade backdoors. Verified on-chain."

---

## SCENE 4: Bounded Task & Customer Payment (0:24–0:34)

**Visual:** Fast two-part split. Top: Hermes runtime executes a deterministic documentation task (`docs_report_v1`). Bottom: a customer pays the treasury via `pay_agent`. The passport instantly logs the incoming service revenue and updates the spendable balance. The authorized executor dispatches a bounded native payout within its daily cap.  
**Camera:** Quick horizontal tracking wipe across the passport metrics.  
**On-screen text:**
- Transaction badge: `pay_agent: +10 NEAR (Finalized)`
- Bounded Grant: `Epoch: 1 · Cap: 2 NEAR · Status: Active`

**Sound:** Rapid data ticks, clean acoustic tick on confirmation.

> **VO:** "The agent earns revenue and spends within strict, on-chain operator bounds under Epoch 1."

---

## SCENE 5: The Sale & The Stale Executor Slam (0:34–0:48) ⭐ *the money shot*

**Visual:** Full-screen Marketplace view. Buyer clicks **Buy Now**. The registry executes the sale in a single atomic receipt: NFT title changes, seller is credited, and `authority_epoch` increments from `1 → 2`.  
Immediately cut to terminal: Seller’s background automated bot attempts another payout using its old key.  
**Everything stops.** A giant crimson banner slams across the screen: `PANIC: UnauthorizedExecutor (Epoch Mismatch: Expected 2, Got 1)`. The treasury funds remain 100% untouched.  
**Camera:** Micro screen shake (2 frames) on the transaction rejection. Cut back to UI as the buyer installs a fresh executor for Epoch 2 with an instant green tick.  
**On-screen text:**
- Atomic swap: `Owner: buyer.testnet · Authority Epoch: 2`
- Red failure banner: `execute_payment: REJECTED (Epoch 1 Revoked)`
- Green confirmation: `Epoch 2 Executor: AUTHORIZED`

**Sound:** Music cuts dead on the seller's rejection. Deep mechanical thud, followed by a crisp rising electronic tone when the buyer's executor succeeds.

> **VO:** "The buyer purchases the agent. The treasury and funds stay. The seller's bot attempts a payout—and hits a wall. Epoch 2 revoked them automatically."

---

## SCENE 6: Close (0:48–1:00)

**Visual:** Split view resolving into a sleek dark finish: on the left, the live CLI terminal showing all 5 checks passing (`npm run demo`); on the right, the Nivry Passport showing the permanent treasury address and immutable code hash. Fade to deep void.  
**Camera:** Slow pull-back into a clean, minimalist title card.

**On-screen text, in order:**
1. (0:50) Mid-screen honesty line: *"We don't claim an NFT proves intelligence. We prove the treasury, the keyless contract, and the on-chain revocation."*
2. (0:55) End card fades up:  
   **NIVRY** (large, white)  
   *Transferable Agent Identity with Keyless Custody* (electric teal)  
   Below: `NEAR Testnet · Rust WASM · NEP-171 Extension`

**Sound:** Resolving synth pad fading into clean silence on the final beat.

> **VO:** "Don't trust off-chain promises with an agent's money box. Nivry: verifiable economic handover on NEAR."

---

## Timing check

| Time | Beat | VO words (approx.) |
|---|---|---|
| 0:00–0:07 | Hook: The Drained Treasury | 17 |
| 0:07–0:14 | Problem: Key Backdoors & Fake Custody | 18 |
| 0:14–0:24 | Provisioning: 0 Access Keys & Locked Release | 19 |
| 0:24–0:34 | Execution: Customer Payment & Bounded Spend | 16 |
| 0:34–0:48 | The Money Shot: Epoch Increment & Seller Rejection | 34 |
| 0:48–1:00 | Close: Honest Positioning & End Card | 23 |

**Total:** ~127 words, leaving ample room for sound design, the rejection pause, and on-screen code inspection.

## Production tips for the demo

1. **Use the real CLI demo output:** Run `node packages/cli/dist/index.js demo 1` in Scene 6 to display authentic terminal verification checks.
2. **Pre-record the testnet rejection:** Keep the receipt hash for the failed transaction (`PANIC: UnauthorizedExecutor`) handy so you don't depend on live network latency during editing.
3. **Keep the honesty disclaimer:** Judges reward agents and teams that explicitly differentiate between off-chain execution claims and on-chain custody guarantees.
