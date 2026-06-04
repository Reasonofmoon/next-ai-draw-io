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
import { i18n, type Locale } from "@/lib/i18n/config"
import {
    buildDrawioShareUrl,
    DrawioPngRenderer,
    generateDiagramXml,
} from "@/lib/passage-pipeline"
import { makeZip } from "@/lib/passage-pipeline-zip"
import {
    type PdfMarkdownSection,
    pdfSectionToDetectedPassage,
    splitCsvIntoDiagramSections,
    splitJsonIntoDiagramSections,
    splitPdfMarkdownIntoSections,
} from "@/lib/pdf-markdown-diagram"
import { T } from "@/lib/workbench-tokens"

type JobStatus = "idle" | "converting" | "ready" | "running" | "done" | "error"

interface PdfDocument {
    id: string
    filename: string
    status: JobStatus
    markdown?: string
    engine?: string
    sections: PdfMarkdownSection[]
    warnings: string[]
    error?: string
}

interface DiagramResult {
    status: JobStatus
    xml?: string
    pngBytes?: Uint8Array
    pngDataUrl?: string
    shareUrl?: string
    error?: string
}

interface ConvertedInput {
    markdown: string
    engine: string
    sections: PdfMarkdownSection[]
    warnings: string[]
}

interface AiDetectedPassage {
    number: number
    type: string
    koreanInstruction: string
    englishText: string
    confidence: "high" | "medium" | "low"
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
    fontSize: 34,
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
    gridTemplateColumns: "minmax(320px, 430px) minmax(0, 1fr)",
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

const dropZone = {
    border: `1px dashed ${T.paper400}`,
    borderRadius: 8,
    padding: 24,
    background: "#fff",
    textAlign: "center",
} as const

const tableWrap = {
    overflowX: "auto",
    border: `1px solid ${T.paper300}`,
    borderRadius: 8,
} as const

const statRow = {
    display: "grid",
    gridTemplateColumns: "repeat(4, 1fr)",
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

export default function PdfDiagramsPage() {
    const currentLang =
        typeof window === "undefined"
            ? i18n.defaultLocale
            : ((window.location.pathname.split("/")[1] ||
                  i18n.defaultLocale) as Locale)
    const [documents, setDocuments] = useState<PdfDocument[]>([])
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
    const [results, setResults] = useState<Map<string, DiagramResult>>(
        new Map(),
    )
    const [isConverting, setIsConverting] = useState(false)
    const [isRunning, setIsRunning] = useState(false)
    const rendererRef = useRef<DrawioPngRenderer | null>(null)

    const sections = useMemo(
        () => documents.flatMap((doc) => doc.sections),
        [documents],
    )
    const completedCount = [...results.values()].filter(
        (r) => r.status === "done",
    ).length
    const failedCount = [...results.values()].filter(
        (r) => r.status === "error",
    ).length

    useEffect(() => {
        setSelectedIds(new Set(sections.map((section) => section.id)))
    }, [sections])

    const setResult = (id: string, result: DiagramResult) => {
        setResults((prev) => new Map(prev).set(id, result))
    }

    const handleFiles = async (files: FileList | File[]) => {
        const supportedFiles = Array.from(files).filter((file) =>
            isSupportedInputFile(file),
        )
        if (supportedFiles.length === 0 || isConverting) return

        setIsConverting(true)
        setDocuments([])
        setResults(new Map())

        const nextDocuments: PdfDocument[] = []
        for (const file of supportedFiles) {
            const id = `${file.name}-${file.size}-${file.lastModified}`
            const pending: PdfDocument = {
                id,
                filename: file.name,
                status: "converting",
                sections: [],
                warnings: [],
            }
            nextDocuments.push(pending)
            setDocuments([...nextDocuments])

            try {
                const converted = await convertInputFile(file)
                const ready: PdfDocument = {
                    ...pending,
                    status: "ready",
                    markdown: converted.markdown,
                    engine: converted.engine,
                    sections: converted.sections,
                    warnings: converted.warnings,
                }
                nextDocuments[nextDocuments.length - 1] = ready
                setDocuments([...nextDocuments])
            } catch (err) {
                nextDocuments[nextDocuments.length - 1] = {
                    ...pending,
                    status: "error",
                    error: err instanceof Error ? err.message : String(err),
                    warnings: [],
                    sections: [],
                }
                setDocuments([...nextDocuments])
            }
        }

        setIsConverting(false)
    }

    const toggleSelection = (id: string) => {
        setSelectedIds((prev) => {
            const next = new Set(prev)
            if (next.has(id)) next.delete(id)
            else next.add(id)
            return next
        })
    }

    const selectAll = () => {
        setSelectedIds(new Set(sections.map((section) => section.id)))
    }

    const runBatch = async () => {
        if (selectedIds.size === 0 || isRunning) return

        setIsRunning(true)
        const renderer = new DrawioPngRenderer()
        rendererRef.current = renderer
        try {
            await renderer.init()
            for (const id of selectedIds) {
                const section = sections.find((item) => item.id === id)
                if (!section) continue
                setResult(id, { status: "running" })
                try {
                    const xml = await generateDiagramXml(
                        pdfSectionToDetectedPassage(section),
                    )
                    const pngBytes = await renderer.render(xml, 2)
                    setResult(id, {
                        status: "done",
                        xml,
                        pngBytes,
                        pngDataUrl: bytesToDataUrl(pngBytes, "image/png"),
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

    const downloadMarkdownZip = () => {
        const encoder = new TextEncoder()
        const files = documents
            .filter((doc) => doc.markdown)
            .map((doc) => ({
                name: `${baseName(doc.filename)}.md`,
                data: encoder.encode(doc.markdown),
            }))
        if (files.length === 0) return
        downloadBytes(
            `markitdown-markdown-${Date.now()}.zip`,
            makeZip(files),
            "application/zip",
        )
    }

    const downloadDiagramZip = () => {
        const encoder = new TextEncoder()
        const files: Array<{ name: string; data: Uint8Array }> = []
        for (const section of sections) {
            const result = results.get(section.id)
            const stem = `${baseName(section.sourceName)}-${section.sectionIndex}`
            if (result?.xml) {
                files.push({
                    name: `${stem}.drawio.xml`,
                    data: encoder.encode(result.xml),
                })
            }
            if (result?.pngBytes) {
                files.push({
                    name: `${stem}.png`,
                    data: result.pngBytes,
                })
            }
        }
        if (files.length === 0) return
        downloadBytes(
            `pdf-flow-diagrams-${Date.now()}.zip`,
            makeZip(files),
            "application/zip",
        )
    }

    return (
        <main style={page}>
            <div style={shell}>
                <div style={topBar}>
                    <div>
                        <h1 style={title} data-testid="pdf-diagrams-title">
                            Paper 파일 흐름 다이어그램
                        </h1>
                        <p
                            style={{
                                margin: "6px 0 0",
                                color: T.ink500,
                                fontSize: 14,
                            }}
                        >
                            PDF는 MarkItDown으로 Markdown 변환하고, CSV/JSON은
                            문항 데이터로 읽어 문제별 다이어그램을 배치
                            생성합니다.
                        </p>
                    </div>
                    <div style={toolbar}>
                        <a
                            href={`/${currentLang}`}
                            style={{
                                ...button("secondary"),
                                textDecoration: "none",
                            }}
                        >
                            기존 Paper
                        </a>
                        <a
                            href={`/${currentLang}/csv-passages`}
                            style={{
                                ...button("secondary"),
                                textDecoration: "none",
                            }}
                        >
                            CSV 전용
                        </a>
                        <label style={button("secondary", isConverting)}>
                            <Upload size={16} />
                            파일 업로드
                            <input
                                type="file"
                                accept="application/pdf,.pdf,text/csv,.csv,application/json,.json"
                                multiple
                                disabled={isConverting}
                                style={{ display: "none" }}
                                onChange={(event) => {
                                    const files = event.target.files
                                    if (files) void handleFiles(files)
                                    event.currentTarget.value = ""
                                }}
                            />
                        </label>
                        <button
                            type="button"
                            style={button("secondary", documents.length === 0)}
                            disabled={documents.length === 0}
                            onClick={() => {
                                setDocuments([])
                                setResults(new Map())
                                setSelectedIds(new Set())
                            }}
                        >
                            초기화
                        </button>
                    </div>
                </div>

                <div style={grid}>
                    <section style={panel}>
                        <div style={panelHeader}>
                            <FileText size={18} />
                            파일 입력
                        </div>
                        <div style={panelBody}>
                            <div
                                style={dropZone}
                                onDragOver={(event) => event.preventDefault()}
                                onDrop={(event) => {
                                    event.preventDefault()
                                    void handleFiles(event.dataTransfer.files)
                                }}
                            >
                                <Upload
                                    size={30}
                                    style={{
                                        color: T.inkBlue,
                                        marginBottom: 8,
                                    }}
                                />
                                <div style={{ fontWeight: 800 }}>
                                    PDF를 업로드하거나 여기로 끌어오세요
                                </div>
                                <div
                                    style={{
                                        color: T.ink500,
                                        fontSize: 12,
                                        marginTop: 6,
                                    }}
                                >
                                    PDF, CSV, JSON을 파일당 25MB까지 처리합니다.
                                </div>
                            </div>

                            <div style={{ marginTop: 16 }}>
                                {documents.length === 0 ? (
                                    <Empty text="아직 업로드된 파일이 없습니다." />
                                ) : (
                                    documents.map((doc) => (
                                        <DocumentCard key={doc.id} doc={doc} />
                                    ))
                                )}
                            </div>
                        </div>
                    </section>

                    <section style={panel}>
                        <div style={panelHeader}>
                            <Play size={18} />
                            배치 다이어그램
                        </div>
                        <div style={panelBody}>
                            <div style={statRow}>
                                <Stat label="파일" value={documents.length} />
                                <Stat label="섹션" value={sections.length} />
                                <Stat label="선택" value={selectedIds.size} />
                                <Stat
                                    label="완료"
                                    value={`${completedCount}/${failedCount}`}
                                    caption="성공/실패"
                                />
                            </div>

                            <div style={toolbar}>
                                <button
                                    type="button"
                                    data-testid="pdf-run-batch"
                                    style={button(
                                        "primary",
                                        isRunning ||
                                            isConverting ||
                                            selectedIds.size === 0,
                                    )}
                                    disabled={
                                        isRunning ||
                                        isConverting ||
                                        selectedIds.size === 0
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
                                    선택 {selectedIds.size}개 생성
                                </button>
                                <button
                                    type="button"
                                    style={button(
                                        "secondary",
                                        sections.length === 0,
                                    )}
                                    disabled={sections.length === 0}
                                    onClick={selectAll}
                                >
                                    전체 선택
                                </button>
                                <button
                                    type="button"
                                    style={button(
                                        "secondary",
                                        documents.every((doc) => !doc.markdown),
                                    )}
                                    disabled={documents.every(
                                        (doc) => !doc.markdown,
                                    )}
                                    onClick={downloadMarkdownZip}
                                >
                                    <Download size={16} />
                                    MD ZIP
                                </button>
                                <button
                                    type="button"
                                    data-testid="pdf-download-zip"
                                    style={button(
                                        "secondary",
                                        completedCount === 0,
                                    )}
                                    disabled={completedCount === 0}
                                    onClick={downloadDiagramZip}
                                >
                                    <Download size={16} />
                                    Diagram ZIP
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
                                            <Th>PDF</Th>
                                            <Th>섹션</Th>
                                            <Th>Markdown</Th>
                                            <Th>상태</Th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {sections.map((section) => (
                                            <tr key={section.id}>
                                                <Td>
                                                    <input
                                                        type="checkbox"
                                                        checked={selectedIds.has(
                                                            section.id,
                                                        )}
                                                        onChange={() =>
                                                            toggleSelection(
                                                                section.id,
                                                            )
                                                        }
                                                    />
                                                </Td>
                                                <Td>{section.sourceName}</Td>
                                                <Td>{section.title}</Td>
                                                <Td>
                                                    {section.charCount.toLocaleString()}{" "}
                                                    chars
                                                </Td>
                                                <Td>
                                                    <Status
                                                        result={results.get(
                                                            section.id,
                                                        )}
                                                    />
                                                </Td>
                                            </tr>
                                        ))}
                                        {sections.length === 0 ? (
                                            <tr>
                                                <Td colSpan={5}>
                                                    변환된 섹션이 없습니다.
                                                </Td>
                                            </tr>
                                        ) : null}
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
                            <Empty text="배치 생성을 실행하면 PNG 미리보기와 draw.io 링크가 표시됩니다." />
                        ) : (
                            <div style={resultGrid}>
                                {sections.map((section) => {
                                    const result = results.get(section.id)
                                    if (result?.status !== "done") return null
                                    return (
                                        <article
                                            key={section.id}
                                            style={resultCard}
                                        >
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
                                                    {section.title} ·{" "}
                                                    {section.sourceName}
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
                                                    data-testid="pdf-diagram-image"
                                                    src={result.pngDataUrl}
                                                    alt={`${section.title} flow diagram`}
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
                                                            `${baseName(section.sourceName)}-${section.sectionIndex}.png`,
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
                                                            `${baseName(section.sourceName)}-${section.sectionIndex}.xml`,
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

function DocumentCard({ doc }: { doc: PdfDocument }) {
    return (
        <article
            style={{
                border: `1px solid ${T.paper300}`,
                borderRadius: 8,
                background: "#fff",
                padding: 12,
                marginTop: 10,
            }}
        >
            <div
                style={{
                    display: "flex",
                    justifyContent: "space-between",
                    gap: 10,
                    alignItems: "center",
                }}
            >
                <strong>{doc.filename}</strong>
                <Status result={{ status: doc.status, error: doc.error }} />
            </div>
            {doc.engine ? (
                <div style={{ color: T.ink500, fontSize: 12, marginTop: 4 }}>
                    {doc.engine}
                </div>
            ) : null}
            {doc.error ? (
                <div
                    style={{
                        color: T.coral,
                        fontSize: 12,
                        lineHeight: 1.5,
                        marginTop: 8,
                    }}
                >
                    {doc.error}
                </div>
            ) : null}
            {doc.markdown ? (
                <details style={{ marginTop: 10 }}>
                    <summary style={{ cursor: "pointer", fontWeight: 700 }}>
                        Markdown 미리보기 ·{" "}
                        {doc.markdown.length.toLocaleString()} chars
                    </summary>
                    <pre
                        style={{
                            margin: "10px 0 0",
                            maxHeight: 180,
                            overflow: "auto",
                            whiteSpace: "pre-wrap",
                            fontFamily: T.fontMono,
                            fontSize: 11,
                            background: T.paper100,
                            border: `1px solid ${T.paper300}`,
                            borderRadius: 8,
                            padding: 10,
                        }}
                    >
                        {doc.markdown.slice(0, 4000)}
                    </pre>
                </details>
            ) : null}
            {doc.warnings.length > 0 ? (
                <div
                    style={{
                        marginTop: 10,
                        background: T.yellowWash,
                        border: `1px solid ${T.mustard}`,
                        borderRadius: 8,
                        padding: 10,
                        fontSize: 12,
                        color: T.ink700,
                    }}
                >
                    {doc.warnings.slice(0, 3).map((warning) => (
                        <div key={warning}>{warning}</div>
                    ))}
                </div>
            ) : null}
        </article>
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
            <div style={{ fontSize: 24, fontWeight: 800, marginTop: 2 }}>
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

function Td({ children, colSpan }: { children: ReactNode; colSpan?: number }) {
    return (
        <td
            colSpan={colSpan}
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

function Status({
    result,
}: {
    result?: { status: JobStatus; error?: string }
}) {
    if (!result || result.status === "idle") {
        return <span style={{ color: T.ink500 }}>대기</span>
    }
    if (result.status === "converting") {
        return <Busy text="변환 중" />
    }
    if (result.status === "running") {
        return <Busy text="생성 중" />
    }
    if (result.status === "ready") {
        return (
            <span style={{ color: T.inkBlue, fontWeight: 700 }}>
                Markdown 준비
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

function Busy({ text }: { text: string }) {
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
            <Loader2 size={13} className="animate-spin" /> {text}
        </span>
    )
}

function Empty({ text }: { text: string }) {
    return (
        <div
            style={{
                padding: 28,
                textAlign: "center",
                color: T.ink500,
            }}
        >
            {text}
        </div>
    )
}

function isSupportedInputFile(file: File): boolean {
    const name = file.name.toLowerCase()
    return (
        name.endsWith(".pdf") || name.endsWith(".csv") || name.endsWith(".json")
    )
}

async function convertInputFile(file: File): Promise<ConvertedInput> {
    const name = file.name.toLowerCase()
    if (name.endsWith(".csv")) {
        const markdown = await file.text()
        const split = splitCsvIntoDiagramSections(markdown, file.name)
        return {
            markdown,
            engine: "csv-question-parser",
            sections: split.sections,
            warnings: split.warnings,
        }
    }
    if (name.endsWith(".json")) {
        const markdown = await file.text()
        const split = splitJsonIntoDiagramSections(markdown, file.name)
        return {
            markdown,
            engine: "json-question-parser",
            sections: split.sections,
            warnings: split.warnings,
        }
    }

    const converted = await convertPdfToMarkdown(file)
    const split = splitPdfMarkdownIntoSections(converted.markdown, file.name)
    const refined = await refinePdfQuestionsIfNeeded(
        converted.markdown,
        file.name,
        split,
    )
    return {
        markdown: converted.markdown,
        engine: refined.usedAi
            ? `${converted.engine} + ai-question-detector`
            : converted.engine,
        sections: refined.sections,
        warnings: refined.warnings,
    }
}

async function refinePdfQuestionsIfNeeded(
    markdown: string,
    filename: string,
    split: {
        sections: PdfMarkdownSection[]
        warnings: string[]
    },
): Promise<{
    usedAi: boolean
    sections: PdfMarkdownSection[]
    warnings: string[]
}> {
    if (!shouldUseAiQuestionDetector(markdown, split.sections)) {
        return {
            usedAi: false,
            sections: split.sections,
            warnings: split.warnings,
        }
    }

    try {
        const aiSections = await detectPdfQuestionsViaAI(markdown, filename)
        if (
            aiSections.length >= 8 &&
            aiSections.length >= split.sections.length / 2
        ) {
            return {
                usedAi: true,
                sections: aiSections,
                warnings: [
                    `AI question detector replaced the initial ${split.sections.length} sections with ${aiSections.length} clean question passages.`,
                    ...split.warnings,
                ],
            }
        }

        return {
            usedAi: false,
            sections: split.sections,
            warnings: [
                `AI question detector returned only ${aiSections.length} passages, so the initial split was kept.`,
                ...split.warnings,
            ],
        }
    } catch (err) {
        return {
            usedAi: false,
            sections: split.sections,
            warnings: [
                `AI question detector failed: ${
                    err instanceof Error ? err.message : String(err)
                }`,
                ...split.warnings,
            ],
        }
    }
}

function shouldUseAiQuestionDetector(
    markdown: string,
    sections: PdfMarkdownSection[],
): boolean {
    if (markdown.length < 8000 || sections.length === 0) return false
    const questionNumbers = sections
        .map((section) => section.questionNumber)
        .filter((number): number is number => typeof number === "number")
    const hasExamRange = questionNumbers.some(
        (number) => number >= 18 && number <= 45,
    )
    if (!hasExamRange) return false

    const hasShortQuestion = sections.some(
        (section) => section.questionNumber && section.charCount < 250,
    )
    const hasLargeGaps = questionNumbers.some((number, index) => {
        const next = questionNumbers[index + 1]
        return next !== undefined && next - number > 2
    })
    return hasShortQuestion || hasLargeGaps || sections.length < 20
}

async function detectPdfQuestionsViaAI(
    markdown: string,
    filename: string,
): Promise<PdfMarkdownSection[]> {
    const fullText =
        markdown.length > 120000 ? markdown.slice(0, 120000) : markdown
    const res = await fetch("/api/detect-passages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            fullText,
            numberRange: { min: 18, max: 45 },
        }),
    })
    const data = (await res.json().catch(() => null)) as {
        passages?: AiDetectedPassage[]
        error?: string
    } | null
    if (!res.ok || !data?.passages) {
        throw new Error(data?.error ?? `/api/detect-passages ${res.status}`)
    }

    return data.passages
        .filter((passage) => passage.englishText.trim().length >= 50)
        .sort((a, b) => a.number - b.number)
        .map((passage, index) => {
            const questionType =
                passage.type === "기타" ? "핵심 흐름" : passage.type
            const markdownForDiagram = [
                passage.koreanInstruction
                    ? `Instruction: ${passage.koreanInstruction}`
                    : "",
                "",
                passage.englishText,
            ]
                .filter(Boolean)
                .join("\n")
            return {
                id: `${baseName(filename)}-ai-q${passage.number}`,
                sourceName: filename,
                title: `Q${passage.number} · ${questionType}`,
                markdown: markdownForDiagram,
                sectionIndex: index + 1,
                charCount: markdownForDiagram.length,
                questionNumber: passage.number,
                questionType,
            }
        })
}

async function convertPdfToMarkdown(file: File): Promise<{
    markdown: string
    engine: string
}> {
    const formData = new FormData()
    formData.append("file", file)
    const res = await fetch("/api/convert-pdf-markdown", {
        method: "POST",
        body: formData,
    })
    const data = (await res.json()) as {
        success?: boolean
        markdown?: string
        engine?: string
        error?: string
    }
    if (!res.ok || !data.success || typeof data.markdown !== "string") {
        throw new Error(data.error ?? `PDF conversion failed (${res.status})`)
    }
    return {
        markdown: data.markdown,
        engine: data.engine ?? "microsoft-markitdown",
    }
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

function baseName(filename: string): string {
    return filename.replace(/\.[^.]+$/, "").replace(/[^a-z0-9가-힣]+/gi, "-")
}
