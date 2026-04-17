/**
 * Compose a draw.io-rendered diagram PNG with a caption header for HWP insertion.
 *
 * Output layout:
 *   ┌─────────────────────────────────────────┐
 *   │  Q18 · 요지 추론        AI 구조 다이어그램  │  ← header bar (primary color)
 *   ├─────────────────────────────────────────┤
 *   │                                          │
 *   │          [  diagram image  ]             │
 *   │                                          │
 *   └─────────────────────────────────────────┘
 */

export interface CaptionOptions {
    questionNumber: number | string
    questionType: string
    subtitle?: string
    /** Header background color. Default matches primary palette. */
    headerBg?: string
    /** Header text color. */
    headerFg?: string
    /** Outer border color. */
    borderColor?: string
    /** Horizontal padding inside the card. */
    paddingX?: number
    /** Vertical padding inside the card. */
    paddingY?: number
    /** Header bar height in px. */
    headerHeight?: number
}

/**
 * Compose a PNG byte array of (caption header + diagram) using Canvas.
 */
export async function composeDiagramWithCaption(
    diagramPngBytes: Uint8Array,
    options: CaptionOptions,
): Promise<Uint8Array> {
    const {
        questionNumber,
        questionType,
        subtitle = "AI 구조 다이어그램",
        headerBg = "#1D4ED8",
        headerFg = "#FFFFFF",
        borderColor = "#1D4ED8",
        paddingX = 12,
        paddingY = 12,
        headerHeight = 44,
    } = options

    // Decode diagram image
    const blob = new Blob([diagramPngBytes.buffer as ArrayBuffer], {
        type: "image/png",
    })
    const bitmap = await createImageBitmap(blob)

    const diagramW = bitmap.width
    const diagramH = bitmap.height
    const canvasW = diagramW + paddingX * 2
    const canvasH = diagramH + headerHeight + paddingY * 2

    const canvas = document.createElement("canvas")
    canvas.width = canvasW
    canvas.height = canvasH
    const ctx = canvas.getContext("2d")
    if (!ctx) throw new Error("2D canvas context unavailable")

    // White background
    ctx.fillStyle = "#FFFFFF"
    ctx.fillRect(0, 0, canvasW, canvasH)

    // Header bar
    ctx.fillStyle = headerBg
    ctx.fillRect(0, 0, canvasW, headerHeight)

    // Header text: "Q{N} · {type}"
    ctx.fillStyle = headerFg
    ctx.font =
        "bold 18px 'Pretendard', 'Noto Sans KR', 'Malgun Gothic', sans-serif"
    ctx.textBaseline = "middle"
    ctx.textAlign = "left"
    const leftText = `Q${questionNumber}  ·  ${questionType}`
    ctx.fillText(leftText, paddingX, headerHeight / 2)

    // Header subtitle on the right
    ctx.font =
        "500 13px 'Pretendard', 'Noto Sans KR', 'Malgun Gothic', sans-serif"
    ctx.textAlign = "right"
    ctx.fillText(subtitle, canvasW - paddingX, headerHeight / 2)

    // Diagram image
    ctx.drawImage(bitmap, paddingX, headerHeight + paddingY, diagramW, diagramH)
    bitmap.close()

    // Border around the whole card
    ctx.strokeStyle = borderColor
    ctx.lineWidth = 2
    ctx.strokeRect(1, 1, canvasW - 2, canvasH - 2)

    // Thin line under header
    ctx.strokeStyle = "rgba(0,0,0,0.08)"
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(0, headerHeight)
    ctx.lineTo(canvasW, headerHeight)
    ctx.stroke()

    // Export PNG
    const composedBlob = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob((b) => {
            if (b) resolve(b)
            else reject(new Error("canvas.toBlob returned null"))
        }, "image/png")
    })
    const buffer = await composedBlob.arrayBuffer()
    return new Uint8Array(buffer)
}
