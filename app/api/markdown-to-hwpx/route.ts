/**
 * POST /api/markdown-to-hwpx
 *
 * Node-side reverse converter: Markdown → HWPX (.hwpx ArrayBuffer) via
 * kordoc's `markdownToHwpx`. Paired with `/api/parse-hwp-markdown` to
 * form a full round-trip.
 *
 * Why a separate route: kordoc is ESM with `import.meta.url` and cannot be
 * bundled into browser JS by Next.js. All kordoc calls must live on the
 * Node runtime.
 *
 * Why this exists (product angle): `@rhwp/core` excels at "surgical
 * insertion into an existing HWP" but is overkill when a teacher just
 * wants "give me the AI output as a .hwpx I can share." This route is
 * the lightweight path.
 *
 * Contract:
 *   Request:  JSON { markdown: string, filename?: string }
 *   Response: 200 application/vnd.hancom.hwpx (binary)
 *             4xx application/json { success: false, error, stage }
 *
 * See: docs/external-tools/02-kordoc.md
 */

import { type NextRequest, NextResponse } from "next/server"

export const runtime = "nodejs"
export const maxDuration = 60

interface RequestBody {
    markdown?: unknown
    filename?: unknown
}

export async function POST(req: NextRequest): Promise<Response> {
    let body: RequestBody
    try {
        body = (await req.json()) as RequestBody
    } catch (err) {
        return NextResponse.json(
            {
                success: false,
                stage: "read",
                error: err instanceof Error ? err.message : "Invalid JSON body",
            },
            { status: 400 },
        )
    }

    if (typeof body.markdown !== "string" || body.markdown.length === 0) {
        return NextResponse.json(
            {
                success: false,
                stage: "read",
                error: "`markdown` (non-empty string) is required",
            },
            { status: 400 },
        )
    }

    const filename =
        typeof body.filename === "string" && body.filename.trim().length > 0
            ? body.filename.trim()
            : "document.hwpx"

    try {
        const kordoc = await import("kordoc")
        const hwpxBuffer = await kordoc.markdownToHwpx(body.markdown)

        // HWPX is actually a zipped XML container. Use the closest standard
        // MIME — browsers will respect the Content-Disposition filename.
        return new Response(hwpxBuffer, {
            status: 200,
            headers: {
                "Content-Type": "application/vnd.hancom.hwpx",
                "Content-Disposition": `attachment; filename="${encodeURIComponent(filename)}"`,
                "Content-Length": String(hwpxBuffer.byteLength),
            },
        })
    } catch (err) {
        console.error("[markdown-to-hwpx] kordoc threw:", err)
        return NextResponse.json(
            {
                success: false,
                stage: "convert",
                error: err instanceof Error ? err.message : String(err),
            },
            { status: 500 },
        )
    }
}
