import { execFile } from "node:child_process"
import { mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { promisify } from "node:util"
import { type NextRequest, NextResponse } from "next/server"

export const runtime = "nodejs"
export const maxDuration = 120

const execFileAsync = promisify(execFile)
const MAX_PDF_BYTES = 25 * 1024 * 1024
const MAX_MARKDOWN_CHARS = 200000

interface ConvertSuccess {
    success: true
    markdown: string
    filename: string
    charCount: number
    engine: string
    metadata: Record<string, unknown>
}

interface ConvertFailure {
    success: false
    error: string
    stage: "upload" | "convert"
}

type ConvertPayload = ConvertSuccess | ConvertFailure

export async function POST(
    req: NextRequest,
): Promise<NextResponse<ConvertPayload>> {
    let file: Blob
    let filename = "uploaded.pdf"

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

        file = entry
        if ("name" in entry && typeof (entry as File).name === "string") {
            filename = (entry as File).name
        }
    } catch (err) {
        return NextResponse.json(
            {
                success: false,
                stage: "upload",
                error: err instanceof Error ? err.message : String(err),
            },
            { status: 400 },
        )
    }

    if (!filename.toLowerCase().endsWith(".pdf")) {
        return NextResponse.json(
            {
                success: false,
                stage: "upload",
                error: "Only PDF files are supported.",
            },
            { status: 400 },
        )
    }
    if (file.size > MAX_PDF_BYTES) {
        return NextResponse.json(
            {
                success: false,
                stage: "upload",
                error: `PDF exceeds ${Math.round(MAX_PDF_BYTES / 1024 / 1024)}MB limit.`,
            },
            { status: 413 },
        )
    }

    try {
        const fileBytes = await file.arrayBuffer()
        const requestOrigin = new URL(req.url).origin
        const converted =
            process.env.VERCEL === "1" && process.env.VERCEL_URL
                ? await convertWithVercelPythonFunction(
                      fileBytes,
                      filename,
                      requestOrigin,
                  )
                : await convertWithLocalPython(fileBytes)

        const markdown = converted.markdown.trim()
        if (markdown.length === 0) {
            return NextResponse.json(
                {
                    success: false,
                    stage: "convert",
                    error: "MarkItDown returned empty Markdown.",
                },
                { status: 422 },
            )
        }
        if (markdown.length > MAX_MARKDOWN_CHARS) {
            return NextResponse.json(
                {
                    success: false,
                    stage: "convert",
                    error: `Converted Markdown exceeds ${MAX_MARKDOWN_CHARS.toLocaleString()} characters.`,
                },
                { status: 413 },
            )
        }

        return NextResponse.json({
            success: true,
            markdown,
            filename,
            charCount: markdown.length,
            engine: converted.engine,
            metadata: converted.metadata,
        })
    } catch (err) {
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

async function convertWithVercelPythonFunction(
    fileBytes: ArrayBuffer,
    filename: string,
    origin: string,
): Promise<{
    markdown: string
    engine: string
    metadata: Record<string, unknown>
}> {
    const formData = new FormData()
    formData.append(
        "file",
        new Blob([fileBytes], { type: "application/pdf" }),
        filename,
    )
    const res = await fetch(`${origin}/api/markitdown_python`, {
        method: "POST",
        body: formData,
    })
    const data = (await res.json().catch(() => null)) as {
        success?: boolean
        markdown?: string
        error?: string
        metadata?: Record<string, unknown>
    } | null
    if (!res.ok || !data?.success || typeof data.markdown !== "string") {
        throw new Error(
            data?.error ??
                `Vercel MarkItDown function failed with status ${res.status}`,
        )
    }
    return {
        markdown: data.markdown,
        engine: "microsoft-markitdown-python-function",
        metadata: data.metadata ?? {},
    }
}

async function convertWithLocalPython(fileBytes: ArrayBuffer): Promise<{
    markdown: string
    engine: string
    metadata: Record<string, unknown>
}> {
    const tempDir = await mkdtemp(path.join(tmpdir(), "markitdown-pdf-"))
    const pdfPath = path.join(tempDir, "input.pdf")
    try {
        await writeFile(pdfPath, Buffer.from(fileBytes))
        const scriptPath = path.join(
            process.cwd(),
            "scripts",
            "markitdown_pdf.py",
        )
        const candidates = pythonCandidates()
        const errors: string[] = []

        for (const candidate of candidates) {
            try {
                const { stdout } = await execFileAsync(
                    candidate.command,
                    [...candidate.prefixArgs, scriptPath, pdfPath],
                    {
                        timeout: 90000,
                        maxBuffer: 1024 * 1024 * 12,
                        windowsHide: true,
                    },
                )
                const data = JSON.parse(stdout) as {
                    success?: boolean
                    markdown?: string
                    error?: string
                    detail?: string
                    metadata?: Record<string, unknown>
                }
                if (!data.success || typeof data.markdown !== "string") {
                    throw new Error(
                        [data.error, data.detail].filter(Boolean).join(" "),
                    )
                }
                return {
                    markdown: data.markdown,
                    engine: "microsoft-markitdown-local-python",
                    metadata: data.metadata ?? {},
                }
            } catch (err) {
                errors.push(
                    `${candidate.command} ${candidate.prefixArgs.join(" ")}: ${
                        err instanceof Error ? err.message : String(err)
                    }`,
                )
            }
        }

        throw new Error(errors.join("\n"))
    } finally {
        await rm(tempDir, { recursive: true, force: true })
    }
}

function pythonCandidates(): Array<{ command: string; prefixArgs: string[] }> {
    const configured = process.env.MARKITDOWN_PYTHON
    const candidates: Array<{ command: string; prefixArgs: string[] }> = []
    if (configured) candidates.push({ command: configured, prefixArgs: [] })
    candidates.push(
        { command: "python", prefixArgs: [] },
        { command: "python3", prefixArgs: [] },
        { command: "py", prefixArgs: ["-3"] },
    )
    return candidates
}
