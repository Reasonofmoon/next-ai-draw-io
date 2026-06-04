import type { DetectedPassage } from "@/lib/hwp-utils"

export interface CsatCsvPassage {
    id: string
    questionNumber: number
    questionType: string
    koreanInstruction: string
    englishPassage: string
    sourceRow: number
}

export interface CsatCsvParseResult {
    passages: CsatCsvPassage[]
    warnings: string[]
}

const HEADER_ALIASES = {
    questionNumber: [
        "questionNumber",
        "question_number",
        "number",
        "no",
        "q",
        "문항",
        "문항번호",
        "번호",
    ],
    questionType: [
        "questionType",
        "question_type",
        "type",
        "유형",
        "문항유형",
        "문제유형",
    ],
    koreanInstruction: [
        "koreanInstruction",
        "korean_instruction",
        "instruction",
        "prompt",
        "발문",
        "한글발문",
        "질문",
    ],
    englishPassage: [
        "englishPassage",
        "english_passage",
        "englishText",
        "english_text",
        "passage",
        "text",
        "본문",
        "지문",
        "영어지문",
    ],
} as const

function normalizeHeader(value: string): string {
    return value
        .replace(/^\uFEFF/, "")
        .trim()
        .toLowerCase()
        .replace(/[\s_-]+/g, "")
}

function findColumn(
    headers: string[],
    aliases: readonly string[],
): number | undefined {
    const normalizedHeaders = headers.map(normalizeHeader)
    for (const alias of aliases) {
        const normalizedAlias = normalizeHeader(alias)
        const idx = normalizedHeaders.indexOf(normalizedAlias)
        if (idx >= 0) return idx
    }
    return undefined
}

export function parseCsv(text: string): string[][] {
    const rows: string[][] = []
    let row: string[] = []
    let field = ""
    let inQuotes = false

    for (let i = 0; i < text.length; i++) {
        const ch = text[i]
        const next = text[i + 1]

        if (inQuotes) {
            if (ch === '"' && next === '"') {
                field += '"'
                i++
            } else if (ch === '"') {
                inQuotes = false
            } else {
                field += ch
            }
            continue
        }

        if (ch === '"') {
            inQuotes = true
        } else if (ch === ",") {
            row.push(field)
            field = ""
        } else if (ch === "\n") {
            row.push(field)
            rows.push(row)
            row = []
            field = ""
        } else if (ch !== "\r") {
            field += ch
        }
    }

    if (field.length > 0 || row.length > 0) {
        row.push(field)
        rows.push(row)
    }

    return rows.filter((cells) => cells.some((cell) => cell.trim().length > 0))
}

export function parseCsatCsv(text: string): CsatCsvParseResult {
    const rows = parseCsv(text)
    const warnings: string[] = []
    if (rows.length === 0)
        return { passages: [], warnings: ["CSV가 비어 있습니다."] }

    const headers = rows[0]
    const questionNumberCol = findColumn(headers, HEADER_ALIASES.questionNumber)
    const questionTypeCol = findColumn(headers, HEADER_ALIASES.questionType)
    const koreanInstructionCol = findColumn(
        headers,
        HEADER_ALIASES.koreanInstruction,
    )
    const englishPassageCol = findColumn(headers, HEADER_ALIASES.englishPassage)

    if (englishPassageCol === undefined) {
        return {
            passages: [],
            warnings: [
                "지문 컬럼을 찾지 못했습니다. `englishPassage`, `passage`, `지문`, `영어지문` 중 하나를 헤더로 사용하세요.",
            ],
        }
    }

    const passages: CsatCsvPassage[] = []
    for (let i = 1; i < rows.length; i++) {
        const row = rows[i]
        const englishPassage = (row[englishPassageCol] ?? "")
            .replace(/\s+/g, " ")
            .trim()
        if (englishPassage.length < 20) {
            warnings.push(`${i + 1}행: 영어 지문이 너무 짧아 건너뜁니다.`)
            continue
        }

        const rawNumber =
            questionNumberCol === undefined ? "" : row[questionNumberCol]
        const parsedNumber = Number.parseInt(rawNumber, 10)
        const questionNumber = Number.isFinite(parsedNumber)
            ? parsedNumber
            : passages.length + 1
        const questionType =
            questionTypeCol === undefined
                ? "핵심 흐름"
                : (row[questionTypeCol] ?? "").trim() || "핵심 흐름"
        const koreanInstruction =
            koreanInstructionCol === undefined
                ? ""
                : (row[koreanInstructionCol] ?? "").trim()

        passages.push({
            id: `${questionNumber}-${i + 1}`,
            questionNumber,
            questionType,
            koreanInstruction,
            englishPassage,
            sourceRow: i + 1,
        })
    }

    return { passages, warnings }
}

export function toDetectedPassage(passage: CsatCsvPassage): DetectedPassage {
    return {
        questionNumber: passage.questionNumber,
        questionType: passage.questionType,
        koreanInstruction: passage.koreanInstruction,
        englishPassage: passage.englishPassage,
        choices: [],
        pageNumber: 0,
        sectionIdx: 0,
        insertAfterParaIdx: 0,
    }
}

export const CSAT_CSV_SAMPLE = [
    "questionNumber,questionType,koreanInstruction,englishPassage",
    '1,핵심 흐름,다음 글의 핵심 흐름을 파악하시오.,"Many people assume that creativity appears suddenly, as if a new idea arrives from nowhere. In reality, creative work usually begins with careful observation. A designer notices a small inconvenience, compares it with previous experiences, and then tests several possible solutions. The final idea may look simple, but it is the result of repeated attention, connection, and revision."',
].join("\n")
