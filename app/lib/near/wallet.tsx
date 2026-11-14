"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

import type { NearConnector } from "@hot-labs/near-connect";

export interface ContractCall {
  receiverId: string;
  methodName: string;
  args?: Record<string, unknown>;
  gas?: string;
  deposit?: string;
}

interface WalletContextValue {
  accountId: string | null;
  connecting: boolean;
  ready: boolean;
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
  /** Resolves with the wallet's execution outcome; callers narrow what they read. */
  signAndSend: (call: ContractCall) => Promise<unknown>;
  /** Plain NEAR transfer, e.g. topping up an agent treasury. */
  sendTransfer: (receiverId: string, deposit: string) => Promise<unknown>;
}

const WalletContext = createContext<WalletContextValue | null>(null);

/** 300 TGas — covers `create_agent`'s provisioning batch and its callback. */
const DEFAULT_GAS = "300000000000000";

/**
 * The connector is loaded from the browser only. Importing it during SSR pulls
 * in wallet-executor code that expects `window`, and the connector is useless
 * until a user clicks something anyway.
 */
let connectorPromise: Promise<NearConnector> | null = null;

function loadConnector(): Promise<NearConnector> {
  connectorPromise ??= import("@hot-labs/near-connect").then(
    ({ NearConnector }) =>
      new NearConnector({
        network: "testnet",
        features: { testnet: true },
        footerBranding: null,
      }),
  );
  return connectorPromise;
}

export function WalletProvider({ children }: { children: ReactNode }) {
  const [accountId, setAccountId] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [ready, setReady] = useState(false);
  const connectorRef = useRef<NearConnector | null>(null);

  useEffect(() => {
    let cancelled = false;

    const boot = async () => {
      try {
        const connector = await loadConnector();
        if (cancelled) return;

        connectorRef.current = connector;
        connector.on("wallet:signIn", ({ accounts }) => {
          setAccountId(accounts[0]?.accountId ?? null);
        });
        connector.on("wallet:signOut", () => setAccountId(null));

        try {
          const { accounts } = await connector.getConnectedWallet();
          if (!cancelled) setAccountId(accounts[0]?.accountId ?? null);
        } catch {
          // Nobody is connected. Not an error.
        }
      } finally {
        if (!cancelled) setReady(true);
      }
    };

    void boot();

    return () => {
      cancelled = true;
    };
  }, []);

  const connect = useCallback(async () => {
    setConnecting(true);
    try {
      const connector = connectorRef.current ?? (await loadConnector());
      await connector.connect();
      const { accounts } = await connector.getConnectedWallet();
      setAccountId(accounts[0]?.accountId ?? null);
    } finally {
      setConnecting(false);
    }
  }, []);

  const disconnect = useCallback(async () => {
    const connector = connectorRef.current ?? (await loadConnector());
    await connector.disconnect();
    setAccountId(null);
  }, []);

  const signAndSend = useCallback(async (call: ContractCall) => {
    const connector = connectorRef.current ?? (await loadConnector());
    const { wallet, accounts } = await connector.getConnectedWallet();

    if (accounts.length === 0) {
      throw new Error("Connect a wallet before signing.");
    }

    return wallet.signAndSendTransaction({
      signerId: accounts[0].accountId,
      receiverId: call.receiverId,
      actions: [
        {
          type: "FunctionCall",
          params: {
            methodName: call.methodName,
            args: call.args ?? {},
            gas: call.gas ?? DEFAULT_GAS,
            deposit: call.deposit ?? "0",
          },
        },
      ],
    });
  }, []);

  const sendTransfer = useCallback(async (receiverId: string, deposit: string) => {
    const connector = connectorRef.current ?? (await loadConnector());
    const { wallet, accounts } = await connector.getConnectedWallet();

    if (accounts.length === 0) {
      throw new Error("Connect a wallet before signing.");
    }

    return wallet.signAndSendTransaction({
      signerId: accounts[0].accountId,
      receiverId,
      actions: [{ type: "Transfer", params: { deposit } }],
    });
  }, []);

  const value = useMemo(
    () => ({
      accountId,
      connecting,
      ready,
      connect,
      disconnect,
      signAndSend,
      sendTransfer,
    }),
    [accountId, connecting, ready, connect, disconnect, signAndSend, sendTransfer],
  );

  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>;
}

export function useWallet(): WalletContextValue {
  const value = useContext(WalletContext);
  if (!value) throw new Error("useWallet must be used inside <WalletProvider>.");
  return value;
}
