import { normalizeAssetInput } from "@/lib/graveshift/resurrection";
import { verifyEvmOwnership } from "@/lib/graveshift/eth-ownership";

export const runtime = "nodejs";

export const POST = async (req: Request) =>
{
    try {
        const body = await req.json();

        const normalizedAsset = normalizeAssetInput({
            chain: asOptionalString(body.chain) ?? "ethereum",
            ethAddress: asRequiredString(body.ethAddress, "ethAddress"),
            assetType: asRequiredString(body.assetType, "assetType"),
            contractAddress: asRequiredString(body.contractAddress, "contractAddress"),
            tokenId: asOptionalString(body.tokenId),
        });

        const ownershipCheck = await verifyEvmOwnership(normalizedAsset);
        if (!ownershipCheck.verified) {
            return Response.json(
                {
                    verified: false,
                    error: ownershipCheck.reason ?? "Ownership verification failed",
                },
                { status: 400 }
            );
        }

        return Response.json({
            verified: true,
            assetId: ownershipCheck.assetId,
            assetKey: ownershipCheck.assetKey,
            metadata: ownershipCheck.metadata,
            tokenBalance: ownershipCheck.tokenBalance,
        });
    } catch (error) {
        let message = "Failed to verify asset";
        if (error instanceof Error) {
            message = error.message;
        }

        return Response.json(
            {
                verified: false,
                error: message,
            },
            { status: 400 }
        );
    }
};

function asRequiredString(value: unknown, fieldName: string): string
{
    if (typeof value !== "string" || !value.trim().length) {
        throw new Error(`Missing required field: ${fieldName}`);
    }

    return value;
}

function asOptionalString(value: unknown): string | null
{
    if (typeof value !== "string") {
        return null;
    }

    const trimmed = value.trim();
    return trimmed.length ? trimmed : null;
}
