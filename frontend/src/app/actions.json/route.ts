import { createActionHeaders } from "@solana/actions";

const headers = createActionHeaders({
    chainId: "devnet",
    actionVersion: "2.4",
});

export const GET = async () =>
{
    const payload = {
        rules: [
            {
                pathPattern: "/*",
                apiPath: "/api/actions/*",
            },
            {
                pathPattern: "/api/actions/**",
                apiPath: "/api/actions/**",
            },
        ],
    };

    return Response.json(payload, {
        headers,
    });
};

export const OPTIONS = GET;
