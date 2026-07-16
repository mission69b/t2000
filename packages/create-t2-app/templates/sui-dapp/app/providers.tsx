"use client";

import { SuiClientProvider, WalletProvider } from "@mysten/dapp-kit";
import { getJsonRpcFullnodeUrl } from "@mysten/sui/jsonRpc";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";

// dapp-kit's provider still wants a JSON-RPC client internally (it hasn't
// migrated to gRPC yet). It exists here ONLY to satisfy wallet-connect
// plumbing — every read THIS APP makes goes through SuiGrpcClient in
// app/api/balance/route.ts. Don't add useSuiClientQuery reads; JSON-RPC
// shuts down on mainnet the week of July 20, 2026.
const networks = {
  mainnet: { url: getJsonRpcFullnodeUrl("mainnet"), network: "mainnet" as const },
};

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => new QueryClient());

  return (
    <QueryClientProvider client={queryClient}>
      <SuiClientProvider networks={networks} defaultNetwork="mainnet">
        <WalletProvider autoConnect>{children}</WalletProvider>
      </SuiClientProvider>
    </QueryClientProvider>
  );
}
