"use client";

import React, { FC, useMemo, useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

// Solana
import { ConnectionProvider, WalletProvider } from "@solana/wallet-adapter-react";
import { WalletModalProvider } from "@solana/wallet-adapter-react-ui";
import { PhantomWalletAdapter, SolflareWalletAdapter } from "@solana/wallet-adapter-wallets";
import "@solana/wallet-adapter-react-ui/styles.css";

// Wagmi (Ethereum)
import { WagmiProvider, createConfig, http } from "wagmi";
import { mainnet } from "wagmi/chains";
import { injected } from "wagmi/connectors";

const queryClient = new QueryClient();

const wagmiConfig = createConfig({
    chains: [mainnet],
    connectors: [injected()],
    transports: {
        [mainnet.id]: http(),
    },
});

export const Providers: FC<{ children: React.ReactNode }> = ({ children }) =>
{
    // Try to use a local or devnet endpoint for the demo; devnet for now
    const endpoint = "https://api.devnet.solana.com";

    const wallets = useMemo(
        () => [new PhantomWalletAdapter(), new SolflareWalletAdapter()],
        []
    );

    return (
        <WagmiProvider config={wagmiConfig}>
            <QueryClientProvider client={queryClient}>
                <ConnectionProvider endpoint={endpoint}>
                    <WalletProvider wallets={wallets} autoConnect>
                        <WalletModalProvider>{children}</WalletModalProvider>
                    </WalletProvider>
                </ConnectionProvider>
            </QueryClientProvider>
        </WagmiProvider>
    );
};
