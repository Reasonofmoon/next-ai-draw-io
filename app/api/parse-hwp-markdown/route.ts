/**
 * POST /api/parse-hwp-markdown
 *
 * Server-side HWP/HWPX/HWPML → Markdown converter powered by `kordoc`
 * (MIT, Node.js 18+, pure JS). Isolated from the browser because kordoc
 * ships ESM with `import.meta.url`, which Next.js refuses to bundle into
 * client JS; a Node-runtime API route is the correct escape hatch.
 *
 * Complements — NOT replaces — our existing `@rhwp/core` pipeline:
 *   - @rhwp/core  → browser, write-capable, single-format HWP
 *   - kordoc      → server, read-only, rich structure (Markdown + IRBlocks)
 *
 * See: docs/external-tools/02-kordoc.md
 */

import { type NextRequest, NextResponse } from "next/server"

export const runtime = "nodejs"
// Large HWP files can exceed default 4MB body limit; bump to 20MB.
export const maxDuration = 60

interface SuccessPayload {
    success: true
    format: string
    markdown: string
    blocks: unknown[]
    metadata: Record<string, unknown>
}

interface FailurePayload {
    success: false
    stage: "upload" | "read" | "parse"
    error: string
}

export async function POST(
    req: NextRequest,
): Promise<NextResponse<SuccessPayload | FailurePayload>> {
    let fileBytes: ArrayBuffer
    let filename = "uploaded"

    try {
        const formData = await req.formData()
        const entry = formData.get("file")
        if (!(entry instanceof Blob)) {
            return NextResponse.json(
                {
                    success: false,
                    stage: "upload",
                    error: "No 'file' field in multipart body",
                },
                { status: 400 },
            )
        }
        if ("name" in entry && typeof (entry as File).name === "string") {
            filename = (entry as File).name
        }
        fileBytes = await entry.arrayBuffer()
    } catch (err) {
        return NextResponse.json(
            {
                success: false,
                stage: "read",
                error: err instanceof Error ? err.message : String(err),
            },
            { status: 400 },
        )
    }

    try {
        // Dynamic import — kordoc is ESM with `import.meta.url`, must not
        // be eagerly resolved at build time by the Edge bundler.
        const kordoc = await import("kordoc")

        // Best-effort format tag for UI display; kordoc's ParseResult
        // metadata doesn't carry it, so we detect separately on the buffer.
        let format = "unknown"
        try {
            const primary = kordoc.detectFormat(fileBytes)
            if (primary === "unknown") {
                // HWPX/XLSX/DOCX all land in the zip-based branch.
                const zipFormat = await kordoc.detectZipFormat(fileBytes)
                format = zipFormat ?? "unknown"
            } else {
                format = primary
            }
        } catch {
            // non-fatal — continue with "unknown"
        }

        const result = await kordoc.parse(fileBytes)

        if (!result || !result.success) {
            return NextResponse.json(
                {
                    success: false,
                    stage: "parse",
                    error:
                        result &&
                        "error" in result &&
                        typeof result.error === "string"
                            ? result.error
                            : "kordoc.parse returned failure without message",
                },
                { status: 422 },
            )
        }

        return NextResponse.json({
            success: true,
            format,
            markdown: result.markdown ?? "",
            blocks: Array.isArray(result.blocks) ? result.blocks : [],
            metadata: { filename, ...(result.metadata ?? {}) },
        })
    } catch (err) {
        console.error("[parse-hwp-markdown] kordoc threw:", err)
        return NextResponse.json(
            {
                success: false,
                stage: "parse",
                error: err instanceof Error ? err.message : String(err),
            },
            { status: 500 },
        )
    }
}
