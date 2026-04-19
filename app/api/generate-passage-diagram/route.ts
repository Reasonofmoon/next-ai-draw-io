/**
 * POST /api/generate-passage-diagram
 *
 * Batch-optimized non-streaming endpoint. Takes a CSAT English reading passage
 * plus metadata, calls the configured AI with the display_diagram tool,
 * and returns the resulting mxCell XML as a plain JSON response.
 *
 * Compared to /api/chat, this endpoint:
 *   - returns JSON (no SSE parsing on the client)
 *   - accepts a single passage (no message history)
 *   - uses generateText (single-shot, maxSteps=1)
 *   - still honors access code, quota, provider overrides, and prompt caching
 */

import { generateText } from "ai"
import { z } from "zod"
import { getAIModel } from "@/lib/ai-providers"
import {
    checkAccessCode,
    hasOwnApiKey,
    parseClientOverrides,
} from "@/lib/ai-shared"
import {
    checkAndIncrementRequest,
    isQuotaEnabled,
} from "@/lib/dynamo-quota-manager"
import { getSystemPrompt } from "@/lib/system-prompts"
import { getUserIdFromRequest } from "@/lib/user-id"

export const maxDuration = 120

const RequestSchema = z.object({
    passage: z.object({
        englishText: z.string().min(10).max(10000),
        questionType: z.string().max(50),
        koreanInstruction: z.string().max(500).optional(),
        questionNumber: z.union([z.number(), z.string()]).optional(),
    }),
    /**
     * Optional caller-built prompt (overrides server-built default).
     * Pipeline's buildPassagePrompt sends this so prompt shaping stays
     * in the shared pipeline module.
     */
    userPrompt: z.string().max(20000).optional(),
    /**
     * Whether to include the minimal (no-styling) system prompt variant.
     */
    minimalStyle: z.boolean().optional(),
})

export async function POST(req: Request): Promise<Response> {
    // 1. Access code
    const accessResp = checkAccessCode(req)
    if (accessResp) return accessResp

    // 2. Parse & validate body
    let body: unknown
    try {
        body = await req.json()
    } catch {
        return Response.json({ error: "Invalid JSON body" }, { status: 400 })
    }
    const parsed = RequestSchema.safeParse(body)
    if (!parsed.success) {
        return Response.json(
            {
                error: "Invalid request body",
                issues: parsed.error.issues,
            },
            { status: 400 },
        )
    }
    const { passage, userPrompt, minimalStyle = false } = parsed.data

    // 3. Quota
    const userId = getUserIdFromRequest(req)
    if (isQuotaEnabled() && !hasOwnApiKey(req) && userId !== "anonymous") {
        const quotaCheck = await checkAndIncrementRequest(userId, {
            requests: Number(process.env.DAILY_REQUEST_LIMIT) || 10,
            tokens: Number(process.env.DAILY_TOKEN_LIMIT) || 200000,
            tpm: Number(process.env.TPM_LIMIT) || 20000,
        })
        if (!quotaCheck.allowed) {
            return Response.json(
                {
                    error: quotaCheck.error,
                    type: quotaCheck.type,
                    used: quotaCheck.used,
                    limit: quotaCheck.limit,
                },
                { status: 429 },
            )
        }
    }

    // 4. Resolve model
    const clientOverrides = await parseClientOverrides(req)
    const { model, providerOptions, headers, modelId } =
        getAIModel(clientOverrides)

    // 5. Build messages
    const systemMessage = getSystemPrompt(modelId, minimalStyle)
    const finalUserPrompt = userPrompt ?? buildDefaultPrompt(passage)

    // 6. Call AI with display_diagram tool (non-streaming)
    try {
        const result = await generateText({
            model,
            providerOptions,
            headers,
            system: systemMessage,
            messages: [{ role: "user", content: finalUserPrompt }],
            tools: {
                display_diagram: {
                    description:
                        "Display a diagram on draw.io. Pass ONLY the mxCell elements; wrapper tags are added automatically. Every mxCell needs unique id (start from '2') and parent='1'.",
                    inputSchema: z.object({
                        xml: z
                            .string()
                            .describe("mxCell XML fragment for the diagram"),
                    }),
                },
            },
            toolChoice: { type: "tool", toolName: "display_diagram" },
            stopWhen: () => true, // single step — tool call IS the answer
        })

        // 7. Extract XML from tool call
        const toolCall = result.toolCalls?.find(
            (tc) => tc.toolName === "display_diagram",
        )
        // AI SDK v5 uses .input, older .args — support both
        const xml =
            (toolCall as { input?: { xml?: string } } | undefined)?.input
                ?.xml ??
            (toolCall as { args?: { xml?: string } } | undefined)?.args?.xml ??
            ""

        if (!xml || xml.trim().length === 0) {
            // Fallback: scan text for mxCell fragments
            const raw = result.text ?? ""
            const fragment = extractMxCellFragment(raw)
            if (fragment) {
                return Response.json({
                    xml: fragment,
                    usage: result.usage,
                    warning: "Extracted XML from text (no tool call present)",
                })
            }
            return Response.json(
                {
                    error: "Model returned no diagram XML",
                    rawText: raw.slice(0, 500),
                    finishReason: result.finishReason,
                },
                { status: 502 },
            )
        }

        return Response.json({
            xml,
            usage: result.usage,
            modelId,
        })
    } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err)
        console.error("[/api/generate-passage-diagram] AI call failed:", err)
        return Response.json(
            { error: `AI call failed: ${errMsg}` },
            { status: 502 },
        )
    }
}

function buildDefaultPrompt(p: {
    englishText: string
    questionType: string
    koreanInstruction?: string
}): string {
    // Kept minimal — real prompt shaping lives in lib/passage-pipeline.ts
    // and is sent via userPrompt. This is only a safety fallback.
    return [
        `Generate a draw.io diagram for this ${p.questionType} CSAT passage.`,
        p.koreanInstruction
            ? `Korean instruction (context): ${p.koreanInstruction}`
            : "",
        "",
        "Passage:",
        p.englishText,
    ]
        .filter(Boolean)
        .join("\n")
}

function extractMxCellFragment(text: string): string | null {
    // Strip markdown code fences if present
    const fenceMatch = text.match(/```(?:xml|markup)?\s*([\s\S]*?)```/)
    const candidate = fenceMatch ? fenceMatch[1] : text
    // Find the first <mxCell> ... last </mxCell>
    const first = candidate.indexOf("<mxCell")
    if (first < 0) return null
    const lastClose = Math.max(
        candidate.lastIndexOf("</mxCell>") + "</mxCell>".length,
        candidate.lastIndexOf("/>") + 2,
    )
    if (lastClose <= first) return null
    return candidate.slice(first, lastClose).trim()
}
