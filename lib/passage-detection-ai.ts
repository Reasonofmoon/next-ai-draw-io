/**
 * AI-based passage detection fallback for HWP files whose layouts defeat
 * the regex detector (e.g., question numbers in tables, nonstandard
 * punctuation, split paragraphs).
 *
 * Flow:
 *   1. Send full extracted text to /api/detect-passages (LLM, structured output)
 *   2. Receive passage list with English text + question metadata
 *   3. Fuzzy-match each English text back to the paragraph list to recover
 *      sectionIdx + insertAfterParaIdx (needed for HWP insertion).
 */

import type { DetectedPassage, HwpParagraph } from "@/lib/hwp-utils"

export interface AiDetectedPassage {
    number: number
    type: string
    koreanInstruction: string
    englishText: string
    confidence: "high" | "medium" | "low"
}

/**
 * Call the AI detection endpoint and map results back to HwpParagraph positions.
 */
export async function detectPassagesViaAI(
    paragraphs: HwpParagraph[],
    signal?: AbortSignal,
): Promise<DetectedPassage[]> {
    const fullText = paragraphs
        .map((p) => p.text)
        .filter((t) => t.length > 0)
        .join("\n")

    if (fullText.length < 100) {
        throw new Error("Document too short for AI detection (< 100 chars)")
    }

    // Truncate very long documents — most CSAT papers are ~80k chars, we allow 120k.
    const truncated =
        fullText.length > 120000 ? fullText.slice(0, 120000) : fullText

    const res = await fetch("/api/detect-passages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal,
        body: JSON.stringify({ fullText: truncated }),
    })

    if (!res.ok) {
        const body = await res.text().catch(() => "")
        throw new Error(
            `/api/detect-passages ${res.status}: ${body.slice(0, 300)}`,
        )
    }

    const data = (await res.json()) as {
        passages?: AiDetectedPassage[]
        error?: string
    }
    if (data.error || !data.passages) {
        throw new Error(data.error ?? "No passages returned")
    }

    return (
        data.passages
            .map((p) => mapAiPassageToDetected(p, paragraphs))
            .filter((p): p is DetectedPassage => p !== null)
            // Sort by question number to preserve order
            .sort((a, b) => a.questionNumber - b.questionNumber)
    )
}

/**
 * Map an AI-detected passage (text-only) to a DetectedPassage with position info.
 * Returns null if the passage text cannot be located in the document.
 */
function mapAiPassageToDetected(
    ai: AiDetectedPassage,
    paragraphs: HwpParagraph[],
): DetectedPassage | null {
    const position = findPassagePosition(ai.englishText, paragraphs)
    if (!position) {
        console.warn(
            `[passage-detection-ai] Q${ai.number}: could not locate in document, skipping`,
        )
        return null
    }

    return {
        questionNumber: ai.number,
        questionType: ai.type,
        koreanInstruction: ai.koreanInstruction,
        englishPassage: ai.englishText,
        choices: [],
        pageNumber: 0,
        sectionIdx: position.sectionIdx,
        insertAfterParaIdx: position.insertAfterParaIdx,
    }
}

/**
 * Fuzzy match AI-returned English text to paragraph positions.
 * Strategy: take a distinctive substring from the passage and substring-search
 * across paragraphs. Use the last paragraph that contains matching text as
 * the insertion anchor.
 */
function findPassagePosition(
    englishText: string,
    paragraphs: HwpParagraph[],
): { sectionIdx: number; insertAfterParaIdx: number } | null {
    // Extract a distinctive ~40-char chunk from the middle of the passage.
    // Middle is safer than start because passage headers often differ (AI may
    // reformat numbers/whitespace).
    const clean = englishText.replace(/\s+/g, " ").trim()
    if (clean.length < 20) return null

    // Try multiple probe windows: early, middle, late. First hit wins.
    const probes: string[] = []
    const addProbe = (start: number, len = 40) => {
        const p = clean
            .slice(start, start + len)
            .replace(/\s+/g, " ")
            .toLowerCase()
        if (p.length >= 20) probes.push(p)
    }
    addProbe(Math.floor(clean.length * 0.3))
    addProbe(Math.floor(clean.length * 0.6))
    addProbe(0)
    addProbe(Math.max(0, clean.length - 40))

    let startIdx = -1
    for (const probe of probes) {
        startIdx = paragraphs.findIndex((p) => {
            const pt = p.text.replace(/\s+/g, " ").toLowerCase()
            return pt.length >= 20 && pt.includes(probe)
        })
        if (startIdx >= 0) break
    }
    if (startIdx < 0) return null

    // Find the last paragraph that still contains passage content.
    // Scan forward as long as paragraphs are English-heavy.
    let endIdx = startIdx
    for (
        let i = startIdx + 1;
        i < paragraphs.length && i < startIdx + 30;
        i++
    ) {
        const pt = paragraphs[i].text.trim()
        if (pt.length === 0) continue
        // Stop if we hit a choice line or another question header
        if (/^\s*[①②③④⑤]/.test(pt)) break
        if (/^\s*(?:\[\d{1,2}\]|\d{1,2}[.)])/.test(pt)) break
        // Keep extending if still English-heavy
        const letters = (pt.match(/[a-zA-Z]/g) ?? []).length
        if (letters / pt.length > 0.3) {
            endIdx = i
        }
    }

    return {
        sectionIdx: paragraphs[endIdx].sectionIdx,
        insertAfterParaIdx: paragraphs[endIdx].paraIdx,
    }
}

/**
 * Is the regex-based detection result "good enough" to skip AI fallback?
 *
 * We want AI fallback when:
 *  - 0 passages detected
 *  - Very few passages (< 5) but document is long
 *  - Total English char count across passages is tiny (< 2000)
 */
export function isRegexResultGoodEnough(
    passages: DetectedPassage[],
    paragraphs: HwpParagraph[],
): boolean {
    if (passages.length >= 10) return true
    const totalChars = passages.reduce(
        (sum, p) => sum + p.englishPassage.length,
        0,
    )
    if (passages.length >= 5 && totalChars >= 2500) return true
    // If document itself is short, 5+ passages is plenty
    const docLen = paragraphs.reduce((sum, p) => sum + p.text.length, 0)
    if (docLen < 20000 && passages.length >= 3) return true
    return false
}
