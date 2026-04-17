"use client"

import { useState } from "react"

export default function TestHwpPage() {
    const [status, setStatus] = useState("Ready. Select a HWP file.")
    const [debugLog, setDebugLog] = useState<string[]>([])
    const [text, setText] = useState("")
    const [passages, setPassages] = useState<
        Array<{
            questionNumber: number
            questionType: string
            koreanInstruction: string
            englishPassage: string
            choices: string[]
            pageNumber: number
            sectionIdx: number
            insertAfterParaIdx: number
        }>
    >([])

    const [hwpFile, setHwpFile] = useState<File | null>(null)
    const [pngFile, setPngFile] = useState<File | null>(null)
    const [sectionIdx, setSectionIdx] = useState(0)
    const [paraIdx, setParaIdx] = useState(0)
    const [widthPx, setWidthPx] = useState(400)
    const [heightPx, setHeightPx] = useState(300)
    const [inserting, setInserting] = useState(false)

    const [pipelineRunning, setPipelineRunning] = useState(false)
    const [pipelineProgress, setPipelineProgress] = useState<{
        current: number
        total: number
        stage: string
        failures: number
    }>({ current: 0, total: 0, stage: "", failures: 0 })
    const [passageResults, setPassageResults] = useState<
        Map<number, { xml: string; pngDataUrl: string; shareUrl: string }>
    >(new Map())

    const [manualText, setManualText] = useState(
        "Traditional economic theory assumed that rational actors maximize utility. However, behavioral economists have shown that humans systematically deviate from this rationality. Tversky and Kahneman demonstrated how cognitive biases like loss aversion and framing effects dominate decision-making. These findings suggest that economic models must incorporate psychological realism to predict real-world behavior.",
    )
    const [manualType, setManualType] = useState("요지")
    const [manualResult, setManualResult] = useState<{
        xml: string
        pngDataUrl: string
        shareUrl: string
    } | null>(null)

    const handleInsertAndDownload = async () => {
        if (!hwpFile) {
            setStatus("Error: select a HWP file first.")
            return
        }
        if (!pngFile) {
            setStatus("Error: select a PNG file to insert.")
            return
        }

        setInserting(true)
        try {
            log(
                `Inserting PNG (${pngFile.name}) into HWP at section=${sectionIdx}, para=${paraIdx}, ${widthPx}×${heightPx}px`,
            )
            const pngBytes = new Uint8Array(await pngFile.arrayBuffer())
            const { insertDiagramIntoHwp } = await import("@/lib/hwp-utils")
            const modified = await insertDiagramIntoHwp(
                hwpFile,
                pngBytes,
                sectionIdx,
                paraIdx,
                widthPx,
                heightPx,
            )
            log(`Export complete: ${modified.length} bytes`)

            const blob = new Blob([modified.buffer as ArrayBuffer], {
                type: "application/x-hwp",
            })
            const url = URL.createObjectURL(blob)
            const a = document.createElement("a")
            a.href = url
            const baseName = hwpFile.name.replace(/\.(hwp|hwpx)$/i, "")
            a.download = `${baseName}-with-diagram.hwp`
            a.click()
            URL.revokeObjectURL(url)
            setStatus(
                `Downloaded: ${a.download} (${(modified.length / 1024).toFixed(0)}KB)`,
            )
        } catch (err) {
            const errMsg =
                err instanceof Error
                    ? `${err.message}\n${err.stack}`
                    : String(err)
            setStatus(`Insert error: ${errMsg}`)
            log(`INSERT ERROR: ${errMsg}`)
            console.error(err)
        } finally {
            setInserting(false)
        }
    }

    const handleRunManualPipeline = async () => {
        if (!hwpFile) {
            setStatus("Error: upload a HWP file first.")
            return
        }
        if (!manualText.trim()) {
            setStatus("Error: paste some passage text.")
            return
        }

        setPipelineRunning(true)
        setManualResult(null)
        log("=== Starting manual pipeline for single passage ===")

        try {
            const {
                generateDiagramXml,
                DrawioPngRenderer,
                buildDrawioShareUrl,
            } = await import("@/lib/passage-pipeline")
            const { insertDiagramIntoHwp } = await import("@/lib/hwp-utils")

            const fakePassage = {
                questionNumber: 99,
                questionType: manualType,
                koreanInstruction: "",
                englishPassage: manualText.trim(),
                choices: [],
                pageNumber: 0,
                sectionIdx,
                insertAfterParaIdx: paraIdx,
            }

            log(
                `[1/3] Calling AI with ${manualText.length} chars (${manualType})`,
            )
            const xml = await generateDiagramXml(fakePassage)
            log(`[1/3] AI returned ${xml.length} chars of XML`)

            log("[2/3] Rendering PNG via hidden draw.io iframe...")
            const renderer = new DrawioPngRenderer()
            await renderer.init()
            const rawPng = await renderer.render(xml, 2)
            log(
                `[2/3] Raw PNG rendered: ${rawPng.length} bytes — composing caption...`,
            )
            renderer.destroy()

            const { composeDiagramWithCaption } = await import(
                "@/lib/diagram-captioner"
            )
            const pngBytes = await composeDiagramWithCaption(rawPng, {
                questionNumber: `manual`,
                questionType: manualType,
            })
            log(`[2/3] Composed PNG: ${pngBytes.length} bytes`)

            // Preview
            const blob = new Blob([pngBytes.buffer as ArrayBuffer], {
                type: "image/png",
            })
            const reader = new FileReader()
            reader.onload = () => {
                const dataUrl = reader.result as string
                setManualResult({
                    xml,
                    pngDataUrl: dataUrl,
                    shareUrl: buildDrawioShareUrl(xml),
                })
            }
            reader.readAsDataURL(blob)

            log(
                `[3/3] Inserting into HWP at sec=${sectionIdx}, para=${paraIdx}`,
            )
            const modified = await insertDiagramIntoHwp(
                hwpFile,
                pngBytes,
                sectionIdx,
                paraIdx,
                widthPx,
                heightPx,
            )
            log(`[3/3] HWP export: ${modified.length} bytes`)

            const hwpBlob = new Blob([modified.buffer as ArrayBuffer], {
                type: "application/x-hwp",
            })
            const url = URL.createObjectURL(hwpBlob)
            const a = document.createElement("a")
            a.href = url
            a.download = `${hwpFile.name.replace(/\.(hwp|hwpx)$/i, "")}-manual-diagram.hwp`
            a.click()
            URL.revokeObjectURL(url)
            setStatus("Manual pipeline done! HWP downloaded.")
            log("=== Manual pipeline complete ===")
        } catch (err) {
            const errMsg =
                err instanceof Error
                    ? `${err.message}\n${err.stack}`
                    : String(err)
            setStatus(`Manual pipeline error: ${errMsg}`)
            log(`MANUAL PIPELINE ERROR: ${errMsg}`)
            console.error(err)
        } finally {
            setPipelineRunning(false)
        }
    }

    const handleRunFullPipeline = async () => {
        if (!hwpFile) {
            setStatus("Error: upload a HWP file first.")
            return
        }
        if (passages.length === 0) {
            setStatus(
                "Error: no passages detected yet — extract passages first.",
            )
            return
        }

        setPipelineRunning(true)
        setPassageResults(new Map())
        setPipelineProgress({
            current: 0,
            total: passages.length,
            stage: "starting",
            failures: 0,
        })
        log(`=== Starting full pipeline for ${passages.length} passages ===`)

        try {
            const { runPassagePipeline, buildDrawioShareUrl } = await import(
                "@/lib/passage-pipeline"
            )
            let failures = 0

            const result = await runPassagePipeline({
                hwpFile,
                passages,
                displayWidthPx: widthPx,
                displayHeightPx: heightPx,
                onProgress: (p) => {
                    if (p.stage === "ai") {
                        log(
                            `Q${p.questionNumber}: calling AI (${p.passageIdx + 1}/${p.total})`,
                        )
                        setPipelineProgress({
                            current: p.passageIdx,
                            total: p.total,
                            stage: `AI → Q${p.questionNumber}`,
                            failures,
                        })
                    } else if (p.stage === "render") {
                        log(`Q${p.questionNumber}: rendering PNG`)
                        setPipelineProgress({
                            current: p.passageIdx,
                            total: p.total,
                            stage: `PNG → Q${p.questionNumber}`,
                            failures,
                        })
                    } else if (p.stage === "passage-done") {
                        log(
                            `Q${p.questionNumber}: ✓ (${p.pngBytes.length} bytes PNG)`,
                        )
                        const blob = new Blob(
                            [p.pngBytes.buffer as ArrayBuffer],
                            { type: "image/png" },
                        )
                        const reader = new FileReader()
                        reader.onload = () => {
                            const dataUrl = reader.result as string
                            setPassageResults((prev) => {
                                const next = new Map(prev)
                                next.set(p.questionNumber, {
                                    xml: p.xml,
                                    pngDataUrl: dataUrl,
                                    shareUrl: buildDrawioShareUrl(p.xml),
                                })
                                return next
                            })
                        }
                        reader.readAsDataURL(blob)
                    } else if (p.stage === "passage-error") {
                        failures += 1
                        log(`Q${p.questionNumber}: ✗ ${p.error}`)
                        setPipelineProgress((prev) => ({ ...prev, failures }))
                    } else if (p.stage === "inserting") {
                        log(`Inserting ${p.total} diagrams into HWP...`)
                        setPipelineProgress({
                            current: passages.length,
                            total: passages.length,
                            stage: "Inserting into HWP",
                            failures,
                        })
                    } else if (p.stage === "done") {
                        log(
                            `=== Pipeline done: ${p.successCount} ok, ${p.failCount} failed, ${p.hwpBytes.length} bytes HWP ===`,
                        )
                    }
                },
            })

            // Download the HWP
            const blob = new Blob([result.hwpBytes.buffer as ArrayBuffer], {
                type: "application/x-hwp",
            })
            const url = URL.createObjectURL(blob)
            const a = document.createElement("a")
            a.href = url
            const baseName = hwpFile.name.replace(/\.(hwp|hwpx)$/i, "")
            a.download = `${baseName}-ai-diagrams.hwp`
            a.click()
            URL.revokeObjectURL(url)
            setStatus(
                `Pipeline complete: ${result.results.length}/${passages.length} passages diagrammed. HWP downloaded.`,
            )
        } catch (err) {
            const errMsg =
                err instanceof Error
                    ? `${err.message}\n${err.stack}`
                    : String(err)
            setStatus(`Pipeline error: ${errMsg}`)
            log(`PIPELINE ERROR: ${errMsg}`)
            console.error(err)
        } finally {
            setPipelineRunning(false)
        }
    }

    const handleDownloadPngZip = async () => {
        if (passageResults.size === 0) {
            setStatus("Error: run the pipeline first.")
            return
        }

        try {
            // Minimal ZIP (store method, no compression) — no dependency needed.
            const { makeZip } = await import("@/lib/passage-pipeline-zip")
            const files: Array<{ name: string; data: Uint8Array }> = []
            const urlList: string[] = []
            for (const [q, r] of passageResults) {
                const b64 = r.pngDataUrl.split(",")[1]
                const binary = atob(b64)
                const bytes = new Uint8Array(binary.length)
                for (let i = 0; i < binary.length; i++)
                    bytes[i] = binary.charCodeAt(i)
                files.push({
                    name: `Q${String(q).padStart(2, "0")}.png`,
                    data: bytes,
                })
                urlList.push(`Q${q}: ${r.shareUrl}`)
            }
            files.push({
                name: "share-urls.txt",
                data: new TextEncoder().encode(urlList.join("\n")),
            })
            const zipBytes = makeZip(files)
            const blob = new Blob([zipBytes.buffer as ArrayBuffer], {
                type: "application/zip",
            })
            const url = URL.createObjectURL(blob)
            const a = document.createElement("a")
            a.href = url
            a.download = `passage-diagrams-${Date.now()}.zip`
            a.click()
            URL.revokeObjectURL(url)
            setStatus(`ZIP downloaded (${files.length} files)`)
        } catch (err) {
            const errMsg = err instanceof Error ? err.message : String(err)
            setStatus(`ZIP error: ${errMsg}`)
            log(`ZIP ERROR: ${errMsg}`)
        }
    }

    const handleBatchInsertAllPassages = async () => {
        if (!hwpFile) {
            setStatus("Error: select a HWP file first.")
            return
        }
        if (!pngFile) {
            setStatus("Error: select a PNG file to insert.")
            return
        }
        if (passages.length === 0) {
            setStatus("Error: no passages detected yet.")
            return
        }

        setInserting(true)
        try {
            log(
                `Batch inserting PNG below ${passages.length} passages (${widthPx}×${heightPx}px each)`,
            )
            const pngBytes = new Uint8Array(await pngFile.arrayBuffer())
            const { insertMultiplePicturesIntoHwp } = await import(
                "@/lib/hwp-utils"
            )

            const insertions = passages.map((p) => ({
                sectionIdx: p.sectionIdx,
                paraIdx: p.insertAfterParaIdx,
                pngBytes,
                displayWidthPx: widthPx,
                displayHeightPx: heightPx,
                description: `Diagram for Q${p.questionNumber} (${p.questionType})`,
            }))

            const modified = await insertMultiplePicturesIntoHwp(
                hwpFile,
                insertions,
            )
            log(
                `Batch export complete: ${modified.length} bytes, ${insertions.length} diagrams inserted`,
            )

            const blob = new Blob([modified.buffer as ArrayBuffer], {
                type: "application/x-hwp",
            })
            const url = URL.createObjectURL(blob)
            const a = document.createElement("a")
            a.href = url
            const baseName = hwpFile.name.replace(/\.(hwp|hwpx)$/i, "")
            a.download = `${baseName}-with-${insertions.length}-diagrams.hwp`
            a.click()
            URL.revokeObjectURL(url)
            setStatus(
                `Downloaded: ${a.download} (${(modified.length / 1024).toFixed(0)}KB, ${insertions.length} diagrams)`,
            )
        } catch (err) {
            const errMsg =
                err instanceof Error
                    ? `${err.message}\n${err.stack}`
                    : String(err)
            setStatus(`Batch insert error: ${errMsg}`)
            log(`BATCH ERROR: ${errMsg}`)
            console.error(err)
        } finally {
            setInserting(false)
        }
    }

    const log = (msg: string) => {
        console.log("[HWP-TEST]", msg)
        setDebugLog((prev) => [
            ...prev,
            `${new Date().toLocaleTimeString()} ${msg}`,
        ])
    }

    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0]
        if (!file) return

        setHwpFile(file)
        setDebugLog([])
        setStatus(
            `Loading ${file.name} (${(file.size / 1024).toFixed(0)}KB)...`,
        )
        log(`File: ${file.name}, size: ${file.size} bytes`)

        try {
            // Step 1: Dynamic import
            log("Importing @rhwp/core...")
            const rhwpModule = await import("@rhwp/core")
            log(`Module loaded. Keys: ${Object.keys(rhwpModule).join(", ")}`)

            // Step 2: Register measureTextWidth
            log("Registering measureTextWidth...")
            let ctx: CanvasRenderingContext2D | null = null
            let lastFont = ""
            // biome-ignore lint/suspicious/noExplicitAny: WASM callback
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

            // Step 3: WASM init
            log("Initializing WASM...")
            await rhwpModule.default({ module_or_path: "/rhwp_bg.wasm" })
            log("WASM initialized!")

            // Step 4: Load document
            log("Reading file buffer...")
            const buffer = new Uint8Array(await file.arrayBuffer())
            log(`Buffer size: ${buffer.length} bytes`)

            log("Creating HwpDocument...")
            const doc = new rhwpModule.HwpDocument(buffer)
            log("HwpDocument created!")

            // Step 5: Get document info
            const pageCount = doc.pageCount()
            log(`Page count: ${pageCount}`)

            const sectionCount = doc.getSectionCount()
            log(`Section count: ${sectionCount}`)

            const docInfo = doc.getDocumentInfo()
            log(`Document info: ${docInfo.slice(0, 500)}`)

            // Step 6: Extract paragraphs with position info (section, para idx)
            log("=== Extracting paragraphs with position ===")
            const lines: string[] = []
            const positionedParas: Array<{
                sectionIdx: number
                paraIdx: number
                text: string
            }> = []

            for (let sec = 0; sec < sectionCount; sec++) {
                log(`--- Section ${sec} ---`)
                let paraCount = 0
                try {
                    paraCount = doc.getParagraphCount(sec)
                    log(`  getParagraphCount(${sec}) = ${paraCount}`)
                } catch (err) {
                    log(
                        `  getParagraphCount error: ${err instanceof Error ? err.message : String(err)}`,
                    )
                }

                for (let para = 0; para < paraCount; para++) {
                    try {
                        const paraLen = doc.getParagraphLength(sec, para)
                        if (paraLen > 0) {
                            const text = doc.getTextRange(sec, para, 0, paraLen)
                            if (text && text.length > 0) {
                                lines.push(text)
                                positionedParas.push({
                                    sectionIdx: sec,
                                    paraIdx: para,
                                    text,
                                })
                                if (para < 5 || para % 100 === 0) {
                                    log(
                                        `  Para ${para} (${text.length}ch): "${text.slice(0, 80)}${text.length > 80 ? "..." : ""}"`,
                                    )
                                }
                            }
                        } else {
                            positionedParas.push({
                                sectionIdx: sec,
                                paraIdx: para,
                                text: "",
                            })
                        }
                    } catch (err) {
                        if (para < 10) {
                            log(
                                `  Para ${para} error: ${err instanceof Error ? err.message : String(err)}`,
                            )
                        }
                    }
                }
            }

            log(
                `Extracted ${positionedParas.length} paragraphs (${lines.length} non-empty)`,
            )

            // Step 6b: Fallback — extract text from HTML rendering
            if (lines.length === 0) {
                log("=== Method B: renderPageHtml (fallback) ===")
                for (let page = 0; page < Math.min(pageCount, 3); page++) {
                    try {
                        const html = doc.renderPageHtml(page)
                        log(`  Page ${page} HTML length: ${html.length}`)
                        if (html.length > 0) {
                            log(
                                `  Page ${page} HTML preview: ${html.slice(0, 200)}...`,
                            )
                            // Strip HTML tags to get text
                            const textOnly = html
                                .replace(/<[^>]+>/g, " ")
                                .replace(/\s+/g, " ")
                                .trim()
                            if (textOnly.length > 0) {
                                lines.push(textOnly)
                                log(
                                    `  Page ${page} text: "${textOnly.slice(0, 100)}..."`,
                                )
                            }
                        }
                    } catch (err) {
                        log(
                            `  Page ${page} renderPageHtml error: ${err instanceof Error ? err.message : String(err)}`,
                        )
                    }
                }
                log(`Method B result: ${lines.length} pages with text`)
            }

            const fullText = lines.join("\n")
            log(
                `Total extracted: ${fullText.length} chars, ${lines.length} paragraphs`,
            )

            setText(fullText.slice(0, 3000))
            setStatus(
                `Extracted ${fullText.length} chars (${lines.length} paragraphs). Detecting passages...`,
            )

            // Step 7: Detect passages using position-aware detector
            const { detectPassagesFromParagraphs, diagnoseQuestionHeaders } =
                await import("@/lib/hwp-utils")
            const detected = detectPassagesFromParagraphs(positionedParas)
            setPassages(detected)
            log(
                `Detected ${detected.length} passages: ${detected.map((p) => `Q${p.questionNumber}@sec${p.sectionIdx}/para${p.insertAfterParaIdx}`).join(", ")}`,
            )

            if (detected.length === 0) {
                log(
                    "=== Diagnostic: question-number candidates found in document ===",
                )
                const candidates = diagnoseQuestionHeaders(positionedParas)
                log(
                    `Found ${candidates.length} question-number candidates (any range)`,
                )
                const inRange = candidates.filter(
                    (c) => c.qNum >= 18 && c.qNum <= 45,
                )
                log(`In CSAT reading range (18-45): ${inRange.length}`)
                for (const c of candidates.slice(0, 20)) {
                    log(`  para ${c.paraIdx}: [Q${c.qNum}] "${c.text}"`)
                }
                if (candidates.length === 0) {
                    log(
                        "  → No question numbers detected at all. Question headers may use different format.",
                    )
                    log("  → Sample of paragraphs with 숫자 at start:")
                    const numStart = positionedParas
                        .filter((p) => /^\s*\d+/.test(p.text))
                        .slice(0, 10)
                    for (const p of numStart) {
                        log(`    para ${p.paraIdx}: "${p.text.slice(0, 80)}"`)
                    }
                }
            }

            setStatus(
                `Done! ${lines.length} paragraphs, ${fullText.length} chars, ${detected.length} passages found.`,
            )

            doc.free()
        } catch (err) {
            const errMsg =
                err instanceof Error
                    ? `${err.message}\n${err.stack}`
                    : String(err)
            setStatus(`Error: ${errMsg}`)
            log(`FATAL ERROR: ${errMsg}`)
            console.error(err)
        }
    }

    return (
        <div
            style={{
                padding: 20,
                maxWidth: 900,
                margin: "0 auto",
                fontFamily: "monospace",
            }}
        >
            <h1>HWP Text Extraction Test (@rhwp/core)</h1>

            <input
                type="file"
                accept=".hwp,.hwpx"
                onChange={handleFileChange}
                style={{ marginBottom: 16, fontSize: 16 }}
            />

            <p>
                <strong>Status:</strong> {status}
            </p>

            <fieldset
                style={{
                    border: "1px solid #444",
                    borderRadius: 8,
                    padding: 12,
                    marginBottom: 16,
                }}
            >
                <legend style={{ fontWeight: "bold" }}>
                    PNG → HWP Insert Test
                </legend>
                <div
                    style={{
                        display: "flex",
                        flexDirection: "column",
                        gap: 8,
                        fontSize: 13,
                    }}
                >
                    <label>
                        PNG file:{" "}
                        <input
                            type="file"
                            accept="image/png"
                            onChange={(e) =>
                                setPngFile(e.target.files?.[0] ?? null)
                            }
                        />
                        {pngFile && (
                            <span style={{ marginLeft: 8, color: "#8f8" }}>
                                {pngFile.name}
                            </span>
                        )}
                    </label>
                    <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                        <label>
                            Section:{" "}
                            <input
                                type="number"
                                min={0}
                                value={sectionIdx}
                                onChange={(e) =>
                                    setSectionIdx(Number(e.target.value))
                                }
                                style={{ width: 60 }}
                            />
                        </label>
                        <label>
                            Paragraph:{" "}
                            <input
                                type="number"
                                min={0}
                                value={paraIdx}
                                onChange={(e) =>
                                    setParaIdx(Number(e.target.value))
                                }
                                style={{ width: 60 }}
                            />
                        </label>
                        <label>
                            Width(px):{" "}
                            <input
                                type="number"
                                min={1}
                                value={widthPx}
                                onChange={(e) =>
                                    setWidthPx(Number(e.target.value))
                                }
                                style={{ width: 70 }}
                            />
                        </label>
                        <label>
                            Height(px):{" "}
                            <input
                                type="number"
                                min={1}
                                value={heightPx}
                                onChange={(e) =>
                                    setHeightPx(Number(e.target.value))
                                }
                                style={{ width: 70 }}
                            />
                        </label>
                    </div>
                    <button
                        type="button"
                        onClick={handleInsertAndDownload}
                        disabled={!hwpFile || !pngFile || inserting}
                        style={{
                            padding: "8px 14px",
                            background: inserting ? "#555" : "#2a6",
                            color: "#fff",
                            border: "none",
                            borderRadius: 6,
                            cursor: inserting ? "wait" : "pointer",
                            fontSize: 14,
                            alignSelf: "flex-start",
                        }}
                    >
                        {inserting ? "Inserting..." : "Insert & Download HWP"}
                    </button>
                    <button
                        type="button"
                        onClick={handleBatchInsertAllPassages}
                        disabled={
                            !hwpFile ||
                            !pngFile ||
                            inserting ||
                            passages.length === 0
                        }
                        style={{
                            padding: "8px 14px",
                            background: inserting ? "#555" : "#a62",
                            color: "#fff",
                            border: "none",
                            borderRadius: 6,
                            cursor: inserting ? "wait" : "pointer",
                            fontSize: 14,
                            alignSelf: "flex-start",
                            marginTop: 4,
                        }}
                    >
                        {inserting
                            ? "Inserting..."
                            : `Insert below ALL ${passages.length} passage${passages.length === 1 ? "" : "s"}`}
                    </button>
                </div>
            </fieldset>

            <fieldset
                style={{
                    border: "2px solid #a80",
                    borderRadius: 8,
                    padding: 12,
                    marginBottom: 16,
                }}
            >
                <legend style={{ fontWeight: "bold", color: "#fc5" }}>
                    ✏️ Manual passage test (single end-to-end)
                </legend>
                <div style={{ fontSize: 12, color: "#aaa", marginBottom: 8 }}>
                    Paste ANY English passage below and run the pipeline on just
                    that text. Bypasses passage detection — good for validating
                    AI → PNG → HWP when detection fails or you want to test
                    arbitrary content.
                </div>
                <label
                    style={{ display: "block", marginBottom: 6, fontSize: 13 }}
                >
                    Passage type:{" "}
                    <select
                        value={manualType}
                        onChange={(e) => setManualType(e.target.value)}
                        style={{ fontSize: 13, padding: 2 }}
                    >
                        <option value="주제">주제 (topic)</option>
                        <option value="요지">요지 (main idea)</option>
                        <option value="빈칸 추론">
                            빈칸 추론 (fill blank)
                        </option>
                        <option value="순서 배열">
                            순서 배열 (sequencing)
                        </option>
                        <option value="문장 위치">문장 위치 (insertion)</option>
                        <option value="함축 의미">함축 의미 (implied)</option>
                        <option value="제목">제목 (title)</option>
                        <option value="요약">요약 (summary)</option>
                    </select>
                </label>
                <textarea
                    value={manualText}
                    onChange={(e) => setManualText(e.target.value)}
                    rows={6}
                    style={{
                        width: "100%",
                        fontSize: 13,
                        fontFamily: "inherit",
                        padding: 8,
                        background: "#111",
                        color: "#ddd",
                        border: "1px solid #444",
                        borderRadius: 4,
                        marginBottom: 8,
                    }}
                    placeholder="Paste English reading passage here..."
                />
                <button
                    type="button"
                    onClick={handleRunManualPipeline}
                    disabled={
                        !hwpFile ||
                        !manualText.trim() ||
                        pipelineRunning ||
                        inserting
                    }
                    style={{
                        padding: "10px 16px",
                        background: pipelineRunning ? "#555" : "#a80",
                        color: "#fff",
                        border: "none",
                        borderRadius: 6,
                        cursor: pipelineRunning ? "wait" : "pointer",
                        fontSize: 14,
                        fontWeight: "bold",
                    }}
                >
                    {pipelineRunning
                        ? "Running manual pipeline..."
                        : "Generate & Insert (1 passage)"}
                </button>
                {manualResult && (
                    <div
                        style={{
                            marginTop: 12,
                            borderTop: "1px solid #444",
                            paddingTop: 12,
                        }}
                    >
                        <img
                            src={manualResult.pngDataUrl}
                            alt="Generated diagram"
                            style={{
                                maxWidth: "100%",
                                maxHeight: 400,
                                border: "1px solid #333",
                                borderRadius: 4,
                                background: "#fff",
                            }}
                        />
                        <div style={{ marginTop: 6, fontSize: 11 }}>
                            <a
                                href={manualResult.shareUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                style={{ color: "#8cf" }}
                            >
                                Open in draw.io viewer ↗
                            </a>
                            {" · "}
                            <span style={{ color: "#888" }}>
                                {manualResult.xml.length} chars XML
                            </span>
                        </div>
                        <details style={{ marginTop: 6, fontSize: 11 }}>
                            <summary
                                style={{ cursor: "pointer", color: "#888" }}
                            >
                                View XML
                            </summary>
                            <pre
                                style={{
                                    whiteSpace: "pre-wrap",
                                    fontSize: 10,
                                    background: "#0a0a0a",
                                    padding: 8,
                                    borderRadius: 4,
                                    maxHeight: 200,
                                    overflow: "auto",
                                }}
                            >
                                {manualResult.xml}
                            </pre>
                        </details>
                    </div>
                )}
            </fieldset>

            <fieldset
                style={{
                    border: "2px solid #2a6",
                    borderRadius: 8,
                    padding: 12,
                    marginBottom: 16,
                }}
            >
                <legend style={{ fontWeight: "bold", color: "#5c9" }}>
                    🤖 Full AI Pipeline (passages → AI XML → PNG → HWP)
                </legend>
                <div style={{ fontSize: 12, color: "#aaa", marginBottom: 8 }}>
                    Sends each detected passage to the AI, renders the returned
                    draw.io XML to PNG (via hidden iframe), and inserts every
                    diagram at its passage location. Uses the Width/Height
                    values above.
                </div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <button
                        type="button"
                        onClick={handleRunFullPipeline}
                        disabled={
                            !hwpFile ||
                            passages.length === 0 ||
                            pipelineRunning ||
                            inserting
                        }
                        style={{
                            padding: "10px 16px",
                            background: pipelineRunning ? "#555" : "#2a6",
                            color: "#fff",
                            border: "none",
                            borderRadius: 6,
                            cursor: pipelineRunning ? "wait" : "pointer",
                            fontSize: 14,
                            fontWeight: "bold",
                        }}
                    >
                        {pipelineRunning
                            ? `Running... ${pipelineProgress.current}/${pipelineProgress.total} (${pipelineProgress.stage})`
                            : `Run pipeline for ${passages.length} passage${passages.length === 1 ? "" : "s"}`}
                    </button>
                    <button
                        type="button"
                        onClick={handleDownloadPngZip}
                        disabled={passageResults.size === 0 || pipelineRunning}
                        style={{
                            padding: "10px 16px",
                            background:
                                passageResults.size === 0 ? "#333" : "#36a",
                            color: "#fff",
                            border: "none",
                            borderRadius: 6,
                            cursor:
                                passageResults.size === 0
                                    ? "not-allowed"
                                    : "pointer",
                            fontSize: 14,
                        }}
                    >
                        Download ZIP ({passageResults.size} PNGs + URLs)
                    </button>
                </div>
                {pipelineRunning && (
                    <div style={{ marginTop: 8, fontSize: 12 }}>
                        <div
                            style={{
                                background: "#222",
                                height: 8,
                                borderRadius: 4,
                                overflow: "hidden",
                            }}
                        >
                            <div
                                style={{
                                    background: "#2a6",
                                    height: "100%",
                                    width: `${(pipelineProgress.current / Math.max(1, pipelineProgress.total)) * 100}%`,
                                    transition: "width 0.3s",
                                }}
                            />
                        </div>
                        {pipelineProgress.failures > 0 && (
                            <div style={{ color: "#f88", marginTop: 4 }}>
                                {pipelineProgress.failures} failure(s) so far
                            </div>
                        )}
                    </div>
                )}
            </fieldset>

            {/* Debug Log - always visible */}
            <div
                style={{
                    background: "#0a0a0a",
                    border: "1px solid #333",
                    borderRadius: 8,
                    padding: 12,
                    marginBottom: 16,
                    maxHeight: 400,
                    overflow: "auto",
                    fontSize: 12,
                    lineHeight: 1.5,
                }}
            >
                <strong>Debug Log:</strong>
                {debugLog.length === 0 && (
                    <p style={{ color: "#666" }}>Select a file to start...</p>
                )}
                {debugLog.map((line, i) => (
                    <div
                        key={i}
                        style={{
                            color: line.includes("ERROR")
                                ? "#ff4444"
                                : line.includes("!")
                                  ? "#44ff44"
                                  : "#ccc",
                        }}
                    >
                        {line}
                    </div>
                ))}
            </div>

            {passages.length > 0 && (
                <div>
                    <h2>Detected Passages ({passages.length})</h2>
                    {passages.map((p) => (
                        <div
                            key={p.questionNumber}
                            style={{
                                border: "1px solid #444",
                                borderRadius: 8,
                                padding: 12,
                                marginBottom: 12,
                                background: "#1a1a2e",
                            }}
                        >
                            <div
                                style={{
                                    display: "flex",
                                    justifyContent: "space-between",
                                    alignItems: "center",
                                    gap: 8,
                                }}
                            >
                                <h3 style={{ margin: 0 }}>
                                    Q{p.questionNumber} — {p.questionType}
                                </h3>
                                <div
                                    style={{
                                        display: "flex",
                                        gap: 8,
                                        alignItems: "center",
                                    }}
                                >
                                    <span
                                        style={{ color: "#888", fontSize: 11 }}
                                    >
                                        sec {p.sectionIdx} / para{" "}
                                        {p.insertAfterParaIdx}
                                    </span>
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setSectionIdx(p.sectionIdx)
                                            setParaIdx(p.insertAfterParaIdx)
                                            setStatus(
                                                `Target set: Q${p.questionNumber} (sec=${p.sectionIdx}, para=${p.insertAfterParaIdx})`,
                                            )
                                        }}
                                        style={{
                                            padding: "4px 10px",
                                            fontSize: 12,
                                            background: "#445",
                                            color: "#fff",
                                            border: "1px solid #667",
                                            borderRadius: 4,
                                            cursor: "pointer",
                                        }}
                                    >
                                        Set as insert target
                                    </button>
                                </div>
                            </div>
                            <p style={{ color: "#aaa", fontSize: 13 }}>
                                {p.koreanInstruction}
                            </p>
                            <p style={{ fontSize: 14, lineHeight: 1.6 }}>
                                {p.englishPassage.slice(0, 300)}
                                {p.englishPassage.length > 300 ? "..." : ""}
                            </p>
                            <p style={{ color: "#666", fontSize: 11 }}>
                                {p.englishPassage.length} chars,{" "}
                                {p.choices.length} choices
                            </p>
                            {passageResults.get(p.questionNumber) && (
                                <div
                                    style={{
                                        marginTop: 8,
                                        borderTop: "1px solid #333",
                                        paddingTop: 8,
                                    }}
                                >
                                    <img
                                        src={
                                            passageResults.get(p.questionNumber)
                                                ?.pngDataUrl
                                        }
                                        alt={`Diagram for Q${p.questionNumber}`}
                                        style={{
                                            maxWidth: "100%",
                                            maxHeight: 300,
                                            border: "1px solid #333",
                                            borderRadius: 4,
                                            background: "#fff",
                                        }}
                                    />
                                    <div style={{ marginTop: 6, fontSize: 11 }}>
                                        <a
                                            href={
                                                passageResults.get(
                                                    p.questionNumber,
                                                )?.shareUrl
                                            }
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            style={{ color: "#8cf" }}
                                        >
                                            Open in draw.io viewer ↗
                                        </a>
                                    </div>
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            )}

            {text && (
                <details open>
                    <summary
                        style={{
                            cursor: "pointer",
                            fontWeight: "bold",
                            marginBottom: 8,
                        }}
                    >
                        Raw extracted text (first 3000 chars)
                    </summary>
                    <pre
                        style={{
                            whiteSpace: "pre-wrap",
                            fontSize: 12,
                            background: "#111",
                            padding: 12,
                            borderRadius: 8,
                            maxHeight: 400,
                            overflow: "auto",
                            border: "1px solid #333",
                        }}
                    >
                        {text}
                    </pre>
                </details>
            )}
        </div>
    )
}
