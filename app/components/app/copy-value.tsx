"use client";

import { useState } from "react";

export function CopyValue({ value, label = "value" }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1400);
    } catch {
      setCopied(false);
    }
  };

  return (
    <button
      type="button"
      onClick={copy}
      aria-label={`Copy ${label}`}
      className="shrink-0 font-mono text-[9px] uppercase tracking-[0.14em] text-dim transition-colors hover:text-accent"
    >
      {copied ? "copied" : "copy"}
    </button>
  );
}
