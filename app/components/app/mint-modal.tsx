"use client";

import {
  useEffect,
  useMemo,
  useState,
  type ChangeEvent,
  type ReactNode,
} from "react";

import { LifecycleBadge } from "@/components/app/lifecycle-badge";
import { explainFailure, messageOf } from "@/lib/near/errors";
import { formatNear, formatTokenId } from "@/lib/near/format";
import {
  MANIFEST_LIMITS,
  canonicalJson,
  emptyDraft,
  isDraftValid,
  manifestHash,
  sha256Hex,
  toManifest,
  validateDraft,
  type ManifestDraft,
} from "@/lib/near/manifest";
import type { Lifecycle } from "@/lib/near/types";
import {
  REGISTRY_ID,
  getAgentInfoSafe,
  getNextTokenId,
  getProvisioningCost,
  getTreasuryInfo,
} from "@/lib/near/views";
import { useWallet } from "@/lib/near/wallet";

const POLL_MS = 2500;

const YOCTO_PER_NEAR = BigInt("1000000000000000000000000");
const INITIAL_TREASURY = BigInt(3) * YOCTO_PER_NEAR;

const RUNTIME_HINTS = ["hermes", "openai", "claude", "codex"] as const;

type Step = "manifest" | "review" | "signing" | "provisioning";

const STEP_LABEL: Record<Step, string> = {
  manifest: "01 / MANIFEST",
  review: "02 / REVIEW",
  signing: "03 / SIGN",
  provisioning: "04 / PROVISION",
};

const PROVISION_COPY: Record<Lifecycle, string> = {
  provisioning:
    "Creating the treasury, deploying the wallet and minting the title. This is one batch and it finishes in a callback, so the title does not exist yet.",
  ready: "The title exists and the treasury is funded.",
  failed: "Provisioning failed. The deposit returns to the funder.",
  uncertain:
    "The batch landed uncertain. Reconcile this agent before using it — a refund next to a live treasury is exactly the double-spend to avoid.",
};

const INPUT =
  "w-full border border-mint/15 bg-transparent px-3 py-2 font-mono text-[12px] text-mint placeholder:text-mint/20 transition-colors focus:border-accent focus:outline-none";

interface MintModalProps {
  open: boolean;
  onClose: () => void;
  onReserved: (tokenId: string, name: string) => void;
}

/**
 * Mounted only while open, so every mint starts from a clean form without an
 * effect writing state back to its initial value.
 */
export function MintModal({ open, onClose, onReserved }: MintModalProps) {
  if (!open) return null;
  return <MintDialog onClose={onClose} onReserved={onReserved} />;
}

function MintDialog({
  onClose,
  onReserved,
}: Omit<MintModalProps, "open">) {
  const { signAndSend } = useWallet();

  const [step, setStep] = useState<Step>("manifest");
  const [draft, setDraft] = useState<ManifestDraft>(emptyDraft);
  const [cost, setCost] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [hashed, setHashed] = useState<{ canonical: string; value: string } | null>(
    null,
  );
  const [hashing, setHashing] = useState(false);
  const [reserved, setReserved] = useState<{ tokenId: string; name: string } | null>(
    null,
  );
  const [lifecycle, setLifecycle] = useState<Lifecycle | null>(null);
  const [balance, setBalance] = useState<string | null>(null);

  const errors = useMemo(() => validateDraft(draft), [draft]);
  const valid = isDraftValid(draft);

  const canonical = useMemo(
    () => (valid ? canonicalJson(toManifest(draft)) : ""),
    [draft, valid],
  );

  // Only ever trust a hash that was computed for the canonical bytes on screen.
  const hash = hashed && hashed.canonical === canonical ? hashed.value : null;

  // Read the live cost once. It is never hardcoded.
  useEffect(() => {
    let cancelled = false;

    getProvisioningCost()
      .then((value) => {
        if (!cancelled) setCost(value);
      })
      .catch((cause: unknown) => {
        if (!cancelled) setError(explainFailure(messageOf(cause)));
      });

    return () => {
      cancelled = true;
    };
  }, []);

  // Hashing is async and follows the form. Results for stale drafts are dropped
  // by the canonical-byte comparison above.
  useEffect(() => {
    if (!valid) return;

    const payload = canonicalJson(toManifest(draft));
    let cancelled = false;

    manifestHash(toManifest(draft))
      .then((value) => {
        if (!cancelled) setHashed({ canonical: payload, value });
      })
      .catch(() => {
        if (!cancelled) setHashed(null);
      });

    return () => {
      cancelled = true;
    };
  }, [draft, valid]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };

    window.addEventListener("keydown", onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
    };
  }, [onClose]);

  // Poll the reserved token until it settles. The dashboard keeps its own
  // tracker, so closing this modal does not strand the mint.
  useEffect(() => {
    if (!reserved) return;

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const tick = async () => {
      const info = await getAgentInfoSafe(reserved.tokenId);
      if (cancelled) return;

      if (info) {
        setLifecycle(info.lifecycle);

        if (info.lifecycle === "ready") {
          try {
            const treasury = await getTreasuryInfo(info.treasury_account_id);
            if (!cancelled) setBalance(treasury.balance_yocto);
          } catch {
            // The title is the fact; the balance is detail.
          }
          return;
        }

        if (info.lifecycle !== "provisioning") return;
      }

      timer = setTimeout(() => void tick(), POLL_MS);
    };

    void tick();

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [reserved]);

  const update = (field: keyof ManifestDraft) => (value: string) =>
    setDraft((current) => ({ ...current, [field]: value }));

  const onBundleFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setHashing(true);
    setError(null);

    try {
      const digest = await sha256Hex(await file.arrayBuffer());
      setDraft((current) => ({
        ...current,
        bundle_sha256: digest,
        name:
          current.name ||
          file.name.replace(/\.[^.]+$/, "").slice(0, MANIFEST_LIMITS.name),
      }));
    } catch (cause) {
      setError(
        `Could not hash the file. ${explainFailure(messageOf(cause))} Browsers only allow hashing on https or localhost.`,
      );
    } finally {
      setHashing(false);
      event.target.value = "";
    }
  };

  const submit = async () => {
    if (!cost || !valid) return;

    setError(null);
    setStep("signing");

    const manifest = toManifest(draft);

    try {
      // The id this transaction reserves. `create_agent` returns it, but not
      // every wallet surfaces a return value, so this is the fallback.
      const expectedTokenId = String(await getNextTokenId());

      const outcome = await signAndSend({
        receiverId: REGISTRY_ID,
        methodName: "create_agent",
        args: { manifest, expected_cost: cost },
        deposit: cost,
      });

      const tokenId = tokenIdFromOutcome(outcome) ?? expectedTokenId;

      setReserved({ tokenId, name: manifest.name });
      setLifecycle("provisioning");
      setStep("provisioning");
      onReserved(tokenId, manifest.name);
    } catch (cause) {
      setError(explainFailure(messageOf(cause)));
      setStep("review");
    }
  };

  const storageShare = cost ? safeSubtract(cost, INITIAL_TREASURY) : null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/70 p-4 backdrop-blur-sm sm:items-center"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="mint-title"
        onClick={(event) => event.stopPropagation()}
        className="my-auto w-full max-w-2xl border border-accent/35 bg-void shadow-[0_30px_80px_-20px_rgba(0,0,0,0.9)]"
      >
        <header className="flex items-start justify-between gap-4 border-b border-mint/10 px-5 py-4 sm:px-6">
          <div>
            <h2
              id="mint-title"
              className="font-mono text-[10px] tracking-[0.24em] text-accent"
            >
              MINT AGENT
            </h2>
            <p className="mt-1.5 font-mono text-[10px] tracking-[0.14em] text-mint/35">
              {STEP_LABEL[step]}
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="-mr-1 -mt-1 p-2 font-mono text-[14px] leading-none text-mint/40 transition-colors hover:text-mint"
          >
            ✕
          </button>
        </header>

        <div className="max-h-[calc(100dvh-12rem)] overflow-y-auto px-5 py-5 sm:px-6">
          {step === "manifest" ? (
            <div className="grid gap-4 sm:grid-cols-2">
              <Field id="name" label="NAME" error={errors.name}>
                <input
                  id="name"
                  value={draft.name}
                  onChange={(event) => update("name")(event.target.value)}
                  placeholder="Docs Reporter"
                  maxLength={MANIFEST_LIMITS.name}
                  className={INPUT}
                />
              </Field>

              <Field id="runtime_hint" label="RUNTIME" error={errors.runtime_hint}>
                <input
                  id="runtime_hint"
                  value={draft.runtime_hint}
                  onChange={(event) => update("runtime_hint")(event.target.value)}
                  placeholder="hermes"
                  maxLength={MANIFEST_LIMITS.runtime_hint}
                  className={INPUT}
                />
                <div className="mt-1.5 flex flex-wrap gap-1">
                  {RUNTIME_HINTS.map((hint) => (
                    <button
                      key={hint}
                      type="button"
                      onClick={() => update("runtime_hint")(hint)}
                      className="border border-mint/15 px-1.5 py-0.5 font-mono text-[9px] tracking-[0.12em] text-mint/40 transition-colors hover:border-accent/50 hover:text-accent"
                    >
                      {hint.toUpperCase()}
                    </button>
                  ))}
                </div>
              </Field>

              <Field id="task_kind" label="TASK KIND" error={errors.task_kind}>
                <input
                  id="task_kind"
                  value={draft.task_kind}
                  onChange={(event) => update("task_kind")(event.target.value)}
                  placeholder="docs_report_v1"
                  maxLength={MANIFEST_LIMITS.task_kind}
                  className={INPUT}
                />
              </Field>

              <Field
                id="manifest_uri"
                label="MANIFEST URI"
                error={errors.manifest_uri}
              >
                <input
                  id="manifest_uri"
                  value={draft.manifest_uri}
                  onChange={(event) => update("manifest_uri")(event.target.value)}
                  placeholder="https://…/bundle.tar.gz"
                  maxLength={MANIFEST_LIMITS.manifest_uri}
                  className={INPUT}
                />
              </Field>

              <div className="sm:col-span-2">
                <Field
                  id="bundle_sha256"
                  label="BUNDLE SHA-256"
                  error={errors.bundle_sha256}
                  hint="Hash the bundle you publish, or paste a lowercase hex digest."
                >
                  <div className="flex gap-2">
                    <input
                      id="bundle_sha256"
                      value={draft.bundle_sha256}
                      onChange={(event) =>
                        update("bundle_sha256")(event.target.value.toLowerCase())
                      }
                      placeholder="64 lowercase hex characters"
                      maxLength={MANIFEST_LIMITS.bundle_sha256}
                      spellCheck={false}
                      className={INPUT}
                    />
                    <label className="btn btn-secondary btn-sm shrink-0 cursor-pointer">
                      {hashing ? "Hashing" : "Hash file"}
                      <input
                        type="file"
                        onChange={(event) => void onBundleFile(event)}
                        className="sr-only"
                      />
                    </label>
                  </div>
                </Field>
              </div>

              <div className="sm:col-span-2">
                <Field
                  id="description"
                  label="DESCRIPTION"
                  error={errors.description}
                >
                  <textarea
                    id="description"
                    value={draft.description}
                    onChange={(event) => update("description")(event.target.value)}
                    rows={2}
                    maxLength={MANIFEST_LIMITS.description}
                    placeholder="What this agent does."
                    className={`${INPUT} resize-none`}
                  />
                </Field>
              </div>

              <div className="border border-mint/12 p-3 sm:col-span-2">
                <div className="flex items-center justify-between gap-3">
                  <span className="font-mono text-[9px] tracking-[0.18em] text-mint/35">
                    MANIFEST HASH
                  </span>
                  <span className="font-mono text-[10px] text-accent/80">
                    {hash
                      ? `${hash.slice(0, 16)}…${hash.slice(-8)}`
                      : hashing
                        ? "hashing…"
                        : "—"}
                  </span>
                </div>
                {canonical ? (
                  <pre className="mt-2 max-h-24 overflow-auto whitespace-pre-wrap break-all font-mono text-[10px] leading-relaxed text-mint/25">
                    {canonical}
                  </pre>
                ) : null}
              </div>
            </div>
          ) : null}

          {step === "review" ? (
            <div>
              <dl className="divide-y divide-mint/10 border border-mint/12">
                <Row label="NAME" value={draft.name} />
                <Row label="RUNTIME" value={draft.runtime_hint} />
                <Row label="TASK" value={draft.task_kind} />
                <Row label="URI" value={draft.manifest_uri} />
                <Row label="BUNDLE" value={`${draft.bundle_sha256.slice(0, 16)}…`} />
                <Row label="MANIFEST" value={hash ? `${hash.slice(0, 16)}…` : "—"} />
              </dl>

              <div className="mt-4 grid gap-4 border border-accent/25 p-4 sm:grid-cols-2">
                <div>
                  <p className="font-mono text-[9px] tracking-[0.18em] text-mint/35">
                    ATTACHED DEPOSIT
                  </p>
                  <p className="mt-1.5 font-mono text-[22px] leading-none text-mint">
                    {cost ? `${formatNear(cost)} NEAR` : "—"}
                  </p>
                </div>
                <div className="font-mono text-[10px] leading-relaxed text-mint/35">
                  <p>3.00 NEAR treasury stake</p>
                  <p>
                    {storageShare
                      ? `${formatNear(storageShare, 3)} NEAR registry storage`
                      : "—"}
                  </p>
                </div>
              </div>

              <p className="mt-3 font-mono text-[10px] leading-relaxed text-mint/30">
                Exact deposit, read live from provisioning_cost(). The treasury is
                created without a key.
              </p>
            </div>
          ) : null}

          {step === "signing" ? (
            <div className="py-8 text-center">
              <p className="font-mono text-[11px] tracking-[0.16em] text-accent">
                WAITING FOR SIGNATURE
              </p>
              <p className="mt-3 text-[13px] text-mint/40">
                Approve the transaction in your wallet.
              </p>
            </div>
          ) : null}

          {step === "provisioning" && reserved ? (
            <div className="py-2">
              <div className="flex items-center justify-between gap-3">
                <p className="font-mono text-[9px] tracking-[0.22em] text-accent">
                  RESERVED
                </p>
                <LifecycleBadge lifecycle={lifecycle ?? "provisioning"} />
              </div>

              <p className="mt-3 font-mono text-[40px] leading-none text-mint">
                #{formatTokenId(reserved.tokenId)}
              </p>

              <p className="mt-4 max-w-md text-[13px] leading-relaxed text-mint/45">
                {PROVISION_COPY[lifecycle ?? "provisioning"]}
              </p>

              {balance ? (
                <p className="mt-4 font-mono text-[10px] tracking-[0.14em] text-mint/50">
                  TREASURY {formatNear(balance)} NEAR
                </p>
              ) : null}

              <p className="mt-6 font-mono text-[10px] text-mint/25">
                Closing this keeps the tracker running on the dashboard.
              </p>
            </div>
          ) : null}

          {error ? (
            <p className="mt-4 border border-mint/15 px-3 py-2 font-mono text-[11px] leading-relaxed text-mint/70">
              {error}
            </p>
          ) : null}
        </div>

        <footer className="flex items-center justify-between gap-3 border-t border-mint/10 px-5 py-4 sm:px-6">
          <button
            type="button"
            onClick={() => setStep("manifest")}
            disabled={step === "manifest" || step === "signing" || step === "provisioning"}
            className="btn btn-secondary btn-sm"
          >
            Back
          </button>

          {step === "manifest" ? (
            <button
              type="button"
              onClick={() => setStep("review")}
              disabled={!valid || !cost || hash === null}
              className="btn btn-primary btn-sm"
            >
              Continue
            </button>
          ) : null}

          {step === "review" ? (
            <button
              type="button"
              onClick={() => void submit()}
              disabled={!valid || !cost}
              className="btn btn-primary btn-sm"
            >
              Sign and mint
            </button>
          ) : null}

          {step === "signing" ? (
            <button type="button" disabled className="btn btn-primary btn-sm">
              Signing
            </button>
          ) : null}

          {step === "provisioning" ? (
            <button type="button" onClick={onClose} className="btn btn-primary btn-sm">
              Close
            </button>
          ) : null}
        </footer>
      </div>
    </div>
  );
}

function Field({
  id,
  label,
  hint,
  error,
  children,
}: {
  id: string;
  label: string;
  hint?: string;
  error?: string;
  children: ReactNode;
}) {
  return (
    <div>
      <label
        htmlFor={id}
        className="mb-1.5 block font-mono text-[9px] tracking-[0.18em] text-mint/40"
      >
        {label}
      </label>
      {children}
      {error ? (
        <p className="mt-1.5 font-mono text-[10px] leading-relaxed text-mint/60">
          {error}
        </p>
      ) : hint ? (
        <p className="mt-1.5 font-mono text-[10px] leading-relaxed text-mint/25">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4 px-3 py-2.5">
      <dt className="shrink-0 font-mono text-[9px] tracking-[0.18em] text-mint/35">
        {label}
      </dt>
      <dd className="truncate font-mono text-[11px] text-mint/75">{value}</dd>
    </div>
  );
}

function safeSubtract(cost: string, floor: bigint): bigint | null {
  try {
    const value = BigInt(cost) - floor;
    return value > BigInt(0) ? value : BigInt(0);
  } catch {
    return null;
  }
}

/** `create_agent` returns the token id; wallets do not always surface it. */
function tokenIdFromOutcome(outcome: unknown): string | null {
  const status = (outcome as { status?: unknown } | null)?.status;
  if (!status || typeof status !== "object") return null;

  const successValue = (status as { SuccessValue?: unknown }).SuccessValue;
  if (typeof successValue !== "string" || successValue.length === 0) return null;

  try {
    const binary = atob(successValue);
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
    const parsed: unknown = JSON.parse(new TextDecoder().decode(bytes));
    return typeof parsed === "string" ? parsed : null;
  } catch {
    return null;
  }
}
