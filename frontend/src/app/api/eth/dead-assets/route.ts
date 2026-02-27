import { normalizeEvmAddress } from "@/lib/graveshift/resurrection";
import { scanDeadAssets } from "@/lib/graveshift/dead-assets";

export const runtime = "nodejs";

export const POST = async (req: Request) =>
{
    try {
        const body = await req.json();
        const ethAddress = normalizeEvmAddress(asRequiredString(body.ethAddress, "ethAddress"), "ethAddress");

        const requestedLimit = asOptionalNumber(body.limit);
        const limit = requestedLimit == null ? 20 : Math.max(1, Math.min(Math.trunc(requestedLimit), 100));

        const result = await scanDeadAssets(ethAddress, limit);

        return Response.json({
            ethAddress,
            scannedAt: new Date().toISOString(),
            totalHoldings: result.totalHoldings,
            deadAssets: result.deadAssets,
        });
    } catch (error) {
        const message = error instanceof Error ? error.message : "Failed to scan dead assets";

        return Response.json(
            {
                error: message,
            },
            {
                status: 400,
            }
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

function asOptionalNumber(value: unknown): number | null
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
