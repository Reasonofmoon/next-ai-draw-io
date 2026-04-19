/**
 * Shared helpers for /api/chat and /api/generate-passage-diagram (and future
 * batch endpoints). Extracts the client-header → provider-config plumbing
 * that was previously inline in /api/chat.
 */

import { findServerModelById } from "@/lib/server-model-config"

/**
 * Parse client-supplied AI provider overrides from request headers.
 * Matches the behavior of /api/chat but without quota/session/message logic.
 */
export async function parseClientOverrides(req: Request): Promise<{
    provider: string | null
    baseUrl: string | null
    apiKey: string | null
    modelId: string | null
    awsAccessKeyId: string | null
    awsSecretAccessKey: string | null
    awsRegion: string | null
    awsSessionToken: string | null
    vertexApiKey: string | null
    apiKeyEnv?: string | string[]
    baseUrlEnv?: string
    headers?: Record<string, string>
}> {
    const provider = req.headers.get("x-ai-provider")
    let baseUrl = req.headers.get("x-ai-base-url")
    const selectedModelId = req.headers.get("x-selected-model-id")

    // EdgeOne special-case: construct full URL
    if (provider === "edgeone" && !baseUrl) {
        const origin = req.headers.get("origin") || new URL(req.url).origin
        baseUrl = `${origin}/api/edgeai`
    }

    const cookieHeader = req.headers.get("cookie")

    // Server model lookup
    let serverModelConfig: {
        apiKeyEnv?: string | string[]
        baseUrlEnv?: string
        provider?: string
    } = {}
    if (selectedModelId?.startsWith("server:")) {
        const serverModel = await findServerModelById(selectedModelId)
        if (serverModel) {
            serverModelConfig = {
                apiKeyEnv: serverModel.apiKeyEnv,
                baseUrlEnv: serverModel.baseUrlEnv,
                provider: serverModel.provider,
            }
        }
    }

    return {
        provider: serverModelConfig.provider || provider,
        baseUrl,
        apiKey: req.headers.get("x-ai-api-key"),
        modelId: req.headers.get("x-ai-model"),
        awsAccessKeyId: req.headers.get("x-aws-access-key-id"),
        awsSecretAccessKey: req.headers.get("x-aws-secret-access-key"),
        awsRegion: req.headers.get("x-aws-region"),
        awsSessionToken: req.headers.get("x-aws-session-token"),
        vertexApiKey: req.headers.get("x-vertex-api-key"),
        ...(serverModelConfig.apiKeyEnv !== undefined && {
            apiKeyEnv: serverModelConfig.apiKeyEnv,
        }),
        ...(serverModelConfig.baseUrlEnv !== undefined && {
            baseUrlEnv: serverModelConfig.baseUrlEnv,
        }),
        ...(provider === "edgeone" &&
            cookieHeader && {
                headers: { cookie: cookieHeader },
            }),
    }
}

/**
 * Check access code (if ACCESS_CODE_LIST env is configured).
 * Returns null if allowed, otherwise returns a Response to return to the client.
 */
export function checkAccessCode(req: Request): Response | null {
    const accessCodes =
        process.env.ACCESS_CODE_LIST?.split(",")
            .map((code) => code.trim())
            .filter(Boolean) || []
    if (accessCodes.length === 0) return null

    const provided = req.headers.get("x-access-code")
    if (!provided || !accessCodes.includes(provided)) {
        return Response.json(
            {
                error: "Invalid or missing access code. Please configure it in Settings.",
            },
            { status: 401 },
        )
    }
    return null
}

/**
 * Detect whether the request brings its own AI credentials.
 * Used to decide whether to enforce the platform daily quota.
 */
export function hasOwnApiKey(req: Request): boolean {
    return !!(
        req.headers.get("x-ai-provider") &&
        (req.headers.get("x-ai-api-key") ||
            req.headers.get("x-aws-access-key-id") ||
            req.headers.get("x-vertex-api-key"))
    )
}
