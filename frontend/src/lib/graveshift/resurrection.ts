import { getAddress, type Address } from "viem";

export type AssetType = "erc20" | "erc721" | "erc1155";
export type AssetChain = "ethereum" | "polygon";

export const CHAIN_CONFIG: Record<AssetChain, {
    caip2: string;
    displayName: string;
}> = {
    ethereum: {
        caip2: "eip155:1",
        displayName: "Ethereum Mainnet",
    },
    polygon: {
        caip2: "eip155:137",
        displayName: "Polygon PoS",
    },
};

export type NormalizedAssetInput = {
    chain: AssetChain;
    ethAddress: Address;
    assetType: AssetType;
    contractAddress: Address;
    tokenId: string | null;
};

export const ETH_ADDRESS_PATTERN = "^0x[a-fA-F0-9]{40}$";
export const ETH_SIGNATURE_PATTERN = "^0x[a-fA-F0-9]{130}$";

export function normalizeAssetChain(value: string): AssetChain
{
    const normalized = value.trim().toLowerCase();
    if (normalized === "ethereum" || normalized === "polygon") {
        return normalized;
    }

    throw new Error("chain must be either 'ethereum' or 'polygon'");
}

export function normalizeAssetType(value: string): AssetType
{
    const normalized = value.trim().toLowerCase();
    if (normalized === "erc20" || normalized === "erc721" || normalized === "erc1155") {
        return normalized;
    }

    throw new Error("assetType must be either 'erc20', 'erc721', or 'erc1155'");
}

export function normalizeEvmAddress(value: string, fieldName: string): Address
{
    try {
        return getAddress(value.trim());
    } catch {
        throw new Error(`Invalid ${fieldName} address`);
    }
}

export function normalizeTokenId(value: string | null | undefined): string | null
{
    if (value == null) {
        return null;
    }

    const trimmed = value.trim();
    if (!trimmed.length) {
        return null;
    }

    try {
        const parsed = BigInt(trimmed);
        if (parsed < BigInt(0)) {
            throw new Error();
        }

        return parsed.toString(10);
    } catch {
        throw new Error("tokenId must be a non-negative integer");
    }
}

export function normalizeAssetInput(input: {
    chain?: string;
    ethAddress: string;
    assetType: string;
    contractAddress: string;
    tokenId?: string | null;
}): NormalizedAssetInput
{
    const chain = normalizeAssetChain(input.chain ?? "ethereum");
    const assetType = normalizeAssetType(input.assetType);
    const tokenId = normalizeTokenId(input.tokenId);

    if ((assetType === "erc721" || assetType === "erc1155") && tokenId == null) {
        throw new Error("tokenId is required for ERC-721 and ERC-1155 assets");
    }

    return {
        chain,
        ethAddress: normalizeEvmAddress(input.ethAddress, "ethAddress"),
        assetType,
        contractAddress: normalizeEvmAddress(input.contractAddress, "contractAddress"),
        tokenId,
    };
}

export function buildAssetKey(input: NormalizedAssetInput): string
{
    const tokenSegment = input.tokenId ?? "*";
    return `${CHAIN_CONFIG[input.chain].caip2}:${input.assetType}:${input.contractAddress.toLowerCase()}:${tokenSegment}:${input.ethAddress.toLowerCase()}`;
}

export function buildResurrectionProofMessage(input: NormalizedAssetInput & {
    solanaAccount: string;
}): string
{
    const tokenSegment = input.tokenId ?? "*";
    const chainDisplayName = CHAIN_CONFIG[input.chain].displayName;

    return [
        "GraveShift Resurrection Proof",
        `EVM Owner: ${input.ethAddress}`,
        `Solana Recipient: ${input.solanaAccount}`,
        `Network: ${chainDisplayName}`,
        `Asset Type: ${input.assetType}`,
        `Contract: ${input.contractAddress}`,
        `Token Id: ${tokenSegment}`,
        "Action: I authorize this asset resurrection on Solana.",
    ].join("\n");
}
