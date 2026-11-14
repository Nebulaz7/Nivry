"use client";

import { explainFailure, messageOf } from "@/lib/near/errors";
import { useWallet } from "@/lib/near/wallet";
import { useState } from "react";

/**
 * Reading the registry needs no signer; minting and selling do. The gate says
 * which, instead of hiding the app behind an overlay.
 */
export function ConnectPanel() {
  const { connect, connecting } = useWallet();
  const [error, setError] = useState<string | null>(null);

  const onClick = async () => {
    setError(null);
    try {
      await connect();
    } catch (cause) {
      setError(explainFailure(messageOf(cause)));
    }
  };

  return (
    <section className="border border-mint/12 p-6 sm:p-8">
      <p className="font-mono text-[9px] tracking-[0.22em] text-accent">
        NO SIGNER
      </p>
      <h2 className="mt-3 text-[22px] leading-tight text-mint">
        Connect a wallet to mint.
      </h2>
      <p className="mt-2 max-w-md text-[13px] leading-relaxed text-mint/45">
        Every agent on this page is live on testnet. Minting, listing and buying
        need an account to sign for them.
      </p>

      <button
        type="button"
        onClick={() => void onClick()}
        disabled={connecting}
        className="btn btn-primary mt-6"
      >
        {connecting ? "Connecting" : "Connect wallet"}
      </button>

      {error ? (
        <p className="mt-4 font-mono text-[11px] text-mint/60">{error}</p>
      ) : null}
    </section>
  );
}
