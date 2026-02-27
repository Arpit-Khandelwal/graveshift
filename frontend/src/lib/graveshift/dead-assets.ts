import { formatUnits, getAddress, type Address } from "viem";

const ETHPLORER_BASE_URL = process.env.ETHPLORER_BASE_URL ?? "https://api.ethplorer.io";
const ETHPLORER_API_KEY = process.env.ETHPLORER_API_KEY ?? "freekey";
const DEXSCREENER_BASE_URL = process.env.DEXSCREENER_BASE_URL ?? "https://api.dexscreener.com";
const POLYGON_ALCHEMY_BASE_URL = process.env.POLYGON_ALCHEMY_BASE_URL ?? "https://polygon-mainnet.g.alchemy.com";
const POLYGON_ALCHEMY_API_KEY = process.env.POLYGON_ALCHEMY_API_KEY ?? "demo";

const MIN_LIQUIDITY_USD = 15_000;
const MIN_VOLUME_24H_USD = 5_000;
const MIN_MARKET_CAP_USD = 1_000_000;
const MIN_HOLDER_COUNT = 300;
const STALE_PRICE_SECONDS = 90 * 24 * 60 * 60;

const POLYGON_ERC1155_SCAN_MAX_PAGES = 4;
const POLYGON_ERC1155_SCAN_PAGE_SIZE = 100;
const POLYGON_ERC1155_SCAN_MAX_ITEMS = 350;

type EthplorerAddressInfo = {
    tokens?: Array<{
        tokenInfo?: {
            address?: string;
            name?: string;
            symbol?: string;
            decimals?: string | number;
            holdersCount?: number | string;
            lastUpdated?: number | string;
            price?: false | {
                rate?: number | string;
                marketCapUsd?: number | string;
                volume24h?: number | string;
                ts?: number | string;
            };
        };
        rawBalance?: string;
        balance?: string | number;
    }>;
};

type DexScreenerPair = {
    chainId?: string;
    baseToken?: {
        address?: string;
    };
    quoteToken?: {
        address?: string;
    };
    liquidity?: {
        usd?: number | string;
    };
    volume?: {
        h24?: number | string;
    };
};

type AlchemyPolygonNftResponse = {
    ownedNfts?: Array<{
        tokenType?: string;
        tokenId?: string;
        balance?: string;
        name?: string | null;
        description?: string | null;
        raw?: {
            error?: string | null;
        };
        image?: {
            originalUrl?: string | null;
            cachedUrl?: string | null;
        };
        contract?: {
            address?: string;
            name?: string | null;
            symbol?: string | null;
            tokenType?: string;
            isSpam?: boolean;
            spamClassifications?: string[];
        };
    }>;
    pageKey?: string;
};

type ParsedErc20Holding = {
    contractAddress: Address;
    name: string | null;
    symbol: string | null;
    balance: string;
    holdersCount: number | null;
    marketCapUsd: number | null;
    priceVolume24h: number | null;
    priceUpdatedAt: number | null;
};

type PolygonErc1155Holding = {
    contractAddress: Address;
    tokenId: string;
    name: string | null;
    symbol: string | null;
    balance: string;
    description: string | null;
    imageUrl: string | null;
    isSpam: boolean;
    spamClassifications: string[];
    metadataError: string | null;
};

export type DeadAsset = {
    chain: "ethereum" | "polygon";
    assetType: "erc20" | "erc1155";
    contractAddress: Address;
    tokenId: string | null;
    name: string | null;
    symbol: string | null;
    balance: string;
    deadScore: number;
    reasons: string[];
    metrics: Record<string, number | string | boolean | null>;
};

export type DeadAssetScanResult = {
    totalHoldings: number;
    deadAssets: DeadAsset[];
};

export async function scanDeadAssets(
    ethAddress: Address,
    limit = 20
): Promise<DeadAssetScanResult>
{
    const [erc20Holdings, polygonErc1155Holdings] = await Promise.all([
        fetchEthereumErc20Holdings(ethAddress),
        fetchPolygonErc1155Holdings(ethAddress),
    ]);

    const [dexPairsByToken] = await Promise.all([
        fetchDexPairsForTokens(erc20Holdings.map((holding) => holding.contractAddress)),
    ]);

    const ethereumDeadAssets = erc20Holdings.map((holding) =>
        evaluateEthereumErc20Holding(
            holding,
            dexPairsByToken.get(holding.contractAddress.toLowerCase()) ?? []
        )
    );

    const polygonDeadAssets = polygonErc1155Holdings.map((holding) =>
        evaluatePolygonErc1155Holding(holding)
    );

    const combined = [...ethereumDeadAssets, ...polygonDeadAssets]
        .filter((asset) => asset.deadScore >= 40)
        .sort((a, b) => b.deadScore - a.deadScore)
        .slice(0, limit);

    return {
        totalHoldings: erc20Holdings.length + polygonErc1155Holdings.length,
        deadAssets: combined,
    };
}

async function fetchEthereumErc20Holdings(ethAddress: Address): Promise<ParsedErc20Holding[]>
{
    const url = `${ETHPLORER_BASE_URL}/getAddressInfo/${ethAddress}?apiKey=${encodeURIComponent(ETHPLORER_API_KEY)}`;
    const response = await fetch(url, {
        cache: "no-store",
    });

    if (!response.ok) {
        throw new Error(`Ethplorer request failed (${response.status})`);
    }

    const payload = (await response.json()) as EthplorerAddressInfo;

    return (payload.tokens ?? [])
        .map(parseErc20Holding)
        .filter((holding): holding is ParsedErc20Holding => holding != null);
}

function parseErc20Holding(token: NonNullable<EthplorerAddressInfo["tokens"]>[number]): ParsedErc20Holding | null
{
    const tokenInfo = token.tokenInfo;
    if (!tokenInfo?.address) {
        return null;
    }

    let contractAddress: Address;
    try {
        contractAddress = getAddress(tokenInfo.address);
    } catch {
        return null;
    }

    const decimals = clampDecimals(parseNumber(tokenInfo.decimals) ?? 18);
    const rawBalance = parseRawBalance(token.rawBalance ?? token.balance);

    if (rawBalance == null || rawBalance <= BigInt(0)) {
        return null;
    }

    const balance = formatUnits(rawBalance, decimals);

    const priceData = tokenInfo.price && typeof tokenInfo.price === "object"
        ? tokenInfo.price
        : null;

    return {
        contractAddress,
        name: tokenInfo.name ?? null,
        symbol: tokenInfo.symbol ?? null,
        balance,
        holdersCount: parseNumber(tokenInfo.holdersCount),
        marketCapUsd: parseNumber(priceData?.marketCapUsd),
        priceVolume24h: parseNumber(priceData?.volume24h),
        priceUpdatedAt: parseNumber(priceData?.ts) ?? parseNumber(tokenInfo.lastUpdated),
    };
}

async function fetchPolygonErc1155Holdings(ethAddress: Address): Promise<PolygonErc1155Holding[]>
{
    const holdings: PolygonErc1155Holding[] = [];
    let pageKey: string | null = null;

    for (let page = 0; page < POLYGON_ERC1155_SCAN_MAX_PAGES; page += 1) {
        const query = new URLSearchParams({
            owner: ethAddress,
            withMetadata: "true",
            pageSize: POLYGON_ERC1155_SCAN_PAGE_SIZE.toString(),
        });

        if (pageKey) {
            query.set("pageKey", pageKey);
        }

        const url = `${POLYGON_ALCHEMY_BASE_URL}/nft/v3/${POLYGON_ALCHEMY_API_KEY}/getNFTsForOwner?${query.toString()}`;
        const response = await fetch(url, {
            cache: "no-store",
        });

        if (!response.ok) {
            throw new Error(`Polygon ERC-1155 scan failed (${response.status})`);
        }

        const payload = (await response.json()) as AlchemyPolygonNftResponse;

        for (const nft of payload.ownedNfts ?? []) {
            const tokenType = (nft.tokenType ?? nft.contract?.tokenType ?? "").toUpperCase();
            if (tokenType !== "ERC1155") {
                continue;
            }

            if (!nft.contract?.address) {
                continue;
            }

            let contractAddress: Address;
            try {
                contractAddress = getAddress(nft.contract.address);
            } catch {
                continue;
            }

            const tokenId = normalizeTokenId(nft.tokenId);
            if (!tokenId) {
                continue;
            }

            const balance = normalizeBalanceString(nft.balance);
            if (!balance || BigInt(balance) <= BigInt(0)) {
                continue;
            }

            holdings.push({
                contractAddress,
                tokenId,
                name: normalizeNullableString(nft.name) ?? normalizeNullableString(nft.contract.name),
                symbol: normalizeNullableString(nft.contract.symbol),
                balance,
                description: normalizeNullableString(nft.description),
                imageUrl: normalizeNullableString(nft.image?.originalUrl) ?? normalizeNullableString(nft.image?.cachedUrl),
                isSpam: Boolean(nft.contract.isSpam),
                spamClassifications: Array.isArray(nft.contract.spamClassifications)
                    ? nft.contract.spamClassifications
                    : [],
                metadataError: normalizeNullableString(nft.raw?.error),
            });

            if (holdings.length >= POLYGON_ERC1155_SCAN_MAX_ITEMS) {
                return holdings;
            }
        }

        if (!payload.pageKey) {
            break;
        }

        pageKey = payload.pageKey;
    }

    return holdings;
}

async function fetchDexPairsForTokens(
    tokenAddresses: Address[]
): Promise<Map<string, DexScreenerPair[]>>
{
    const result = new Map<string, DexScreenerPair[]>();
    const uniqueAddresses = Array.from(new Set(tokenAddresses.map((address) => address.toLowerCase())));

    const chunks = chunk(uniqueAddresses, 30);
    for (const chunkAddresses of chunks) {
        try {
            const requestUrl = `${DEXSCREENER_BASE_URL}/tokens/v1/ethereum/${chunkAddresses.join(",")}`;
            const response = await fetch(requestUrl, {
                cache: "no-store",
            });

            if (!response.ok) {
                continue;
            }

            const pairs = (await response.json()) as DexScreenerPair[];
            if (!Array.isArray(pairs)) {
                continue;
            }

            for (const pair of pairs) {
                if ((pair.chainId ?? "").toLowerCase() !== "ethereum") {
                    continue;
                }

                const baseAddress = (pair.baseToken?.address ?? "").toLowerCase();
                const quoteAddress = (pair.quoteToken?.address ?? "").toLowerCase();

                for (const address of [baseAddress, quoteAddress]) {
                    if (!address || !chunkAddresses.includes(address)) {
                        continue;
                    }

                    const existing = result.get(address) ?? [];
                    existing.push(pair);
                    result.set(address, existing);
                }
            }
        } catch {
            continue;
        }
    }

    return result;
}

function evaluateEthereumErc20Holding(holding: ParsedErc20Holding, pairs: DexScreenerPair[]): DeadAsset
{
    let deadScore = 0;
    const reasons: string[] = [];

    const dexPairCount = pairs.length;
    const dexLiquidityUsd = maxFiniteNumber(
        pairs
            .map((pair) => parseNumber(pair.liquidity?.usd))
            .filter((value): value is number => value != null)
    );

    const dexVolume24h = maxFiniteNumber(
        pairs
            .map((pair) => parseNumber(pair.volume?.h24))
            .filter((value): value is number => value != null)
    );

    if (dexPairCount === 0) {
        deadScore += 40;
        reasons.push("No active Ethereum DEX pair found");
    }

    if (dexLiquidityUsd != null && dexLiquidityUsd < MIN_LIQUIDITY_USD) {
        deadScore += 25;
        reasons.push("Low DEX liquidity");
    }

    if (dexPairCount > 0 && (dexVolume24h ?? 0) < MIN_VOLUME_24H_USD) {
        deadScore += 20;
        reasons.push("Low DEX 24h volume");
    }

    if (holding.marketCapUsd == null) {
        deadScore += 15;
        reasons.push("No tracked market cap data");
    } else if (holding.marketCapUsd < MIN_MARKET_CAP_USD) {
        deadScore += 10;
        reasons.push("Low market cap");
    }

    if (holding.holdersCount != null && holding.holdersCount < MIN_HOLDER_COUNT) {
        deadScore += 10;
        reasons.push("Low holder count");
    }

    if (holding.priceUpdatedAt != null) {
        const ageSeconds = Math.max(0, Math.floor(Date.now() / 1000) - holding.priceUpdatedAt);
        if (ageSeconds > STALE_PRICE_SECONDS) {
            deadScore += 10;
            reasons.push("Price feed is stale");
        }
    }

    return {
        chain: "ethereum",
        assetType: "erc20",
        contractAddress: holding.contractAddress,
        tokenId: null,
        name: holding.name,
        symbol: holding.symbol,
        balance: holding.balance,
        deadScore,
        reasons,
        metrics: {
            holdersCount: holding.holdersCount,
            marketCapUsd: holding.marketCapUsd,
            priceVolume24h: holding.priceVolume24h,
            dexLiquidityUsd,
            dexVolume24h,
            dexPairCount,
            priceUpdatedAt: holding.priceUpdatedAt,
        },
    };
}

function evaluatePolygonErc1155Holding(holding: PolygonErc1155Holding): DeadAsset
{
    let deadScore = 0;
    const reasons: string[] = [];

    if (holding.isSpam) {
        deadScore += 45;
        reasons.push("Flagged as spam by indexer");
    }

    if (holding.spamClassifications.length) {
        deadScore += 15;
        reasons.push(`Spam signals: ${holding.spamClassifications.join(", ")}`);
    }

    if (!holding.name) {
        deadScore += 10;
        reasons.push("Missing token metadata name");
    }

    if (!holding.imageUrl) {
        deadScore += 10;
        reasons.push("Missing NFT image metadata");
    }

    if (holding.metadataError) {
        deadScore += 20;
        reasons.push("Broken token metadata URI");
    }

    const description = (holding.description ?? "").toLowerCase();
    if (containsSpamPhrase(description)) {
        deadScore += 25;
        reasons.push("Spammy claim/airdrop text in metadata");
    }

    return {
        chain: "polygon",
        assetType: "erc1155",
        contractAddress: holding.contractAddress,
        tokenId: holding.tokenId,
        name: holding.name,
        symbol: holding.symbol,
        balance: holding.balance,
        deadScore,
        reasons,
        metrics: {
            isSpam: holding.isSpam,
            spamSignalCount: holding.spamClassifications.length,
            hasMetadataError: holding.metadataError != null,
        },
    };
}

function containsSpamPhrase(value: string): boolean
{
    if (!value) {
        return false;
    }

    const phrases = [
        "airdrop",
        "claim",
        "reward",
        "visit",
        "bonus",
        "voucher",
        "t.me",
        "telegram",
        "http://",
        "https://",
    ];

    return phrases.some((phrase) => value.includes(phrase));
}

function parseRawBalance(value: unknown): bigint | null
{
    if (typeof value === "string" && value.trim().length) {
        try {
            return BigInt(value.trim());
        } catch {
            return null;
        }
    }

    if (typeof value === "number" && Number.isFinite(value) && value > 0) {
        try {
            return BigInt(Math.trunc(value));
        } catch {
            return null;
        }
    }

    return null;
}

function normalizeTokenId(value: unknown): string | null
{
    if (typeof value !== "string" || !value.trim().length) {
        return null;
    }

    try {
        return BigInt(value.trim()).toString(10);
    } catch {
        return null;
    }
}

function normalizeBalanceString(value: unknown): string | null
{
    if (typeof value === "string" && value.trim().length) {
        try {
            return BigInt(value.trim()).toString(10);
        } catch {
            return null;
        }
    }

    if (typeof value === "number" && Number.isFinite(value) && value > 0) {
        return BigInt(Math.trunc(value)).toString(10);
    }

    return null;
}

function normalizeNullableString(value: unknown): string | null
{
    if (typeof value !== "string") {
        return null;
    }

    const trimmed = value.trim();
    return trimmed.length ? trimmed : null;
}

function parseNumber(value: unknown): number | null
{
    if (typeof value === "number" && Number.isFinite(value)) {
        return value;
    }

    if (typeof value === "string" && value.trim().length) {
        const parsed = Number(value.trim());
        if (Number.isFinite(parsed)) {
            return parsed;
        }
    }

    return null;
}

function clampDecimals(value: number): number
{
    if (!Number.isFinite(value)) {
        return 18;
    }

    return Math.max(0, Math.min(Math.trunc(value), 30));
}

function maxFiniteNumber(values: number[]): number | null
{
    if (!values.length) {
        return null;
    }

    return values.reduce((max, value) => (value > max ? value : max), values[0]);
}

function chunk<T>(items: T[], chunkSize: number): T[][]
{
    const chunks: T[][] = [];

    for (let i = 0; i < items.length; i += chunkSize) {
        chunks.push(items.slice(i, i + chunkSize));
    }

    return chunks;
}
