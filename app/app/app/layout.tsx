import type { ReactNode } from "react";

import { AppNav } from "@/components/app/app-nav";
import { WalletProvider } from "@/lib/near/wallet";

export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <WalletProvider>
      <div className="flex min-h-dvh flex-col bg-canvas text-ink">
        <AppNav />
        <div className="flex-1">{children}</div>
      </div>
    </WalletProvider>
  );
}
