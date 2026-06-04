// @vitest-environment node
import { describe, expect, it } from "vitest"
import {
    pdfSectionToDetectedPassage,
    splitPdfMarkdownIntoSections,
} from "@/lib/pdf-markdown-diagram"

describe("splitPdfMarkdownIntoSections", () => {
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
