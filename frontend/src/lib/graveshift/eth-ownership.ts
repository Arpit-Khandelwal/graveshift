import { createHash } from "crypto";
import { createPublicClient, formatUnits, http, parseAbi } from "viem";
import { mainnet, polygon } from "viem/chains";
import { buildAssetKey, type AssetChain, type NormalizedAssetInput } from "./resurrection";

const ERC20_ABI = parseAbi([
    "function balanceOf(address owner) view returns (uint256)",
    "function symbol() view returns (string)",
    "function name() view returns (string)",
    "function decimals() view returns (uint8)",
]);

const ERC721_ABI = parseAbi([
    "function ownerOf(uint256 tokenId) view returns (address)",
    "function symbol() view returns (string)",
    "function name() view returns (string)",
]);

const ERC1155_ABI = parseAbi([
    "function balanceOf(address account, uint256 id) view returns (uint256)",
]);

const POLYGON_ALCHEMY_BASE_URL = process.env.POLYGON_ALCHEMY_BASE_URL ?? "https://polygon-mainnet.g.alchemy.com";
const POLYGON_ALCHEMY_API_KEY = process.env.POLYGON_ALCHEMY_API_KEY ?? "demo";

type TokenMetadata = {
    name: string | null;
    symbol: string | null;
    decimals: number | null;
};

export type OwnershipCheck = {
    verified: boolean;
    reason?: string;
    metadata: TokenMetadata;
    tokenBalance?: string;
    assetKey: string;
    assetId: string;
};

function getEvmClient(chain: AssetChain)
{
    const transport = chain === "polygon"
        ? http(process.env.POLYGON_RPC_URL ?? "https://polygon-bor-rpc.publicnode.com")
        : http(process.env.ETH_RPC_URL ?? "https://eth.llamarpc.com");

    return createPublicClient({
        chain: chain === "polygon" ? polygon : mainnet,
        transport,
    });
}

function toShortAssetId(assetKey: string): string
{
    return createHash("sha256").update(assetKey).digest("hex").slice(0, 32);
}

async function readTokenMetadata(input: NormalizedAssetInput): Promise<TokenMetadata>
{
    const client = getEvmClient(input.chain);

    if (input.assetType === "erc20") {
        const [name, symbol, decimals] = await Promise.all([
            client.readContract({
                address: input.contractAddress,
                abi: ERC20_ABI,
                functionName: "name",
            }).catch(() => null),
            client.readContract({
                address: input.contractAddress,
                abi: ERC20_ABI,
                functionName: "symbol",
            }).catch(() => null),
            client.readContract({
                address: input.contractAddress,
                abi: ERC20_ABI,
                functionName: "decimals",
            }).catch(() => null),
        ]);

        return {
            name,
            symbol,
            decimals: decimals == null ? null : Number(decimals),
        };
    }

    const [name, symbol] = await Promise.all([
        client.readContract({
            address: input.contractAddress,
            abi: ERC721_ABI,
            functionName: "name",
        }).catch(() => null),
        client.readContract({
            address: input.contractAddress,
            abi: ERC721_ABI,
            functionName: "symbol",
        }).catch(() => null),
    ]);

    return {
        name,
        symbol,
        decimals: null,
    };
}

export async function verifyEvmOwnership(
    input: NormalizedAssetInput
): Promise<OwnershipCheck>
{
    const client = getEvmClient(input.chain);
    const assetKey = buildAssetKey(input);
    const assetId = toShortAssetId(assetKey);

    if (input.assetType === "erc721") {
        try {
            const owner = await client.readContract({
                address: input.contractAddress,
                abi: ERC721_ABI,
                functionName: "ownerOf",
                args: [BigInt(input.tokenId!)],
            });

            const metadata = await readTokenMetadata(input);
            const verified = owner.toLowerCase() === input.ethAddress.toLowerCase();

            return {
                verified,
                reason: verified ? undefined : "Connected Ethereum wallet is not the owner of this ERC-721 token",
                metadata,
                assetKey,
                assetId,
            };
        } catch {
            return {
                verified: false,
                reason: "Failed to verify ERC-721 ownership. Check chain, contract, and tokenId.",
                metadata: {
                    name: null,
                    symbol: null,
                    decimals: null,
                },
                assetKey,
                assetId,
            };
        }
    }

    if (input.assetType === "erc1155") {
        try {
            const balance = await client.readContract({
                address: input.contractAddress,
                abi: ERC1155_ABI,
                functionName: "balanceOf",
                args: [input.ethAddress, BigInt(input.tokenId!)],
            });

            return {
                verified: balance > BigInt(0),
                reason: balance > BigInt(0) ? undefined : "Connected wallet has zero balance for this ERC-1155 token",
                metadata: {
                    name: null,
                    symbol: null,
                    decimals: null,
                },
                tokenBalance: balance.toString(10),
                assetKey,
                assetId,
            };
        } catch {
            if (input.chain === "polygon") {
                const fallbackBalance = await queryPolygonErc1155BalanceViaAlchemy(
                    input.ethAddress,
                    input.contractAddress,
                    input.tokenId!
                );

                if (fallbackBalance != null) {
                    return {
                        verified: fallbackBalance > BigInt(0),
                        reason: fallbackBalance > BigInt(0)
                            ? undefined
                            : "Connected wallet has zero balance for this ERC-1155 token",
                        metadata: {
                            name: null,
                            symbol: null,
                            decimals: null,
                        },
                        tokenBalance: fallbackBalance.toString(10),
                        assetKey,
                        assetId,
                    };
                }
            }

            return {
                verified: false,
                reason: "Failed to verify ERC-1155 balance. Check chain, contract, and tokenId.",
                metadata: {
                    name: null,
                    symbol: null,
                    decimals: null,
                },
                assetKey,
                assetId,
            };
        }
    }

    try {
        const [balance, metadata] = await Promise.all([
            client.readContract({
                address: input.contractAddress,
                abi: ERC20_ABI,
                functionName: "balanceOf",
                args: [input.ethAddress],
            }),
            readTokenMetadata(input),
        ]);

        const decimals = metadata.decimals ?? 18;
        const balanceFormatted = formatUnits(balance, decimals);

        return {
            verified: balance > BigInt(0),
            reason: balance > BigInt(0) ? undefined : "Connected Ethereum wallet has zero balance for this ERC-20 token",
            metadata,
            tokenBalance: balanceFormatted,
            assetKey,
            assetId,
        };
    } catch {
        return {
            verified: false,
            reason: "Failed to verify ERC-20 balance. Check chain and contract address.",
            metadata: {
                name: null,
                symbol: null,
                decimals: null,
            },
            assetKey,
            assetId,
        };
    }
}

async function queryPolygonErc1155BalanceViaAlchemy(
    owner: `0x${string}`,
    contract: `0x${string}`,
    tokenId: string
): Promise<bigint | null>
{
    let pageKey: string | null = null;

    for (let page = 0; page < 4; page += 1) {
        const query = new URLSearchParams({
            owner,
            withMetadata: "false",
            pageSize: "100",
        });

        if (pageKey) {
            query.set("pageKey", pageKey);
        }

        const url = `${POLYGON_ALCHEMY_BASE_URL}/nft/v3/${POLYGON_ALCHEMY_API_KEY}/getNFTsForOwner?${query.toString()}`;
        const response = await fetch(url, { cache: "no-store" });
        if (!response.ok) {
            return null;
        }

        const payload = await response.json() as {
            ownedNfts?: Array<{
                tokenType?: string;
                tokenId?: string;
                balance?: string;
                contractAddress?: string;
                contract?: {
                    address?: string;
                };
            }>;
            pageKey?: string;
        };

        for (const nft of payload.ownedNfts ?? []) {
            if (nft.tokenType && (nft.tokenType ?? "").toUpperCase() !== "ERC1155") {
                continue;
            }

            const nftContract = (nft.contractAddress ?? nft.contract?.address ?? "").toLowerCase();
            if (nftContract !== contract.toLowerCase()) {
                continue;
            }

            const normalizedTokenId = normalizeTokenIdMaybe(nft.tokenId);
            if (normalizedTokenId !== tokenId) {
                continue;
            }

            return normalizeBigIntMaybe(nft.balance);
        }

        if (!payload.pageKey) {
            break;
        }

        pageKey = payload.pageKey;
    }

    return null;
}

function normalizeTokenIdMaybe(value: string | undefined): string | null
{
    if (!value || !value.trim().length) {
        return null;
    }

    try {
        return BigInt(value.trim()).toString(10);
    } catch {
        return null;
    }
}

function normalizeBigIntMaybe(value: string | undefined): bigint | null
{
    if (!value || !value.trim().length) {
        return null;
    }

    try {
        return BigInt(value.trim());
    } catch {
        return null;
    }
}
