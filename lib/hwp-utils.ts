/**
 * HWP file parsing utilities using @rhwp/core WASM
 *
 * Extracts text from HWP/HWPX files for AI diagram generation.
 * Must run client-side only (requires Canvas API for text measurement).
 */

import type { HwpDocument as HwpDocumentType } from "@rhwp/core"

let rhwpModule: typeof import("@rhwp/core") | null = null
let initialized = false

/**
 * Register the required measureTextWidth callback for WASM text layout.
 * Must be called before WASM initialization.
 */
function registerMeasureTextWidth(): void {
    let ctx: CanvasRenderingContext2D | null = null
    let lastFont = ""

    // biome-ignore lint/suspicious/noExplicitAny: WASM callback requires global registration
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

/**
 * Lazily initialize the WASM module (client-side only).
 */
async function ensureInitialized(): Promise<typeof import("@rhwp/core")> {
    if (typeof window === "undefined") {
        throw new Error("@rhwp/core requires browser environment (Canvas API)")
    }

    if (rhwpModule && initialized) return rhwpModule

    // Register text measurement callback before WASM init
    registerMeasureTextWidth()

    // Dynamic import to avoid SSR issues
    rhwpModule = await import("@rhwp/core")
    await rhwpModule.default({ module_or_path: "/rhwp_bg.wasm" })
    initialized = true

    return rhwpModule
}

/**
 * Detected passage from a HWP document
 */
export interface DetectedPassage {
    questionNumber: number
    questionType: string
    koreanInstruction: string
    englishPassage: string
    choices: string[]
    pageNumber: number
    /** Section index where the passage's last paragraph lives — for diagram insertion. */
    sectionIdx: number
    /** Index of the paragraph immediately after the English passage (good insertion target). */
    insertAfterParaIdx: number
}

/**
 * One paragraph with its position in the HWP document.
 */
export interface HwpParagraph {
    sectionIdx: number
    paraIdx: number
    text: string
}

/**
 * Extract paragraphs with their section/para indices, preserving position
 * for later diagram insertion.
 */
export async function extractParagraphsFromHwp(
    file: File,
): Promise<HwpParagraph[]> {
    const rhwp = await ensureInitialized()
    const buffer = new Uint8Array(await file.arrayBuffer())
    const doc = new rhwp.HwpDocument(buffer)

    try {
        const sectionCount = doc.getSectionCount()
        const paragraphs: HwpParagraph[] = []

        for (let sec = 0; sec < sectionCount; sec++) {
            let paraCount = 0
            try {
                paraCount = doc.getParagraphCount(sec)
            } catch {
                continue
            }

            for (let para = 0; para < paraCount; para++) {
                try {
                    const paraLen = doc.getParagraphLength(sec, para)
                    if (paraLen <= 0) {
                        paragraphs.push({
                            sectionIdx: sec,
                            paraIdx: para,
                            text: "",
                        })
                        continue
                    }
                    const text = doc.getTextRange(sec, para, 0, paraLen) ?? ""
                    paragraphs.push({ sectionIdx: sec, paraIdx: para, text })
                } catch {
                    paragraphs.push({
                        sectionIdx: sec,
                        paraIdx: para,
                        text: "",
                    })
                }
            }
        }

        return paragraphs
    } finally {
        doc.free()
    }
}

/**
 * Extract all text from a HWP file.
 *
 * Iterates through sections and paragraphs to collect full document text.
 */
export async function extractTextFromHwp(file: File): Promise<string> {
    const rhwp = await ensureInitialized()
    const buffer = new Uint8Array(await file.arrayBuffer())
    const doc = new rhwp.HwpDocument(buffer)

    try {
        const sectionCount = doc.getSectionCount()
        const lines: string[] = []

        for (let sec = 0; sec < sectionCount; sec++) {
            // Get document info to find paragraph count per section
            const infoJson = doc.getDocumentInfo()
            const info = JSON.parse(infoJson)

            // Extract text paragraph by paragraph
            // getTextRange(sec, para, charOffset, count) — use large count to get full para
            const MAX_CHARS = 10000

            // Try paragraphs until we get empty results
            for (let para = 0; para < 9999; para++) {
                try {
                    const text = doc.getTextRange(sec, para, 0, MAX_CHARS)
                    if (!text || text.length === 0) break
                    lines.push(text)
                } catch {
                    // End of paragraphs for this section
                    break
                }
            }
        }

        return lines.join("\n")
    } finally {
        doc.free()
    }
}

/**
 * Ratio of ASCII letters (a-z, A-Z) — more precise than "ASCII code < 128"
 * because ASCII includes digits, spaces, punctuation (which also appear in Korean text).
 */
function englishLetterRatio(text: string): number {
    if (text.length === 0) return 0
    const letters = text.match(/[a-zA-Z]/g)?.length ?? 0
    return letters / text.length
}

/**
 * Is this line a listening script? (starts with W:, M:, Woman:, Man:, 여:, 남:)
 */
function isListeningScript(text: string): boolean {
    return /^\s*(?:W|M|Woman|Man|여|남)\s*:/.test(text)
}

/**
 * Is this line a multiple-choice option? (starts with ①②③④⑤)
 */
function isChoiceLine(text: string): boolean {
    return /^\s*[①②③④⑤]/.test(text)
}

/**
 * Match a question-number line. Matches `숫자.` `숫자)` or `[숫자]` at line start.
 * Returns the question number, or null if not a question line.
 */
function matchQuestionLine(text: string): number | null {
    // Allow: "[18]", "18.", "18)", "18. something", "18)something" — trailing whitespace optional
    const m = text.match(
        /^\s*(?:\[(\d{1,2})\]|(\d{1,2})[.)])(?:\s|$|[A-Za-z가-힣])/,
    )
    if (!m) return null
    return Number.parseInt(m[1] || m[2], 10)
}

function detectQuestionType(koreanInstruction: string): string {
    const s = koreanInstruction
    if (/주제/.test(s)) return "주제"
    if (/요지|주장/.test(s)) return "요지"
    if (/빈칸/.test(s)) return "빈칸 추론"
    if (/순서/.test(s)) return "순서 배열"
    if (/위치|넣기/.test(s)) return "문장 위치"
    if (/함축|의미/.test(s)) return "함축 의미"
    if (/목적/.test(s)) return "목적"
    if (/심경|분위기/.test(s)) return "심경/분위기"
    if (/무관/.test(s)) return "무관한 문장"
    if (/제목/.test(s)) return "제목"
    if (/요약/.test(s)) return "요약"
    if (/어법|어휘/.test(s)) return "어법/어휘"
    return "기타"
}

/**
 * Hybrid detection: try regex first, fall back to AI if regex result is weak.
 * Returns detected passages + which method produced them (for UI feedback).
 */
export async function detectPassagesHybrid(
    paragraphs: HwpParagraph[],
    options: {
        signal?: AbortSignal
        onStageChange?: (stage: "regex" | "ai" | "done") => void
    } = {},
): Promise<{
    passages: DetectedPassage[]
    method: "regex" | "ai" | "regex+ai"
    regexCount: number
    aiCount: number
}> {
    options.onStageChange?.("regex")
    const regexResult = detectPassagesFromParagraphs(paragraphs)

    const { detectPassagesViaAI, isRegexResultGoodEnough } = await import(
        "@/lib/passage-detection-ai"
    )

    if (isRegexResultGoodEnough(regexResult, paragraphs)) {
        options.onStageChange?.("done")
        return {
            passages: regexResult,
            method: "regex",
            regexCount: regexResult.length,
            aiCount: 0,
        }
    }

    options.onStageChange?.("ai")
    try {
        const aiResult = await detectPassagesViaAI(paragraphs, options.signal)
        options.onStageChange?.("done")

        // If AI found more than regex, trust AI fully.
        // If regex found some but AI more, use AI (it's more comprehensive).
        // If AI returned 0 but regex had some, keep regex.
        if (aiResult.length === 0 && regexResult.length > 0) {
            return {
                passages: regexResult,
                method: "regex",
                regexCount: regexResult.length,
                aiCount: 0,
            }
        }
        return {
            passages: aiResult,
            method: regexResult.length > 0 ? "regex+ai" : "ai",
            regexCount: regexResult.length,
            aiCount: aiResult.length,
        }
    } catch (err) {
        console.error("[hwp-utils] AI detection fallback failed:", err)
        options.onStageChange?.("done")
        // AI failed — fall back to whatever regex got
        return {
            passages: regexResult,
            method: "regex",
            regexCount: regexResult.length,
            aiCount: 0,
        }
    }
}

/**
 * Diagnostic: scan paragraphs and report every question-number candidate found.
 * Useful when detectPassagesFromParagraphs returns 0 — helps figure out why.
 */
export function diagnoseQuestionHeaders(paragraphs: HwpParagraph[]): Array<{
    paraIdx: number
    qNum: number
    text: string
}> {
    const found: Array<{ paraIdx: number; qNum: number; text: string }> = []
    for (const p of paragraphs) {
        const qNum = matchQuestionLine(p.text.trim())
        if (qNum !== null) {
            found.push({ paraIdx: p.paraIdx, qNum, text: p.text.slice(0, 60) })
        }
    }
    return found
}

/**
 * Detect English passages in a CSAT/모의고사 HWP 문제지.
 *
 * Strategy:
 * 1. Walk paragraphs in order, tracking the most recent question number header.
 * 2. For each question, collect English paragraphs (letter ratio > 0.4, ≥30 chars)
 *    that are NOT listening scripts and NOT choice lines.
 * 3. Stop collecting for that question when choices (①②③④⑤) begin,
 *    a new question header appears, or we hit a blank run > 3.
 */
export function detectPassagesFromParagraphs(
    paragraphs: HwpParagraph[],
): DetectedPassage[] {
    const passages: DetectedPassage[] = []

    let currentQuestion: number | null = null
    let currentType = ""
    let currentKorean = ""
    let englishChunks: string[] = []
    let choices: string[] = []
    let currentSectionIdx = 0
    let firstEnglishParaIdx: number | null = null
    let lastEnglishParaIdx: number | null = null

    const flushCurrent = () => {
        if (
            currentQuestion !== null &&
            currentQuestion >= 18 &&
            currentQuestion <= 45 &&
            englishChunks.length > 0 &&
            lastEnglishParaIdx !== null
        ) {
            const englishText = englishChunks
                .join(" ")
                .replace(/\s+/g, " ")
                .trim()
            // Require substantial English content to avoid capturing short fragments.
            if (englishText.length >= 80) {
                passages.push({
                    questionNumber: currentQuestion,
                    questionType:
                        currentType || detectQuestionType(currentKorean),
                    koreanInstruction: currentKorean.trim(),
                    englishPassage: englishText,
                    choices: [...choices],
                    pageNumber: 0,
                    sectionIdx: currentSectionIdx,
                    insertAfterParaIdx: lastEnglishParaIdx,
                })
            }
        }
        currentQuestion = null
        currentType = ""
        currentKorean = ""
        englishChunks = []
        choices = []
        firstEnglishParaIdx = null
        lastEnglishParaIdx = null
    }

    for (const p of paragraphs) {
        const text = p.text.trim()
        if (!text) continue

        const qNum = matchQuestionLine(text)
        if (qNum !== null) {
            // New question begins — flush previous.
            flushCurrent()
            currentQuestion = qNum
            currentSectionIdx = p.sectionIdx
            // The first line of a question is usually the Korean instruction.
            currentKorean = text.replace(
                /^\s*(?:\[\d{1,2}\]|\d{1,2}[.)])\s*/,
                "",
            )
            currentType = detectQuestionType(currentKorean)
            continue
        }

        if (currentQuestion === null) continue

        // Skip listening scripts entirely (they are English but not reading passages).
        if (isListeningScript(text)) continue

        // Choice lines — capture, but they also mark the end of the English passage.
        if (isChoiceLine(text)) {
            choices.push(text)
            continue
        }

        // If we've already seen choices, don't add more English (next block belongs to next question).
        if (choices.length > 0) continue

        const ratio = englishLetterRatio(text)
        if (ratio > 0.4 && text.length >= 30) {
            englishChunks.push(text)
            if (firstEnglishParaIdx === null) firstEnglishParaIdx = p.paraIdx
            lastEnglishParaIdx = p.paraIdx
        } else if (englishChunks.length === 0) {
            // Still in Korean instruction zone — extend it.
            currentKorean += ` ${text}`
        }
    }
    flushCurrent()

    return passages
}

/**
 * Legacy flat-text detector — kept for backward compatibility.
 * Prefer detectPassagesFromParagraphs for new code.
 */
export function detectPassages(fullText: string): DetectedPassage[] {
    const fakeParas: HwpParagraph[] = fullText
        .split("\n")
        .map((line, idx) => ({ sectionIdx: 0, paraIdx: idx, text: line }))
    return detectPassagesFromParagraphs(fakeParas)
}

/**
 * Check if a file is an HWP/HWPX document.
 */
export function isHwpFile(file: File): boolean {
    const name = file.name.toLowerCase()
    return name.endsWith(".hwp") || name.endsWith(".hwpx")
}

/**
 * Render a specific page of an HWP document as SVG.
 */
export async function renderHwpPageSvg(
    file: File,
    pageNumber: number,
): Promise<string> {
    const rhwp = await ensureInitialized()
    const buffer = new Uint8Array(await file.arrayBuffer())
    const doc = new rhwp.HwpDocument(buffer)

    try {
        return doc.renderPageSvg(pageNumber)
    } finally {
        doc.free()
    }
}

/**
 * Get total page count of an HWP document.
 */
export async function getHwpPageCount(file: File): Promise<number> {
    const rhwp = await ensureInitialized()
    const buffer = new Uint8Array(await file.arrayBuffer())
    const doc = new rhwp.HwpDocument(buffer)

    try {
        return doc.pageCount()
    } finally {
        doc.free()
    }
}

/**
 * 1 px at 96 DPI = 7200/96 = 75 HWPUNIT (HWPUNIT = 1/7200 inch).
 */
const PX_TO_HWPUNIT = 75

async function readImageNaturalSize(
    pngBytes: Uint8Array,
): Promise<{ width: number; height: number }> {
    const blob = new Blob([pngBytes.buffer as ArrayBuffer], {
        type: "image/png",
    })
    const bitmap = await createImageBitmap(blob)
    const size = { width: bitmap.width, height: bitmap.height }
    bitmap.close()
    return size
}

/**
 * A single picture insertion request.
 */
export interface PictureInsertion {
    sectionIdx: number
    paraIdx: number
    pngBytes: Uint8Array
    displayWidthPx: number
    displayHeightPx: number
    description?: string
}

/**
 * Insert multiple pictures into one HWP document in a single pass.
 *
 * IMPORTANT: insertions are processed in reverse (section desc, para desc) order
 * so that earlier paragraph indices stay valid after later ones shift.
 */
export async function insertMultiplePicturesIntoHwp(
    hwpFile: File,
    insertions: PictureInsertion[],
): Promise<Uint8Array> {
    const rhwp = await ensureInitialized()
    const buffer = new Uint8Array(await hwpFile.arrayBuffer())
    const doc = new rhwp.HwpDocument(buffer)

    // Sort descending so later inserts don't shift earlier paragraph indices.
    const ordered = [...insertions].sort((a, b) => {
        if (a.sectionIdx !== b.sectionIdx) return b.sectionIdx - a.sectionIdx
        return b.paraIdx - a.paraIdx
    })

    try {
        for (const ins of ordered) {
            const natural = await readImageNaturalSize(ins.pngBytes)
            doc.insertPicture(
                ins.sectionIdx,
                ins.paraIdx,
                0,
                ins.pngBytes,
                Math.round(ins.displayWidthPx * PX_TO_HWPUNIT),
                Math.round(ins.displayHeightPx * PX_TO_HWPUNIT),
                natural.width,
                natural.height,
                "png",
                ins.description ?? "AI-generated discourse flow diagram",
            )
        }
        return doc.exportHwp()
    } finally {
        doc.free()
    }
}

/**
 * Insert a diagram image into an HWP document and return modified HWP bytes.
 *
 * @param displayWidthPx  — on-screen display width in CSS pixels (converted to HWPUNIT)
 * @param displayHeightPx — on-screen display height in CSS pixels (converted to HWPUNIT)
 */
export async function insertDiagramIntoHwp(
    hwpFile: File,
    diagramPng: Uint8Array,
    sectionIdx: number,
    paraIdx: number,
    displayWidthPx: number,
    displayHeightPx: number,
): Promise<Uint8Array> {
    const rhwp = await ensureInitialized()
    const natural = await readImageNaturalSize(diagramPng)

    const buffer = new Uint8Array(await hwpFile.arrayBuffer())
    const doc = new rhwp.HwpDocument(buffer)

    try {
        doc.insertPicture(
            sectionIdx,
            paraIdx,
            0,
            diagramPng,
            Math.round(displayWidthPx * PX_TO_HWPUNIT),
            Math.round(displayHeightPx * PX_TO_HWPUNIT),
            natural.width,
            natural.height,
            "png",
            "AI-generated discourse flow diagram",
        )

        return doc.exportHwp()
    } finally {
        doc.free()
    }
}
