"use client";

import { useEffect, useMemo, useState } from "react";
import { useAccount, useConnect, useDisconnect, useSignMessage } from "wagmi";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import { ExternalLink, ShieldCheck, Skull, Sparkles } from "lucide-react";
import { Transaction } from "@solana/web3.js";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  buildResurrectionProofMessage,
  normalizeAssetInput,
  type AssetChain,
  type AssetType,
} from "@/lib/graveshift/resurrection";

type VerificationResponse = {
  verified: boolean;
  assetId?: string;
  assetKey?: string;
  metadata?: {
    name: string | null;
    symbol: string | null;
    decimals: number | null;
  };
  tokenBalance?: string;
  error?: string;
};

type DeadAssetEntry = {
  chain: AssetChain;
  assetType: AssetType;
  contractAddress: string;
  tokenId: string | null;
  name: string | null;
  symbol: string | null;
  balance: string;
  deadScore: number;
  reasons: string[];
  metrics: Record<string, number | string | boolean | null>;
};

type DeadAssetScanResponse = {
  totalHoldings: number;
  deadAssets: DeadAssetEntry[];
  error?: string;
};

type ActionPostTransactionResponse = {
  type: "transaction";
  transaction: string;
  message?: string;
};

export default function Home()
{
  const { address: ethAddress, isConnected: isEthConnected } = useAccount();
  const { connect, connectors, isPending: isEthConnectPending } = useConnect();
  const { disconnect } = useDisconnect();
  const { signMessageAsync, isPending: isSigningProof } = useSignMessage();

  const { connection } = useConnection();
  const solanaWallet = useWallet();

  const [chain, setChain] = useState<AssetChain>("ethereum");
  const [assetType, setAssetType] = useState<AssetType>("erc721");
  const [contractAddress, setContractAddress] = useState("");
  const [tokenId, setTokenId] = useState("");
  const [verification, setVerification] = useState<VerificationResponse | null>(null);
  const [deadAssets, setDeadAssets] = useState<DeadAssetEntry[]>([]);
  const [proofSignature, setProofSignature] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string>("Connect wallets and verify an EVM asset.");
  const [verifyBusy, setVerifyBusy] = useState(false);
  const [scanBusy, setScanBusy] = useState(false);
  const [resurrectBusy, setResurrectBusy] = useState(false);
  const [txSignature, setTxSignature] = useState<string | null>(null);
  const [appOrigin, setAppOrigin] = useState("");

  useEffect(() =>
  {
    setAppOrigin(window.location.origin);
  }, []);

  useEffect(() =>
  {
    if (isEthConnected) {
      return;
    }

    setDeadAssets([]);
    setChain("ethereum");
    setContractAddress("");
    setTokenId("");
    setVerification(null);
    setProofSignature(null);
  }, [isEthConnected]);

  const proofMessage = useMemo(() =>
  {
    if (!ethAddress || !solanaWallet.publicKey) {
      return "";
    }

    try {
      const normalized = normalizeAssetInput({
        chain,
        ethAddress,
        assetType,
        contractAddress,
        tokenId,
      });

      return buildResurrectionProofMessage({
        ...normalized,
        solanaAccount: solanaWallet.publicKey.toBase58(),
      });
    } catch {
      return "";
    }
  }, [assetType, chain, contractAddress, ethAddress, solanaWallet.publicKey, tokenId]);

  const requiresTokenId = assetType === "erc721" || assetType === "erc1155";
  const canVerify = isEthConnected
    && contractAddress.trim().length > 0
    && (!requiresTokenId || tokenId.trim().length > 0);
  const canSignProof = Boolean(
    verification?.verified
    && proofMessage.length > 0
    && solanaWallet.publicKey
    && solanaWallet.connected
  );
  const canResurrect = Boolean(canSignProof && proofSignature && !resurrectBusy);

  const resetDerivedState = () =>
  {
    setVerification(null);
    setProofSignature(null);
    setTxSignature(null);
  };

  const verifyAsset = async (input: {
    ethAddress: string;
    chain: AssetChain;
    assetType: AssetType;
    contractAddress: string;
    tokenId: string;
  }) =>
  {
    setVerifyBusy(true);
    setStatusMessage("Verifying asset ownership on the selected source chain...");

    try {
      const response = await fetch("/api/eth/verify", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          ethAddress: input.ethAddress,
          chain: input.chain,
          assetType: input.assetType,
          contractAddress: input.contractAddress,
          tokenId: input.tokenId,
        }),
      });

      const payload = (await response.json()) as VerificationResponse;
      if (!response.ok || !payload.verified) {
        throw new Error(payload.error ?? "Ownership verification failed");
      }

      setVerification(payload);
      setProofSignature(null);
      setStatusMessage("Ownership verified. Sign the EVM proof message.");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Verification failed";
      setVerification({ verified: false, error: message });
      setStatusMessage(message);
    } finally {
      setVerifyBusy(false);
    }
  };

  const handleVerifyAsset = async () =>
  {
    if (!ethAddress) {
      setStatusMessage("Connect an Ethereum wallet first.");
      return;
    }

    await verifyAsset({
      ethAddress,
      chain,
      assetType,
      contractAddress,
      tokenId,
    });
  };

  const handleScanDeadAssets = async () =>
  {
    if (!ethAddress) {
      setStatusMessage("Connect an Ethereum wallet first.");
      return;
    }

    setScanBusy(true);
    setStatusMessage("Scanning Ethereum wallet for dead assets...");

    try {
      const response = await fetch("/api/eth/dead-assets", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          ethAddress,
          limit: 12,
        }),
      });

      const payload = (await response.json()) as DeadAssetScanResponse;
      if (!response.ok) {
        throw new Error(payload.error ?? "Dead asset scan failed");
      }

      setDeadAssets(payload.deadAssets);

      if (!payload.deadAssets.length) {
        setStatusMessage(`No dead assets detected across ${payload.totalHoldings} holdings.`);
        return;
      }

      const firstAsset = payload.deadAssets[0];
      setChain(firstAsset.chain);
      setAssetType(firstAsset.assetType);
      setContractAddress(firstAsset.contractAddress);
      setTokenId(firstAsset.tokenId ?? "");
      setStatusMessage(`Found ${payload.deadAssets.length} dead assets. Auto-selected ${firstAsset.symbol ?? "token"} on ${firstAsset.chain}.`);

      await verifyAsset({
        ethAddress,
        chain: firstAsset.chain,
        assetType: firstAsset.assetType,
        contractAddress: firstAsset.contractAddress,
        tokenId: firstAsset.tokenId ?? "",
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Dead asset scan failed";
      setStatusMessage(message);
      setDeadAssets([]);
    } finally {
      setScanBusy(false);
    }
  };

  const handleSelectScannedAsset = async (asset: DeadAssetEntry) =>
  {
    if (!ethAddress) {
      setStatusMessage("Connect an Ethereum wallet first.");
      return;
    }

    setChain(asset.chain);
    setAssetType(asset.assetType);
    setContractAddress(asset.contractAddress);
    setTokenId(asset.tokenId ?? "");

    await verifyAsset({
      ethAddress,
      chain: asset.chain,
      assetType: asset.assetType,
      contractAddress: asset.contractAddress,
      tokenId: asset.tokenId ?? "",
    });
  };

  const handleSignProof = async () =>
  {
    if (!proofMessage.length) {
      setStatusMessage("Provide valid asset details and connect Solana wallet to generate proof message.");
      return;
    }

    try {
      setStatusMessage("Requesting EVM wallet signature...");
      const signature = await signMessageAsync({
        message: proofMessage,
      });

      setProofSignature(signature);
      setStatusMessage("Proof signed. You can now resurrect on Solana devnet.");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to sign EVM proof";
      setStatusMessage(message);
    }
  };

  const handleResurrect = async () =>
  {
    if (!ethAddress || !solanaWallet.publicKey || !proofSignature) {
      setStatusMessage("Verification, Solana wallet connection, and EVM signature are required.");
      return;
    }

    setResurrectBusy(true);
    setStatusMessage("Building Solana migration transaction...");

    try {
      const response = await fetch("/api/actions/resurrect", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          account: solanaWallet.publicKey.toBase58(),
          data: {
            ethAddress,
            chain,
            assetType,
            contractAddress,
            tokenId,
            ethSignature: proofSignature,
          },
        }),
      });

      const payload = (await response.json()) as ActionPostTransactionResponse & { error?: string };
      if (!response.ok || !payload.transaction) {
        throw new Error(payload.error ?? "Failed to build resurrection transaction");
      }

      if (!solanaWallet.connected) {
        await solanaWallet.connect();
      }

      if (!solanaWallet.publicKey) {
        throw new Error("Connect and authorize your Solana wallet before sending.");
      }

      const transaction = Transaction.from(base64ToBytes(payload.transaction));
      const requiredSignerAddresses = transaction.signatures.map((entry) => entry.publicKey.toBase58());
      const currentWalletAddress = solanaWallet.publicKey.toBase58();

      if (requiredSignerAddresses.length > 0 && !requiredSignerAddresses.includes(currentWalletAddress)) {
        throw new Error(
          `Transaction expects signer ${requiredSignerAddresses[0]}. Reconnect wallet and rebuild the transaction.`
        );
      }

      const signature = await sendSolanaTransactionWithAuthFallback({
        wallet: solanaWallet,
        connection,
        transaction,
      });

      setStatusMessage("Transaction submitted. Waiting for confirmation on devnet...");

      const latestBlockhash = await connection.getLatestBlockhash("confirmed");
      await connection.confirmTransaction(
        {
          signature,
          blockhash: latestBlockhash.blockhash,
          lastValidBlockHeight: latestBlockhash.lastValidBlockHeight,
        },
        "confirmed"
      );

      setTxSignature(signature);
      setStatusMessage("Resurrection complete. Migration record is now on Solana devnet.");
    } catch (error) {
      const message = toFriendlyResurrectError(error);
      setStatusMessage(message);
    } finally {
      setResurrectBusy(false);
    }
  };

  const appActionUrl = appOrigin ? `${appOrigin}/api/actions/resurrect` : "";

  const dialDeveloperUrl = appActionUrl
    ? `https://dial.to/developer?url=${encodeURIComponent(appActionUrl)}&cluster=devnet`
    : "";

  return (
    <main className="container mx-auto max-w-5xl px-4 py-12">
      <header className="mb-10 text-center space-y-3">
        <h1 className="text-5xl font-black bg-gradient-to-r from-zinc-100 via-zinc-400 to-zinc-700 text-transparent bg-clip-text">
          GraveShift
        </h1>
        <p className="text-zinc-400 max-w-3xl mx-auto">
          Functional cross-chain resurrection: verify EVM ownership, sign proof, and write a migration record on Solana devnet.
        </p>
      </header>

      <div className="grid gap-6 md:grid-cols-2">
        <Card className="bg-zinc-950 border-zinc-900">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-zinc-200">
              <ShieldCheck className="w-5 h-5 text-blue-400" /> EVM Proof
            </CardTitle>
            <CardDescription>
              Connect your wallet and scan Ethereum ERC-20 + Polygon ERC-1155 dead assets directly. Manual input is optional.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {!isEthConnected ? (
              <div className="space-y-3">
                {connectors.map((connector) => (
                  <Button
                    key={connector.uid}
                    variant="outline"
                    className="w-full"
                    disabled={isEthConnectPending}
                    onClick={() => connect({ connector })}
                  >
                    Connect {connector.name}
                  </Button>
                ))}
              </div>
            ) : (
              <div className="space-y-2 rounded-lg border border-zinc-800 bg-zinc-900 p-3">
                <p className="text-sm text-zinc-400">Connected Ethereum wallet</p>
                <p className="font-mono text-sm text-zinc-200">
                  {ethAddress}
                </p>
                <Button size="sm" variant="ghost" onClick={() => disconnect()}>
                  Disconnect
                </Button>
              </div>
            )}

            {isEthConnected && (
              <>
                <Button className="w-full" disabled={scanBusy} onClick={handleScanDeadAssets}>
                  {scanBusy ? "Scanning Wallet..." : "Scan Wallet For Dead Assets"}
                </Button>

                {!!deadAssets.length && (
                  <div className="space-y-3">
                    {deadAssets.map((asset) => (
                      <div
                        key={`${asset.chain}:${asset.assetType}:${asset.contractAddress}:${asset.tokenId ?? "*"}`}
                        className="rounded-lg border border-zinc-800 bg-zinc-900 p-3 space-y-2"
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <p className="text-sm text-zinc-200 font-semibold">
                              {asset.name ?? "Unknown Token"} {asset.symbol ? `(${asset.symbol})` : ""}
                            </p>
                            <p className="text-xs text-zinc-400 font-mono">{asset.contractAddress}</p>
                            <p className="text-xs text-zinc-500">
                              {asset.chain} • {asset.assetType}{asset.tokenId ? ` • tokenId ${asset.tokenId}` : ""}
                            </p>
                          </div>
                          <span className="text-xs rounded-full border border-red-900/60 bg-red-950/30 px-2 py-1 text-red-300">
                            Dead Score {asset.deadScore}
                          </span>
                        </div>

                        <p className="text-xs text-zinc-300">Balance: {asset.balance}</p>
                        <p className="text-xs text-zinc-400">
                          {asset.reasons.join(" • ")}
                        </p>

                        <Button
                          size="sm"
                          className="w-full"
                          disabled={verifyBusy}
                          onClick={() =>
                          {
                            void handleSelectScannedAsset(asset);
                          }}
                        >
                          Use This Asset
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}

            <details className="rounded-lg border border-zinc-800 bg-zinc-900 p-3">
              <summary className="cursor-pointer text-sm text-zinc-300">Manual asset input (optional)</summary>

              <div className="mt-3 space-y-3">
                <div className="space-y-2">
                  <label className="text-sm text-zinc-300" htmlFor="chain">Source Chain</label>
                  <select
                    id="chain"
                    value={chain}
                    onChange={(event) =>
                    {
                      setChain(event.target.value as AssetChain);
                      resetDerivedState();
                    }}
                    className="w-full rounded-md border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm"
                  >
                    <option value="ethereum">Ethereum Mainnet</option>
                    <option value="polygon">Polygon PoS</option>
                  </select>
                </div>

                <div className="space-y-2">
                  <label className="text-sm text-zinc-300" htmlFor="assetType">Asset Type</label>
                  <select
                    id="assetType"
                    value={assetType}
                    onChange={(event) =>
                    {
                      setAssetType(event.target.value as AssetType);
                      resetDerivedState();
                    }}
                    className="w-full rounded-md border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm"
                  >
                    <option value="erc721">ERC-721 NFT</option>
                    <option value="erc20">ERC-20 Token</option>
                    <option value="erc1155">ERC-1155</option>
                  </select>
                </div>

                <div className="space-y-2">
                  <label className="text-sm text-zinc-300" htmlFor="contractAddress">Contract Address</label>
                  <input
                    id="contractAddress"
                    type="text"
                    value={contractAddress}
                    onChange={(event) =>
                    {
                      setContractAddress(event.target.value);
                      resetDerivedState();
                    }}
                    placeholder="0x..."
                    className="w-full rounded-md border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm font-mono"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-sm text-zinc-300" htmlFor="tokenId">
                    Token ID {requiresTokenId ? "(required)" : "(optional)"}
                  </label>
                  <input
                    id="tokenId"
                    type="text"
                    value={tokenId}
                    onChange={(event) =>
                    {
                      setTokenId(event.target.value);
                      resetDerivedState();
                    }}
                    placeholder="1234"
                    className="w-full rounded-md border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm font-mono"
                  />
                </div>
              </div>
            </details>

            <Button className="w-full" disabled={!canVerify || verifyBusy} onClick={handleVerifyAsset}>
              {verifyBusy ? "Verifying..." : "Verify Selected Asset"}
            </Button>

            {verification?.verified && (
              <div className="rounded-lg border border-emerald-900/60 bg-emerald-950/20 p-3 text-sm space-y-1">
                <p className="text-emerald-300">Ownership verified</p>
                <p className="text-zinc-300">Asset ID: <span className="font-mono">{verification.assetId}</span></p>
                {verification.metadata?.name && (
                  <p className="text-zinc-300">Token: {verification.metadata.name} ({verification.metadata.symbol ?? "?"})</p>
                )}
                {verification.tokenBalance && (
                  <p className="text-zinc-300">Balance: {verification.tokenBalance}</p>
                )}
              </div>
            )}

            {verification && !verification.verified && (
              <div className="rounded-lg border border-red-900/60 bg-red-950/20 p-3 text-sm text-red-300">
                {verification.error ?? "Verification failed"}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="bg-zinc-950 border-zinc-900">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-zinc-200">
              <Sparkles className="w-5 h-5 text-purple-400" /> Solana Resurrection
            </CardTitle>
            <CardDescription>
              Connect Solana wallet, sign EVM proof, then submit the migration transaction.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <WalletMultiButton style={{ width: "100%", justifyContent: "center" }} />

            <Button className="w-full" disabled={!canSignProof || isSigningProof} onClick={handleSignProof}>
              {isSigningProof ? "Signing Proof..." : "Sign EVM Proof"}
            </Button>

            {proofSignature && (
              <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-3 text-sm space-y-1">
                <p className="text-zinc-300">EVM signature captured:</p>
                <p className="font-mono text-xs break-all text-zinc-400">{proofSignature}</p>
              </div>
            )}

            <Button className="w-full" disabled={!canResurrect} onClick={handleResurrect}>
              {resurrectBusy ? "Submitting..." : "Resurrect Asset On Solana"}
            </Button>

            <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-3 text-sm text-zinc-300">
              <p>{statusMessage}</p>
            </div>

            {txSignature && (
              <a
                href={`https://explorer.solana.com/tx/${txSignature}?cluster=devnet`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 text-sm text-emerald-300 hover:text-emerald-200"
              >
                <ExternalLink className="w-4 h-4" /> View transaction on Solana Explorer
              </a>
            )}

            {dialDeveloperUrl && (
              <a
                href={dialDeveloperUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 text-sm text-blue-300 hover:text-blue-200"
              >
                <Skull className="w-4 h-4" /> Open this Blink in Dialect developer tool
              </a>
            )}
          </CardContent>
        </Card>
      </div>
    </main>
  );
}

function base64ToBytes(value: string): Uint8Array
{
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);

  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }

  return bytes;
}

async function sendSolanaTransactionWithAuthFallback(input: {
  wallet: ReturnType<typeof useWallet>;
  connection: ReturnType<typeof useConnection>["connection"];
  transaction: Transaction;
}): Promise<string>
{
  const { wallet, connection, transaction } = input;

  try {
    return await wallet.sendTransaction(transaction, connection);
  } catch (error) {
    if (!isWalletAuthorizationError(error)) {
      throw error;
    }

    if (!wallet.signTransaction || !wallet.publicKey) {
      throw error;
    }

    const latestBlockhash = await connection.getLatestBlockhash("confirmed");
    transaction.recentBlockhash = latestBlockhash.blockhash;
    transaction.lastValidBlockHeight = latestBlockhash.lastValidBlockHeight;
    transaction.feePayer = wallet.publicKey;

    const signed = await wallet.signTransaction(transaction);
    return connection.sendRawTransaction(signed.serialize());
  }
}

function isWalletAuthorizationError(error: unknown): boolean
{
  const message = error instanceof Error ? error.message : String(error ?? "");
  const normalized = message.toLowerCase();

  return normalized.includes("has not been authorized by the user")
    || normalized.includes("requested account")
    || normalized.includes("not authorized");
}

function toFriendlyResurrectError(error: unknown): string
{
  if (isWalletAuthorizationError(error)) {
    return "Solana wallet authorization failed. Reconnect the wallet in WalletMultiButton and approve the transaction.";
  }

  if (error instanceof Error) {
    return error.message;
  }

  return "Resurrection transaction failed";
}
