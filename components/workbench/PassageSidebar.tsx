/**
 * PassageSidebar — Phase 2 of the /test-hwp redesign.
 *
 * Compact left-rail list of detected passages: checkbox + question number +
 * type chip + per-passage result dots (diagram / content). Bulk selection
 * controls sit at the top of the sidebar.
 *
 * This sidebar READS the same state as the existing Section 9 grid; it does
 * not own selection. Phase 2 keeps Section 9 in place as a detailed view;
 * Phase 4/5 will retire Section 9 once step panels & results panel replace
 * its affordances.
 */

import type { CSSProperties } from "react"
import { colorForType, makeButton, T } from "@/lib/workbench-tokens"

export interface SidebarPassage {
    questionNumber: number
    questionType: string
    sectionIdx: number
    insertAfterParaIdx: number
}

export interface PassageSidebarProps {
    passages: SidebarPassage[]
    selectedQuestionNumbers: Set<number>
    onToggle: (qNum: number) => void
    onSelectAll: () => void
    onDeselectAll: () => void
    onInvert: () => void
    /** qNums that already have generated Korean content */
    contentReadyQuestionNumbers?: Set<number>
    /** qNums that already have a generated diagram */
    diagramReadyQuestionNumbers?: Set<number>
}

const header: CSSProperties = {
    padding: "16px 18px 12px",
    borderBottom: `1px solid ${T.paper300}`,
    background: T.paper50,
    position: "sticky",
    top: 0,
    zIndex: 1,
}

const title: CSSProperties = {
    fontFamily: T.fontDisplay,
    fontSize: 22,
    color: T.ink900,
    margin: 0,
    marginBottom: 8,
}

const toolbar: CSSProperties = {
    display: "flex",
    gap: 6,
    flexWrap: "wrap",
}

const row = (selected: boolean): CSSProperties => ({
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "10px 14px",
    borderBottom: `1px solid ${T.paper200}`,
    background: selected ? T.blueWash : "transparent",
    cursor: "pointer",
    transition: "background 120ms",
    fontFamily: T.fontSans,
})

const qNumBadge = (color: string): CSSProperties => ({
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    minWidth: 28,
    height: 24,
    padding: "0 6px",
    borderRadius: 6,
    background: color,
    color: "#fff",
    fontWeight: 700,
    fontSize: 12,
})

const typeText: CSSProperties = {
    fontSize: 12,
    color: T.ink700,
    flex: 1,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
}

const dot = (filled: boolean, color: string): CSSProperties => ({
    width: 8,
    height: 8,
    borderRadius: "50%",
    background: filled ? color : "transparent",
    border: `1.5px solid ${filled ? color : T.paper400}`,
})

export function PassageSidebar({
    passages,
    selectedQuestionNumbers,
    onToggle,
    onSelectAll,
    onDeselectAll,
    onInvert,
    contentReadyQuestionNumbers,
    diagramReadyQuestionNumbers,
}: PassageSidebarProps) {
    const selectedCount = selectedQuestionNumbers.size
    const total = passages.length

    if (total === 0) {
        return (
            <div style={{ padding: 18, color: T.ink500, fontSize: 13 }}>
                <div
                    style={{
                        fontFamily: T.fontDisplay,
                        fontSize: 20,
                        color: T.ink700,
                        marginBottom: 6,
                    }}
                >
                    지문 목록
                </div>
                HWP를 업로드하면 여기에 감지된 지문이 보여요.
            </div>
        )
    }

    return (
        <div>
            <div style={header}>
                <h3 style={title}>
                    📖 지문 {selectedCount}/{total}
                </h3>
                <div style={toolbar}>
                    <button
                        type="button"
                        onClick={onSelectAll}
                        disabled={selectedCount === total}
                        style={{
                            ...makeButton(
                                T.sage,
                                "#fff",
                                selectedCount === total,
                            ),
                            padding: "4px 10px",
                            fontSize: 11,
                        }}
                    >
                        전체
                    </button>
                    <button
                        type="button"
                        onClick={onDeselectAll}
                        disabled={selectedCount === 0}
                        style={{
                            ...makeButton(T.coral, "#fff", selectedCount === 0),
                            padding: "4px 10px",
                            fontSize: 11,
                        }}
                    >
                        해제
                    </button>
                    <button
                        type="button"
                        onClick={onInvert}
                        style={{
                            ...makeButton(T.lavender, "#fff", false),
                            padding: "4px 10px",
                            fontSize: 11,
                        }}
                    >
                        반전
                    </button>
                </div>
            </div>
            <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
                {passages.map((p) => {
                    const selected = selectedQuestionNumbers.has(
                        p.questionNumber,
                    )
                    const color = colorForType(p.questionType)
                    const hasContent =
                        contentReadyQuestionNumbers?.has(p.questionNumber) ??
                        false
                    const hasDiagram =
                        diagramReadyQuestionNumbers?.has(p.questionNumber) ??
                        false
                    return (
                        <li
                            key={p.questionNumber}
                            onClick={() => onToggle(p.questionNumber)}
                            style={row(selected)}
                        >
                            <input
                                type="checkbox"
                                checked={selected}
                                onChange={(e) => {
                                    e.stopPropagation()
                                    onToggle(p.questionNumber)
                                }}
                                onClick={(e) => e.stopPropagation()}
                                style={{ cursor: "pointer" }}
                            />
                            <span style={qNumBadge(color)}>
                                {p.questionNumber}
                            </span>
                            <span style={typeText}>{p.questionType}</span>
                            <span
                                style={dot(hasDiagram, T.inkBlue)}
                                title={
                                    hasDiagram
                                        ? "다이어그램 준비됨"
                                        : "다이어그램 없음"
                                }
                            />
                            <span
                                style={dot(hasContent, T.sage)}
                                title={
                                    hasContent
                                        ? "한글 콘텐츠 준비됨"
                                        : "한글 콘텐츠 없음"
                                }
                            />
                        </li>
                    )
                })}
            </ul>
        </div>
    )
}

export default PassageSidebar
