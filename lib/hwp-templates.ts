/**
 * Template presets (Phase 3 will wire full rendering; Phase 1b uses these
 * just for the dropdown + allowed-block filtering).
 *
 * A template bundles:
 *   - Which block types the AI is allowed to emit.
 *   - The preferred rendering order.
 *   - Page-level layout hints used by the future hwp-template-engine.
 */

import type { BlockType } from "@/lib/korean-content-generator"

export type TemplateId = "answer-1col" | "exam-2col" | "vocab-note"

export interface HwpTemplate {
    id: TemplateId
    name: string
    description: string
    pageColumns: 1 | 2
    allowedBlockTypes: BlockType[]
    /** Ordered list — blocks are rendered in this order inside the template. */
    blockOrder: BlockType[]
    /** Include the diagram PNG for this template? */
    includeDiagram: boolean
    /** Include the original English passage text above the content? */
    includeOriginalPassage: boolean
}

export const TEMPLATES: Record<TemplateId, HwpTemplate> = {
    "answer-1col": {
        id: "answer-1col",
        name: "해설지 세로 1단",
        description:
            "교사·자습용 풀이 해설. 어휘표 → 다이어그램 → 해석 → 해설 → 배경 지식 순서.",
        pageColumns: 1,
        allowedBlockTypes: [
            "vocabulary",
            "translation",
            "summary",
            "grammar",
            "answer_explanation",
            "background",
            "custom",
        ],
        blockOrder: [
            "vocabulary",
            "translation",
            "summary",
            "answer_explanation",
            "grammar",
            "background",
            "custom",
        ],
        includeDiagram: true,
        includeOriginalPassage: true,
    },
    "exam-2col": {
        id: "exam-2col",
        name: "시험지 A4 2단",
        description:
            "문제 푸는 학생용 실전 레이아웃. 어휘 힌트 + 다이어그램만. 해설 없음.",
        pageColumns: 2,
        allowedBlockTypes: ["vocabulary", "custom"],
        blockOrder: ["vocabulary", "custom"],
        includeDiagram: true,
        includeOriginalPassage: true,
    },
    "vocab-note": {
        id: "vocab-note",
        name: "어휘노트",
        description: "단어장. 지문별 어휘표만 집약. 다이어그램·해설 없음.",
        pageColumns: 1,
        allowedBlockTypes: ["vocabulary"],
        blockOrder: ["vocabulary"],
        includeDiagram: false,
        includeOriginalPassage: false,
    },
}

export const TEMPLATE_IDS = Object.keys(TEMPLATES) as TemplateId[]

export function getTemplate(id: TemplateId): HwpTemplate {
    return TEMPLATES[id]
}
