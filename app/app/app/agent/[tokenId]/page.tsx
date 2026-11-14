import { Suspense } from "react";

import { Passport } from "@/components/app/passport";

/** `params` is a promise under Cache Components; awaiting it inside Suspense
 * keeps the route shell prerenderable. */
async function PassportRoute({
  params,
}: {
  params: Promise<{ tokenId: string }>;
}) {
  const { tokenId } = await params;
  return <Passport tokenId={tokenId} />;
}

export default function AgentPassportPage({
  params,
}: {
  params: Promise<{ tokenId: string }>;
}) {
  return (
    <Suspense
      fallback={
        <div className="mx-auto w-full max-w-6xl px-5 pt-8 sm:px-8">
          <div className="h-32 animate-pulse border border-line bg-panel" />
        </div>
      }
    >
      <PassportRoute params={params} />
    </Suspense>
  );
}
