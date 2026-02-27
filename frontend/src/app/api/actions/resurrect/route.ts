import
    {
        ActionPostResponse,
        createPostResponse,
        ActionGetResponse,
        ActionPostRequest,
        createActionHeaders,
    } from "@solana/actions";
import
    {
        clusterApiUrl, Connection, PublicKey, SystemProgram, Transaction, TransactionInstruction,
    } from "@solana/web3.js";
import { recoverMessageAddress } from "viem";
import
    {
        CHAIN_CONFIG,
        ETH_SIGNATURE_PATTERN,
        buildResurrectionProofMessage,
        normalizeAssetInput,
    } from "@/lib/graveshift/resurrection";
import { verifyEvmOwnership } from "@/lib/graveshift/eth-ownership";

const ACTION_VERSION = "2.4";
const CHAIN_ID = "devnet";
const DEFAULT_PROGRAM_ID = "6hJAy23ndpQii5QzVmXTjGjgmDPhhPEQNvrd5o9S8JWF";
const GRAVESHIFT_PROGRAM_ID = new PublicKey(process.env.GRAVESHIFT_PROGRAM_ID ?? DEFAULT_PROGRAM_ID);
const MEMO_PROGRAM_ID = new PublicKey("MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr");
const INITIALIZE_MIGRATION_DISCRIMINATOR = Buffer.from([45, 80, 44, 197, 254, 105, 131, 109]);
const COMPLETE_MIGRATION_DISCRIMINATOR = Buffer.from([160, 78, 74, 46, 91, 133, 203, 44]);

// set up Blink-compliant CORS + metadata headers
const headers = createActionHeaders({
    chainId: CHAIN_ID,
    actionVersion: ACTION_VERSION,
});

export const runtime = "nodejs";

export const GET = async (req: Request) =>
{
    const actionHref = new URL("/api/actions/resurrect", req.url).toString();

    const payload: ActionGetResponse = {
        type: "action",
        title: "GraveShift: Resurrect Your Dead Ethereum Assets",
        icon: new URL("/favicon.ico", new URL(req.url).origin).toString(), // Usually replace with a full URL to an image
        description:
            "Verify EVM ownership (Ethereum or Polygon) and write a real on-chain migration record on Solana devnet. tokenId is required for ERC-721/ERC-1155.",
        label: "Verify + Resurrect",
        links: {
            actions: [
                {
                    type: "transaction",
                    label: "Resurrect Asset",
                    href: actionHref,
                    parameters: [
                        {
                            name: "ethAddress",
                            label: "EVM owner (0x...)",
                            required: true,
                            pattern: "^0x[a-fA-F0-9]{40}$",
                        },
                        {
                            type: "select",
                            name: "chain",
                            label: "Source chain",
                            required: true,
                            options: [
                                {
                                    label: "Ethereum",
                                    value: "ethereum",
                                    selected: true,
                                },
                                {
                                    label: "Polygon",
                                    value: "polygon",
                                },
                            ],
                        },
                        {
                            type: "select",
                            name: "assetType",
                            label: "Asset type",
                            required: true,
                            options: [
                                {
                                    label: "ERC-721 NFT",
                                    value: "erc721",
                                    selected: true,
                                },
                                {
                                    label: "ERC-20 token",
                                    value: "erc20",
                                },
                                {
                                    label: "ERC-1155",
                                    value: "erc1155",
                                },
                            ],
                        },
                        {
                            name: "contractAddress",
                            label: "Asset contract (0x...)",
                            required: true,
                            pattern: "^0x[a-fA-F0-9]{40}$",
                        },
                        {
                            name: "tokenId",
                            label: "Token ID (required for ERC-721/ERC-1155)",
                            required: false,
                            pattern: "^[0-9]+$",
                        },
                        {
                            type: "textarea",
                            name: "ethSignature",
                            label: "EVM proof signature",
                            required: true,
                            pattern: ETH_SIGNATURE_PATTERN,
                        },
                    ],
                },
            ],
        },
    };

    return Response.json(payload, {
        headers,
    });
};

export const OPTIONS = async () => Response.json(null, { headers });

export const POST = async (req: Request) =>
{
    try {
        const body: ActionPostRequest = await req.json();
        const requestData = (body.data ?? {}) as Record<string, string | Array<string> | undefined>;

        let account: PublicKey;
        try {
            account = new PublicKey(body.account);
        } catch {
            return new Response('Invalid "account" provided', {
                status: 400,
                headers,
            });
        }

        const ethAddress = extractRequiredField(requestData, "ethAddress");
        const chain = extractOptionalField(requestData, "chain") ?? "ethereum";
        const assetType = extractRequiredField(requestData, "assetType");
        const contractAddress = extractRequiredField(requestData, "contractAddress");
        const tokenId = extractOptionalField(requestData, "tokenId");
        const ethSignature = extractRequiredField(requestData, "ethSignature");

        if (!new RegExp(ETH_SIGNATURE_PATTERN).test(ethSignature)) {
            return new Response("Invalid EVM signature format", {
                status: 400,
                headers,
            });
        }

        const normalizedAsset = normalizeAssetInput({
            chain,
            ethAddress,
            assetType,
            contractAddress,
            tokenId,
        });

        const ownershipCheck = await verifyEvmOwnership(normalizedAsset);
        if (!ownershipCheck.verified) {
            return new Response(ownershipCheck.reason ?? "Ownership verification failed", {
                status: 400,
                headers,
            });
        }

        const proofMessage = buildResurrectionProofMessage({
            ...normalizedAsset,
            solanaAccount: account.toBase58(),
        });

        const recoveredAddress = await recoverMessageAddress({
            message: proofMessage,
            signature: ethSignature as `0x${string}`,
        });

        if (recoveredAddress.toLowerCase() !== normalizedAsset.ethAddress.toLowerCase()) {
            return new Response("EVM signature does not match provided owner address", {
                status: 400,
                headers,
            });
        }

        const connection = new Connection(clusterApiUrl("devnet"));
        const [migrationRecordPda] = PublicKey.findProgramAddressSync(
            [
                Buffer.from("migration"),
                account.toBuffer(),
                Buffer.from(ownershipCheck.assetId, "utf8"),
            ],
            GRAVESHIFT_PROGRAM_ID
        );

        const existingRecord = await connection.getAccountInfo(migrationRecordPda);
        if (existingRecord) {
            return new Response("This asset has already been resurrected for this Solana wallet", {
                status: 409,
                headers,
            });
        }

        const initializeIx = new TransactionInstruction({
            programId: GRAVESHIFT_PROGRAM_ID,
            keys: [
                {
                    pubkey: migrationRecordPda,
                    isWritable: true,
                    isSigner: false,
                },
                {
                    pubkey: account,
                    isWritable: true,
                    isSigner: true,
                },
                {
                    pubkey: SystemProgram.programId,
                    isWritable: false,
                    isSigner: false,
                },
            ],
            data: Buffer.concat([
                INITIALIZE_MIGRATION_DISCRIMINATOR,
                encodeAnchorString(ownershipCheck.assetId),
            ]),
        });

        const completeIx = new TransactionInstruction({
            programId: GRAVESHIFT_PROGRAM_ID,
            keys: [
                {
                    pubkey: migrationRecordPda,
                    isWritable: true,
                    isSigner: false,
                },
                {
                    pubkey: account,
                    isWritable: true,
                    isSigner: true,
                },
            ],
            data: COMPLETE_MIGRATION_DISCRIMINATOR,
        });

        const memoIx = new TransactionInstruction({
            programId: MEMO_PROGRAM_ID,
            keys: [],
            data: Buffer.from(`graveshift:${ownershipCheck.assetKey}`, "utf8"),
        });

        const transaction = new Transaction().add(initializeIx, completeIx, memoIx);

        transaction.feePayer = account;
        transaction.recentBlockhash = (
            await connection.getLatestBlockhash()
        ).blockhash;

        const payload: ActionPostResponse = await createPostResponse({
            fields: {
                type: "transaction",
                transaction,
                message: `Resurrection ready. Asset ID ${ownershipCheck.assetId} (${CHAIN_CONFIG[normalizedAsset.chain].displayName}) will be written on Solana.`,
            },
        });

        return Response.json(payload, { headers });
    } catch (err) {
        console.error(err);
        let message = "An unknown error occurred";
        if (typeof err == "string") message = err;
        if (err instanceof Error) message = err.message;
        return new Response(message, {
            status: 400,
            headers,
        });
    }
};

function extractRequiredField(
    data: Record<string, string | Array<string> | undefined>,
    fieldName: string
): string
{
    const value = extractOptionalField(data, fieldName);
    if (!value) {
        throw new Error(`Missing required field: ${fieldName}`);
    }

    return value;
}

function extractOptionalField(
    data: Record<string, string | Array<string> | undefined>,
    fieldName: string
): string | null
{
    const raw = data[fieldName];
    if (raw == null) {
        return null;
    }

    if (Array.isArray(raw)) {
        const candidate = raw.find((item) => item.trim().length > 0);
        return candidate?.trim() ?? null;
    }

    const trimmed = raw.trim();
    return trimmed.length ? trimmed : null;
}

function encodeAnchorString(value: string): Buffer
{
    const valueBytes = Buffer.from(value, "utf8");
    const lengthPrefix = Buffer.alloc(4);
    lengthPrefix.writeUInt32LE(valueBytes.length, 0);

    return Buffer.concat([lengthPrefix, valueBytes]);
}
