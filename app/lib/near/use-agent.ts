"use client";

import { useCallback, useEffect, useState } from "react";

import type { AgentInfo, TreasuryInfo } from "./types";
import { getAgentInfoSafe, getTreasuryInfo } from "./views";

/**
 * Reads one agent plus its treasury, and keeps polling while provisioning is
 * still settling. `refresh()` re-runs the read after an action.
 */
export function useAgent(tokenId: string) {
  const [info, setInfo] = useState<AgentInfo | null>(null);
  const [treasury, setTreasury] = useState<TreasuryInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);

  const refresh = useCallback(() => setRevision((value) => value + 1), []);

  useEffect(() => {
    if (!tokenId) return;

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const load = async () => {
      const next = await getAgentInfoSafe(tokenId);
      if (cancelled) return;

      if (!next) {
        setError("No agent with that token id.");
        return;
      }

      setInfo(next);
      setError(null);

      try {
        const nextTreasury = await getTreasuryInfo(next.treasury_account_id);
        if (!cancelled) setTreasury(nextTreasury);
      } catch {
        if (!cancelled) setTreasury(null);
      }

      if (next.lifecycle === "provisioning") {
        timer = setTimeout(() => void load(), 3000);
      }
    };

    void load();

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [tokenId, revision]);

  return { info, treasury, error, refresh };
}
