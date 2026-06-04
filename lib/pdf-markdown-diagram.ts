import type { DetectedPassage } from "@/lib/hwp-utils"

export interface PdfMarkdownSection {
    id: string
    sourceName: string
    title: string
    markdown: string
    sectionIndex: number
    charCount: number
}

export interface PdfMarkdownSplitResult {
    sections: PdfMarkdownSection[]
    warnings: string[]
}

const DEFAULT_MAX_SECTION_CHARS = 8500
const DEFAULT_MIN_SECTION_CHARS = 180

function cleanMarkdown(markdown: string): string {
    return markdown
        .replace(/\r\n?/g, "\n")
        .replace(/[ \t]+\n/g, "\n")
        .replace(/\n{4,}/g, "\n\n\n")
        .trim()
}

function baseId(sourceName: string): string {
    return sourceName
        .toLowerCase()
        .replace(/\.[^.]+$/, "")
        .replace(/[^a-z0-9가-힣]+/gi, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 48)
}

function headingSections(
    markdown: string,
): Array<{ title: string; text: string }> {
    const matches = [...markdown.matchAll(/^#{1,3}\s+(.+)$/gm)]
    if (matches.length < 2) return []

    return matches.map((match, idx) => {
        const start = match.index ?? 0
        const end = matches[idx + 1]?.index ?? markdown.length
        const title = match[1]?.trim() || `Section ${idx + 1}`
        return {
            title,
            text: markdown.slice(start, end).trim(),
        }
    })
}

function paragraphChunks(
    markdown: string,
    maxChars: number,
): Array<{ title: string; text: string }> {
    const paragraphs = markdown
        .split(/\n{2,}/)
        .map((p) => p.trim())
        .filter(Boolean)
    const chunks: Array<{ title: string; text: string }> = []
    let current: string[] = []
    let currentLength = 0

    for (const paragraph of paragraphs) {
        const nextLength = currentLength + paragraph.length + 2
        if (current.length > 0 && nextLength > maxChars) {
            chunks.push({
                title: `Part ${chunks.length + 1}`,
                text: current.join("\n\n"),
            })
            current = []
            currentLength = 0
        }
        current.push(paragraph)
        currentLength += paragraph.length + 2
    }

    if (current.length > 0) {
        chunks.push({
            title: `Part ${chunks.length + 1}`,
            text: current.join("\n\n"),
        })
    }

    return chunks
}

function splitOversizedSection(
    section: { title: string; text: string },
    maxChars: number,
): Array<{ title: string; text: string }> {
    if (section.text.length <= maxChars) return [section]
    return paragraphChunks(section.text, maxChars).map((chunk, idx) => ({
        title: `${section.title} ${idx + 1}`,
        text: chunk.text,
    }))
}

export function splitPdfMarkdownIntoSections(
    markdown: string,
    sourceName: string,
    options: {
        maxSectionChars?: number
        minSectionChars?: number
    } = {},
): PdfMarkdownSplitResult {
    const maxSectionChars = options.maxSectionChars ?? DEFAULT_MAX_SECTION_CHARS
    const minSectionChars = options.minSectionChars ?? DEFAULT_MIN_SECTION_CHARS
    const cleaned = cleanMarkdown(markdown)
    const warnings: string[] = []

    if (cleaned.length === 0) {
        return { sections: [], warnings: ["Markdown content is empty."] }
    }

    const primary =
        headingSections(cleaned).length > 0
            ? headingSections(cleaned)
            : paragraphChunks(cleaned, maxSectionChars)
    const pieces = primary.flatMap((section) =>
        splitOversizedSection(section, maxSectionChars),
    )
    const idPrefix = baseId(sourceName) || "pdf"

    const sections = pieces
        .map((piece, index) => ({
            id: `${idPrefix}-${index + 1}`,
            sourceName,
            title: piece.title,
            markdown: piece.text,
            sectionIndex: index + 1,
            charCount: piece.text.length,
        }))
        .filter((section) => {
            if (section.markdown.length >= minSectionChars) return true
            warnings.push(
                `${section.title}: content is shorter than ${minSectionChars} characters and was skipped.`,
            )
            return false
        })

    if (sections.length === 0) {
        warnings.push("No section was long enough to diagram.")
    }

    return { sections, warnings }
}

export function pdfSectionToDetectedPassage(
    section: PdfMarkdownSection,
): DetectedPassage {
    return {
        questionNumber: section.sectionIndex,
        questionType: "문서 핵심 흐름",
        koreanInstruction:
            "PDF에서 MarkItDown으로 변환한 Markdown입니다. 문서의 핵심 흐름과 논리 전개를 보여주세요.",
        englishPassage: [
            `Source: ${section.sourceName}`,
            `Section: ${section.title}`,
            "",
            section.markdown,
        ].join("\n"),
        choices: [],
        pageNumber: 0,
        sectionIdx: section.sectionIndex - 1,
        insertAfterParaIdx: 0,
    }
}
