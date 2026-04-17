/**
 * Passage → Diagram pipeline.
 *
 * Orchestrates: AI text → mxCell XML (via /api/chat SSE) →
 * PNG bytes (via hidden draw.io iframe) → batch insert into HWP.
 */

import { composeDiagramWithCaption } from "@/lib/diagram-captioner"
import type { DetectedPassage } from "@/lib/hwp-utils"
import { wrapWithMxFile } from "@/lib/utils"

/**
 * Shared visual style guide — injected into every passage prompt so diagrams
 * across the whole HWP look consistent.
 */
const STYLE_GUIDE = [
    "=== VISUAL STYLE (required) ===",
    "Colors (use fillColor + strokeColor):",
    "  • Primary claim/topic  →  fillColor=#DBEAFE strokeColor=#1D4ED8  (blue)",
    "  • Evidence/detail      →  fillColor=#D1FAE5 strokeColor=#047857  (green)",
    "  • Counterpoint/gap     →  fillColor=#FEE2E2 strokeColor=#B91C1C  (red)",
    "  • Example/illustration →  fillColor=#FEF3C7 strokeColor=#B45309  (amber)",
    "  • Neutral/framing      →  fillColor=#F3F4F6 strokeColor=#374151  (gray)",
    "  • Blank/placeholder    →  fillColor=#FFFFFF strokeColor=#9CA3AF strokeWidth=2 dashed=1",
    "Shapes: rounded rectangles (rounded=1, arcSize=12). Stroke width 2.",
    "Font: fontFamily=Helvetica, fontSize=13, align=center, verticalAlign=middle.",
    "Arrows: endArrow=classic, strokeColor=#374151, labels concise (≤3 words).",
    "Layout: 500–650 wide × 300–400 tall total. Generous spacing (≥20px gaps).",
    "Keep every label in English, ≤8 words per box.",
].join("\n")

/**
 * Per-question-type structural guidance. Tells the LLM what shape the diagram
 * should take based on what the CSAT question is asking.
 */
function typeSpecificGuidance(questionType: string): string {
    switch (questionType) {
        case "주제":
        case "제목":
            return [
                "TYPE: topic/title identification.",
                "STRUCTURE: one central box (primary color) for the topic, 3–5 surrounding",
                "boxes (evidence color) for supporting points radiating out. Arrows point",
                "FROM supporting TO central (they support the topic).",
            ].join(" ")
        case "요지":
            return [
                "TYPE: main-idea / author's claim.",
                "STRUCTURE: top-to-bottom — Context (neutral) → Claim (primary, bold) → ",
                "2–3 Supporting reasons (evidence) → Implication/restatement (primary).",
            ].join(" ")
        case "빈칸 추론":
            return [
                "TYPE: fill-in-the-blank reasoning.",
                "STRUCTURE: linear flow — Setup (neutral) → [BLANK] (placeholder style,",
                "dashed, WHITE bg) → Consequence (primary). Include 1–2 evidence boxes",
                "branching into the blank showing what it must be. Label arrow to blank",
                "'leads to ___'.",
            ].join(" ")
        case "순서 배열":
            return [
                "TYPE: paragraph sequencing.",
                "STRUCTURE: 4 boxes left-to-right labeled (Given) → (A) → (B) → (C) with",
                "thick arrows. Each box contains a 5-word summary of that chunk.",
            ].join(" ")
        case "문장 위치":
            return [
                "TYPE: sentence insertion.",
                "STRUCTURE: linear 4–5 box timeline with one GAP box (dashed, labeled",
                "'INSERT HERE') at the best position. Show logical break before and",
                "continuation after.",
            ].join(" ")
        case "함축 의미":
            return [
                "TYPE: implied-meaning (underlined phrase).",
                "STRUCTURE: three layers — Literal wording (neutral) → Surface meaning",
                "(evidence) → Implied meaning (primary, bold). Arrows represent 'means'.",
            ].join(" ")
        case "심경/분위기":
            return [
                "TYPE: mood / emotion shift.",
                "STRUCTURE: horizontal timeline with 3–4 boxes showing emotional state",
                "at each stage (neutral → neutral → primary). Use emoji-style text if",
                "natural (e.g., 'anxious' → 'relieved'). Label arrows with trigger event.",
            ].join(" ")
        case "목적":
            return [
                "TYPE: writer's purpose.",
                "STRUCTURE: central box for PURPOSE (primary, bold) at center, ",
                "3–4 supporting-detail boxes (evidence) pointing INTO it, all labeled",
                "with the specific signal (e.g., 'polite request', 'deadline', 'contact').",
            ].join(" ")
        case "무관한 문장":
            return [
                "TYPE: identify unrelated sentence.",
                "STRUCTURE: 5 sequential boxes labeled ①②③④⑤, with the unrelated one",
                "using COUNTERPOINT color (red) and a dashed 'off-topic' label.",
            ].join(" ")
        case "요약":
            return [
                "TYPE: passage summary.",
                "STRUCTURE: left column 3 detail boxes (evidence) → middle SYNTHESIS",
                "box (primary, bold, larger) → right column 2-slot result showing the",
                "two blanks of the summary sentence.",
            ].join(" ")
        case "어법/어휘":
            return [
                "TYPE: grammar/vocabulary.",
                "STRUCTURE: tree diagram — parent sentence box, children for each",
                "tested item (neutral), one highlighted counterpoint for the error.",
            ].join(" ")
        default:
            return [
                "TYPE: general discourse flow.",
                "STRUCTURE: 3–6 boxes connected by labeled arrows showing the passage's",
                "logical progression. Use primary color for main claim, evidence color",
                "for support, counterpoint for tension.",
            ].join(" ")
    }
}

/**
 * Build a passage-specific user prompt.
 * Combines shared style guide + type-specific structure + the passage text.
 */
export function buildPassagePrompt(passage: DetectedPassage): string {
    const header = `You are analyzing a CSAT English reading passage. Question type: ${passage.questionType}.`
    const guidance = typeSpecificGuidance(passage.questionType)
    const korean = passage.koreanInstruction
        ? `\nKorean instruction (context only, do NOT put Korean in the diagram): ${passage.koreanInstruction}`
        : ""
    return [
        header,
        "",
        guidance,
        "",
        STYLE_GUIDE,
        "",
        "TASK: Generate the mxCell elements for a draw.io diagram following the",
        "structure and style rules above. Output ONLY the mxCell XML (no mxfile",
        "wrapper — it will be added automatically).",
        korean,
        "",
        "Passage:",
        passage.englishPassage,
    ].join("\n")
}

/**
 * Call /api/chat with a single-turn user message and extract the
 * display_diagram tool-input XML from the SSE stream.
 */
export async function generateDiagramXml(
    passage: DetectedPassage,
    signal?: AbortSignal,
): Promise<string> {
    const userPrompt = buildPassagePrompt(passage)

    const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal,
        body: JSON.stringify({
            messages: [
                {
                    id: `passage-${passage.questionNumber}-${Date.now()}`,
                    role: "user",
                    parts: [{ type: "text", text: userPrompt }],
                },
            ],
            xml: "",
            previousXml: "",
            sessionId: "",
            customSystemMessage: "",
        }),
    })

    if (!res.ok) {
        const body = await res.text().catch(() => "")
        throw new Error(`/api/chat ${res.status}: ${body.slice(0, 200)}`)
    }
    if (!res.body) throw new Error("/api/chat: empty body")

    const reader = res.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ""
    let collectedXml: string | null = null
    let deltaXml = ""

    while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })

        // SSE events are separated by blank lines ("\n\n")
        const events = buffer.split("\n\n")
        buffer = events.pop() ?? ""

        for (const evt of events) {
            for (const line of evt.split("\n")) {
                if (!line.startsWith("data:")) continue
                const jsonStr = line.slice(5).trim()
                if (!jsonStr || jsonStr === "[DONE]") continue
                try {
                    const msg = JSON.parse(jsonStr)
                    if (
                        msg.type === "tool-input-available" &&
                        msg.toolName === "display_diagram" &&
                        msg.input?.xml
                    ) {
                        collectedXml = msg.input.xml as string
                    } else if (
                        msg.type === "tool-input-delta" &&
                        typeof msg.inputTextDelta === "string"
                    ) {
                        deltaXml += msg.inputTextDelta
                    }
                } catch {
                    // ignore malformed event
                }
            }
        }
    }

    const xml = collectedXml ?? deltaXml
    if (!xml || xml.trim().length === 0) {
        throw new Error("No diagram XML returned from /api/chat")
    }
    return xml
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
        const insertions = results.map((r) => ({
            sectionIdx: r.passage.sectionIdx,
            paraIdx: r.passage.insertAfterParaIdx,
            pngBytes: r.pngBytes,
            displayWidthPx,
            displayHeightPx,
            description: `Diagram for Q${r.passage.questionNumber} (${r.passage.questionType})`,
        }))
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
    baseUrl = "https://viewer.diagrams.net",
): string {
    const fullXml = wrapWithMxFile(xml)
    return `${baseUrl}/?highlight=0000ff&edit=_blank&nav=1#R${encodeURIComponent(fullXml)}`
}
