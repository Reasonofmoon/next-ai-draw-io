/**
 * Passage → Diagram pipeline.
 *
 * Orchestrates: AI text → mxCell XML (via /api/chat SSE) →
 * PNG bytes (via hidden draw.io iframe) → batch insert into HWP.
 */

import { composeDiagramWithCaption } from "@/lib/diagram-captioner"
import { getDiagramSizePreset } from "@/lib/diagram-presets"
import type { DetectedPassage } from "@/lib/hwp-utils"
import { getDrawioOpenUrlBase } from "@/lib/site-url"
import { wrapWithMxFile } from "@/lib/utils"

/**
 * Shared visual style guide — injected into every passage prompt so diagrams
 * across the whole HWP look consistent.
 */
const STYLE_GUIDE = [
    "============================================================",
    "VISUAL STYLE",
    "============================================================",
    "Colors must encode rhetorical function:",
    "",
    "Primary claim/topic:",
    "  fillColor=#DBEAFE strokeColor=#1D4ED8",
    "",
    "Evidence/detail:",
    "  fillColor=#D1FAE5 strokeColor=#047857",
    "",
    "Counterpoint/gap/tension:",
    "  fillColor=#FEE2E2 strokeColor=#B91C1C",
    "",
    "Example/illustration:",
    "  fillColor=#FEF3C7 strokeColor=#B45309",
    "",
    "Neutral/framing:",
    "  fillColor=#F3F4F6 strokeColor=#374151",
    "",
    "Blank/placeholder:",
    "  fillColor=#FFFFFF strokeColor=#9CA3AF strokeWidth=2 dashed=1",
    "",
    "Shapes:",
    "  rounded rectangles only.",
    "  Use rounded=1 and arcSize=12.",
    "  Stroke width 2 by default.",
    "",
    "Font:",
    "  fontFamily=Helvetica",
    "  fontSize=13",
    "  align=center",
    "  verticalAlign=middle",
    "",
    "Edges:",
    "  Use orthogonal connectors.",
    "  endArrow=classic",
    "  strokeColor=#374151",
    "  Arrow labels must be concise, maximum 3 words.",
    "  Prefer logic labels:",
    "    because, therefore, but, however, supports, explains,",
    "    causes, reveals, contrasts, leads to, enables.",
    "",
    "Layout:",
    "  total diagram about 500–650 wide and 300–400 tall.",
    "  generous spacing, minimum 24 px gaps.",
    "  balanced alignment.",
    "  no overlaps.",
    "  no crowding.",
    "  clear visual hierarchy.",
    "  use 4–7 boxes in most cases.",
    "  fewer, clearer boxes are better.",
    "",
    "Labels:",
    "  Use English only for ordinary CSAT English passages.",
    "  Do not put Korean in ordinary CSAT English diagrams.",
    "  Each box label must be maximum 8 words.",
    "  Use compressed meaning, not copied full sentences.",
    "  Avoid vague labels such as Detail, Point, Conclusion.",
    "  Make labels conceptually useful.",
].join("\n")

/**
 * Per-question-type structural guidance. Tells the LLM what shape the diagram
 * should take based on what the CSAT question is asking.
 */
function typeSpecificGuidance(questionType: string): string {
    switch (questionType) {
        case "주제":
            return [
                "TYPE: topic.",
                "VISUAL GOAL: show the subject area and the controlling idea.",
                "STRUCTURE: Use a compact concept map: Broad Topic (neutral) →",
                "Focused Aspect (evidence) → Controlling Idea (primary, bold).",
                "Add 1–2 evidence/example boxes only if they clarify the topic.",
                "Do not make the topic too broad. Do not copy a full sentence.",
            ].join(" ")
        case "제목":
            return [
                "TYPE: title selection.",
                "VISUAL GOAL: show the best title as a synthesis of topic and claim.",
                "STRUCTURE: Use a pyramid-like layout: Details/Examples at bottom →",
                "Core Contrast or Mechanism in middle → Best Title Idea at top or center.",
                "The title box must be primary and bold. Use 3–5 support boxes.",
                "The title idea should sound like a concise conceptual headline.",
            ].join(" ")
        case "요지":
            return [
                "TYPE: main idea.",
                "VISUAL GOAL: compress the whole passage into one central claim supported by key reasons.",
                "STRUCTURE: Topic Frame (neutral) → Key Reason 1 (evidence) →",
                "Main Idea (primary, bold) ← Key Reason 2 (evidence).",
                "If the passage corrects a misconception, include Common Belief",
                "(counterpoint) → Correction (primary). Main idea must be most prominent.",
            ].join(" ")
        case "핵심 흐름":
            return [
                "TYPE: core discourse flow.",
                "VISUAL GOAL: reveal the passage's main reasoning spine.",
                "STRUCTURE: Create a left-to-right logic chain with 4–6 boxes:",
                "Context or Issue (neutral) → Tension / Key Observation",
                "(evidence or counterpoint) → Main Claim (primary, bold) →",
                "Reason / Mechanism (evidence) → Implication or Takeaway (primary).",
                "Use a red counterpoint/tension box only if the passage clearly pivots.",
                "Arrow labels should show logic: because, therefore, however,",
                "reveals, leads to, explains.",
            ].join(" ")
        case "문서 핵심 흐름":
            return [
                "TYPE: document core flow from Markdown.",
                "VISUAL GOAL: show section-level conceptual flow, not paragraph notes.",
                "STRUCTURE: choose the best layout: Argument flow, Report flow,",
                "Process flow, Comparison flow, or Concept map. Prefer 5–8 boxes",
                "for longer documents. Use only highest-level ideas and merge repeated details.",
            ].join(" ")
        case "빈칸 추론":
            return [
                "TYPE: fill-in-the-blank reasoning.",
                "VISUAL GOAL: show what the blank must logically complete.",
                "STRUCTURE: Use a reasoning funnel: Setup / Context (neutral) →",
                "Constraint 1 (evidence) → [BLANK] (placeholder, dashed, white) →",
                "Consequence / Completed Meaning (primary). Add Constraint 2 as",
                "a branch into the blank if needed. The boxes before the blank",
                "should show logical pressure; the box after should show why it matters.",
                "Arrow labels: requires, leads to ___, therefore, explains.",
            ].join(" ")
        case "순서 배열":
            return [
                "TYPE: paragraph sequencing.",
                "VISUAL GOAL: show the correct logical order, not the original listed order.",
                "STRUCTURE: Create 4 boxes in the inferred correct sequence:",
                "(Given) → next paragraph → next paragraph → final paragraph.",
                "Each label must begin with (Given), (A), (B), or (C), then a",
                "maximum 5-word summary. Arrow labels should show why each follows:",
                "introduces, explains, contrasts, result, example, conclusion.",
            ].join(" ")
        case "문장 위치":
            return [
                "TYPE: sentence insertion.",
                "VISUAL GOAL: show the logical gap where the inserted sentence belongs.",
                "STRUCTURE: Create a 4–5 box timeline: Before-context → Logical gap →",
                "INSERT HERE (dashed) → After-context → Continuation / Result.",
                "Use red if the insertion resolves contrast or a break; evidence color",
                "if it supplies missing support. Arrow labels: refers back, therefore,",
                "however, resumes, explains.",
            ].join(" ")
        case "함축 의미":
            return [
                "TYPE: implied meaning.",
                "VISUAL GOAL: reveal movement from literal wording to deeper implication.",
                "STRUCTURE: Literal Phrase (neutral) → Local Context (evidence) →",
                "Hidden Contrast / Assumption (counterpoint if present) →",
                "Implied Meaning (primary, bold). The final box must state the inferred",
                "meaning, not just a paraphrase. Arrow labels: means, in context, implies.",
            ].join(" ")
        case "심경/분위기":
            return [
                "TYPE: mood / emotion shift.",
                "VISUAL GOAL: show how emotion changes over time and what causes the shift.",
                "STRUCTURE: Create a horizontal timeline with 3–4 emotional states.",
                "Each box should contain Stage + Emotion, e.g. Initial Anxiety,",
                "Growing Relief, Quiet Confidence. Use arrow labels for triggers.",
                "Use primary color for the final dominant mood; red for reversal/tension.",
            ].join(" ")
        case "목적":
            return [
                "TYPE: writer's purpose.",
                "VISUAL GOAL: show how details converge on the author's communicative purpose.",
                "STRUCTURE: Use a hub-and-spoke layout. Place central PURPOSE box",
                "in primary color and bold style. Add 3–4 surrounding boxes pointing inward:",
                "Audience / Situation, Problem or Need, Key Information, Requested Action.",
                "The central purpose should be an infinitive phrase when possible.",
            ].join(" ")
        case "무관한 문장":
            return [
                "TYPE: identify unrelated sentence.",
                "VISUAL GOAL: show the topic chain and the sentence that breaks it.",
                "STRUCTURE: Create 5 sequential boxes labeled ① ② ③ ④ ⑤.",
                "Each box contains a maximum 5-word idea summary. Use red counterpoint",
                "and dashed style for the unrelated sentence. Add arrow label off-topic",
                "or breaks chain. Show why it does not belong.",
            ].join(" ")
        case "요약":
            return [
                "TYPE: passage summary.",
                "VISUAL GOAL: show how key details synthesize into the summary.",
                "STRUCTURE: left column 3 key details (evidence) → middle SYNTHESIS",
                "box (primary, bold) → right column showing summary result or blanks.",
                "Merge repeated details and show only answer-relevant relationships.",
            ].join(" ")
        case "어법/어휘":
            return [
                "TYPE: grammar/vocabulary in context.",
                "VISUAL GOAL: show the relation that determines correctness or fit.",
                "STRUCTURE: For grammar, use Sentence Context → Grammar Trigger →",
                "Required Form, with a red competing form if useful. For vocabulary,",
                "use Context Mood/Situation → Meaning Constraint → Target Meaning →",
                "Contextual Fit/Mismatch. Labels should name functions, not rules.",
            ].join(" ")
        default:
            return [
                "TYPE: general reading reasoning.",
                "VISUAL GOAL: reveal the passage's most answer-relevant logic.",
                "STRUCTURE: Use the best-fitting structure: core flow, contrast-resolution,",
                "cause-effect, problem-solution, or claim-support. Use 4–7 boxes.",
                "Make the main claim or answer-relevant idea visually prominent.",
            ].join(" ")
    }
}

/**
 * Build a passage-specific user prompt.
 * Combines shared style guide + type-specific structure + the passage text.
 */
export function buildPassagePrompt(passage: DetectedPassage): string {
    const isPdfDocument = passage.questionType === "문서 핵심 흐름"
    const guidance = typeSpecificGuidance(passage.questionType)
    if (isPdfDocument) {
        return [
            "You are analyzing Markdown extracted from a PDF document.",
            "",
            "Diagram type: document core flow.",
            "",
            "The goal is to create a visual-thinking map of the document's essential structure.",
            "Do not summarize every paragraph.",
            "Do not create a table of contents.",
            "Show the conceptual flow:",
            "- background or problem,",
            "- key sections or claims,",
            "- supporting evidence,",
            "- contrast or limitation,",
            "- conclusion, recommendation, or implication.",
            "",
            "For PDF Markdown documents, label nodes in the document's dominant language.",
            "Use English only when the source is English or mixed.",
            "If the source is mostly Korean, Korean labels are allowed.",
            "If the source is mostly English, use English labels.",
            "",
            "============================================================",
            "DOCUMENT STRUCTURE RULES",
            "============================================================",
            guidance,
            "",
            STYLE_GUIDE,
            "",
            "============================================================",
            "TASK",
            "============================================================",
            "Generate draw.io mxCell elements that visualize the document's core flow.",
            "",
            "Output ONLY the mxCell XML fragment.",
            "Do NOT output markdown.",
            "Do NOT output explanations.",
            "Do NOT output code fences.",
            "Do NOT output mxfile, root, graphModel, or XML declaration.",
            "",
            "Markdown:",
            passage.englishPassage,
        ].join("\n")
    }

    const koreanInstruction = passage.koreanInstruction || ""
    return [
        "You are analyzing a CSAT English reading passage.",
        "",
        `Question type: ${passage.questionType}`,
        "",
        "The goal is to create a visual-thinking map, not a decorative summary.",
        "The diagram must help a student quickly see:",
        "- what the passage is mainly about,",
        "- how the ideas move,",
        "- where the logic turns,",
        "- which details support the answer,",
        "- why the final claim or inference follows.",
        "",
        "============================================================",
        "QUESTION-TYPE STRUCTURE",
        "============================================================",
        guidance,
        "",
        STYLE_GUIDE,
        "",
        "============================================================",
        "TASK",
        "============================================================",
        "",
        "Generate draw.io mxCell elements that visualize the passage's core reasoning.",
        "",
        "Output ONLY the mxCell XML fragment.",
        "Do NOT output markdown.",
        "Do NOT output explanations.",
        "Do NOT output code fences.",
        "Do NOT output mxfile, root, graphModel, or XML declaration.",
        "The wrapper will be added automatically.",
        "",
        "Korean instruction for context only.",
        "Use it only to understand the task.",
        "Do NOT put Korean in the diagram.",
        "",
        "Korean instruction:",
        koreanInstruction,
        "",
        "Passage:",
        passage.englishPassage,
    ]
        .filter(Boolean)
        .join("\n")
}

/**
 * Call /api/generate-passage-diagram (non-streaming JSON endpoint) and
 * return the mxCell XML fragment. Preferred over /api/chat for batch work:
 * no SSE parsing, no tool-call protocol parsing client-side.
 */
export async function generateDiagramXml(
    passage: DetectedPassage,
    signal?: AbortSignal,
): Promise<string> {
    const userPrompt = buildPassagePrompt(passage)

    const res = await fetch("/api/generate-passage-diagram", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal,
        body: JSON.stringify({
            passage: {
                englishText: passage.englishPassage,
                questionType: passage.questionType,
                koreanInstruction: passage.koreanInstruction || undefined,
                questionNumber: passage.questionNumber,
            },
            userPrompt,
        }),
    })

    if (!res.ok) {
        const body = await res.text().catch(() => "")
        throw new Error(
            `/api/generate-passage-diagram ${res.status}: ${body.slice(0, 300)}`,
        )
    }

    const data = (await res.json()) as {
        xml?: string
        error?: string
        rawText?: string
        warning?: string
    }
    if (data.error || !data.xml) {
        throw new Error(
            data.error ?? "No XML in response from generate-passage-diagram",
        )
    }
    if (data.warning) {
        console.warn("[passage-pipeline]", data.warning)
    }
    return data.xml
}

/**
 * Hidden-iframe based draw.io PNG renderer.
 *
 * Loads a single draw.io embed iframe once and serializes render requests.
 * Each call to render(xml) returns PNG bytes.
 */
export class DrawioPngRenderer {
    private iframe: HTMLIFrameElement | null = null
    private origin: string
    private ready = false
    private readyPromise: Promise<void> | null = null
    private queue: Promise<unknown> = Promise.resolve()
    private messageHandler: ((e: MessageEvent) => void) | null = null
    private pendingExport: {
        resolve: (png: Uint8Array) => void
        reject: (err: Error) => void
    } | null = null
    private pendingLoadResolve: (() => void) | null = null

    constructor(embedUrl?: string) {
        const base = embedUrl ?? "https://embed.diagrams.net"
        this.origin = new URL(base).origin
    }

    async init(): Promise<void> {
        if (this.ready) return
        if (this.readyPromise) return this.readyPromise

        this.readyPromise = new Promise<void>((resolve, reject) => {
            const iframe = document.createElement("iframe")
            iframe.style.position = "fixed"
            iframe.style.left = "-9999px"
            iframe.style.top = "-9999px"
            iframe.style.width = "800px"
            iframe.style.height = "600px"
            iframe.style.border = "0"
            iframe.src = `${this.origin}/?embed=1&ui=min&spin=0&proto=json&noSaveBtn=1&saveAndExit=0&noExitBtn=1`
            this.iframe = iframe

            const timeoutId = setTimeout(() => {
                reject(new Error("draw.io iframe init timeout (15s)"))
            }, 15000)

            this.messageHandler = (e: MessageEvent) => {
                if (e.origin !== this.origin) return
                if (typeof e.data !== "string") return
                let msg: Record<string, unknown>
                try {
                    msg = JSON.parse(e.data)
                } catch {
                    return
                }

                if (msg.event === "init") {
                    this.ready = true
                    clearTimeout(timeoutId)
                    resolve()
                    return
                }

                if (msg.event === "load" && this.pendingLoadResolve) {
                    const r = this.pendingLoadResolve
                    this.pendingLoadResolve = null
                    r()
                    return
                }

                if (
                    msg.event === "export" &&
                    typeof msg.data === "string" &&
                    this.pendingExport
                ) {
                    const pending = this.pendingExport
                    this.pendingExport = null
                    try {
                        pending.resolve(dataUrlToBytes(msg.data))
                    } catch (err) {
                        pending.reject(
                            err instanceof Error ? err : new Error(String(err)),
                        )
                    }
                }
            }
            window.addEventListener("message", this.messageHandler)
            document.body.appendChild(iframe)
        })

        return this.readyPromise
    }

    async render(xml: string, scale = 2): Promise<Uint8Array> {
        await this.init()
        // Serialize requests — draw.io embed handles one load/export at a time.
        const task = this.queue.then(() => this.renderOnce(xml, scale))
        this.queue = task.catch(() => undefined)
        return task
    }

    private renderOnce(xml: string, scale: number): Promise<Uint8Array> {
        if (!this.iframe?.contentWindow) {
            return Promise.reject(new Error("draw.io iframe not ready"))
        }
        const win = this.iframe.contentWindow
        const fullXml = wrapWithMxFile(xml)

        return new Promise<Uint8Array>((resolve, reject) => {
            const timeout = setTimeout(() => {
                this.pendingExport = null
                this.pendingLoadResolve = null
                reject(new Error("draw.io render timeout (20s)"))
            }, 20000)

            this.pendingLoadResolve = () => {
                // Small delay to let layout settle, then request export
                setTimeout(() => {
                    this.pendingExport = {
                        resolve: (bytes) => {
                            clearTimeout(timeout)
                            resolve(bytes)
                        },
                        reject: (err) => {
                            clearTimeout(timeout)
                            reject(err)
                        },
                    }
                    win.postMessage(
                        JSON.stringify({
                            action: "export",
                            format: "png",
                            scale,
                        }),
                        this.origin,
                    )
                }, 300)
            }

            win.postMessage(
                JSON.stringify({ action: "load", xml: fullXml, autosave: 0 }),
                this.origin,
            )
        })
    }

    destroy(): void {
        if (this.messageHandler) {
            window.removeEventListener("message", this.messageHandler)
            this.messageHandler = null
        }
        if (this.iframe) {
            this.iframe.remove()
            this.iframe = null
        }
        this.ready = false
        this.readyPromise = null
    }
}

function dataUrlToBytes(dataUrl: string): Uint8Array {
    const comma = dataUrl.indexOf(",")
    if (comma < 0) throw new Error("Invalid data URL from draw.io export")
    const b64 = dataUrl.slice(comma + 1)
    const binary = atob(b64)
    const bytes = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
    return bytes
}

/**
 * Progress event emitted by the batch pipeline.
 */
export type PipelineProgress =
    | { stage: "ai"; passageIdx: number; total: number; questionNumber: number }
    | {
          stage: "render"
          passageIdx: number
          total: number
          questionNumber: number
      }
    | {
          stage: "passage-done"
          passageIdx: number
          total: number
          questionNumber: number
          xml: string
          pngBytes: Uint8Array
      }
    | {
          stage: "passage-error"
          passageIdx: number
          total: number
          questionNumber: number
          error: string
      }
    | { stage: "inserting"; total: number }
    | {
          stage: "done"
          hwpBytes: Uint8Array
          successCount: number
          failCount: number
      }

/**
 * Per-passage result.
 */
export interface PipelineResult {
    passage: DetectedPassage
    xml: string
    pngBytes: Uint8Array
}

/**
 * Run full pipeline: passages → AI XML → PNG → batch insert into HWP.
 *
 * Emits progress via onProgress callback. Returns final HWP bytes and per-passage results.
 */
export async function runPassagePipeline(params: {
    hwpFile: File
    passages: DetectedPassage[]
    displayWidthPx?: number
    displayHeightPx?: number
    smartSizing?: boolean
    concurrency?: number
    onProgress?: (p: PipelineProgress) => void
    signal?: AbortSignal
}): Promise<{
    hwpBytes: Uint8Array
    results: PipelineResult[]
    failures: Array<{ passage: DetectedPassage; error: string }>
}> {
    const {
        hwpFile,
        passages,
        displayWidthPx = 500,
        displayHeightPx = 350,
        smartSizing = true,
        onProgress,
        signal,
    } = params

    const renderer = new DrawioPngRenderer()
    await renderer.init()

    const results: PipelineResult[] = []
    const failures: Array<{ passage: DetectedPassage; error: string }> = []

    try {
        for (let i = 0; i < passages.length; i++) {
            if (signal?.aborted) throw new DOMException("aborted", "AbortError")
            const passage = passages[i]
            try {
                onProgress?.({
                    stage: "ai",
                    passageIdx: i,
                    total: passages.length,
                    questionNumber: passage.questionNumber,
                })
                const xml = await generateDiagramXml(passage, signal)

                onProgress?.({
                    stage: "render",
                    passageIdx: i,
                    total: passages.length,
                    questionNumber: passage.questionNumber,
                })
                const rawPng = await renderer.render(xml, 2)
                const pngBytes = await composeDiagramWithCaption(rawPng, {
                    questionNumber: passage.questionNumber,
                    questionType: passage.questionType,
                })

                results.push({ passage, xml, pngBytes })
                onProgress?.({
                    stage: "passage-done",
                    passageIdx: i,
                    total: passages.length,
                    questionNumber: passage.questionNumber,
                    xml,
                    pngBytes,
                })
            } catch (err) {
                const errMsg = err instanceof Error ? err.message : String(err)
                failures.push({ passage, error: errMsg })
                onProgress?.({
                    stage: "passage-error",
                    passageIdx: i,
                    total: passages.length,
                    questionNumber: passage.questionNumber,
                    error: errMsg,
                })
            }
        }

        onProgress?.({ stage: "inserting", total: results.length })
        const { insertMultiplePicturesIntoHwp } = await import(
            "@/lib/hwp-utils"
        )
        const insertions = results.map((r) => {
            const preset = getDiagramSizePreset(r.passage.questionType)
            const widthPx = smartSizing ? preset.widthPx : displayWidthPx
            const heightPx = smartSizing ? preset.heightPx : displayHeightPx
            return {
                sectionIdx: r.passage.sectionIdx,
                paraIdx: r.passage.insertAfterParaIdx,
                pngBytes: r.pngBytes,
                displayWidthPx: widthPx,
                displayHeightPx: heightPx,
                description: `Diagram for Q${r.passage.questionNumber} (${r.passage.questionType})`,
            }
        })
        const hwpBytes = await insertMultiplePicturesIntoHwp(
            hwpFile,
            insertions,
        )

        onProgress?.({
            stage: "done",
            hwpBytes,
            successCount: results.length,
            failCount: failures.length,
        })
        return { hwpBytes, results, failures }
    } finally {
        renderer.destroy()
    }
}

/**
 * Generate a sharable draw.io viewer URL for a given XML (no backend required).
 * Uses draw.io's "#R<url-encoded-xml>" scheme.
 */
export function buildDrawioShareUrl(
    xml: string,
    baseUrl = getDrawioOpenUrlBase(),
): string {
    const fullXml = wrapWithMxFile(xml)
    return `${baseUrl}/?highlight=0000ff&edit=_blank&nav=1#R${encodeURIComponent(fullXml)}`
}
