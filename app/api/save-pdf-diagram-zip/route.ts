import { mkdir, writeFile } from "node:fs/promises"
import path from "node:path"
import { type NextRequest, NextResponse } from "next/server"

export const runtime = "nodejs"

const MAX_ZIP_BYTES = 60 * 1024 * 1024

interface SaveZipSuccess {
    success: true
    filename: string
    path: string
    bytes: number
}

interface SaveZipFailure {
    success: false
    error: string
}

type SaveZipPayload = SaveZipSuccess | SaveZipFailure

export async function POST(
    req: NextRequest,
): Promise<NextResponse<SaveZipPayload>> {
    if (process.env.VERCEL === "1") {
        return NextResponse.json(
            {
                success: false,
                error: "Local file saving is only available in the local development server.",
            },
            { status: 501 },
        )
    }

    let body: unknown
    try {
        body = await req.json()
    } catch {
        return NextResponse.json(
            { success: false, error: "Invalid JSON body." },
            { status: 400 },
        )
    }

    if (!isSaveZipRequest(body)) {
        return NextResponse.json(
            { success: false, error: "Expected filename and zipBase64." },
            { status: 400 },
        )
    }

    const filename = safeZipFilename(body.filename)
    const bytes = Buffer.from(body.zipBase64, "base64")
    if (bytes.length === 0 || bytes.length > MAX_ZIP_BYTES) {
        return NextResponse.json(
            {
                success: false,
                error: `ZIP must be between 1 byte and ${Math.round(MAX_ZIP_BYTES / 1024 / 1024)}MB.`,
            },
            { status: 413 },
        )
    }

    const exportDir = path.resolve(process.cwd(), "exports", "pdf-diagrams")
    const outputPath = path.resolve(exportDir, filename)
    if (!outputPath.startsWith(exportDir + path.sep)) {
        return NextResponse.json(
            { success: false, error: "Unsafe output path." },
            { status: 400 },
        )
    }

    await mkdir(exportDir, { recursive: true })
    await writeFile(outputPath, bytes)

    return NextResponse.json({
        success: true,
        filename,
        path: outputPath,
        bytes: bytes.length,
    })
}

function isSaveZipRequest(value: unknown): value is {
    filename: string
    zipBase64: string
} {
    if (!value || typeof value !== "object") return false
    const record = value as Record<string, unknown>
    return (
        typeof record.filename === "string" &&
        record.filename.length > 0 &&
        record.filename.length <= 180 &&
        typeof record.zipBase64 === "string" &&
        record.zipBase64.length > 0
    )
}

function safeZipFilename(filename: string): string {
    const cleaned = filename
        .replace(/[/\\?%*:|"<>]/g, "-")
        .replace(/\s+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 160)
    const fallback = `pdf-diagrams-${Date.now()}`
    const stem = cleaned.length > 0 ? cleaned : fallback
    return stem.toLowerCase().endsWith(".zip") ? stem : `${stem}.zip`
}
