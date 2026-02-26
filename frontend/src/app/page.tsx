"use client";

import { useEffect, useState } from "react";
import { useAccount, useConnect, useDisconnect } from "wagmi";
import { injected } from "wagmi/connectors";
import { useWallet } from "@solana/wallet-adapter-react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import { formatEther } from "viem";
import { Skull, Pickaxe, Flame, ArrowRight, CheckCircle2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

// Mocks
const MOCK_DEAD_ASSETS = [
  { id: "poap-4839", name: "NYC Meetup 2021", type: "Expired POAP", date: "Oct 2021", isDead: true },
  { id: "dao-0x52f", name: "RuggedDAO Gov", type: "ERC-20 Token", date: "Jan 2022", isDead: true },
  { id: "nft-9192", name: "EtherSouls #441", type: "Abandoned NFT", date: "Mar 2022", isDead: true },
];

export default function Home()
{
  const { address, isConnected } = useAccount();
  const { connect, connectors } = useConnect();
  const { disconnect } = useDisconnect();

  const solanaWallet = useWallet();

  const [scanning, setScanning] = useState(false);
  const [assets, setAssets] = useState<typeof MOCK_DEAD_ASSETS>([]);

  // Bridge State
  const [selectedAsset, setSelectedAsset] = useState<string | null>(null);
  const [bridging, setBridging] = useState(false);
  const [bridgeProgress, setBridgeProgress] = useState(0);
  const [bridgeStatus, setBridgeStatus] = useState("");
  const [resurrected, setResurrected] = useState(false);

  useEffect(() =>
  {
    if (isConnected && address) {
      setScanning(true);
      // Mock scanning delay
      setTimeout(() =>
      {
        setAssets(MOCK_DEAD_ASSETS);
        setScanning(false);
      }, 2500);
    } else {
      setAssets([]);
    }
  }, [isConnected, address]);

  const handleResurrect = async (id: string) =>
  {
    if (!solanaWallet.connected) {
      alert("Please connect Solana wallet first to receive the resurrected asset!");
      return;
    }

    setSelectedAsset(id);
    setBridging(true);
    setBridgeProgress(10);
    setBridgeStatus("⚰️ Digging from Ethereum grave...");

    // Simulated Bridge Flow
    await new Promise(r => setTimeout(r, 1500));
    setBridgeProgress(40);
    setBridgeStatus("🌉 Approving crossing via Sunrise Bridge...");

    await new Promise(r => setTimeout(r, 2000));
    setBridgeProgress(75);
    setBridgeStatus("🔥 Passing soul through the Wormhole...");

    await new Promise(r => setTimeout(r, 2000));
    setBridgeProgress(95);
    setBridgeStatus("☀️ Rising on Solana! Minting KYD Ticket...");

    await new Promise(r => setTimeout(r, 1500));
    setBridgeProgress(100);
    setBridgeStatus("✅ Resurrected Successfully!");

    setTimeout(() =>
    {
      setBridging(false);
      setResurrected(true);
      setAssets(assets.filter(a => a.id !== id));
    }, 1500);
  };

  return (
    <main className="container mx-auto max-w-5xl px-4 py-12 flex flex-col items-center">

      {/* Header */}
      <div className="text-center mb-16 space-y-4">
        <div className="flex justify-center mb-6">
          <div className="p-4 bg-zinc-900 border border-zinc-800 rounded-2xl shadow-2xl flex items-center gap-4">
            <span className="text-4xl">☠️</span>
            <ArrowRight className="w-8 h-8 text-zinc-500" />
            <span className="text-4xl">🌅</span>
          </div>
        </div>
        <h1 className="text-5xl md:text-7xl font-black bg-gradient-to-br from-zinc-100 via-zinc-400 to-zinc-800 text-transparent bg-clip-text">
          GraveShift
        </h1>
        <p className="text-xl text-zinc-400 max-w-2xl mx-auto">
          Ethereum's graveyard is full. Resurrect your dead assets — expired POAPs, rugged NFTs, dead DAOs — and bring them to life on Solana.
        </p>
      </div>

      <div className="grid md:grid-cols-2 gap-8 w-full mb-12">
        {/* Ethereum Section */}
        <Card className="bg-zinc-950 border-zinc-900 shadow-2xl relative overflow-hidden group">
          <div className="absolute inset-0 bg-gradient-to-br from-blue-900/10 to-transparent opacity-50" />
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-zinc-300">
              <span className="text-blue-400">⟠</span> Ethereum Graveyard
            </CardTitle>
            <CardDescription className="text-zinc-500">
              Connect to scan your wallet for forgotten assets to migrate.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {!isConnected ? (
              <Button
                variant="outline"
                className="w-full bg-blue-950/20 border-blue-900/50 hover:bg-blue-900/40 text-blue-300"
                onClick={() => connect({ connector: connectors[0] })}
              >
                Connect Ethereum Wallet
              </Button>
            ) : (
              <div className="space-y-4">
                <div className="flex items-center justify-between text-sm bg-zinc-900 p-3 rounded-lg border border-zinc-800">
                  <span className="text-zinc-400">Connected</span>
                  <span className="font-mono text-zinc-300">
                    {address?.slice(0, 6)}...{address?.slice(-4)}
                  </span>
                  <Button variant="ghost" size="sm" onClick={() => disconnect()} className="h-6 text-xs text-red-400 hover:text-red-300 hover:bg-red-950/30">Disconnect</Button>
                </div>

                {scanning && (
                  <div className="flex flex-col items-center justify-center py-8 text-zinc-500 gap-3">
                    <RefreshCw className="w-6 h-6 animate-spin text-zinc-600" />
                    <span>Scanning tombstones...</span>
                  </div>
                )}

                {!scanning && assets.length > 0 && (
                  <div className="space-y-3">
                    {assets.map((asset) => (
                      <div key={asset.id} className="flex flex-col p-3 bg-zinc-900/50 border border-zinc-800 rounded-lg group-hover:border-zinc-700 transition-colors">
                        <div className="flex justify-between items-start mb-2">
                          <div>
                            <h4 className="font-medium text-zinc-200">{asset.name}</h4>
                            <p className="text-xs text-zinc-500">{asset.type} • Died {asset.date}</p>
                          </div>
                          <Skull className="w-5 h-5 text-zinc-600" />
                        </div>
                        <Button
                          onClick={() => handleResurrect(asset.id)}
                          size="sm"
                          className="w-full bg-emerald-900/20 text-emerald-400 hover:bg-emerald-900/40 hover:text-emerald-300 border border-emerald-900/50 transition-all font-medium"
                        >
                          <Pickaxe className="w-4 h-4 mr-2" /> Resurrect Asset
                        </Button>
                      </div>
                    ))}
                  </div>
                )}

                {!scanning && assets.length === 0 && (
                  <div className="text-center py-8 text-zinc-500">
                    No dead assets found in this wallet.
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Solana Section */}
        <Card className="bg-zinc-950 border-zinc-900 shadow-2xl relative overflow-hidden group">
          <div className="absolute inset-0 bg-gradient-to-bl from-purple-900/10 to-transparent opacity-50" />
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-zinc-300">
              <span className="text-purple-400">◎</span> Solana Afterlife
            </CardTitle>
            <CardDescription className="text-zinc-500">
              Where your assets are reborn. Connect target wallet.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col h-full">
            <div className="mb-6">
              <WalletMultiButton style={{ backgroundColor: "rgba(88, 28, 135, 0.2)", border: "1px solid rgba(147, 51, 234, 0.3)", borderRadius: "0.5rem", width: "100%", justifyContent: "center", color: "#d8b4fe", transition: "all 0.2s" }} />
            </div>

            {resurrected && (
              <div className="flex-1 flex flex-col items-center justify-center p-6 bg-emerald-950/20 border border-emerald-900/50 rounded-xl text-center space-y-4 animate-in fade-in zoom-in duration-500">
                <div className="w-16 h-16 bg-emerald-900/30 rounded-full flex items-center justify-center">
                  <Flame className="w-8 h-8 text-emerald-400" />
                </div>
                <div>
                  <h3 className="text-emerald-300 font-bold text-lg">Resurrected Soul #001</h3>
                  <p className="text-emerald-400/70 text-sm">KYD Ticket Minted</p>
                </div>
                <Button className="bg-white text-black hover:bg-zinc-200 font-bold w-full rounded-full">
                  Share Blink ☠️→🌅
                </Button>
              </div>
            )}

            {!resurrected && solanaWallet.connected && (
              <div className="flex-1 flex flex-col items-center justify-center py-12 text-zinc-600 text-center border border-dashed border-zinc-800 rounded-xl">
                <span className="text-3xl mb-2">👻</span>
                <p>Awaiting souls to resurrect...</p>
              </div>
            )}

            {!resurrected && !solanaWallet.connected && (
              <div className="flex-1" />
            )}
          </CardContent>
        </Card>
      </div>

      {/* Bridge Modal */}
      <Dialog open={bridging}>
        <DialogContent className="sm:max-w-md bg-zinc-950 border-zinc-800 text-zinc-100">
          <DialogHeader>
            <DialogTitle className="text-2xl text-center mb-2">Sunrise Migration</DialogTitle>
            <DialogDescription className="text-center text-zinc-400">
              Bridging dead asset to Solana. Please don't close this window.
            </DialogDescription>
          </DialogHeader>
          <div className="py-8 space-y-6">
            <div className="flex justify-between items-center px-4">
              <div className="text-blue-400 flex flex-col items-center gap-2">
                <span className="text-2xl">⟠</span>
                <span className="text-xs">Ethereum</span>
              </div>
              <div className="flex-1 px-4">
                <div className="h-0.5 bg-zinc-800 relative">
                  <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-3 h-3 bg-zinc-700 rotate-45" />
                </div>
              </div>
              <div className="text-purple-400 flex flex-col items-center gap-2">
                <span className="text-2xl">◎</span>
                <span className="text-xs">Solana</span>
              </div>
            </div>

            <div className="space-y-2">
              <Progress value={bridgeProgress} className="h-2 bg-zinc-900" indicatorClassName="bg-gradient-to-r from-blue-600 via-purple-500 to-emerald-400" />
              <p className="text-sm text-center text-zinc-400 font-mono animate-pulse">{bridgeStatus}</p>
            </div>
          </div>
        </DialogContent>
      </Dialog>

    </main>
  );
}
