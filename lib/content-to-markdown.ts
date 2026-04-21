/**
 * Serialize AI-generated ContentBlocks (per passage) into a single
 * Markdown document suitable for kordoc's `markdownToHwpx` reverse
 * conversion.
 *
 * Output shape:
 *
 *     # 생성된 콘텐츠 — <timestamp>
 *
 *     ## Q1 (빈칸추론)
 *     > 원문: Despite the falling snow…
 *
 *     ### 어휘
 *     | 단어 | 뜻 | 예문 |
 *     | --- | --- | --- |
 *     | …  | …  | … |
 *
 *     ### 요지
 *     …paragraph…
 *
 *     ---
 *
 *     ## Q3 (어휘)
 *     …
 *
 * The choice to go Markdown-first (not HWPX-first) is deliberate: kordoc's
 * `markdownToHwpx` is well-trodden, while building HWPX via @rhwp/core
 * would duplicate the whole insertion pipeline. This is the "lightweight"
 * alternative path — when the teacher wants the AI output as a shareable
 * file without touching the original HWP.
 */

import type { DetectedPassage } from "@/lib/hwp-utils"
import type { ContentBlock, VocabEntry } from "@/lib/korean-content-generator"

/**
 * Escape a cell so pipe/newline don't break the markdown table grammar.
 * kordoc's parser is tolerant but we still want clean output for users
 * who open the intermediate .md by hand.
 */
function escapeCell(s: string): string {
    return s.replace(/\r?\n/g, " ").replace(/\|/g, "\\|").trim()
}

function vocabTable(entries: VocabEntry[]): string {
    if (entries.length === 0) return ""
    const header = "| 단어 | 뜻 | 예문 |\n| --- | --- | --- |"
    const rows = entries
        .map(
            (e) =>
                `| ${escapeCell(e.word)} | ${escapeCell(e.meaning)} | ${escapeCell(
                    e.example ?? "",
                )} |`,
        )
        .join("\n")
    return `${header}\n${rows}`
}

function renderBlock(b: ContentBlock): string {
    const heading = `### ${b.title}`
    if (b.renderAs === "table" && b.vocabEntries) {
        return `${heading}\n\n${vocabTable(b.vocabEntries)}`
    }
    const body = (b.textContent ?? "").trim()
    return body ? `${heading}\n\n${body}` : heading
}

/** Brief preview of the original English passage — trimmed to 200 chars. */
function passageBlockquote(passage: DetectedPassage): string {
    const src = passage.englishPassage.replace(/\s+/g, " ").trim()
    if (!src) return ""
    const preview = src.length > 200 ? `${src.slice(0, 200)}…` : src
    return `> 원문: ${preview}`
}

export interface ContentMarkdownOptions {
    /** Document title at the top. Defaults to a timestamp line. */
    docTitle?: string
    /** Include the English passage preview as a blockquote. Default: true. */
    includePassagePreview?: boolean
}

/**
 * Collect every passage that has generated content, in passage order.
 * Passages without content are skipped entirely — no empty sections.
 *
 * Returns an empty string if nothing has been generated yet.
 */
export function contentBlocksToMarkdown(
    passages: DetectedPassage[],
    contentByPassage: Map<number, ContentBlock[]>,
    options: ContentMarkdownOptions = {},
): string {
    const includePassagePreview = options.includePassagePreview ?? true

    const sections: string[] = []
    const title =
        options.docTitle ??
        `생성된 콘텐츠 — ${new Date().toISOString().slice(0, 16).replace("T", " ")}`
    sections.push(`# ${title}`)

    let written = 0
    for (const p of passages) {
        const blocks = contentByPassage.get(p.questionNumber)
        if (!blocks || blocks.length === 0) continue
        written++

        const parts: string[] = []
        parts.push(`## Q${p.questionNumber} (${p.questionType})`)
        if (includePassagePreview) {
            const quote = passageBlockquote(p)
            if (quote) parts.push(quote)
        }
        for (const b of blocks) parts.push(renderBlock(b))
        sections.push(parts.join("\n\n"))
    }

    if (written === 0) return ""
    return `${sections.join("\n\n---\n\n")}\n`
}
