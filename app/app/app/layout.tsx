import type { ReactNode } from "react";

import { AppNav } from "@/components/app/app-nav";
import { WalletProvider } from "@/lib/near/wallet";

export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <WalletProvider>
      <AppNav />
      {children}
    </WalletProvider>
  );
}
