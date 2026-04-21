/**
 * Phase 4a — Orchestrator that takes detected-passages + generated content
 * blocks + a template, and writes the result into an HWP file.
 *
 * Pipeline:
 *   1. For each selected passage, we have `blocks: ContentBlock[]`.
 *   2. Order the blocks by `template.blockOrder` (respecting template).
 *   3. Filter to `template.allowedBlockTypes`.
 *   4. Insert each block BELOW the passage's `insertAfterParaIdx`.
 *
 * IMPORTANT — insertion-order correctness:
 *   Inserting paragraphs SHIFTS subsequent paragraph indices. To stay safe,
 *   we process passages in **reverse (section desc, paragraph desc)** order,
 *   exactly like insertMultiplePicturesIntoHwp.
 */

import type { HwpDocument } from "@rhwp/core"
import type { StylePresetId } from "@/lib/hwp-format-rules"
import {
    insertLabeledBlockAfter,
    insertParagraphAfter,
    insertVocabTableAfter,
} from "@/lib/hwp-primitives"
import type { HwpTemplate } from "@/lib/hwp-templates"
import type { DetectedPassage } from "@/lib/hwp-utils"
import type { ContentBlock, VocabEntry } from "@/lib/korean-content-generator"

// ---------------------------------------------------------------------------
// Module initialisation (client-side only, mirrors hwp-utils)
// ---------------------------------------------------------------------------

let rhwpModule: typeof import("@rhwp/core") | null = null
let initialized = false

function registerMeasureTextWidth(): void {
    let ctx: CanvasRenderingContext2D | null = null
    let lastFont = ""
    // biome-ignore lint/suspicious/noExplicitAny: WASM callback global
    ;(globalThis as any).measureTextWidth = (
        font: string,
        text: string,
    ): number => {
        if (!ctx) {
            const canvas = document.createElement("canvas")
            ctx = canvas.getContext("2d")
        }
        if (ctx && font !== lastFont) {
            ctx.font = font
            lastFont = font
        }
        return ctx?.measureText(text).width ?? 0
    }
}

async function ensureInitialized(): Promise<typeof import("@rhwp/core")> {
    if (typeof window === "undefined") {
        throw new Error("@rhwp/core requires browser environment (Canvas API)")
    }
    if (rhwpModule && initialized) return rhwpModule
    registerMeasureTextWidth()
    rhwpModule = await import("@rhwp/core")
    await rhwpModule.default({ module_or_path: "/rhwp_bg.wasm" })
    initialized = true
    return rhwpModule
}

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface ContentInsertionPlan {
    passage: DetectedPassage
    blocks: ContentBlock[]
}

export interface InsertKoreanContentOptions {
    hwpFile: File
    plans: ContentInsertionPlan[]
    template: HwpTemplate
}

export interface InsertKoreanContentResult {
    bytes: Uint8Array
    insertedBlockCount: number
    skippedBlockCount: number
}

// ---------------------------------------------------------------------------
// Block ordering per template
// ---------------------------------------------------------------------------

function orderBlocksForTemplate(
    blocks: ContentBlock[],
    template: HwpTemplate,
): ContentBlock[] {
    const allowed = new Set(template.allowedBlockTypes)
    const orderIndex = new Map<string, number>()
    template.blockOrder.forEach((type, i) => {
        orderIndex.set(type, i)
    })

    return [...blocks]
        .filter((b) => allowed.has(b.type))
        .sort((a, b) => {
            const ai = orderIndex.get(a.type) ?? 999
            const bi = orderIndex.get(b.type) ?? 999
            return ai - bi
        })
}

// ---------------------------------------------------------------------------
// Single-block insertion. Returns the NEW cursor paraIdx below the block.
// ---------------------------------------------------------------------------

function insertBlock(
    doc: HwpDocument,
    sectionIdx: number,
    cursorParaIdx: number,
    block: ContentBlock,
): number {
    if (block.type === "vocabulary" && block.renderAs === "table") {
        const entries: VocabEntry[] = block.vocabEntries ?? []
        // Write the block header as a plain bold-ish paragraph, then the table
        let c = insertParagraphAfter(
            doc,
            sectionIdx,
            cursorParaIdx,
            `■ ${block.title}`,
        )
        c = insertVocabTableAfter(doc, sectionIdx, c, entries)
        if (block.reasoning) {
            c = insertParagraphAfter(
                doc,
                sectionIdx,
                c,
                `💡 ${block.reasoning}`,
            )
        }
        return insertParagraphAfter(doc, sectionIdx, c, "")
    }

    // textbox-style block — paragraph stand-in for Phase 4a
    return insertLabeledBlockAfter(doc, sectionIdx, cursorParaIdx, {
        title: block.title,
        body: block.textContent ?? "",
        stylePreset: block.stylePreset as StylePresetId,
        reasoning: block.reasoning,
    })
}

// ---------------------------------------------------------------------------
// Per-passage rendering
// ---------------------------------------------------------------------------

interface RenderStats {
    inserted: number
    skipped: number
}

function renderPassageContent(
    doc: HwpDocument,
    plan: ContentInsertionPlan,
    template: HwpTemplate,
): RenderStats {
    const stats: RenderStats = { inserted: 0, skipped: 0 }
    const ordered = orderBlocksForTemplate(plan.blocks, template)

    if (ordered.length === 0) return stats

    const sectionIdx = plan.passage.sectionIdx
    let cursor = plan.passage.insertAfterParaIdx

    // Section header: "[N번 한글 학습 콘텐츠]"
    try {
        cursor = insertParagraphAfter(
            doc,
            sectionIdx,
            cursor,
            `── ${plan.passage.questionNumber}번 한글 학습 콘텐츠 (${template.name}) ──`,
        )
    } catch (err) {
        console.warn(
            `[hwp-content-renderer] passage ${plan.passage.questionNumber} header insert failed:`,
            err,
        )
    }

    for (const block of ordered) {
        try {
            cursor = insertBlock(doc, sectionIdx, cursor, block)
            stats.inserted++
        } catch (err) {
            console.error(
                `[hwp-content-renderer] passage ${plan.passage.questionNumber} block ${block.type} insert failed:`,
                err,
            )
            stats.skipped++
        }
    }

    return stats
}

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

export async function insertKoreanContentIntoHwp(
    options: InsertKoreanContentOptions,
): Promise<InsertKoreanContentResult> {
    const rhwp = await ensureInitialized()
    const buffer = new Uint8Array(await options.hwpFile.arrayBuffer())
    const doc = new rhwp.HwpDocument(buffer)

    // Process in reverse order so earlier paragraph indices stay valid.
    const ordered = [...options.plans].sort((a, b) => {
        if (a.passage.sectionIdx !== b.passage.sectionIdx) {
            return b.passage.sectionIdx - a.passage.sectionIdx
        }
        return b.passage.insertAfterParaIdx - a.passage.insertAfterParaIdx
    })

    let inserted = 0
    let skipped = 0

    try {
        for (const plan of ordered) {
            const stats = renderPassageContent(doc, plan, options.template)
            inserted += stats.inserted
            skipped += stats.skipped
        }
        const bytes = doc.exportHwp()
        return {
            bytes,
            insertedBlockCount: inserted,
            skippedBlockCount: skipped,
        }
    } finally {
        doc.free()
    }
}
