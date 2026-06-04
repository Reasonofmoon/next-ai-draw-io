import { parseCsatCsv } from "@/lib/csat-csv"
import type { DetectedPassage } from "@/lib/hwp-utils"

export interface PdfMarkdownSection {
    id: string
    sourceName: string
    title: string
    markdown: string
    sectionIndex: number
    charCount: number
    questionNumber?: number
    questionType?: string
}

export interface PdfMarkdownSplitResult {
    sections: PdfMarkdownSection[]
    warnings: string[]
}

const DEFAULT_MAX_SECTION_CHARS = 8500
const DEFAULT_MIN_SECTION_CHARS = 180
const MAX_DIAGRAM_MARKDOWN_CHARS = 9000

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

function questionSections(markdown: string): Array<{
    questionNumber: number
    questionType: string
    title: string
    text: string
}> {
    const rawMarkers = [
        ...markdown.matchAll(
            /(?:^|\n)\s*(?:#{1,6}\s*)?(?:(?:Q|문항)\s*)?([1-9]\d?)\s*(?:[.)]\s*|\n)(?=\S)/g,
        ),
    ]
        .map((match) => ({
            index: match.index ?? 0,
            number: Number.parseInt(match[1] ?? "", 10),
        }))
        .filter((marker) => Number.isFinite(marker.number))

    const englishExamMarkers = rawMarkers.filter(
        (marker) => marker.number >= 18 && marker.number <= 45,
    )
    const broadMarkers =
        englishExamMarkers.length >= 2 ? englishExamMarkers : rawMarkers
    const activeMarkers = broadMarkers.filter((marker, idx) => {
        const nextIndex = broadMarkers[idx + 1]?.index ?? markdown.length
        return isLikelyQuestionSegment(markdown.slice(marker.index, nextIndex))
    })
    if (activeMarkers.length < 2) return []

    const sections = activeMarkers.map((marker, idx) => {
        const end = activeMarkers[idx + 1]?.index ?? markdown.length
        const text = markdown.slice(marker.index, end).trim()
        const questionType = inferQuestionType(text)
        return {
            questionNumber: marker.number,
            questionType,
            title: `Q${marker.number} · ${questionType}`,
            text,
        }
    })

    const byNumber = new Map<number, (typeof sections)[number]>()
    for (const section of sections) {
        const previous = byNumber.get(section.questionNumber)
        if (!previous || section.text.length > previous.text.length) {
            byNumber.set(section.questionNumber, section)
        }
    }

    return [...byNumber.values()].sort(
        (a, b) => a.questionNumber - b.questionNumber,
    )
}

function isLikelyQuestionSegment(text: string): boolean {
    const normalized = text.replace(/\s+/g, " ").trim()
    if (normalized.length < 120) return false
    if (
        /다음\s*글|글의|목적|심경|분위기|주제|제목|빈칸|밑줄|어법|어휘|요지|요약|순서|주어진|함축|무관|낱말|문장|흐름/i.test(
            normalized,
        )
    ) {
        return true
    }
    const englishLetters = (normalized.match(/[A-Za-z]/g) ?? []).length
    return englishLetters >= 120
}

function inferQuestionType(text: string): string {
    const normalized = text.replace(/\s+/g, " ")
    if (/목적|쓴\s*이유|글을\s*쓴/.test(normalized)) return "목적"
    if (/심경|분위기|어조/.test(normalized)) return "심경/분위기"
    if (/함축|밑줄\s*친.*의미|underlined.*mean/i.test(normalized)) {
        return "함축 의미"
    }
    if (/요지|주장/.test(normalized)) return "요지"
    if (/주제|main\s*topic|subject/i.test(normalized)) return "주제"
    if (/제목|title/i.test(normalized)) return "제목"
    if (/빈칸|blank|complete/i.test(normalized)) return "빈칸 추론"
    if (/무관|관계\s*없는|흐름으로\s*보아.*않은/.test(normalized)) {
        return "무관한 문장"
    }
    if (/순서|글의\s*순서|arrange|order/i.test(normalized)) {
        return "순서 배열"
    }
    if (
        /주어진\s*문장|넣기에|sentence.*insert|insert.*sentence/i.test(
            normalized,
        )
    ) {
        return "문장 위치"
    }
    if (/요약문|summary|summarize/i.test(normalized)) return "요약"
    if (/어법|문법|grammar|어휘|vocabulary|낱말/.test(normalized)) {
        return "어법/어휘"
    }
    return "핵심 흐름"
}

function limitForDiagram(text: string): string {
    if (text.length <= MAX_DIAGRAM_MARKDOWN_CHARS) return text

    const head = text.slice(0, 7200)
    const tail = text.slice(-1400)
    return [
        head.trimEnd(),
        "",
        "[...middle content omitted to keep this question within the diagram API limit...]",
        "",
        tail.trimStart(),
    ].join("\n")
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

    const idPrefix = baseId(sourceName) || "pdf"
    const questions = questionSections(cleaned)

    if (questions.length > 0) {
        const sections = questions.map((question, index) => {
            const markdownForDiagram = limitForDiagram(question.text)
            if (markdownForDiagram.length < question.text.length) {
                warnings.push(
                    `Q${question.questionNumber}: content was shortened from ${question.text.length.toLocaleString()} to ${markdownForDiagram.length.toLocaleString()} characters for diagram generation.`,
                )
            }
            return {
                id: `${idPrefix}-q${question.questionNumber}`,
                sourceName,
                title: question.title,
                markdown: markdownForDiagram,
                sectionIndex: index + 1,
                charCount: markdownForDiagram.length,
                questionNumber: question.questionNumber,
                questionType: question.questionType,
            }
        })

        return {
            sections,
            warnings: [
                `Detected ${sections.length} exam questions from PDF Markdown.`,
                ...warnings,
            ],
        }
    }

    const headingBased = headingSections(cleaned)
    const primary =
        headingBased.length > 0
            ? headingBased
            : paragraphChunks(cleaned, maxSectionChars)
    const pieces = primary.flatMap((section) =>
        splitOversizedSection(section, maxSectionChars),
    )

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

export function splitCsvIntoDiagramSections(
    csv: string,
    sourceName: string,
): PdfMarkdownSplitResult {
    const parsed = parseCsatCsv(csv)
    const idPrefix = baseId(sourceName) || "csv"
    const warnings = [...parsed.warnings]

    const sections = parsed.passages.map((passage, index) => {
        const markdown = limitForDiagram(
            [
                passage.koreanInstruction
                    ? `Instruction: ${passage.koreanInstruction}`
                    : "",
                "",
                passage.englishPassage,
            ]
                .filter(Boolean)
                .join("\n"),
        )
        return {
            id: `${idPrefix}-q${passage.questionNumber}-${index + 1}`,
            sourceName,
            title: `Q${passage.questionNumber} · ${passage.questionType}`,
            markdown,
            sectionIndex: index + 1,
            charCount: markdown.length,
            questionNumber: passage.questionNumber,
            questionType: passage.questionType,
        }
    })

    if (sections.length === 0) {
        warnings.push("CSV에서 다이어그램으로 만들 문항을 찾지 못했습니다.")
    }

    return { sections, warnings }
}

export function splitJsonIntoDiagramSections(
    jsonText: string,
    sourceName: string,
): PdfMarkdownSplitResult {
    let parsed: unknown
    try {
        parsed = JSON.parse(jsonText)
    } catch (err) {
        return {
            sections: [],
            warnings: [
                `JSON parse failed: ${
                    err instanceof Error ? err.message : String(err)
                }`,
            ],
        }
    }

    const items = extractJsonItems(parsed)
    const idPrefix = baseId(sourceName) || "json"
    const warnings: string[] = []
    const sections = items.map((item, index) => {
        const questionNumber =
            numberField(item, [
                "questionNumber",
                "question_number",
                "number",
                "no",
                "q",
            ]) ?? index + 1
        const rawMarkdown = markdownFromJsonItem(item)
        const markdown = limitForDiagram(rawMarkdown)
        const questionType =
            stringField(item, [
                "questionType",
                "question_type",
                "type",
                "category",
            ]) ?? inferQuestionType(markdown)
        const itemTitle =
            stringField(item, ["title", "name", "heading"]) ??
            `Q${questionNumber} · ${questionType}`

        if (markdown.trim().length < 20) {
            warnings.push(`${itemTitle}: 내용이 너무 짧습니다.`)
        }

        return {
            id: `${idPrefix}-q${questionNumber}-${index + 1}`,
            sourceName,
            title: itemTitle,
            markdown,
            sectionIndex: index + 1,
            charCount: markdown.length,
            questionNumber,
            questionType,
        }
    })

    if (sections.length === 0) {
        warnings.push("JSON에서 다이어그램으로 만들 항목을 찾지 못했습니다.")
    }

    return {
        sections: sections.filter(
            (section) => section.markdown.trim().length >= 20,
        ),
        warnings,
    }
}

export function pdfSectionToDetectedPassage(
    section: PdfMarkdownSection,
): DetectedPassage {
    const questionType = section.questionType ?? "문서 핵심 흐름"
    return {
        questionNumber: section.questionNumber ?? section.sectionIndex,
        questionType,
        koreanInstruction:
            section.questionNumber !== undefined
                ? "PDF에서 MarkItDown으로 변환한 수능형 문항입니다. 발문과 지문을 바탕으로 문제별 핵심 흐름을 보여주세요."
                : "PDF에서 MarkItDown으로 변환한 Markdown입니다. 문서의 핵심 흐름과 논리 전개를 보여주세요.",
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

function extractJsonItems(value: unknown): unknown[] {
    if (Array.isArray(value)) return value
    if (value && typeof value === "object") {
        const record = value as Record<string, unknown>
        for (const key of ["questions", "passages", "items", "data", "rows"]) {
            const candidate = record[key]
            if (Array.isArray(candidate)) return candidate
        }
        return [value]
    }
    return []
}

function stringField(value: unknown, keys: string[]): string | undefined {
    if (!value || typeof value !== "object") return undefined
    const record = value as Record<string, unknown>
    for (const key of keys) {
        const field = record[key]
        if (typeof field === "string" && field.trim()) return field.trim()
    }
    return undefined
}

function numberField(value: unknown, keys: string[]): number | undefined {
    const raw = stringField(value, keys)
    const fromString = raw ? Number.parseInt(raw, 10) : Number.NaN
    if (Number.isFinite(fromString)) return fromString
    if (!value || typeof value !== "object") return undefined
    const record = value as Record<string, unknown>
    for (const key of keys) {
        const field = record[key]
        if (typeof field === "number" && Number.isFinite(field)) return field
    }
    return undefined
}

function markdownFromJsonItem(item: unknown): string {
    if (typeof item === "string") return item
    if (!item || typeof item !== "object") return ""

    const record = item as Record<string, unknown>
    const parts = [
        stringField(record, [
            "koreanInstruction",
            "instruction",
            "prompt",
            "question",
        ]),
        stringField(record, [
            "englishPassage",
            "english_passage",
            "passage",
            "text",
            "content",
            "markdown",
            "body",
        ]),
        choicesToMarkdown(record.choices),
    ].filter(Boolean)

    if (parts.length > 0) return parts.join("\n\n")
    return JSON.stringify(record, null, 2)
}

function choicesToMarkdown(value: unknown): string | undefined {
    if (!Array.isArray(value) || value.length === 0) return undefined
    return value
        .map((choice, index) => {
            if (typeof choice === "string") return `${index + 1}. ${choice}`
            return `${index + 1}. ${JSON.stringify(choice)}`
        })
        .join("\n")
}
