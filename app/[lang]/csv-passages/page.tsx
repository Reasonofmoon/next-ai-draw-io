"use client"

import {
    AlertCircle,
    CheckCircle2,
    Download,
    FileText,
    Loader2,
    Play,
    Upload,
} from "lucide-react"
import Image from "next/image"
import { type ReactNode, useEffect, useMemo, useRef, useState } from "react"
import {
    CSAT_CSV_SAMPLE,
    parseCsatCsv,
    toDetectedPassage,
} from "@/lib/csat-csv"
import {
    buildDrawioShareUrl,
    DrawioPngRenderer,
    generateDiagramXml,
} from "@/lib/passage-pipeline"
import { makeZip } from "@/lib/passage-pipeline-zip"
import { T } from "@/lib/workbench-tokens"

type DiagramStatus = "idle" | "running" | "done" | "error"

interface DiagramResult {
    status: DiagramStatus
    xml?: string
    pngBytes?: Uint8Array
    pngDataUrl?: string
    shareUrl?: string
    error?: string
}

const page = {
    minHeight: "100vh",
    background: "#F7F4EE",
    color: T.ink900,
    fontFamily: T.fontSans,
} as const

const shell = {
    maxWidth: 1280,
    margin: "0 auto",
    padding: "28px 24px 44px",
} as const

const topBar = {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 16,
    marginBottom: 20,
} as const

const title = {
    margin: 0,
    fontFamily: T.fontDisplay,
    fontSize: 36,
    letterSpacing: 0,
} as const

const toolbar = {
    display: "flex",
    gap: 10,
    flexWrap: "wrap",
    alignItems: "center",
} as const

const button = (kind: "primary" | "secondary" | "danger", disabled = false) =>
    ({
        display: "inline-flex",
        alignItems: "center",
        gap: 7,
        border: `1px solid ${
            kind === "primary"
                ? T.inkBlue
                : kind === "danger"
                  ? T.coral
                  : T.paper300
        }`,
        background: disabled
            ? T.paper300
            : kind === "primary"
              ? T.inkBlue
              : kind === "danger"
                ? T.pinkWash
                : T.paper50,
        color: disabled
            ? T.ink500
            : kind === "primary"
              ? "#fff"
              : kind === "danger"
                ? T.coral
                : T.ink900,
        borderRadius: 8,
        padding: "9px 12px",
        fontSize: 13,
        fontWeight: 700,
        cursor: disabled ? "not-allowed" : "pointer",
        whiteSpace: "nowrap",
    }) as const

const grid = {
    display: "grid",
    gridTemplateColumns: "minmax(320px, 420px) minmax(0, 1fr)",
    gap: 18,
    alignItems: "start",
} as const

const panel = {
    background: T.paper50,
    border: `1px solid ${T.paper300}`,
    borderRadius: 8,
    boxShadow: T.shadowSoft,
} as const

const panelHeader = {
    padding: "16px 18px",
    borderBottom: `1px solid ${T.paper300}`,
    display: "flex",
    alignItems: "center",
    gap: 10,
    fontWeight: 800,
} as const

const panelBody = {
    padding: 18,
} as const

const textarea = {
    width: "100%",
    minHeight: 220,
    resize: "vertical",
    border: `1px solid ${T.paper300}`,
    borderRadius: 8,
    background: "#fff",
    color: T.ink900,
    padding: 12,
    fontFamily: T.fontMono,
    fontSize: 12,
    lineHeight: 1.55,
} as const

const tableWrap = {
    overflowX: "auto",
    border: `1px solid ${T.paper300}`,
    borderRadius: 8,
} as const

const statRow = {
    display: "grid",
    gridTemplateColumns: "repeat(3, 1fr)",
    gap: 10,
    marginBottom: 14,
} as const

const statCard = {
    background: T.paper100,
    border: `1px solid ${T.paper300}`,
    borderRadius: 8,
    padding: 12,
} as const

const resultGrid = {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
    gap: 14,
} as const

const resultCard = {
    background: "#fff",
    border: `1px solid ${T.paper300}`,
    borderRadius: 8,
    overflow: "hidden",
} as const

export default function CsvPassagesPage() {
    const [csvText, setCsvText] = useState(CSAT_CSV_SAMPLE)
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
    const [results, setResults] = useState<Map<string, DiagramResult>>(
        new Map(),
    )
    const [isRunning, setIsRunning] = useState(false)
    const rendererRef = useRef<DrawioPngRenderer | null>(null)

    const parsed = useMemo(() => parseCsatCsv(csvText), [csvText])
    const selectedCount = selectedIds.size
    const completedCount = [...results.values()].filter(
        (r) => r.status === "done",
    ).length
    const failedCount = [...results.values()].filter(
        (r) => r.status === "error",
    ).length

    useEffect(() => {
        setSelectedIds(new Set(parsed.passages.map((p) => p.id)))
    }, [parsed.passages])

    const ensureSelection = () => [...selectedIds]

    const setResult = (id: string, result: DiagramResult) => {
        setResults((prev) => new Map(prev).set(id, result))
    }

    const handleFile = async (file: File) => {
        const text = await file.text()
        setCsvText(text)
        setSelectedIds(new Set())
        setResults(new Map())
    }

    const toggleSelection = (id: string) => {
        setSelectedIds((prev) => {
            const next = new Set(prev)
            if (next.has(id)) next.delete(id)
            else next.add(id)
            return next
        })
    }

    const runBatch = async () => {
        const ids = ensureSelection()
        if (ids.length === 0 || isRunning) return

        setIsRunning(true)
        const renderer = new DrawioPngRenderer()
        rendererRef.current = renderer
        try {
            await renderer.init()
            for (const id of ids) {
                const passage = parsed.passages.find((p) => p.id === id)
                if (!passage) continue
                setResult(id, { status: "running" })
                try {
                    const xml = await generateDiagramXml(
                        toDetectedPassage(passage),
                    )
                    const pngBytes = await renderer.render(xml, 2)
                    const pngDataUrl = bytesToDataUrl(pngBytes, "image/png")
                    setResult(id, {
                        status: "done",
                        xml,
                        pngBytes,
                        pngDataUrl,
                        shareUrl: buildDrawioShareUrl(xml),
                    })
                } catch (err) {
                    setResult(id, {
                        status: "error",
                        error: err instanceof Error ? err.message : String(err),
                    })
                }
            }
        } finally {
            renderer.destroy()
            rendererRef.current = null
            setIsRunning(false)
        }
    }

    const downloadZip = () => {
        const files: Array<{ name: string; data: Uint8Array }> = []
        const encoder = new TextEncoder()
        for (const passage of parsed.passages) {
            const result = results.get(passage.id)
            if (result?.xml) {
                files.push({
                    name: `q${passage.questionNumber}-flow.drawio.xml`,
                    data: encoder.encode(result.xml),
                })
            }
            if (result?.pngBytes) {
                files.push({
                    name: `q${passage.questionNumber}-flow.png`,
                    data: result.pngBytes,
                })
            }
        }
        if (files.length === 0) return
        downloadBytes(
            `csat-flow-diagrams-${Date.now()}.zip`,
            makeZip(files),
            "application/zip",
        )
    }

    const selectAll = () => {
        setSelectedIds(new Set(parsed.passages.map((p) => p.id)))
    }

    return (
        <main style={page}>
            <div style={shell}>
                <div style={topBar}>
                    <div>
                        <h1 style={title} data-testid="csv-passages-title">
                            수능 지문 CSV 흐름 다이어그램
                        </h1>
                        <p
                            style={{
                                margin: "6px 0 0",
                                color: T.ink500,
                                fontSize: 14,
                            }}
                        >
                            CSV 행마다 영어 지문의 핵심 전개를 draw.io
                            다이어그램으로 만들고, 결과를 배치 다운로드합니다.
                        </p>
                    </div>
                    <div style={toolbar}>
                        <label style={button("secondary")}>
                            <Upload size={16} />
                            CSV 업로드
                            <input
                                type="file"
                                accept=".csv,text/csv"
                                style={{ display: "none" }}
                                onChange={(e) => {
                                    const file = e.target.files?.[0]
                                    if (file) void handleFile(file)
                                    e.currentTarget.value = ""
                                }}
                            />
                        </label>
                        <button
                            type="button"
                            style={button("secondary")}
                            onClick={() => setCsvText(CSAT_CSV_SAMPLE)}
                        >
                            <FileText size={16} />
                            샘플
                        </button>
                    </div>
                </div>

                <div style={grid}>
                    <section style={panel}>
                        <div style={panelHeader}>
                            <FileText size={18} />
                            CSV 입력
                        </div>
                        <div style={panelBody}>
                            <textarea
                                value={csvText}
                                onChange={(e) => {
                                    setCsvText(e.target.value)
                                    setSelectedIds(new Set())
                                    setResults(new Map())
                                }}
                                style={textarea}
                                spellCheck={false}
                            />
                            <div
                                style={{
                                    marginTop: 12,
                                    color: T.ink500,
                                    fontSize: 12,
                                    lineHeight: 1.6,
                                }}
                            >
                                지원 헤더: `questionNumber`, `questionType`,
                                `koreanInstruction`, `englishPassage`. `지문`,
                                `영어지문`, `유형`, `문항번호`도 인식합니다.
                            </div>
                            {parsed.warnings.length > 0 ? (
                                <div
                                    style={{
                                        marginTop: 12,
                                        background: T.yellowWash,
                                        border: `1px solid ${T.mustard}`,
                                        borderRadius: 8,
                                        padding: 10,
                                        color: T.ink700,
                                        fontSize: 12,
                                    }}
                                >
                                    {parsed.warnings.slice(0, 4).map((w) => (
                                        <div key={w}>• {w}</div>
                                    ))}
                                </div>
                            ) : null}
                        </div>
                    </section>

                    <section style={panel}>
                        <div style={panelHeader}>
                            <Play size={18} />
                            배치 생성
                        </div>
                        <div style={panelBody}>
                            <div style={statRow}>
                                <Stat
                                    label="지문"
                                    value={parsed.passages.length}
                                />
                                <Stat label="선택" value={selectedCount} />
                                <Stat
                                    label="완료"
                                    value={`${completedCount}/${failedCount}`}
                                    caption="성공/실패"
                                />
                            </div>
                            <div style={toolbar}>
                                <button
                                    type="button"
                                    data-testid="csv-run-batch"
                                    style={button("primary", isRunning)}
                                    disabled={
                                        parsed.passages.length === 0 ||
                                        selectedCount === 0 ||
                                        isRunning
                                    }
                                    onClick={() => void runBatch()}
                                >
                                    {isRunning ? (
                                        <Loader2
                                            size={16}
                                            className="animate-spin"
                                        />
                                    ) : (
                                        <Play size={16} />
                                    )}
                                    선택 {selectedCount}개 생성
                                </button>
                                <button
                                    type="button"
                                    style={button("secondary")}
                                    onClick={selectAll}
                                    disabled={parsed.passages.length === 0}
                                >
                                    전체 선택
                                </button>
                                <button
                                    type="button"
                                    data-testid="csv-download-zip"
                                    style={button(
                                        "secondary",
                                        completedCount === 0,
                                    )}
                                    disabled={completedCount === 0}
                                    onClick={downloadZip}
                                >
                                    <Download size={16} />
                                    ZIP 다운로드
                                </button>
                            </div>

                            <div style={{ marginTop: 16, ...tableWrap }}>
                                <table
                                    style={{
                                        width: "100%",
                                        borderCollapse: "collapse",
                                        fontSize: 12,
                                    }}
                                >
                                    <thead>
                                        <tr style={{ background: T.paper100 }}>
                                            <Th>선택</Th>
                                            <Th>문항</Th>
                                            <Th>유형</Th>
                                            <Th>지문 미리보기</Th>
                                            <Th>상태</Th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {parsed.passages.map((p) => {
                                            const result = results.get(p.id)
                                            return (
                                                <tr key={p.id}>
                                                    <Td>
                                                        <input
                                                            type="checkbox"
                                                            checked={selectedIds.has(
                                                                p.id,
                                                            )}
                                                            onChange={() =>
                                                                toggleSelection(
                                                                    p.id,
                                                                )
                                                            }
                                                        />
                                                    </Td>
                                                    <Td>{p.questionNumber}</Td>
                                                    <Td>{p.questionType}</Td>
                                                    <Td>
                                                        {p.englishPassage.slice(
                                                            0,
                                                            90,
                                                        )}
                                                        {p.englishPassage
                                                            .length > 90
                                                            ? "..."
                                                            : ""}
                                                    </Td>
                                                    <Td>
                                                        <Status
                                                            result={result}
                                                        />
                                                    </Td>
                                                </tr>
                                            )
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </section>
                </div>

                <section style={{ ...panel, marginTop: 18 }}>
                    <div style={panelHeader}>
                        <CheckCircle2 size={18} />
                        생성된 다이어그램
                    </div>
                    <div style={panelBody}>
                        {completedCount === 0 ? (
                            <div
                                style={{
                                    padding: 36,
                                    textAlign: "center",
                                    color: T.ink500,
                                }}
                            >
                                배치 생성을 실행하면 PNG 미리보기와 draw.io
                                링크가 여기에 표시됩니다.
                            </div>
                        ) : (
                            <div style={resultGrid}>
                                {parsed.passages.map((p) => {
                                    const result = results.get(p.id)
                                    if (result?.status !== "done") return null
                                    return (
                                        <article key={p.id} style={resultCard}>
                                            <div
                                                style={{
                                                    padding: "10px 12px",
                                                    borderBottom: `1px solid ${T.paper300}`,
                                                    display: "flex",
                                                    justifyContent:
                                                        "space-between",
                                                    gap: 10,
                                                    alignItems: "center",
                                                }}
                                            >
                                                <strong>
                                                    Q{p.questionNumber} ·{" "}
                                                    {p.questionType}
                                                </strong>
                                                <a
                                                    href={result.shareUrl}
                                                    target="_blank"
                                                    rel="noreferrer"
                                                    style={{
                                                        color: T.inkBlue,
                                                        fontSize: 12,
                                                        fontWeight: 700,
                                                    }}
                                                >
                                                    draw.io
                                                </a>
                                            </div>
                                            {result.pngDataUrl ? (
                                                <Image
                                                    data-testid="csv-diagram-image"
                                                    src={result.pngDataUrl}
                                                    alt={`Q${p.questionNumber} flow diagram`}
                                                    width={800}
                                                    height={480}
                                                    unoptimized
                                                    style={{
                                                        width: "100%",
                                                        height: "auto",
                                                        display: "block",
                                                        background: "#fff",
                                                    }}
                                                />
                                            ) : null}
                                            <div
                                                style={{
                                                    padding: 10,
                                                    display: "flex",
                                                    gap: 8,
                                                }}
                                            >
                                                <button
                                                    type="button"
                                                    style={button("secondary")}
                                                    onClick={() =>
                                                        result.pngBytes &&
                                                        downloadBytes(
                                                            `q${p.questionNumber}-flow.png`,
                                                            result.pngBytes,
                                                            "image/png",
                                                        )
                                                    }
                                                >
                                                    PNG
                                                </button>
                                                <button
                                                    type="button"
                                                    style={button("secondary")}
                                                    onClick={() =>
                                                        result.xml &&
                                                        downloadBytes(
                                                            `q${p.questionNumber}-flow.xml`,
                                                            new TextEncoder().encode(
                                                                result.xml,
                                                            ),
                                                            "application/xml",
                                                        )
                                                    }
                                                >
                                                    XML
                                                </button>
                                            </div>
                                        </article>
                                    )
                                })}
                            </div>
                        )}
                    </div>
                </section>
            </div>
        </main>
    )
}

function Stat({
    label,
    value,
    caption,
}: {
    label: string
    value: number | string
    caption?: string
}) {
    return (
        <div style={statCard}>
            <div style={{ color: T.ink500, fontSize: 12 }}>{label}</div>
            <div style={{ fontSize: 26, fontWeight: 800, marginTop: 2 }}>
                {value}
            </div>
            {caption ? (
                <div style={{ color: T.ink500, fontSize: 11 }}>{caption}</div>
            ) : null}
        </div>
    )
}

function Th({ children }: { children: ReactNode }) {
    return (
        <th
            style={{
                textAlign: "left",
                padding: "9px 10px",
                borderBottom: `1px solid ${T.paper300}`,
                color: T.ink700,
                whiteSpace: "nowrap",
            }}
        >
            {children}
        </th>
    )
}

function Td({ children }: { children: ReactNode }) {
    return (
        <td
            style={{
                padding: "9px 10px",
                borderBottom: `1px solid ${T.paper200}`,
                verticalAlign: "top",
                color: T.ink700,
            }}
        >
            {children}
        </td>
    )
}

function Status({ result }: { result?: DiagramResult }) {
    if (!result || result.status === "idle") {
        return <span style={{ color: T.ink500 }}>대기</span>
    }
    if (result.status === "running") {
        return (
            <span
                style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 5,
                    color: T.inkBlue,
                    fontWeight: 700,
                }}
            >
                <Loader2 size={13} className="animate-spin" /> 생성 중
            </span>
        )
    }
    if (result.status === "done") {
        return (
            <span
                style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 5,
                    color: T.sage,
                    fontWeight: 700,
                }}
            >
                <CheckCircle2 size={13} /> 완료
            </span>
        )
    }
    return (
        <span
            title={result.error}
            style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 5,
                color: T.coral,
                fontWeight: 700,
            }}
        >
            <AlertCircle size={13} /> 실패
        </span>
    )
}

function bytesToDataUrl(bytes: Uint8Array, mime: string): string {
    let binary = ""
    for (let i = 0; i < bytes.length; i++) {
        binary += String.fromCharCode(bytes[i])
    }
    return `data:${mime};base64,${btoa(binary)}`
}

function downloadBytes(filename: string, bytes: Uint8Array, mime: string) {
    const safeBytes = new Uint8Array(bytes)
    const blob = new Blob([safeBytes.buffer as ArrayBuffer], { type: mime })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = filename
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(url)
}
