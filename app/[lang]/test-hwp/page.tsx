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

    const handleRunSampleBatch = async () => {
        setPipelineRunning(true)
        setPassageResults(new Map())
        log(
            "=== Starting sample batch (visual verification, no HWP insertion) ===",
        )

        try {
            const {
                generateDiagramXml,
                DrawioPngRenderer,
                buildDrawioShareUrl,
            } = await import("@/lib/passage-pipeline")
            const { composeDiagramWithCaption } = await import(
                "@/lib/diagram-captioner"
            )
            const { SAMPLE_PASSAGES } = await import("@/lib/passage-samples")

            const renderer = new DrawioPngRenderer()
            await renderer.init()
            log("draw.io renderer ready")

            let failures = 0
            setPipelineProgress({
                current: 0,
                total: SAMPLE_PASSAGES.length,
                stage: "starting",
                failures: 0,
            })

            for (let i = 0; i < SAMPLE_PASSAGES.length; i++) {
                const sample = SAMPLE_PASSAGES[i]
                const p = sample.passage
                try {
                    log(
                        `[${i + 1}/${SAMPLE_PASSAGES.length}] ${sample.label} — AI call`,
                    )
                    setPipelineProgress({
                        current: i,
                        total: SAMPLE_PASSAGES.length,
                        stage: `AI → ${sample.label}`,
                        failures,
                    })
                    const xml = await generateDiagramXml(p)

                    log(`[${i + 1}/${SAMPLE_PASSAGES.length}] rendering PNG...`)
                    setPipelineProgress({
                        current: i,
                        total: SAMPLE_PASSAGES.length,
                        stage: `PNG → ${sample.label}`,
                        failures,
                    })
                    const rawPng = await renderer.render(xml, 2)
                    const pngBytes = await composeDiagramWithCaption(rawPng, {
                        questionNumber: p.questionNumber,
                        questionType: p.questionType,
                    })

                    const blob = new Blob([pngBytes.buffer as ArrayBuffer], {
                        type: "image/png",
                    })
                    const reader = new FileReader()
                    await new Promise<void>((resolve) => {
                        reader.onload = () => {
                            const dataUrl = reader.result as string
                            setPassageResults((prev) => {
                                const next = new Map(prev)
                                next.set(p.questionNumber, {
                                    xml,
                                    pngDataUrl: dataUrl,
                                    shareUrl: buildDrawioShareUrl(xml),
                                })
                                return next
                            })
                            resolve()
                        }
                        reader.readAsDataURL(blob)
                    })
                    log(
                        `[${i + 1}/${SAMPLE_PASSAGES.length}] ✓ ${sample.label}`,
                    )
                } catch (err) {
                    failures += 1
                    const errMsg =
                        err instanceof Error ? err.message : String(err)
                    log(
                        `[${i + 1}/${SAMPLE_PASSAGES.length}] ✗ ${sample.label}: ${errMsg}`,
                    )
                    setPipelineProgress((prev) => ({ ...prev, failures }))
                }
            }

            renderer.destroy()
            setPipelineProgress({
                current: SAMPLE_PASSAGES.length,
                total: SAMPLE_PASSAGES.length,
                stage: "done",
                failures,
            })
            setStatus(
                `Sample batch done: ${SAMPLE_PASSAGES.length - failures}/${SAMPLE_PASSAGES.length} ok. Scroll down to see results.`,
            )
            log(
                `=== Sample batch complete: ${SAMPLE_PASSAGES.length - failures} ok, ${failures} failed ===`,
            )
        } catch (err) {
            const errMsg =
                err instanceof Error
                    ? `${err.message}\n${err.stack}`
                    : String(err)
            setStatus(`Sample batch error: ${errMsg}`)
            log(`SAMPLE BATCH ERROR: ${errMsg}`)
            console.error(err)
        } finally {
            setPipelineRunning(false)
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
            log("Importing @rhwp/core...")
            const rhwpModule = await import("@rhwp/core")
            log(`Module loaded. Keys: ${Object.keys(rhwpModule).join(", ")}`)

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

            log("Initializing WASM...")
            await rhwpModule.default({ module_or_path: "/rhwp_bg.wasm" })
            log("WASM initialized!")

            log("Reading file buffer...")
            const buffer = new Uint8Array(await file.arrayBuffer())
            log(`Buffer size: ${buffer.length} bytes`)

            log("Creating HwpDocument...")
            const doc = new rhwpModule.HwpDocument(buffer)
            log("HwpDocument created!")

            const pageCount = doc.pageCount()
            log(`Page count: ${pageCount}`)

            const sectionCount = doc.getSectionCount()
            log(`Section count: ${sectionCount}`)

            const docInfo = doc.getDocumentInfo()
            log(`Document info: ${docInfo.slice(0, 500)}`)

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

            const { detectPassagesHybrid, diagnoseQuestionHeaders } =
                await import("@/lib/hwp-utils")

            log("=== Hybrid detection: trying regex first ===")
            setStatus("Detecting passages via regex...")
            const result = await detectPassagesHybrid(positionedParas, {
                onStageChange: (stage) => {
                    if (stage === "ai") {
                        setStatus("Regex weak — calling AI detection (~10s)...")
                        log(
                            "Regex result insufficient, falling back to AI detection...",
                        )
                    }
                },
            })

            setPassages(result.passages)
            log(
                `Detection: method=${result.method}, regex=${result.regexCount}, ai=${result.aiCount}, final=${result.passages.length}`,
            )
            for (const p of result.passages.slice(0, 30)) {
                log(
                    `  Q${p.questionNumber} (${p.questionType}) @ sec${p.sectionIdx}/para${p.insertAfterParaIdx} — ${p.englishPassage.length}ch`,
                )
            }

            if (result.passages.length === 0) {
                log("=== No passages found by either method ===")
                const candidates = diagnoseQuestionHeaders(positionedParas)
                log(
                    `Found ${candidates.length} question-number candidates (any range)`,
                )
                for (const c of candidates.slice(0, 20)) {
                    log(`  para ${c.paraIdx}: [Q${c.qNum}] "${c.text}"`)
                }
            }

            setStatus(
                `Done! ${lines.length} paragraphs, ${fullText.length} chars, ${result.passages.length} passages via ${result.method}.`,
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

    // ===== Design tokens (Paper & Ink palette) =====
    const T = {
        paper50: "#FDFBF7",
        paper100: "#FAF7F2",
        paper200: "#F3EEE4",
        paper300: "#E8DFCE",
        paper400: "#C9BBA3",
        ink900: "#1A1915",
        ink700: "#3C3A33",
        ink500: "#7A746A",
        ink300: "#B8B0A2",
        inkBlue: "#2E5BFF",
        coral: "#FF6B6B",
        mustard: "#F4B740",
        sage: "#7CB342",
        lavender: "#B794F4",
        blueWash: "#E8EFFF",
        pinkWash: "#FFE8E8",
        yellowWash: "#FFF4DB",
        greenWash: "#EBF5E0",
        lavenderWash: "#F0E8FF",
        fontDisplay:
            "'Gaegu', 'Hi Melody', 'Nanum Pen Script', 'Noto Sans KR', cursive",
        fontSans:
            "'Pretendard Variable', 'Pretendard', 'Noto Sans KR', -apple-system, BlinkMacSystemFont, sans-serif",
        fontMono:
            "'JetBrains Mono', 'D2Coding', 'SF Mono', Consolas, monospace",
        shadowSoft:
            "0 1px 0 rgba(232,223,206,1), 0 8px 20px rgba(26,25,21,0.06)",
        shadowLift:
            "0 4px 12px rgba(26,25,21,0.08), 0 12px 28px rgba(26,25,21,0.05)",
    }

    const buttonBase: React.CSSProperties = {
        padding: "10px 18px",
        border: "none",
        borderRadius: 10,
        fontSize: 14,
        fontWeight: 600,
        fontFamily: T.fontSans,
        cursor: "pointer",
        transition: "transform 120ms, box-shadow 200ms",
        boxShadow: "0 2px 0 rgba(26,25,21,0.12)",
    }

    const makeButton = (
        bg: string,
        fg: string = "#fff",
        disabled = false,
    ): React.CSSProperties => ({
        ...buttonBase,
        background: disabled ? T.paper300 : bg,
        color: disabled ? T.ink500 : fg,
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.7 : 1,
    })

    const sectionCard: React.CSSProperties = {
        background: T.paper50,
        border: `1px solid ${T.paper300}`,
        borderRadius: 16,
        padding: 22,
        marginBottom: 20,
        boxShadow: T.shadowSoft,
    }

    const sectionLegend = (
        color: string,
        rotation = -1.5,
    ): React.CSSProperties => ({
        display: "inline-block",
        background: T.paper100,
        padding: "4px 12px",
        borderRadius: 8,
        fontFamily: T.fontDisplay,
        fontSize: 22,
        fontWeight: 700,
        color,
        transform: `rotate(${rotation}deg)`,
        border: `2px solid ${color}`,
        boxShadow: "0 2px 0 rgba(26,25,21,0.08)",
    })

    const inputBase: React.CSSProperties = {
        background: T.paper50,
        color: T.ink900,
        border: `1px solid ${T.paper300}`,
        borderRadius: 8,
        padding: "6px 10px",
        fontFamily: T.fontSans,
        fontSize: 14,
    }

    const hint: React.CSSProperties = {
        color: T.ink500,
        fontSize: 13,
        marginBottom: 12,
        fontFamily: T.fontSans,
        lineHeight: 1.6,
    }

    return (
        <>
            {/* Font loading */}
            <link rel="preconnect" href="https://fonts.googleapis.com" />
            <link
                rel="preconnect"
                href="https://fonts.gstatic.com"
                crossOrigin=""
            />
            <link
                href="https://fonts.googleapis.com/css2?family=Gaegu:wght@400;700&family=Noto+Sans+KR:wght@400;500;700&display=swap"
                rel="stylesheet"
            />
            <link
                rel="stylesheet"
                href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard/dist/web/variable/pretendardvariable.css"
            />

            <div
                style={{
                    minHeight: "100vh",
                    padding: "48px 24px 80px",
                    backgroundColor: T.paper100,
                    backgroundImage: `
                        radial-gradient(circle at 18% 22%, rgba(201,187,163,0.08) 1px, transparent 1px),
                        radial-gradient(circle at 78% 68%, rgba(201,187,163,0.06) 1px, transparent 1px)
                    `,
                    backgroundSize: "140px 140px, 200px 200px",
                    fontFamily: T.fontSans,
                    color: T.ink900,
                }}
            >
                <div
                    style={{
                        maxWidth: 1040,
                        margin: "0 auto",
                    }}
                >
                    {/* Hero */}
                    <header style={{ marginBottom: 40 }}>
                        <div
                            style={{
                                fontSize: 12,
                                letterSpacing: "0.2em",
                                textTransform: "uppercase",
                                color: T.inkBlue,
                                fontWeight: 700,
                                marginBottom: 12,
                            }}
                        >
                            HWP · AI · DIAGRAM PIPELINE
                        </div>
                        <h1
                            style={{
                                margin: 0,
                                fontSize: 54,
                                lineHeight: 1.1,
                                fontWeight: 800,
                                color: T.ink900,
                                letterSpacing: "-0.02em",
                            }}
                        >
                            수능 지문이{" "}
                            <span
                                style={{
                                    position: "relative",
                                    display: "inline-block",
                                    fontFamily: T.fontDisplay,
                                    fontWeight: 700,
                                }}
                            >
                                <span
                                    style={{
                                        position: "absolute",
                                        left: "-4%",
                                        right: "-4%",
                                        bottom: "6%",
                                        height: "38%",
                                        background: T.mustard,
                                        opacity: 0.55,
                                        zIndex: -1,
                                        borderRadius: 4,
                                    }}
                                    aria-hidden="true"
                                />
                                다이어그램
                            </span>
                            <br />
                            으로 변하는 순간.
                        </h1>
                        <p
                            style={{
                                fontSize: 17,
                                color: T.ink700,
                                lineHeight: 1.7,
                                maxWidth: 680,
                                marginTop: 18,
                            }}
                        >
                            HWP 한 번 올리면, 영어 지문마다 AI가 구조
                            다이어그램을 그려 다시 HWP에 넣어드려요. 학생 배포용
                            공유 URL과 이미지 ZIP도 함께.
                        </p>
                    </header>

                    {/* File picker + status */}
                    <section
                        style={{
                            ...sectionCard,
                            background: T.paper50,
                            padding: 24,
                        }}
                    >
                        <div
                            style={{
                                display: "flex",
                                flexWrap: "wrap",
                                gap: 14,
                                alignItems: "center",
                                marginBottom: 14,
                            }}
                        >
                            <label
                                style={{
                                    display: "inline-flex",
                                    alignItems: "center",
                                    gap: 10,
                                    padding: "10px 16px",
                                    background: T.inkBlue,
                                    color: "#fff",
                                    borderRadius: 10,
                                    fontWeight: 600,
                                    fontSize: 14,
                                    cursor: "pointer",
                                    boxShadow: "0 2px 0 rgba(26,25,21,0.12)",
                                }}
                            >
                                📄 HWP 파일 선택
                                <input
                                    type="file"
                                    accept=".hwp,.hwpx"
                                    onChange={handleFileChange}
                                    style={{ display: "none" }}
                                />
                            </label>
                            {hwpFile && (
                                <span
                                    style={{
                                        fontSize: 13,
                                        color: T.ink700,
                                        background: T.yellowWash,
                                        padding: "6px 12px",
                                        borderRadius: 20,
                                        transform: "rotate(-1deg)",
                                        border: `1px dashed ${T.mustard}`,
                                    }}
                                >
                                    {hwpFile.name}
                                </span>
                            )}
                        </div>
                        <div
                            style={{
                                padding: "12px 16px",
                                background: T.paper200,
                                borderRadius: 10,
                                borderLeft: `4px solid ${T.sage}`,
                                fontSize: 14,
                                color: T.ink700,
                                lineHeight: 1.6,
                                fontFamily: T.fontMono,
                            }}
                        >
                            <strong style={{ color: T.ink900 }}>Status</strong>{" "}
                            · {status}
                        </div>
                    </section>

                    {/* PNG → HWP Insert (manual PNG) */}
                    <section style={sectionCard}>
                        <legend style={sectionLegend(T.inkBlue, -1)}>
                            📎 PNG → HWP 직접 삽입
                        </legend>
                        <p style={hint}>
                            이미 만들어둔 PNG를 지정한 위치에 바로 삽입합니다.
                            파이프라인을 거치지 않고 검증용으로 쓰세요.
                        </p>
                        <div
                            style={{
                                display: "flex",
                                flexDirection: "column",
                                gap: 12,
                                fontSize: 14,
                            }}
                        >
                            <label
                                style={{
                                    display: "flex",
                                    alignItems: "center",
                                    gap: 10,
                                }}
                            >
                                <span style={{ minWidth: 80, color: T.ink700 }}>
                                    PNG 파일
                                </span>
                                <label
                                    style={{
                                        display: "inline-flex",
                                        alignItems: "center",
                                        padding: "6px 12px",
                                        background: T.paper200,
                                        border: `1px dashed ${T.paper400}`,
                                        borderRadius: 8,
                                        cursor: "pointer",
                                        fontSize: 13,
                                        color: T.ink700,
                                    }}
                                >
                                    🖼️ 파일 선택
                                    <input
                                        type="file"
                                        accept="image/png"
                                        onChange={(e) =>
                                            setPngFile(
                                                e.target.files?.[0] ?? null,
                                            )
                                        }
                                        style={{ display: "none" }}
                                    />
                                </label>
                                {pngFile && (
                                    <span
                                        style={{
                                            fontSize: 12,
                                            color: T.sage,
                                            fontWeight: 500,
                                        }}
                                    >
                                        ✓ {pngFile.name}
                                    </span>
                                )}
                            </label>
                            <div
                                style={{
                                    display: "flex",
                                    gap: 14,
                                    flexWrap: "wrap",
                                }}
                            >
                                <label
                                    style={{
                                        display: "flex",
                                        alignItems: "center",
                                        gap: 6,
                                    }}
                                >
                                    <span
                                        style={{
                                            fontSize: 13,
                                            color: T.ink700,
                                        }}
                                    >
                                        Section
                                    </span>
                                    <input
                                        type="number"
                                        min={0}
                                        value={sectionIdx}
                                        onChange={(e) =>
                                            setSectionIdx(
                                                Number(e.target.value),
                                            )
                                        }
                                        style={{ ...inputBase, width: 70 }}
                                    />
                                </label>
                                <label
                                    style={{
                                        display: "flex",
                                        alignItems: "center",
                                        gap: 6,
                                    }}
                                >
                                    <span
                                        style={{
                                            fontSize: 13,
                                            color: T.ink700,
                                        }}
                                    >
                                        Paragraph
                                    </span>
                                    <input
                                        type="number"
                                        min={0}
                                        value={paraIdx}
                                        onChange={(e) =>
                                            setParaIdx(Number(e.target.value))
                                        }
                                        style={{ ...inputBase, width: 70 }}
                                    />
                                </label>
                                <label
                                    style={{
                                        display: "flex",
                                        alignItems: "center",
                                        gap: 6,
                                    }}
                                >
                                    <span
                                        style={{
                                            fontSize: 13,
                                            color: T.ink700,
                                        }}
                                    >
                                        Width(px)
                                    </span>
                                    <input
                                        type="number"
                                        min={1}
                                        value={widthPx}
                                        onChange={(e) =>
                                            setWidthPx(Number(e.target.value))
                                        }
                                        style={{ ...inputBase, width: 80 }}
                                    />
                                </label>
                                <label
                                    style={{
                                        display: "flex",
                                        alignItems: "center",
                                        gap: 6,
                                    }}
                                >
                                    <span
                                        style={{
                                            fontSize: 13,
                                            color: T.ink700,
                                        }}
                                    >
                                        Height(px)
                                    </span>
                                    <input
                                        type="number"
                                        min={1}
                                        value={heightPx}
                                        onChange={(e) =>
                                            setHeightPx(Number(e.target.value))
                                        }
                                        style={{ ...inputBase, width: 80 }}
                                    />
                                </label>
                            </div>
                            <div
                                style={{
                                    display: "flex",
                                    gap: 10,
                                    flexWrap: "wrap",
                                }}
                            >
                                <button
                                    type="button"
                                    onClick={handleInsertAndDownload}
                                    disabled={!hwpFile || !pngFile || inserting}
                                    style={makeButton(
                                        T.inkBlue,
                                        "#fff",
                                        !hwpFile || !pngFile || inserting,
                                    )}
                                >
                                    {inserting
                                        ? "삽입 중..."
                                        : "📌 삽입 & 다운로드"}
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
                                    style={makeButton(
                                        T.mustard,
                                        T.ink900,
                                        !hwpFile ||
                                            !pngFile ||
                                            inserting ||
                                            passages.length === 0,
                                    )}
                                >
                                    {inserting
                                        ? "삽입 중..."
                                        : `📚 모든 지문에 일괄 삽입 (${passages.length})`}
                                </button>
                            </div>
                        </div>
                    </section>

                    {/* Visual verification */}
                    <section
                        style={{
                            ...sectionCard,
                            background: T.pinkWash,
                            border: `1px solid ${T.coral}`,
                        }}
                    >
                        <legend style={sectionLegend(T.coral, -2.5)}>
                            🎨 디자인 미리보기 (6개 샘플)
                        </legend>
                        <p style={hint}>
                            요지·주제·빈칸·순서·심경·제목 6개 유형별 샘플 지문을
                            파이프라인에 돌려봐요. HWP 업로드 불필요 —{" "}
                            <em>시각 품질만 빠르게 확인</em>.
                        </p>
                        <button
                            type="button"
                            onClick={handleRunSampleBatch}
                            disabled={pipelineRunning || inserting}
                            style={makeButton(
                                T.coral,
                                "#fff",
                                pipelineRunning || inserting,
                            )}
                        >
                            {pipelineRunning
                                ? `진행 중... ${pipelineProgress.current}/${pipelineProgress.total}`
                                : "✨ 6개 샘플 돌려보기"}
                        </button>
                    </section>

                    {/* Manual single passage */}
                    <section
                        style={{
                            ...sectionCard,
                            background: T.yellowWash,
                            border: `1px solid ${T.mustard}`,
                        }}
                    >
                        <legend style={sectionLegend(T.mustard, 1.5)}>
                            ✏️ 지문 직접 붙여넣기 (1개 end-to-end)
                        </legend>
                        <p style={hint}>
                            임의의 영어 지문을 붙여넣고 AI → PNG → HWP 삽입을 한
                            번에. 감지가 실패했거나 특정 지문만 테스트할 때.
                        </p>
                        <label
                            style={{
                                display: "flex",
                                alignItems: "center",
                                gap: 10,
                                marginBottom: 10,
                                fontSize: 14,
                                color: T.ink700,
                            }}
                        >
                            지문 유형
                            <select
                                value={manualType}
                                onChange={(e) => setManualType(e.target.value)}
                                style={{ ...inputBase, fontSize: 14 }}
                            >
                                <option value="주제">주제 (topic)</option>
                                <option value="요지">요지 (main idea)</option>
                                <option value="빈칸 추론">
                                    빈칸 추론 (fill blank)
                                </option>
                                <option value="순서 배열">
                                    순서 배열 (sequencing)
                                </option>
                                <option value="문장 위치">
                                    문장 위치 (insertion)
                                </option>
                                <option value="함축 의미">
                                    함축 의미 (implied)
                                </option>
                                <option value="제목">제목 (title)</option>
                                <option value="요약">요약 (summary)</option>
                            </select>
                        </label>
                        <textarea
                            value={manualText}
                            onChange={(e) => setManualText(e.target.value)}
                            rows={6}
                            style={{
                                ...inputBase,
                                width: "100%",
                                fontSize: 14,
                                padding: 12,
                                marginBottom: 10,
                                lineHeight: 1.6,
                                background: T.paper50,
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
                            style={makeButton(
                                T.mustard,
                                T.ink900,
                                !hwpFile ||
                                    !manualText.trim() ||
                                    pipelineRunning ||
                                    inserting,
                            )}
                        >
                            {pipelineRunning
                                ? "진행 중..."
                                : "🪄 생성 & 삽입 (1개)"}
                        </button>
                        {manualResult && (
                            <div
                                style={{
                                    marginTop: 18,
                                    paddingTop: 16,
                                    borderTop: `1px dashed ${T.paper400}`,
                                }}
                            >
                                <img
                                    src={manualResult.pngDataUrl}
                                    alt="Generated diagram"
                                    style={{
                                        maxWidth: "100%",
                                        maxHeight: 440,
                                        border: `1px solid ${T.paper300}`,
                                        borderRadius: 10,
                                        background: "#fff",
                                        boxShadow: T.shadowSoft,
                                    }}
                                />
                                <div
                                    style={{
                                        marginTop: 10,
                                        fontSize: 12,
                                        color: T.ink500,
                                    }}
                                >
                                    <a
                                        href={manualResult.shareUrl}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        style={{
                                            color: T.inkBlue,
                                            fontWeight: 600,
                                        }}
                                    >
                                        draw.io에서 열기 ↗
                                    </a>
                                    {" · "}
                                    {manualResult.xml.length} chars XML
                                </div>
                                <details style={{ marginTop: 8, fontSize: 12 }}>
                                    <summary
                                        style={{
                                            cursor: "pointer",
                                            color: T.ink500,
                                        }}
                                    >
                                        XML 보기
                                    </summary>
                                    <pre
                                        style={{
                                            whiteSpace: "pre-wrap",
                                            fontSize: 11,
                                            background: T.paper200,
                                            color: T.ink700,
                                            padding: 12,
                                            borderRadius: 8,
                                            maxHeight: 240,
                                            overflow: "auto",
                                            fontFamily: T.fontMono,
                                        }}
                                    >
                                        {manualResult.xml}
                                    </pre>
                                </details>
                            </div>
                        )}
                    </section>

                    {/* Full AI Pipeline */}
                    <section
                        style={{
                            ...sectionCard,
                            background: T.greenWash,
                            border: `1px solid ${T.sage}`,
                        }}
                    >
                        <legend style={sectionLegend(T.sage, -0.5)}>
                            🤖 전체 AI 파이프라인 (지문 → HWP)
                        </legend>
                        <p style={hint}>
                            감지된 지문 모두에 대해 AI → PNG → HWP 삽입을 자동
                            실행. 지문당 10~20초 소요. Width/Height는 위 값
                            사용.
                        </p>
                        <div
                            style={{
                                display: "flex",
                                gap: 10,
                                flexWrap: "wrap",
                            }}
                        >
                            <button
                                type="button"
                                onClick={handleRunFullPipeline}
                                disabled={
                                    !hwpFile ||
                                    passages.length === 0 ||
                                    pipelineRunning ||
                                    inserting
                                }
                                style={makeButton(
                                    T.sage,
                                    "#fff",
                                    !hwpFile ||
                                        passages.length === 0 ||
                                        pipelineRunning ||
                                        inserting,
                                )}
                            >
                                {pipelineRunning
                                    ? `진행 중 ${pipelineProgress.current}/${pipelineProgress.total}`
                                    : `🚀 ${passages.length}개 지문 파이프라인 실행`}
                            </button>
                            <button
                                type="button"
                                onClick={handleDownloadPngZip}
                                disabled={
                                    passageResults.size === 0 || pipelineRunning
                                }
                                style={makeButton(
                                    T.lavender,
                                    "#fff",
                                    passageResults.size === 0 ||
                                        pipelineRunning,
                                )}
                            >
                                📦 ZIP 다운로드 ({passageResults.size}개)
                            </button>
                        </div>
                        {pipelineRunning && (
                            <div style={{ marginTop: 14 }}>
                                <div
                                    style={{
                                        background: T.paper300,
                                        height: 10,
                                        borderRadius: 10,
                                        overflow: "hidden",
                                    }}
                                >
                                    <div
                                        style={{
                                            background: T.sage,
                                            height: "100%",
                                            width: `${(pipelineProgress.current / Math.max(1, pipelineProgress.total)) * 100}%`,
                                            transition: "width 0.3s",
                                        }}
                                    />
                                </div>
                                <div
                                    style={{
                                        marginTop: 6,
                                        fontSize: 12,
                                        color: T.ink700,
                                    }}
                                >
                                    {pipelineProgress.stage}
                                    {pipelineProgress.failures > 0 && (
                                        <span
                                            style={{
                                                color: T.coral,
                                                marginLeft: 10,
                                                fontWeight: 600,
                                            }}
                                        >
                                            · {pipelineProgress.failures}개 실패
                                        </span>
                                    )}
                                </div>
                            </div>
                        )}
                    </section>

                    {/* Debug log */}
                    <details
                        style={{
                            ...sectionCard,
                            background: T.paper50,
                            padding: 0,
                            overflow: "hidden",
                        }}
                    >
                        <summary
                            style={{
                                cursor: "pointer",
                                padding: "14px 22px",
                                fontWeight: 700,
                                color: T.ink900,
                                background: T.paper200,
                                fontSize: 14,
                                userSelect: "none",
                            }}
                        >
                            🔍 디버그 로그 ({debugLog.length}줄)
                        </summary>
                        <div
                            style={{
                                padding: 16,
                                maxHeight: 400,
                                overflow: "auto",
                                fontFamily: T.fontMono,
                                fontSize: 12,
                                lineHeight: 1.6,
                                background: T.paper50,
                                backgroundImage: `repeating-linear-gradient(
                                    to bottom,
                                    transparent 0,
                                    transparent 19px,
                                    rgba(46,91,255,0.05) 19px,
                                    rgba(46,91,255,0.05) 20px
                                )`,
                            }}
                        >
                            {debugLog.length === 0 && (
                                <p style={{ color: T.ink500 }}>
                                    파일을 선택하면 로그가 나와요...
                                </p>
                            )}
                            {debugLog.map((line, i) => (
                                <div
                                    key={i}
                                    style={{
                                        color: line.includes("ERROR")
                                            ? T.coral
                                            : line.includes("✓") ||
                                                line.includes("done")
                                              ? T.sage
                                              : line.includes("===")
                                                ? T.inkBlue
                                                : T.ink700,
                                        fontWeight: line.includes("===")
                                            ? 600
                                            : 400,
                                    }}
                                >
                                    {line}
                                </div>
                            ))}
                        </div>
                    </details>

                    {/* Sample pipeline results grid (no HWP case) */}
                    {passageResults.size > 0 && passages.length === 0 && (
                        <div style={{ marginTop: 32, marginBottom: 24 }}>
                            <h2
                                style={{
                                    fontFamily: T.fontDisplay,
                                    fontSize: 36,
                                    color: T.ink900,
                                    marginBottom: 16,
                                    transform: "rotate(-1deg)",
                                    display: "inline-block",
                                }}
                            >
                                📒 샘플 결과 ({passageResults.size}개)
                            </h2>
                            <div
                                style={{
                                    display: "grid",
                                    gridTemplateColumns:
                                        "repeat(auto-fill, minmax(320px, 1fr))",
                                    gap: 16,
                                }}
                            >
                                {[...passageResults.entries()]
                                    .sort((a, b) => a[0] - b[0])
                                    .map(([qNum, r], i) => (
                                        <div
                                            key={qNum}
                                            style={{
                                                background: T.paper50,
                                                border: `1px solid ${T.paper300}`,
                                                borderRadius: 12,
                                                padding: 12,
                                                boxShadow: T.shadowSoft,
                                                transform: `rotate(${i % 2 === 0 ? -0.5 : 0.5}deg)`,
                                            }}
                                        >
                                            <img
                                                src={r.pngDataUrl}
                                                alt={`Q${qNum}`}
                                                style={{
                                                    width: "100%",
                                                    border: `1px solid ${T.paper300}`,
                                                    borderRadius: 8,
                                                    background: "#fff",
                                                }}
                                            />
                                            <div
                                                style={{
                                                    marginTop: 8,
                                                    fontSize: 12,
                                                    color: T.ink500,
                                                }}
                                            >
                                                <a
                                                    href={r.shareUrl}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    style={{
                                                        color: T.inkBlue,
                                                        fontWeight: 600,
                                                    }}
                                                >
                                                    draw.io ↗
                                                </a>
                                                <span
                                                    style={{ marginLeft: 10 }}
                                                >
                                                    {r.xml.length}ch XML
                                                </span>
                                            </div>
                                        </div>
                                    ))}
                            </div>
                        </div>
                    )}

                    {/* Detected passages */}
                    {passages.length > 0 && (
                        <div style={{ marginTop: 32 }}>
                            <h2
                                style={{
                                    fontFamily: T.fontDisplay,
                                    fontSize: 40,
                                    color: T.ink900,
                                    marginBottom: 6,
                                    transform: "rotate(-1deg)",
                                    display: "inline-block",
                                }}
                            >
                                📖 감지된 지문 ({passages.length}개)
                            </h2>
                            <p
                                style={{
                                    fontSize: 14,
                                    color: T.ink500,
                                    marginBottom: 20,
                                }}
                            >
                                카드의 <em>"삽입 위치 지정"</em>을 누르면 상단
                                Section/Paragraph가 자동 업데이트됩니다.
                            </p>
                            <div
                                style={{
                                    display: "flex",
                                    flexDirection: "column",
                                    gap: 16,
                                }}
                            >
                                {passages.map((p, idx) => {
                                    const typeColor = colorForType(
                                        p.questionType,
                                        T,
                                    )
                                    const rotation =
                                        idx % 3 === 0
                                            ? -0.3
                                            : idx % 3 === 1
                                              ? 0.2
                                              : -0.1
                                    return (
                                        <article
                                            key={p.questionNumber}
                                            style={{
                                                background: T.paper50,
                                                borderRadius: 14,
                                                padding: 20,
                                                borderLeft: `6px solid ${typeColor}`,
                                                border: `1px solid ${T.paper300}`,
                                                borderLeftWidth: 6,
                                                boxShadow: T.shadowSoft,
                                                transform: `rotate(${rotation}deg)`,
                                            }}
                                        >
                                            <div
                                                style={{
                                                    display: "flex",
                                                    justifyContent:
                                                        "space-between",
                                                    alignItems: "flex-start",
                                                    gap: 12,
                                                    flexWrap: "wrap",
                                                }}
                                            >
                                                <div>
                                                    <div
                                                        style={{
                                                            display:
                                                                "inline-block",
                                                            fontSize: 11,
                                                            letterSpacing:
                                                                "0.1em",
                                                            textTransform:
                                                                "uppercase",
                                                            color: typeColor,
                                                            fontWeight: 700,
                                                            marginBottom: 4,
                                                        }}
                                                    >
                                                        {p.questionType}
                                                    </div>
                                                    <h3
                                                        style={{
                                                            margin: 0,
                                                            fontSize: 22,
                                                            fontWeight: 700,
                                                            color: T.ink900,
                                                            fontFamily:
                                                                T.fontSans,
                                                        }}
                                                    >
                                                        Q{p.questionNumber}
                                                    </h3>
                                                </div>
                                                <div
                                                    style={{
                                                        display: "flex",
                                                        gap: 10,
                                                        alignItems: "center",
                                                    }}
                                                >
                                                    <span
                                                        style={{
                                                            color: T.ink500,
                                                            fontSize: 11,
                                                            fontFamily:
                                                                T.fontMono,
                                                        }}
                                                    >
                                                        sec {p.sectionIdx} ·
                                                        para{" "}
                                                        {p.insertAfterParaIdx}
                                                    </span>
                                                    <button
                                                        type="button"
                                                        onClick={() => {
                                                            setSectionIdx(
                                                                p.sectionIdx,
                                                            )
                                                            setParaIdx(
                                                                p.insertAfterParaIdx,
                                                            )
                                                            setStatus(
                                                                `Target set: Q${p.questionNumber} (sec=${p.sectionIdx}, para=${p.insertAfterParaIdx})`,
                                                            )
                                                        }}
                                                        style={{
                                                            padding: "6px 12px",
                                                            fontSize: 12,
                                                            background:
                                                                T.paper200,
                                                            color: T.ink900,
                                                            border: `1px solid ${T.paper400}`,
                                                            borderRadius: 6,
                                                            cursor: "pointer",
                                                            fontWeight: 600,
                                                            fontFamily:
                                                                T.fontSans,
                                                        }}
                                                    >
                                                        삽입 위치 지정 →
                                                    </button>
                                                </div>
                                            </div>
                                            {p.koreanInstruction && (
                                                <p
                                                    style={{
                                                        color: T.ink500,
                                                        fontSize: 13,
                                                        marginTop: 10,
                                                        marginBottom: 10,
                                                        fontStyle: "italic",
                                                    }}
                                                >
                                                    {p.koreanInstruction}
                                                </p>
                                            )}
                                            <p
                                                style={{
                                                    color: T.ink900,
                                                    fontSize: 14,
                                                    lineHeight: 1.7,
                                                    whiteSpace: "pre-wrap",
                                                    wordBreak: "break-word",
                                                    margin: "8px 0",
                                                }}
                                            >
                                                {p.englishPassage.slice(0, 300)}
                                                {p.englishPassage.length > 300
                                                    ? "..."
                                                    : ""}
                                            </p>
                                            <div
                                                style={{
                                                    fontSize: 11,
                                                    color: T.ink500,
                                                    fontFamily: T.fontMono,
                                                }}
                                            >
                                                {p.englishPassage.length}자 ·{" "}
                                                {p.choices.length}개 선지
                                            </div>
                                            {passageResults.get(
                                                p.questionNumber,
                                            ) && (
                                                <div
                                                    style={{
                                                        marginTop: 14,
                                                        paddingTop: 12,
                                                        borderTop: `1px dashed ${T.paper400}`,
                                                    }}
                                                >
                                                    <img
                                                        src={
                                                            passageResults.get(
                                                                p.questionNumber,
                                                            )?.pngDataUrl
                                                        }
                                                        alt={`Diagram for Q${p.questionNumber}`}
                                                        style={{
                                                            maxWidth: "100%",
                                                            maxHeight: 320,
                                                            border: `1px solid ${T.paper300}`,
                                                            borderRadius: 8,
                                                            background: "#fff",
                                                        }}
                                                    />
                                                    <div
                                                        style={{
                                                            marginTop: 6,
                                                            fontSize: 12,
                                                        }}
                                                    >
                                                        <a
                                                            href={
                                                                passageResults.get(
                                                                    p.questionNumber,
                                                                )?.shareUrl
                                                            }
                                                            target="_blank"
                                                            rel="noopener noreferrer"
                                                            style={{
                                                                color: T.inkBlue,
                                                                fontWeight: 600,
                                                            }}
                                                        >
                                                            draw.io에서 열기 ↗
                                                        </a>
                                                    </div>
                                                </div>
                                            )}
                                        </article>
                                    )
                                })}
                            </div>
                        </div>
                    )}

                    {text && (
                        <details
                            style={{
                                marginTop: 32,
                                background: T.paper50,
                                border: `1px solid ${T.paper300}`,
                                borderRadius: 14,
                                padding: 0,
                                overflow: "hidden",
                            }}
                        >
                            <summary
                                style={{
                                    cursor: "pointer",
                                    padding: "14px 22px",
                                    fontWeight: 700,
                                    color: T.ink900,
                                    background: T.paper200,
                                    fontSize: 14,
                                }}
                            >
                                📝 추출된 원문 미리보기 (첫 3000자)
                            </summary>
                            <pre
                                style={{
                                    whiteSpace: "pre-wrap",
                                    fontSize: 13,
                                    background: T.paper50,
                                    color: T.ink700,
                                    padding: 18,
                                    margin: 0,
                                    maxHeight: 400,
                                    overflow: "auto",
                                    fontFamily: T.fontMono,
                                    lineHeight: 1.6,
                                }}
                            >
                                {text}
                            </pre>
                        </details>
                    )}

                    {/* Footer */}
                    <footer
                        style={{
                            marginTop: 60,
                            paddingTop: 24,
                            borderTop: `1px dashed ${T.paper400}`,
                            textAlign: "center",
                            color: T.ink500,
                            fontSize: 13,
                        }}
                    >
                        <span
                            style={{
                                fontFamily: T.fontDisplay,
                                fontSize: 16,
                                color: T.ink700,
                            }}
                        >
                            달의이성 HWP Lab · AI + draw.io + rhwp
                        </span>
                    </footer>
                </div>
            </div>
        </>
    )
}

// ===== helpers =====
function colorForType(
    type: string,
    T: {
        inkBlue: string
        sage: string
        coral: string
        mustard: string
        lavender: string
        ink500: string
    },
): string {
    switch (type) {
        case "주제":
        case "제목":
            return T.inkBlue
        case "요지":
            return T.sage
        case "빈칸 추론":
            return T.coral
        case "순서 배열":
            return T.mustard
        case "문장 위치":
            return T.lavender
        case "함축 의미":
            return T.coral
        case "목적":
            return T.inkBlue
        case "심경/분위기":
            return T.mustard
        case "무관한 문장":
            return T.coral
        case "요약":
            return T.sage
        case "어법/어휘":
            return T.lavender
        default:
            return T.ink500
    }
}
