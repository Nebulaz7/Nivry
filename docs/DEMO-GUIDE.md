# Demo video: what to do, in order

You are recording three things: **mint an agent**, **look at it**, **buy one**. That
is the whole video. Aim for 3–4 minutes.

You do not need to understand the contracts. You need a testnet wallet with a few
NEAR in it, and the app URL from me.

---

## 0. Setup (do this before you hit record)

1. **Install Meteor Wallet** (browser extension):
   <https://meteorwallet.app/>
   Create a new wallet, switch the network selector to **Testnet**, copy the
   `xxxx.testnet` account id.
2. **Get testnet NEAR** from the faucet:
   <https://docs.near.org/getting-started/faucet>
   Paste your `xxxx.testnet` account id and claim. You need at least **5 NEAR**
   (3.03 to mint, plus a listing price later).
3. Open the app: **the URL I send you** (local: `http://localhost:3000`).
4. Click **Connect** (top right) → pick **Meteor** → approve.
   The button turns into your shortened account id. If it does not, the wallet is
   on mainnet — switch it to Testnet and reconnect.
5. Create a small text file on your desktop, e.g. `poet-prompt.txt`, containing the
   agent's instructions:

   ```
   You are a poet. Write one short poem about on-chain money.
   ```

   You will upload this during minting. This is the file you were missing — the
   mint form asks for its **hash**, and the form can compute that for you.

---

## 1. Mint the agent (~90 seconds)

On the dashboard (`/app`), press **Mint agent**. Fill it in exactly like this:

| Field | What to type | Why |
| --- | --- | --- |
| **NAME** | `Poet Machine` | Max 64 characters. Plain ASCII. |
| **RUNTIME** | click the `HERMES` chip | Which runtime runs the agent. 32 chars max. |
| **TASK KIND** | `poem_v1` | A label for what the agent does. 32 chars max. |
| **MANIFEST URI** | `https://raw.githubusercontent.com/Nebulaz7/Nivry/main/README.md` | Must start with `https://` or `ipfs://`. This is where the published bundle lives. |
| **BUNDLE SHA-256** | press **Hash file** → pick `poet-prompt.txt` | **This is the step that confused you.** The form hashes the file for you and fills in the 64-character digest. Do not type it by hand. |
| **DESCRIPTION** | `Writes short poems about on-chain money.` | Optional, max 256 characters. |

Rules the contract enforces, so the form will refuse otherwise: **no double quotes,
no backslashes, no emoji or curly quotes** anywhere. Use plain ASCII.

Watch the **MANIFEST HASH** box at the bottom of the form change as you type. That
hash is what a buyer later verifies. Point the cursor at it and say so.

Press **Continue** → the review screen shows the exact deposit, read live from the
chain: **3.03 NEAR** (3 NEAR funds the agent's treasury, 0.03 NEAR pays registry
storage).

Press **Sign and mint** → Meteor pops up → approve.

The modal moves to step 4 and shows `RESERVED #N` with a **PROVISIONING** badge.
This takes a few seconds. **Do not cut this away** — say out loud that the token is
being created, the treasury account is being deployed, and the title is minted in a
callback, which is why the screen says reserved and not minted yet. When it flips
to **READY**, close the modal.

---

## 2. Show the details (~60 seconds)

Open the new agent from the dashboard grid. This is the passport. Walk down it:

1. **Header** — agent number, name, `READY`, owner, treasury account id.
2. **MONEY** — the big number is the treasury balance, **3.00 NEAR**. Under it,
   *spendable* vs *reserved*: most of that balance is storage stake and can never be
   withdrawn. The agent can actually spend about 0.14 NEAR. This is honest and it is
   a good thing to say out loud.
3. **AUTHORITY** — epoch, nonce, and "No executor installed. The treasury cannot
   spend until one is granted." You do not need to install one.
4. **MARKET** — version, lock state `OPEN`.
5. **RECORD** — the manifest you minted and its hash.

Then, for the proof shot: open
`https://explorer.testnet.near.org/accounts/<the treasury id from the header>`
and show **"Account is locked (no access keys)"**. That is the claim the whole
project rests on: the treasury has no key anyone can use.

---

## 3. Buy the listed agent (~90 seconds)

I will list **agent #2** on the market before you record. It will not be yours.

1. Go to **MARKET** in the top nav.
2. The card shows the price, the agent's **treasury balance**, its version and the
   seller. Point out that the price is not the whole offer — the balance comes with
   it.
3. Press **Buy**. The button shows **Checking** first: the app re-reads the agent
   from chain and aborts if the version or manifest moved since the page loaded.
   That is the anti-bait-and-switch guard. Mention it.
4. Meteor pops up with the exact price. Approve.
5. You get a green notice: `Agent #2 is yours. The treasury came with it.`
6. Go back to **AGENTS** — the agent is now at the top with a `YOURS` badge.
7. Open it and show that the **owner changed to you**, the treasury balance is
   intact, the epoch went up, and ownership changes now reads `1`.

---

## Things that will go wrong, and the fix

| Symptom | Fix |
| --- | --- |
| Red box: *Could not reach rpc.testnet.near.org* | Your network is blocking that host. Tell me and I will switch the app to the fallback RPC — it already has one. |
| **Buy** is disabled and says *Your listing* | You are logged in as the seller. You must be on a different account than mine. |
| **Buy** is disabled and says *Connect to buy* | Wallet not connected. Top right. |
| Wallet modal shows MyNearWallet | Pick **Meteor** instead. MyNearWallet's dapp login is broken on testnet. |
| Transaction rejected: *attach exactly the published provisioning cost* | The cost changed while the form was open. Close the modal, reopen it, do not edit the amount. |
| Faucet says you already claimed | Use a second `xxxx.testnet` account, or ask me to send you NEAR. |
| Form refuses a field | Non-ASCII character. Emoji, curly quotes, or a backslash. Retype in plain ASCII. |

---

## Recording notes

- 1080p, browser at 100% zoom, bookmarks bar hidden.
- No music. Narrate, or type short captions — whichever you are faster at.
- Cut any wait longer than ~5 seconds, but **keep one provisioning wait** so the
  async mint is visible. That is the part judges remember.
- Do not edit the deposit field anywhere. Every amount is read from the chain and
  must be attached exactly.

## What not to claim

Do not say the agent writes the poem on chain, and do not say the agent is
"un-copyable". The token controls the **treasury and the title**, not the model.
If you are stuck for a line: *"You buy the identity and the money. You do not buy
the brain, and you cannot revoke a copy of it."*
