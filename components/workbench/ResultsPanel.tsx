/**
 * ResultsPanel — Phase 5 of the /test-hwp redesign.
 *
 * Right-rail accordion showing per-passage generation output. Mirrors the
 * PassageSidebar ordering so teachers keep spatial context when clicking
 * around. Each card exposes:
 *
 *   - status chips (콘텐츠 ✓ / 다이어그램 ⏳)
 *   - block-count summary
 *   - 🔁 retry-this-passage button
 *   - expanded: list of ContentBlock titles + reasoning, diagram note
 *
 * Heavy preview rendering (BlockPreview, SVG etc.) stays in the main page
 * for now — this panel is a navigational summary, not a duplicate preview.
 * Phase 6+ can embed full previews once we're confident in spacing.
 */

"use client"

import { type CSSProperties, useState } from "react"
import type { ContentBlock } from "@/lib/korean-content-generator"
import { colorForType, T } from "@/lib/workbench-tokens"

export interface ResultsPanelPassage {
    questionNumber: number
    questionType: string
}

export interface ResultsPanelProps {
    passages: ResultsPanelPassage[]
    contentByPassage: Map<number, ContentBlock[]>
    diagramByPassage: Map<
        number,
        { xml: string; pngDataUrl: string; shareUrl: string }
    >
    onRetryPassage: (qNum: number) => void | Promise<void>
    retryingQuestionNumber?: number | null
}

const panel: CSSProperties = {
    padding: 14,
    fontFamily: T.fontSans,
}

const header: CSSProperties = {
    fontFamily: T.fontDisplay,
    fontSize: 22,
    color: T.ink900,
    margin: "4px 4px 14px",
}

const emptyState: CSSProperties = {
    padding: "40px 18px",
    textAlign: "center",
    color: T.ink500,
    fontSize: 13,
    lineHeight: 1.6,
}

const card = (accent: string): CSSProperties => ({
    border: `1px solid ${T.paper300}`,
    borderLeft: `3px solid ${accent}`,
    borderRadius: 10,
    background: T.paper50,
    marginBottom: 10,
    overflow: "hidden",
})

const cardHeader: CSSProperties = {
    width: "100%",
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "10px 12px",
    background: "transparent",
    border: "none",
    cursor: "pointer",
    textAlign: "left",
    fontFamily: T.fontSans,
    fontSize: 13,
    color: T.ink900,
}

const qBadge = (color: string): CSSProperties => ({
    display: "inline-flex",
    minWidth: 26,
    height: 22,
    padding: "0 6px",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 5,
    background: color,
    color: "#fff",
    fontWeight: 700,
    fontSize: 11,
})

const chip = (ok: boolean, bg: string, fg: string): CSSProperties => ({
    padding: "2px 7px",
    borderRadius: 5,
    background: ok ? bg : T.paper200,
    color: ok ? fg : T.ink500,
    fontSize: 11,
    fontWeight: 600,
    border: `1px solid ${ok ? bg : T.paper300}`,
})

const retryBtn = (disabled: boolean): CSSProperties => ({
    padding: "4px 8px",
    borderRadius: 6,
    background: disabled ? T.paper200 : T.paper100,
    color: disabled ? T.ink300 : T.ink700,
    border: `1px solid ${T.paper300}`,
    cursor: disabled ? "wait" : "pointer",
    fontSize: 11,
    fontWeight: 600,
    fontFamily: T.fontSans,
})

const body: CSSProperties = {
    padding: "0 12px 12px",
    borderTop: `1px dashed ${T.paper300}`,
    fontSize: 12,
    color: T.ink700,
    lineHeight: 1.6,
}

const blockRow: CSSProperties = {
    display: "flex",
    alignItems: "baseline",
    gap: 6,
    padding: "6px 0",
    borderBottom: `1px dotted ${T.paper200}`,
}

export function ResultsPanel({
    passages,
    contentByPassage,
    diagramByPassage,
    onRetryPassage,
    retryingQuestionNumber,
}: ResultsPanelProps) {
    const [openQ, setOpenQ] = useState<number | null>(null)

    if (passages.length === 0) {
        return (
            <div style={panel}>
                <h3 style={header}>💡 결과</h3>
                <div style={emptyState}>
                    콘텐츠를 생성하면 여기에 지문별 요약이 나타나요.
                </div>
            </div>
        )
    }

    const anyResult = contentByPassage.size > 0 || diagramByPassage.size > 0

    return (
        <div style={panel}>
            <h3 style={header}>
                💡 결과 ({contentByPassage.size + diagramByPassage.size})
            </h3>
            {!anyResult ? (
                <div style={emptyState}>
                    아직 생성된 콘텐츠가 없어요.
                    <br />
                    가운데 패널에서 실행해 보세요.
                </div>
            ) : null}
            {passages.map((p) => {
                const blocks = contentByPassage.get(p.questionNumber)
                const diagram = diagramByPassage.get(p.questionNumber)
                const hasContent = Boolean(blocks && blocks.length > 0)
                const hasDiagram = Boolean(diagram)
                if (!hasContent && !hasDiagram) return null

                const accent = colorForType(p.questionType)
                const expanded = openQ === p.questionNumber
                const isRetrying = retryingQuestionNumber === p.questionNumber

                return (
                    <article key={p.questionNumber} style={card(accent)}>
                        <div
                            style={{
                                display: "flex",
                                alignItems: "center",
                                padding: "2px 8px 2px 0",
                            }}
                        >
                            <button
                                type="button"
                                style={{ ...cardHeader, flex: 1 }}
                                onClick={() =>
                                    setOpenQ(expanded ? null : p.questionNumber)
                                }
                                aria-expanded={expanded}
                            >
                                <span style={qBadge(accent)}>
                                    {p.questionNumber}
                                </span>
                                <span
                                    style={{
                                        flex: 1,
                                        overflow: "hidden",
                                        textOverflow: "ellipsis",
                                        whiteSpace: "nowrap",
                                    }}
                                >
                                    {p.questionType}
                                </span>
                                <span
                                    style={chip(
                                        hasContent,
                                        T.greenWash,
                                        T.sage,
                                    )}
                                >
                                    콘{" "}
                                    {hasContent ? (blocks?.length ?? 0) : "–"}
                                </span>
                                <span
                                    style={chip(
                                        hasDiagram,
                                        T.blueWash,
                                        T.inkBlue,
                                    )}
                                >
                                    다 {hasDiagram ? "✓" : "–"}
                                </span>
                                <span style={{ color: T.ink500, fontSize: 11 }}>
                                    {expanded ? "▼" : "▶"}
                                </span>
                            </button>
                            <button
                                type="button"
                                onClick={(e) => {
                                    e.stopPropagation()
                                    onRetryPassage(p.questionNumber)
                                }}
                                disabled={isRetrying}
                                title="이 지문만 다시 생성"
                                aria-label={`Q${p.questionNumber} 재생성`}
                                style={retryBtn(isRetrying)}
                            >
                                {isRetrying ? "…" : "🔁"}
                            </button>
                        </div>
                        {expanded ? (
                            <div style={body}>
                                {hasContent ? (
                                    <div style={{ marginTop: 8 }}>
                                        <div
                                            style={{
                                                fontWeight: 700,
                                                color: T.ink900,
                                                marginBottom: 4,
                                            }}
                                        >
                                            콘텐츠 블록
                                        </div>
                                        {blocks?.map((b, i) => (
                                            <div key={i} style={blockRow}>
                                                <span
                                                    style={{
                                                        fontWeight: 600,
                                                        color: T.ink900,
                                                    }}
                                                >
                                                    {b.type}
                                                </span>
                                                <span
                                                    style={{ color: T.ink500 }}
                                                >
                                                    ·
                                                </span>
                                                <span style={{ flex: 1 }}>
                                                    {b.title}
                                                </span>
                                            </div>
                                        ))}
                                    </div>
                                ) : null}
                                {hasDiagram ? (
                                    <div style={{ marginTop: 10 }}>
                                        <div
                                            style={{
                                                fontWeight: 700,
                                                color: T.ink900,
                                                marginBottom: 4,
                                            }}
                                        >
                                            다이어그램
                                        </div>
                                        <a
                                            href={diagram?.shareUrl}
                                            target="_blank"
                                            rel="noreferrer"
                                            style={{
                                                color: T.inkBlue,
                                                fontSize: 12,
                                            }}
                                        >
                                            draw.io에서 열기 ↗
                                        </a>
                                    </div>
                                ) : null}
                            </div>
                        ) : null}
                    </article>
                )
            })}
        </div>
    )
}

export default ResultsPanel
