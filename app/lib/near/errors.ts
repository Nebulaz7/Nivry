/**
 * The contracts report failures as panic strings. Greying a button out is not an
 * answer, so known panics are translated; anything unrecognised is shown as-is.
 */

const EXPLANATIONS: Array<[match: string, copy: string]> = [
  [
    "attach exactly the published provisioning cost",
    "The deposit no longer matches the live mint cost. Refresh and try again.",
  ],
  [
    "expected_cost does not match the published provisioning cost",
    "The mint cost changed since this form was read. Refresh and try again.",
  ],
  [
    "attach exactly the listing price",
    "The price moved. Re-read the listing before signing.",
  ],
  ["expected_version is stale", "The agent changed since you looked. Refresh."],
  [
    "listing version does not match expected_version",
    "This listing was refreshed after you opened it.",
  ],
  [
    "expected_manifest_hash does not match the listed manifest",
    "The manifest you inspected is not the one listed.",
  ],
  ["agent is not listed", "This agent is no longer for sale."],
  ["agent is not locked", "Lock the agent before listing it."],
  ["the agent is no longer locked for sale", "The seller unlocked this agent."],
  ["seller cannot buy their own listing", "You already own this agent."],
  ["operation in flight", "An earlier payment is still settling. Try again shortly."],
  ["expired grant", "This executor grant has expired."],
  ["epoch", "Authority rotated. Reload before signing."],
];

export function messageOf(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

export function explainFailure(raw: string): string {
  const haystack = raw.toLowerCase();
  const hit = EXPLANATIONS.find(([match]) => haystack.includes(match.toLowerCase()));
  return hit ? hit[1] : raw;
}
