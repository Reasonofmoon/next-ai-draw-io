/**
 * POST /api/detect-passages
 *
 * AI fallback for CSAT reading-passage detection. Takes the full text extracted
 * from a HWP/HWPX document and returns a structured list of English reading
 * passages with their question numbers and types.
 *
 * Use this when regex-based detection (detectPassagesFromParagraphs) returns
 * too few results. The client is responsible for mapping the returned passage
 * text back to paragraph indices via fuzzy substring matching.
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
import { getUserIdFromRequest } from "@/lib/user-id"

export const maxDuration = 120

const RequestSchema = z.object({
    fullText: z.string().min(100).max(120000),
    /** Optional hint — range of question numbers to look for. */
    numberRange: z
        .object({
            min: z.number().int().min(1).max(99),
            max: z.number().int().min(1).max(99),
        })
        .optional(),
})

const PassageSchema = z.object({
    number: z
        .number()
        .int()
        .describe(
            "Question number as shown in the document (e.g., 18, 19, ...)",
        ),
    type: z
        .enum([
            "주제",
            "요지",
            "빈칸 추론",
            "순서 배열",
            "문장 위치",
            "함축 의미",
            "목적",
            "심경/분위기",
            "무관한 문장",
            "제목",
            "요약",
            "어법/어휘",
            "기타",
        ])
        .describe("CSAT question type in Korean"),
    koreanInstruction: z
        .string()
        .max(300)
        .describe(
            "Korean question instruction (the line asking the student what to do)",
        ),
    englishText: z
        .string()
        .min(50)
        .max(3000)
        .describe(
            "The complete English reading passage. Do NOT include Korean text, answer choices (①②③④⑤), or listening scripts.",
        ),
    confidence: z
        .enum(["high", "medium", "low"])
        .describe("Detection confidence based on text clarity"),
})

const ResponseSchema = z.object({
    passages: z
        .array(PassageSchema)
        .describe(
            "All English reading passages found in the document, in order",
        ),
})

export async function POST(req: Request): Promise<Response> {
    const accessResp = checkAccessCode(req)
    if (accessResp) return accessResp

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
    const { fullText, numberRange } = parsed.data

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

    const clientOverrides = await parseClientOverrides(req)
    const { model, providerOptions, headers, modelId } =
        getAIModel(clientOverrides)

    const numMin = numberRange?.min ?? 18
    const numMax = numberRange?.max ?? 45

    const systemPrompt = [
        "You are a CSAT (Korean college entrance exam) English section parser.",
        "Your job: extract every English reading passage from the supplied document text.",
        "",
        "RULES:",
        `1. Only extract numbered questions in the range ${numMin}–${numMax} (the reading comprehension section).`,
        "2. Extract ONLY the English reading text — skip Korean translations, Korean instructions (they go in koreanInstruction field), answer choices (①②③④⑤), and listening scripts (lines starting with W:/M:/여:/남:).",
        "3. If a question is a paragraph-ordering question (순서 배열), reconstruct the English passage as (Given) (A) (B) (C) in the order they appear.",
        "4. For 빈칸 추론, include the passage WITH the blank (use ______ or [BLANK] as placeholder).",
        "5. Group multi-question passages (e.g., 43-45 share one passage) into a single entry with the first question number.",
        "6. Do NOT include answer commentary, 해설, 풀이, [정답], or 출제의도 sections — these are not the original problem, they are the answer key.",
        "7. If you cannot find enough clean English text for a question (under 50 chars), omit it.",
        "8. Confidence = high if passage is clearly delimited, medium if you had to infer boundaries, low if uncertain.",
    ].join("\n")

    const userPrompt = [
        "Extract all English reading passages from the following document text.",
        "",
        "Document:",
        "```",
        fullText,
        "```",
    ].join("\n")

    try {
        const result = await generateObject({
            model,
            providerOptions,
            headers,
            schema: ResponseSchema,
            schemaName: "PassageDetection",
            system: systemPrompt,
            prompt: userPrompt,
        })

        return Response.json({
            passages: result.object.passages,
            usage: result.usage,
            modelId,
        })
    } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err)
        console.error("[/api/detect-passages] AI call failed:", err)
        return Response.json(
            { error: `AI detection failed: ${errMsg}` },
            { status: 502 },
        )
    }
}
