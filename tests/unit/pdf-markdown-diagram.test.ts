// @vitest-environment node
import { describe, expect, it } from "vitest"
import {
    pdfSectionToDetectedPassage,
    splitCsvIntoDiagramSections,
    splitJsonIntoDiagramSections,
    splitPdfMarkdownIntoSections,
    splitTextIntoDiagramSections,
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

    it("drops short false question markers and sorts by question number", () => {
        const markdown = [
            "19. 다음 글에 드러난 필자의 심경으로 가장 적절한 것은?",
            "The narrator first felt nervous about the result, but became relieved when the missing notebook was found and the answer became clear.",
            "",
            "21. 밑줄 친 부분이 다음 글에서 의미하는 바로 가장 적절한 것은?",
            "A scientist said that the team had to keep the door open, meaning that they should continue testing several possible explanations.",
            "",
            "22.",
            "요지",
            "",
            "28.",
            "정답",
            "",
            "26. 다음 글의 흐름으로 보아, 주어진 문장이 들어가기에 가장 적절한 곳은?",
            "The passage explains a problem, adds a missing sentence that bridges two ideas, and then shows why the final conclusion follows.",
        ].join("\n")

        const result = splitPdfMarkdownIntoSections(markdown, "mixed.pdf")

        expect(
            result.sections.map((section) => section.questionNumber),
        ).toEqual([19, 21, 26])
        expect(
            result.sections.every((section) => section.charCount > 120),
        ).toBe(true)
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

    it("turns uploaded CSV rows into one diagram section per question", () => {
        const csv = [
            "questionNumber,questionType,koreanInstruction,englishPassage",
            '18,목적,다음 글의 목적으로 가장 적절한 것은?,"A teacher writes to explain that the class schedule will change because the library is being repaired next week."',
            '19,주제,다음 글의 주제로 가장 적절한 것은?,"Learning improves when students connect examples with a central idea and then explain it in their own words."',
        ].join("\n")

        const result = splitCsvIntoDiagramSections(csv, "questions.csv")

        expect(result.sections).toHaveLength(2)
        expect(
            result.sections.map((section) => section.questionNumber),
        ).toEqual([18, 19])
        expect(result.sections[0].questionType).toBe("목적")
    })

    it("turns uploaded JSON arrays into one diagram section per item", () => {
        const json = JSON.stringify([
            {
                questionNumber: 21,
                questionType: "요지",
                instruction: "다음 글의 요지로 가장 적절한 것은?",
                passage:
                    "Careful observation helps people discover patterns, compare possible explanations, and reach a clearer conclusion.",
                choices: ["Observation supports reasoning"],
            },
            {
                number: 22,
                title: "Vocabulary item",
                text: "A short passage can still be diagrammed when it contains a clear context, evidence, and implication.",
            },
        ])

        const result = splitJsonIntoDiagramSections(json, "questions.json")

        expect(result.sections).toHaveLength(2)
        expect(result.sections[0]).toMatchObject({
            questionNumber: 21,
            questionType: "요지",
        })
        expect(result.sections[1].title).toBe("Vocabulary item")
    })

    it("turns pasted text into diagram sections", () => {
        const text = [
            "18. 다음 글의 목적으로 가장 적절한 것은?",
            "A notice explains that students should move to a temporary classroom because repairs will begin in the library next week.",
            "",
            "19. 다음 글의 주제로 가장 적절한 것은?",
            "Readers understand a difficult idea better when they connect it to examples, compare it with familiar cases, and restate the conclusion.",
        ].join("\n")

        const result = splitTextIntoDiagramSections(text, "pasted-text.txt")

        expect(result.sections).toHaveLength(2)
        expect(
            result.sections.map((section) => section.questionNumber),
        ).toEqual([18, 19])
        expect(result.warnings[0]).toContain("Parsed pasted/plain text")
    })
})
