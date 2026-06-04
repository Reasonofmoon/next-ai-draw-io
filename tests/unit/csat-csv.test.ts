// @vitest-environment node
import { describe, expect, it } from "vitest"
import { parseCsatCsv, parseCsv, toDetectedPassage } from "@/lib/csat-csv"

describe("parseCsv", () => {
    it("handles quoted commas, newlines, and escaped quotes", () => {
        const rows = parseCsv('번호,지문\n1,"A, B\n""C"" follows."\n')

        expect(rows).toEqual([
            ["번호", "지문"],
            ["1", 'A, B\n"C" follows.'],
        ])
    })
})

describe("parseCsatCsv", () => {
    it("accepts Korean headers and maps passages for diagram generation", () => {
        const csv = [
            "문항번호,유형,발문,영어지문",
            '18,핵심 흐름,다음 글의 핵심 흐름을 파악하시오.,"Many readers think the conclusion appears first. However, the passage gradually builds context, adds evidence, and then clarifies the author\'s point."',
        ].join("\n")

        const result = parseCsatCsv(csv)

        expect(result.warnings).toEqual([])
        expect(result.passages).toHaveLength(1)
        expect(result.passages[0]).toMatchObject({
            questionNumber: 18,
            questionType: "핵심 흐름",
            koreanInstruction: "다음 글의 핵심 흐름을 파악하시오.",
            sourceRow: 2,
        })
        expect(result.passages[0].englishPassage).toContain(
            "gradually builds context",
        )
    })

    it("defaults missing type and number fields without losing valid text", () => {
        const csv = [
            "passage",
            '"Observation often comes before invention. A small detail becomes meaningful when someone connects it with a wider problem and tests a practical response."',
        ].join("\n")

        const result = parseCsatCsv(csv)
        const detected = toDetectedPassage(result.passages[0])

        expect(result.warnings).toEqual([])
        expect(detected.questionNumber).toBe(1)
        expect(detected.questionType).toBe("핵심 흐름")
        expect(detected.choices).toEqual([])
    })

    it("reports missing passage headers and short rows", () => {
        expect(parseCsatCsv("번호,유형\n1,주제").warnings[0]).toContain(
            "지문 컬럼",
        )

        const result = parseCsatCsv("번호,지문\n1,too short")

        expect(result.passages).toHaveLength(0)
        expect(result.warnings[0]).toContain("너무 짧아")
    })
})
