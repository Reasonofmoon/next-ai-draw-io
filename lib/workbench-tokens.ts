/**
 * Workbench design tokens — extracted from test-hwp/page.tsx for reuse across
 * the upcoming WorkbenchShell/Stepper/Sidebar components.
 *
 * Phase 0 of the /test-hwp redesign (see plan starry-splashing-dawn.md).
 * Values are byte-identical to the previous inline definitions, so extracting
 * this module must produce ZERO visual change.
 */

import type { CSSProperties } from "react"

// ---------------------------------------------------------------------------
// Paper & Ink palette + fonts + shadows
// ---------------------------------------------------------------------------

export const T = {
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
    fontMono: "'JetBrains Mono', 'D2Coding', 'SF Mono', Consolas, monospace",
    shadowSoft: "0 1px 0 rgba(232,223,206,1), 0 8px 20px rgba(26,25,21,0.06)",
    shadowLift:
        "0 4px 12px rgba(26,25,21,0.08), 0 12px 28px rgba(26,25,21,0.05)",
} as const

export type DesignTokens = typeof T

// ---------------------------------------------------------------------------
// Button factory
// ---------------------------------------------------------------------------

export const buttonBase: CSSProperties = {
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

export const makeButton = (
    bg: string,
    fg: string = "#fff",
    disabled = false,
): CSSProperties => ({
    ...buttonBase,
    background: disabled ? T.paper300 : bg,
    color: disabled ? T.ink500 : fg,
    cursor: disabled ? "not-allowed" : "pointer",
    opacity: disabled ? 0.7 : 1,
})

// ---------------------------------------------------------------------------
// Section card + rotated legend
// ---------------------------------------------------------------------------

export const sectionCard: CSSProperties = {
    background: T.paper50,
    border: `1px solid ${T.paper300}`,
    borderRadius: 16,
    padding: 22,
    marginBottom: 20,
    boxShadow: T.shadowSoft,
}

export const sectionLegend = (
    color: string,
    rotation = -1.5,
): CSSProperties => ({
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

// ---------------------------------------------------------------------------
// Input + hint
// ---------------------------------------------------------------------------

export const inputBase: CSSProperties = {
    background: T.paper50,
    color: T.ink900,
    border: `1px solid ${T.paper300}`,
    borderRadius: 8,
    padding: "6px 10px",
    fontFamily: T.fontSans,
    fontSize: 14,
}

export const hint: CSSProperties = {
    color: T.ink500,
    fontSize: 13,
    marginBottom: 12,
    fontFamily: T.fontSans,
    lineHeight: 1.6,
}

// ---------------------------------------------------------------------------
// Per-question-type accent color
// ---------------------------------------------------------------------------

export function colorForType(type: string): string {
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
