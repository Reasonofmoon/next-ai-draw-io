/**
 * POST /api/generate-korean-content
 *
 * Phase-1 endpoint for the Korean content pipeline.
 *
 * Given an English reading passage + a free-form Korean user prompt
 * ("해석 + 핵심 어휘 6개 + 오답 해설"), returns a structured list of
 * content blocks. Each block declares:
 *   - type       (vocabulary / translation / summary / grammar / ...)
 *   - stylePreset (one of 4 fixed Level-1 visuals)
 *   - renderAs   (textbox | table)
 *   - content    (string OR VocabEntry[])
 *
 * The AI picks stylePreset + renderAs — clamped to the allow-list — so we
 * never have to trust free-form HWP formatting output.
 *
 * See tasks/korean-content-pipeline.md for the full design.
 */

import { generateObject } from "ai"
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
import {
    ALL_STYLE_PRESET_IDS,
    stylePresetGuidanceMarkdown,
} from "@/lib/hwp-format-rules"
import {
    BLOCK_TYPES,
    type BlockType,
    ContentResponseSchema,
    enforceVocabFirst,
} from "@/lib/korean-content-generator"
import { getUserIdFromRequest } from "@/lib/user-id"

export const maxDuration = 120

const RequestSchema = z.object({
    passage: z.object({
        englishPassage: z.string().min(20).max(6000),
        questionType: z.string().max(50),
        koreanInstruction: z.string().max(500).optional(),
        questionNumber: z.union([z.number(), z.string()]).optional(),
    }),
    userPrompt: z.string().min(2).max(1000),
    templateId: z.string().max(40).optional(),
    allowedBlockTypes: z
        .array(z.enum(BLOCK_TYPES))
        .min(1)
        .max(BLOCK_TYPES.length)
        .optional(),
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
            { error: "Invalid request body", issues: parsed.error.issues },
            { status: 400 },
        )
    }
    const { passage, userPrompt, templateId, allowedBlockTypes } = parsed.data
    const allowed: readonly BlockType[] =
        allowedBlockTypes ?? (BLOCK_TYPES as readonly BlockType[])

    // 3. Quota (skipped for BYO-key / anonymous)
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

    // 4. Model
    const clientOverrides = await parseClientOverrides(req)
    const { model, providerOptions, headers, modelId } =
        getAIModel(clientOverrides)

    // 5. Prompt
    const systemPrompt = [
        "You generate structured Korean-language study content for CSAT (수능) English reading passages.",
        "",
        "Your output will be rendered into a HWP (한글) document as text boxes and tables, so you MUST:",
        "  - Produce Korean text in all `title`, `textContent`, and `meaning` fields.",
        "  - English is allowed only inside VocabEntry.word and VocabEntry.example.",
        "  - Choose renderAs=`table` ONLY for block type `vocabulary`, providing vocabEntries[]; leave textContent empty.",
        "  - Choose renderAs=`textbox` for all other block types, providing textContent (a single string, \\n-separated paragraphs OK); leave vocabEntries empty.",
        "  - Never invent answer keys — if the passage doesn't include ①②③④⑤ choices, skip `answer_explanation`.",
        "",
        "STYLE PRESETS (pick one per block, by id):",
        stylePresetGuidanceMarkdown(),
        "",
        "Preset defaults by block type (use these unless the user prompt overrides):",
        "  - vocabulary          → stylePreset=body-plain, renderAs=table",
        "  - translation         → stylePreset=body-plain, renderAs=textbox",
        "  - summary             → stylePreset=body-plain, renderAs=textbox",
        "  - grammar             → stylePreset=callout-box, renderAs=textbox",
        "  - answer_explanation  → stylePreset=callout-box, renderAs=textbox",
        "  - background          → stylePreset=body-muted, renderAs=textbox",
        "  - custom              → stylePreset=body-plain, renderAs=textbox",
        "",
        "ORDERING RULE (critical):",
        "  If you emit a `vocabulary` block, it MUST be the FIRST element of blocks[].",
        "  Downstream diagram generation depends on reading vocabulary before drawing.",
        "",
        `ALLOWED BLOCK TYPES for this request: ${allowed.join(", ")}.`,
        templateId
            ? `Target template: ${templateId}. Respect its allowed-block restrictions.`
            : "",
        "",
        "Emit at most 6 blocks. Keep each textContent under 800 Korean characters unless the user explicitly asks for more.",
        "Include a short `reasoning` (한국어, 1문장, ≤ 60자) for each block explaining why you chose that type.",
    ]
        .filter(Boolean)
        .join("\n")

    const userMessage = [
        `[문항 번호] ${passage.questionNumber ?? "-"}`,
        `[문항 유형] ${passage.questionType}`,
        passage.koreanInstruction
            ? `[한글 발문] ${passage.koreanInstruction}`
            : "",
        "",
        "[영어 지문]",
        passage.englishPassage,
        "",
        "[사용자 요청]",
        userPrompt,
        "",
        "위 지문에 대한 한글 학습 콘텐츠를 생성하세요. 사용자 요청을 최우선으로 반영하되, 허용된 블록 타입과 스타일 프리셋 안에서만 작성하세요.",
    ]
        .filter(Boolean)
        .join("\n")

    try {
        const result = await generateObject({
            model,
            providerOptions,
            headers,
            schema: ContentResponseSchema,
            schemaName: "KoreanContentBlocks",
            system: systemPrompt,
            prompt: userMessage,
        })

        // 6. Server-side clamp — enforce allow-list, fix renderAs/content mismatch,
        //    and vocab-first ordering even if the model ignored the rules.
        const cleanedBlocks = result.object.blocks
            .filter((b) => allowed.includes(b.type))
            .map((b) => {
                // Clamp stylePreset just in case
                const stylePreset = ALL_STYLE_PRESET_IDS.includes(b.stylePreset)
                    ? b.stylePreset
                    : "body-plain"
                // renderAs must match content shape
                if (b.type === "vocabulary") {
                    return {
                        ...b,
                        stylePreset,
                        renderAs: "table" as const,
                        vocabEntries: b.vocabEntries ?? [],
                        textContent: undefined,
                    }
                }
                return {
                    ...b,
                    stylePreset,
                    renderAs: "textbox" as const,
                    textContent: b.textContent ?? "",
                    vocabEntries: undefined,
                }
            })

        if (cleanedBlocks.length === 0) {
            return Response.json(
                {
                    error: "Model returned no blocks matching the allowed types. Try relaxing the prompt.",
                },
                { status: 422 },
            )
        }

        const blocks = enforceVocabFirst(cleanedBlocks)

        return Response.json({
            blocks,
            usage: result.usage,
            modelId,
        })
    } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err)
        console.error("[/api/generate-korean-content] AI call failed:", err)
        return Response.json(
            { error: `AI content generation failed: ${errMsg}` },
            { status: 502 },
        )
    }
}
