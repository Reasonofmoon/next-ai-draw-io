import type { CSSProperties } from "react"

/**
 * Level-1 style presets for Korean content blocks.
 *
 * Goal: give the LLM a fixed, enumerated palette of visual treatments so it
 * can't invent colors / font sizes that break HWP rendering. The AI only
 * chooses a preset id; the actual HWP XML attributes live here.
 *
 * When we move to Level 2 (AI proposes attributes within allow-lists), this
 * file becomes the clamp reference.
 */

export type StylePresetId =
    | "heading-accent"
    | "body-plain"
    | "body-muted"
    | "callout-box"

export interface StylePreset {
    id: StylePresetId
    /** Human-readable label for UI. */
    label: string
    /** When the AI should pick this preset. Used verbatim in the system prompt. */
    guidance: string
    /** Font size in points. */
    fontPt: number
    /** Text color, #RRGGBB. */
    color: string
    /** Background color, #RRGGBB or "transparent". */
    backgroundColor: string
    /** Border color, #RRGGBB or null for none. */
    borderColor: string | null
    /** Border width in points. */
    borderWidthPt: number
    /** Line spacing multiplier (e.g., 1.3). */
    lineSpacing: number
    /** Bold / regular. */
    bold: boolean
    /** Left accent bar in HEX, or null. (heading-accent uses this) */
    leftAccentBar: string | null
}

export const STYLE_PRESETS: Record<StylePresetId, StylePreset> = {
    "heading-accent": {
        id: "heading-accent",
        label: "강조 제목",
        guidance: "블록의 제목 / 섹션 헤더. 어휘 표의 헤더 행에도 사용.",
        fontPt: 12,
        color: "#F8FAFC",
        backgroundColor: "#0F766E",
        borderColor: "#115E59",
        borderWidthPt: 0.5,
        lineSpacing: 1.2,
        bold: true,
        leftAccentBar: "#134E4A",
    },
    "body-plain": {
        id: "body-plain",
        label: "본문 기본",
        guidance:
            "해석, 요약, 일반 설명 같은 주된 본문. 어휘 표의 데이터 행에도 사용.",
        fontPt: 11,
        color: "#0F172A",
        backgroundColor: "transparent",
        borderColor: null,
        borderWidthPt: 0,
        lineSpacing: 1.3,
        bold: false,
        leftAccentBar: null,
    },
    "body-muted": {
        id: "body-muted",
        label: "보조 설명",
        guidance: "배경지식, 참고 사항, 덜 중요한 부가 정보. 작고 회색으로.",
        fontPt: 10,
        color: "#475569",
        backgroundColor: "transparent",
        borderColor: null,
        borderWidthPt: 0,
        lineSpacing: 1.2,
        bold: false,
        leftAccentBar: null,
    },
    "callout-box": {
        id: "callout-box",
        label: "강조 박스",
        guidance: "정답·핵심 포인트·오답 해설 같은 시선을 끌어야 하는 내용.",
        fontPt: 11,
        color: "#78350F",
        backgroundColor: "#FEF3C7",
        borderColor: "#F59E0B",
        borderWidthPt: 1,
        lineSpacing: 1.3,
        bold: false,
        leftAccentBar: null,
    },
}

export const ALL_STYLE_PRESET_IDS = Object.keys(
    STYLE_PRESETS,
) as StylePresetId[]

/** Guidance block for the content-generation system prompt. */
export function stylePresetGuidanceMarkdown(): string {
    return ALL_STYLE_PRESET_IDS.map((id) => {
        const p = STYLE_PRESETS[id]
        return `- \`${id}\` (${p.label}): ${p.guidance}`
    }).join("\n")
}

/**
 * Map a style preset to React inline CSS. Used by the browser preview panel
 * (Phase 1b) so what the teacher sees roughly matches the rendered HWP.
 *
 * This is a best-effort approximation — the real HWP render happens in
 * Phase 4 via the HWP XML primitive builders.
 */
export function stylePresetToReactCss(id: StylePresetId): CSSProperties {
    const p = STYLE_PRESETS[id]
    return {
        fontSize: `${p.fontPt}pt`,
        color: p.color,
        background:
            p.backgroundColor === "transparent" ? undefined : p.backgroundColor,
        border:
            p.borderColor !== null
                ? `${p.borderWidthPt}pt solid ${p.borderColor}`
                : undefined,
        borderLeft: p.leftAccentBar
            ? `4px solid ${p.leftAccentBar}`
            : undefined,
        lineHeight: p.lineSpacing,
        fontWeight: p.bold ? 700 : 400,
        padding: p.backgroundColor === "transparent" ? "6px 0" : "10px 14px",
        borderRadius:
            p.borderColor !== null || p.backgroundColor !== "transparent"
                ? 8
                : undefined,
        whiteSpace: "pre-wrap",
    }
}
