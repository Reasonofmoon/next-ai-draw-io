/**
 * Korean-content generator.
 *
 * Given a detected English passage + a free-form user prompt ("해석 + 핵심
 * 어휘 6개 + 오답 해설"), calls /api/generate-korean-content and returns a
 * structured list of content blocks ready for HWP rendering.
 *
 * Vocabulary is always generated FIRST so the downstream diagram generator
 * can use the vocab list as a hint (vocab-aware diagrams).
 */

import { z } from "zod"
import {
    ALL_STYLE_PRESET_IDS,
    type StylePresetId,
} from "@/lib/hwp-format-rules"
import type { DetectedPassage } from "@/lib/hwp-utils"

// ---------------------------------------------------------------------------
// Schemas (shared between route.ts and client)
// ---------------------------------------------------------------------------

export const BLOCK_TYPES = [
    "vocabulary",
    "translation",
    "summary",
    "grammar",
    "answer_explanation",
    "background",
    "custom",
] as const

export type BlockType = (typeof BLOCK_TYPES)[number]

export const VocabEntrySchema = z.object({
    word: z.string().min(1).max(40),
    meaning: z.string().min(1).max(80),
    example: z.string().max(120).optional(),
})
export type VocabEntry = z.infer<typeof VocabEntrySchema>

export const StylePresetIdSchema = z.enum(
    ALL_STYLE_PRESET_IDS as [StylePresetId, ...StylePresetId[]],
)

export const ContentBlockSchema = z.object({
    type: z.enum(BLOCK_TYPES),
    title: z.string().min(1).max(40),
    stylePreset: StylePresetIdSchema,
    renderAs: z.enum(["textbox", "table"]),
    /**
     * Paragraph text OR array of vocab entries. Discriminated by `renderAs`:
     * - renderAs = "table"   → content must be VocabEntry[]
     * - renderAs = "textbox" → content must be string
     */
    textContent: z.string().max(4000).optional(),
    vocabEntries: z.array(VocabEntrySchema).max(15).optional(),
    /** Optional AI rationale for why this block was chosen (inline-ai style). */
    reasoning: z.string().max(200).optional(),
})
export type ContentBlock = z.infer<typeof ContentBlockSchema>

export const ContentResponseSchema = z.object({
    blocks: z.array(ContentBlockSchema).min(1).max(8),
})
export type ContentResponse = z.infer<typeof ContentResponseSchema>

// ---------------------------------------------------------------------------
// Ordering enforcement: vocab before diagram
// ---------------------------------------------------------------------------

/**
 * Ensure the vocabulary block (if any) comes first in the blocks array.
 * The diagram generator runs *after* this step, so the vocab block is
 * guaranteed to exist before diagram prompting.
 */
export function enforceVocabFirst(blocks: ContentBlock[]): ContentBlock[] {
    const vocabIdx = blocks.findIndex((b) => b.type === "vocabulary")
    if (vocabIdx <= 0) return blocks
    const vocab = blocks[vocabIdx]
    const rest = blocks.filter((_, i) => i !== vocabIdx)
    return [vocab, ...rest]
}

/**
 * Extract the vocabulary list from generated blocks, for passing to the
 * diagram prompt as a hint. Returns an empty array if no vocab block.
 */
export function extractVocabHint(blocks: ContentBlock[]): VocabEntry[] {
    const vocab = blocks.find(
        (b) => b.type === "vocabulary" && b.renderAs === "table",
    )
    return vocab?.vocabEntries ?? []
}

// ---------------------------------------------------------------------------
// Client
// ---------------------------------------------------------------------------

export interface GenerateKoreanContentRequest {
    passage: Pick<
        DetectedPassage,
        | "englishPassage"
        | "questionType"
        | "koreanInstruction"
        | "questionNumber"
    >
    userPrompt: string
    /**
     * Template id — restricts which block types the AI may emit.
     * Passed through to the system prompt.
     */
    templateId?: string
    /**
     * Which block types are allowed for the chosen template. If omitted,
     * all BLOCK_TYPES are allowed.
     */
    allowedBlockTypes?: BlockType[]
}

export interface GenerateKoreanContentResult {
    blocks: ContentBlock[]
    modelId?: string
    usage?: { inputTokens?: number; outputTokens?: number }
}

/**
 * Call /api/generate-korean-content and return normalized blocks.
 * Vocab-first ordering is enforced client-side as a safety net.
 */
export async function generateKoreanContent(
    req: GenerateKoreanContentRequest,
    signal?: AbortSignal,
): Promise<GenerateKoreanContentResult> {
    const res = await fetch("/api/generate-korean-content", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal,
        body: JSON.stringify(req),
    })

    if (!res.ok) {
        const body = await res.text().catch(() => "")
        throw new Error(
            `/api/generate-korean-content ${res.status}: ${body.slice(0, 300)}`,
        )
    }

    const data = (await res.json()) as {
        blocks?: ContentBlock[]
        error?: string
        modelId?: string
        usage?: GenerateKoreanContentResult["usage"]
    }
    if (data.error || !data.blocks) {
        throw new Error(data.error ?? "No blocks returned")
    }

    return {
        blocks: enforceVocabFirst(data.blocks),
        modelId: data.modelId,
        usage: data.usage,
    }
}
