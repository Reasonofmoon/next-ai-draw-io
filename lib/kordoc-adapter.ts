/**
 * Browser-side client for the /api/parse-hwp-markdown route.
 *
 * kordoc itself is Node-only (ESM + `import.meta.url`), so the browser
 * must go through an HTTP boundary. This adapter posts a File as
 * multipart/form-data and Zod-validates the response so the rest of the
 * app sees a typed, trusted shape.
 *
 * Also re-exports the minimal IRBlock shape we rely on (headings + lists
 * are what Phase B-3 passage detection will consume). The full kordoc
 * IRBlock tree is wider; keep this surface tight until we need more.
 *
 * See: docs/external-tools/02-kordoc.md
 */

import { z } from "zod"

// ---------------------------------------------------------------------------
// Response schema
// ---------------------------------------------------------------------------

export const KordocBlockSchema = z
    .object({
        type: z.string(),
        // Free-form payload — kordoc's IRBlock union is wider than we consume.
        // We keep the key fields we touch in later phases:
        text: z.string().optional(),
        level: z.number().optional(),
        items: z.array(z.unknown()).optional(),
        rows: z.array(z.unknown()).optional(),
    })
    .passthrough()

export type KordocBlock = z.infer<typeof KordocBlockSchema>

export const KordocParseSuccessSchema = z.object({
    success: z.literal(true),
    format: z.string(),
    markdown: z.string(),
    blocks: z.array(KordocBlockSchema),
    metadata: z.record(z.string(), z.unknown()),
})

export const KordocParseFailureSchema = z.object({
    success: z.literal(false),
    stage: z.enum(["upload", "read", "parse"]),
    error: z.string(),
})

export type KordocParseResult = z.infer<typeof KordocParseSuccessSchema>
export type KordocParseFailure = z.infer<typeof KordocParseFailureSchema>

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

/**
 * Upload a HWP/HWPX/HWPML/PDF/DOCX/XLSX file to the server and receive a
 * kordoc parse result: raw Markdown, structured IRBlocks, and metadata.
 *
 * Throws on network errors, non-JSON responses, or schema mismatch.
 * Returns a FAILURE result (not throws) when kordoc itself rejected the
 * file — callers can inspect `.stage` to decide whether to retry or fall
 * back to another parser.
 */
export async function parseHwpToMarkdown(
    file: File,
): Promise<KordocParseResult | KordocParseFailure> {
    const form = new FormData()
    form.append("file", file, file.name)

    const res = await fetch("/api/parse-hwp-markdown", {
        method: "POST",
        body: form,
    })

    // Non-2xx responses are expected when kordoc fails parsing — the route
    // returns a structured failure body. Only treat malformed JSON as an
    // exception.
    let payload: unknown
    try {
        payload = await res.json()
    } catch {
        throw new Error(
            `parseHwpToMarkdown: non-JSON response (status ${res.status})`,
        )
    }

    const success = KordocParseSuccessSchema.safeParse(payload)
    if (success.success) return success.data

    const failure = KordocParseFailureSchema.safeParse(payload)
    if (failure.success) return failure.data

    throw new Error(
        `parseHwpToMarkdown: unexpected response shape — ${JSON.stringify(payload).slice(0, 200)}`,
    )
}

// ---------------------------------------------------------------------------
// Reverse direction: Markdown → HWPX (lightweight alternative pipeline)
// ---------------------------------------------------------------------------

/**
 * POST a markdown string to /api/markdown-to-hwpx and receive a .hwpx
 * ArrayBuffer. Throws on HTTP errors or malformed payload — callers that
 * want graceful failure should wrap in try/catch and toast.
 *
 * The server side lives in app/api/markdown-to-hwpx/route.ts and wraps
 * kordoc's `markdownToHwpx`. This adapter is the browser-side client.
 */
export async function convertMarkdownToHwpx(
    markdown: string,
    filename = "document.hwpx",
): Promise<ArrayBuffer> {
    const res = await fetch("/api/markdown-to-hwpx", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ markdown, filename }),
    })

    if (!res.ok) {
        // Error path returns JSON per the route contract.
        let detail = `${res.status} ${res.statusText}`
        try {
            const j = (await res.json()) as { error?: string; stage?: string }
            if (j.error) detail = `${j.stage ?? "error"}: ${j.error}`
        } catch {
            // response body wasn't JSON — keep the status line
        }
        throw new Error(`convertMarkdownToHwpx: ${detail}`)
    }

    return await res.arrayBuffer()
}

/**
 * End-to-end convenience: given a filename + markdown, POST to the
 * conversion route and trigger a browser download. Returns the buffer's
 * byte length so callers can log it.
 */
export async function downloadHwpxFromMarkdown(
    filename: string,
    markdown: string,
): Promise<number> {
    const displayName = filename.endsWith(".hwpx")
        ? filename
        : `${filename}.hwpx`
    const buf = await convertMarkdownToHwpx(markdown, displayName)
    const blob = new Blob([buf], { type: "application/vnd.hancom.hwpx" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = displayName
    document.body.appendChild(a)
    a.click()
    a.remove()
    setTimeout(() => URL.revokeObjectURL(url), 0)
    return buf.byteLength
}

/**
 * Convenience: trigger a browser download of the markdown string.
 * Used by the "📝 MD" button in ResultsPanel.
 */
export function downloadMarkdown(filename: string, markdown: string): void {
    const blob = new Blob([markdown], { type: "text/markdown;charset=utf-8" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = filename.endsWith(".md") ? filename : `${filename}.md`
    document.body.appendChild(a)
    a.click()
    a.remove()
    // Revoke after a tick so the click handler can complete
    setTimeout(() => URL.revokeObjectURL(url), 0)
}
