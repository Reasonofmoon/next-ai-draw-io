// @vitest-environment node
import { describe, expect, it } from "vitest"
import {
    pdfSectionToDetectedPassage,
    splitPdfMarkdownIntoSections,
} from "@/lib/pdf-markdown-diagram"

describe("splitPdfMarkdownIntoSections", () => {
    it("prioritizes CSAT-style question numbers over generic chunks", () => {
        const markdown = [
            "2026년 6월 고1 모의고사 영어 시험지",
            "",
            "18. 다음 글의 목적으로 가장 적절한 것은?",
            "Dear students, the library will extend its opening hours during exam week so that everyone can prepare more comfortably.",
            "① To announce a schedule change",
            "",
            "19. 다음 글에 드러난 필자의 심경으로 가장 적절한 것은?",
            "When I finally found my old notebook, I felt relieved because the notes contained the answer I had been looking for.",
            "① relieved",
            "",
            "Q20",
            "다음 글의 주제로 가장 적절한 것은?",
            "People learn more effectively when they connect new information with examples and then explain the idea in their own words.",
            "① Learning through connection",
        ].join("\n")

        const result = splitPdfMarkdownIntoSections(markdown, "exam.pdf")

        expect(result.sections).toHaveLength(3)
        expect(
            result.sections.map((section) => section.questionNumber),
        ).toEqual([18, 19, 20])
        expect(result.sections.map((section) => section.questionType)).toEqual([
            "목적",
            "심경/분위기",
            "주제",
        ])
        expect(result.sections[0].id).toBe("exam-q18")
        expect(result.warnings[0]).toContain("Detected 3 exam questions")
    })

    it("splits Markdown by headings when available", () => {
        const markdown = [
            "# First Claim",
            "The document begins by describing a practical problem that needs attention and a clear response.",
            "",
            "# Evidence",
            "The next section adds observations, examples, and constraints that explain why the problem matters.",
        ].join("\n")

        const result = splitPdfMarkdownIntoSections(markdown, "sample.pdf", {
            minSectionChars: 40,
        })

        expect(result.warnings).toEqual([])
        expect(result.sections).toHaveLength(2)
        expect(result.sections[0]).toMatchObject({
            id: "sample-1",
            sourceName: "sample.pdf",
            title: "First Claim",
            sectionIndex: 1,
        })
    })

    it("chunks long Markdown without headings", () => {
        const paragraph =
            "A repeated idea connects context to evidence and then to a conclusion."
        const markdown = Array.from({ length: 12 }, () => paragraph).join(
            "\n\n",
        )

        const result = splitPdfMarkdownIntoSections(markdown, "long file.pdf", {
            maxSectionChars: 220,
            minSectionChars: 20,
        })

        expect(result.sections.length).toBeGreaterThan(1)
        expect(result.sections[0].id).toBe("long-file-1")
        expect(
            result.sections.every((section) => section.charCount <= 220),
        ).toBe(true)
    })

    it("maps a section into the existing passage diagram contract", () => {
        const result = splitPdfMarkdownIntoSections(
            "# Flow\nA document section explains context, evidence, and implication in enough detail.",
            "doc.pdf",
            { minSectionChars: 20 },
        )

        const passage = pdfSectionToDetectedPassage(result.sections[0])

        expect(passage.questionType).toBe("문서 핵심 흐름")
        expect(passage.koreanInstruction).toContain("MarkItDown")
        expect(passage.englishPassage).toContain("Source: doc.pdf")
    })
})
