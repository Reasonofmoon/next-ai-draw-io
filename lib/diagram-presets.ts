export interface DiagramTheme {
    headerBg: string
    headerFg: string
    borderColor: string
    accentBg: string
    subtitle: string
}

export interface DiagramSizePreset {
    widthPx: number
    heightPx: number
}

export function getDiagramTheme(questionType: string): DiagramTheme {
    switch (questionType) {
        case "주제":
        case "제목":
            return {
                headerBg: "#0F766E",
                headerFg: "#F8FAFC",
                borderColor: "#115E59",
                accentBg: "#CCFBF1",
                subtitle: "Topic Map",
            }
        case "요지":
        case "목적":
            return {
                headerBg: "#1D4ED8",
                headerFg: "#F8FAFC",
                borderColor: "#1E40AF",
                accentBg: "#DBEAFE",
                subtitle: "Main-Idea Flow",
            }
        case "빈칸 추론":
            return {
                headerBg: "#7C3AED",
                headerFg: "#F8FAFC",
                borderColor: "#6D28D9",
                accentBg: "#EDE9FE",
                subtitle: "Blank Logic Map",
            }
        case "순서 배열":
        case "문장 위치":
            return {
                headerBg: "#B45309",
                headerFg: "#FFF7ED",
                borderColor: "#92400E",
                accentBg: "#FEF3C7",
                subtitle: "Sequence Layout",
            }
        case "심경/분위기":
            return {
                headerBg: "#BE185D",
                headerFg: "#FFF1F2",
                borderColor: "#9D174D",
                accentBg: "#FCE7F3",
                subtitle: "Mood Shift",
            }
        case "함축 의미":
        case "요약":
            return {
                headerBg: "#374151",
                headerFg: "#F9FAFB",
                borderColor: "#1F2937",
                accentBg: "#E5E7EB",
                subtitle: "Meaning Map",
            }
        default:
            return {
                headerBg: "#334155",
                headerFg: "#F8FAFC",
                borderColor: "#1E293B",
                accentBg: "#E2E8F0",
                subtitle: "Discourse Map",
            }
    }
}

export function getDiagramSizePreset(questionType: string): DiagramSizePreset {
    switch (questionType) {
        case "주제":
        case "제목":
            return { widthPx: 540, heightPx: 340 }
        case "요지":
        case "목적":
            return { widthPx: 520, heightPx: 330 }
        case "빈칸 추론":
            return { widthPx: 560, heightPx: 330 }
        case "순서 배열":
        case "문장 위치":
            return { widthPx: 580, heightPx: 300 }
        case "심경/분위기":
            return { widthPx: 540, heightPx: 300 }
        case "함축 의미":
            return { widthPx: 520, heightPx: 320 }
        case "요약":
            return { widthPx: 580, heightPx: 340 }
        case "어법/어휘":
            return { widthPx: 560, heightPx: 360 }
        default:
            return { widthPx: 520, heightPx: 320 }
    }
}
