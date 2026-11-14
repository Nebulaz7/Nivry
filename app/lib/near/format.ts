/** YoctoNEAR formatting. Everything goes through `bigint`; nothing is rounded in flight. */

const YOCTO_PER_NEAR = BigInt("1000000000000000000000000");

/** `3030000000000000000000000` → `"3.03"`. Returns `"—"` for junk input. */
export function formatNear(yocto: string | bigint, decimals = 2): string {
  let value: bigint;

  try {
    value = typeof yocto === "bigint" ? yocto : BigInt(yocto);
  } catch {
    return "—";
  }

  if (value < BigInt(0)) return "—";

  const scale = BigInt(10) ** BigInt(decimals);
  const scaled = (value * scale + YOCTO_PER_NEAR / BigInt(2)) / YOCTO_PER_NEAR;
  const whole = scaled / scale;

  if (decimals === 0) return whole.toString();

  const fraction = (scaled % scale).toString().padStart(decimals, "0");
  return `${whole}.${fraction}`;
}

/** `"3.03 NEAR"`. */
export function formatNearAmount(yocto: string | bigint, decimals = 2): string {
  return `${formatNear(yocto, decimals)} NEAR`;
}

/** `nearby.testnet` → `nearby…net`; full value when it is already short. */
export function shorten(value: string, head = 6, tail = 4): string {
  if (value.length <= head + tail + 1) return value;
  return `${value.slice(0, head)}…${value.slice(-tail)}`;
}

export function formatCount(value: number): string {
  return value.toLocaleString("en-US");
}

/** Two-digit id, for `AGENT #07`. */
export function formatTokenId(tokenId: string): string {
  return tokenId.padStart(2, "0");
}
