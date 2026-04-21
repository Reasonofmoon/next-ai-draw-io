/**
 * Phase 4a HWP primitives — real insertions via @rhwp/core.
 *
 * Build bricks used by hwp-content-renderer:
 *   - insertParagraphAfter        — append a plain-text paragraph below a target paragraph
 *   - insertLabeledBlockAfter     — "■ 제목" header + body lines, optional reasoning footnote
 *   - insertVocabTableAfter       — real HWP table (단어 / 뜻 / 예문) at a target paragraph
 *
 * Phase 4a deliberately does NOT call setShapeProperties / applyCharFormat —
 * those JSON schemas are not publicly documented. Styling (background, border,
 * font color from StylePreset) will land in Phase 4b once we reverse-engineer
 * the props schema.
 *
 * All functions take an already-initialised HwpDocument and mutate it in place.
 */

import type { HwpDocument } from "@rhwp/core"
import type { StylePresetId } from "@/lib/hwp-format-rules"
import type { VocabEntry } from "@/lib/korean-content-generator"

// ---------------------------------------------------------------------------
// Low-level: paragraph-level primitives
// ---------------------------------------------------------------------------

/**
 * Split `afterParaIdx` at its end, creating a new empty paragraph right after,
 * and return the new paragraph's index. Filling it with text is the caller's job.
 */
export function addEmptyParagraphAfter(
    doc: HwpDocument,
    sectionIdx: number,
    afterParaIdx: number,
): number {
    const length = doc.getParagraphLength(sectionIdx, afterParaIdx)
    const raw = doc.splitParagraph(sectionIdx, afterParaIdx, length)
    const parsed = JSON.parse(raw) as {
        ok?: boolean
        paraIdx?: number
    }
    if (!parsed.ok || typeof parsed.paraIdx !== "number") {
        throw new Error(
            `splitParagraph failed for sec=${sectionIdx} para=${afterParaIdx}: ${raw}`,
        )
    }
    return parsed.paraIdx
}

/**
 * Insert a brand-new paragraph containing `text` immediately after `afterParaIdx`.
 * Returns the paragraph index of the newly inserted paragraph.
 *
 * `text` may contain \n, which is split into multiple paragraphs — subsequent
 * lines become additional paragraphs below the first. Returns the last
 * paragraph index written.
 */
export function insertParagraphAfter(
    doc: HwpDocument,
    sectionIdx: number,
    afterParaIdx: number,
    text: string,
): number {
    const lines = text.split(/\r?\n/)
    let cursor = afterParaIdx
    for (const line of lines) {
        const newPara = addEmptyParagraphAfter(doc, sectionIdx, cursor)
        if (line.length > 0) {
            doc.insertText(sectionIdx, newPara, 0, line)
        }
        cursor = newPara
    }
    return cursor
}

// ---------------------------------------------------------------------------
// Higher-level: labelled block (header + body) — textbox stand-in for Phase 4a
// ---------------------------------------------------------------------------

/**
 * Prefix glyph for style-preset-aware header decoration. No color / fill yet —
 * teachers still get a visible, skimmable cue for block boundaries.
 */
const PRESET_PREFIX: Record<StylePresetId, string> = {
    "heading-accent": "■",
    "body-plain": "▸",
    "body-muted": "ㆍ",
    "callout-box": "★",
}

/**
 * Render a textbox-style block as:
 *   ■ [제목]
 *   [본문 라인 1]
 *   [본문 라인 2]
 *   💡 [reasoning]    ← optional
 *
 * Returns the paragraph index of the LAST paragraph written (so the caller
 * can chain further insertions after it).
 */
export function insertLabeledBlockAfter(
    doc: HwpDocument,
    sectionIdx: number,
    afterParaIdx: number,
    opts: {
        title: string
        body: string
        stylePreset: StylePresetId
        reasoning?: string
    },
): number {
    const prefix = PRESET_PREFIX[opts.stylePreset] ?? "▸"
    const header = `${prefix} ${opts.title}`

    let cursor = insertParagraphAfter(doc, sectionIdx, afterParaIdx, header)
    if (opts.body.trim().length > 0) {
        cursor = insertParagraphAfter(doc, sectionIdx, cursor, opts.body)
    }
    if (opts.reasoning && opts.reasoning.trim().length > 0) {
        cursor = insertParagraphAfter(
            doc,
            sectionIdx,
            cursor,
            `💡 ${opts.reasoning}`,
        )
    }
    // Trailing blank paragraph for visual breathing room
    cursor = insertParagraphAfter(doc, sectionIdx, cursor, "")
    return cursor
}

// ---------------------------------------------------------------------------
// Higher-level: vocabulary table (real 표)
// ---------------------------------------------------------------------------

interface CreateTableResult {
    ok: boolean
    paraIdx: number
    controlIdx: number
}

/**
 * Insert a real HWP table populated with VocabEntry[] immediately after
 * `afterParaIdx`. Columns: 단어 / 뜻 / 예문.
 *
 * Strategy:
 *   1. Create an empty paragraph after the target — this is where the table
 *      "lives". Using createTableEx with treatAsChar=false makes the table
 *      occupy its own paragraph.
 *   2. createTableEx with rowCount = entries.length + 1 (header row) and
 *      colCount = 3. Remembers controlIdx.
 *   3. For each cell, insertTextInCell with row-major cell_idx (row*3 + col).
 *
 * Returns the paragraph index AFTER the table so the caller can continue.
 */
export function insertVocabTableAfter(
    doc: HwpDocument,
    sectionIdx: number,
    afterParaIdx: number,
    entries: VocabEntry[],
): number {
    if (entries.length === 0) {
        return afterParaIdx
    }

    const tablePara = addEmptyParagraphAfter(doc, sectionIdx, afterParaIdx)

    const rowCount = entries.length + 1 // +1 for header row
    const colCount = 3

    const createOpts = {
        sectionIdx,
        paraIdx: tablePara,
        charOffset: 0,
        rowCount,
        colCount,
        treatAsChar: false,
    }

    const raw = doc.createTableEx(JSON.stringify(createOpts))
    const parsed = JSON.parse(raw) as CreateTableResult
    if (!parsed.ok) {
        throw new Error(`createTableEx failed: ${raw}`)
    }
    const controlIdx = parsed.controlIdx
    // createTableEx may return a different paraIdx — use its value
    const tableParentPara = parsed.paraIdx

    const writeCell = (row: number, col: number, text: string) => {
        if (!text) return
        const cellIdx = row * colCount + col
        try {
            doc.insertTextInCell(
                sectionIdx,
                tableParentPara,
                controlIdx,
                cellIdx,
                0, // cell_para_idx — cells start with one empty paragraph
                0, // char_offset
                text,
            )
        } catch (err) {
            console.warn(
                `[hwp-primitives] writeCell(${row},${col}) failed:`,
                err,
            )
        }
    }

    // Header row
    writeCell(0, 0, "단어")
    writeCell(0, 1, "뜻")
    writeCell(0, 2, "예문")

    // Data rows
    for (let r = 0; r < entries.length; r++) {
        const entry = entries[r]
        writeCell(r + 1, 0, entry.word)
        writeCell(r + 1, 1, entry.meaning)
        writeCell(r + 1, 2, entry.example ?? "")
    }

    // Append a blank paragraph after the table for breathing room, and return its idx
    return insertParagraphAfter(doc, sectionIdx, tableParentPara, "")
}

// ---------------------------------------------------------------------------
// Higher-level: kordoc IRTable → merged HWP 표 (Phase B-4)
// ---------------------------------------------------------------------------

/**
 * Minimal shape of kordoc's IRTable that this module consumes — keeps us
 * decoupled from kordoc's full dts so the primitives layer stays WASM-only.
 * `cells` is the COMPACT layout: merged positions are skipped, so
 * `cells[r].length` may be less than `cols` when that row has horizontally
 * merged cells or is covered by vertical spans from rows above.
 */
export interface KordocTableLike {
    rows: number
    cols: number
    cells: Array<
        Array<{
            text: string
            colSpan?: number
            rowSpan?: number
            colAddr?: number
            rowAddr?: number
        }>
    >
}

interface Placement {
    row: number
    col: number
    rowSpan: number
    colSpan: number
    text: string
}

/**
 * Walk kordoc's compact 2D cells and compute each cell's absolute (row, col)
 * position in the full grid, honoring prior-row vertical spans.
 *
 * Two paths:
 *   - If any cell carries `rowAddr`/`colAddr` (HWP5 preserves this), trust it.
 *   - Otherwise, use an occupancy grid to walk left-to-right per row.
 */
export function computeKordocTablePlacements(
    table: KordocTableLike,
): Placement[] {
    const out: Placement[] = []
    const rows = Math.max(0, table.rows)
    const cols = Math.max(0, table.cols)
    if (rows === 0 || cols === 0) return out

    const hasAddr = table.cells.some((row) =>
        row.some(
            (c) =>
                typeof c.colAddr === "number" && typeof c.rowAddr === "number",
        ),
    )

    if (hasAddr) {
        for (const row of table.cells) {
            for (const c of row) {
                const r = c.rowAddr ?? 0
                const col = c.colAddr ?? 0
                const rs = Math.max(1, c.rowSpan ?? 1)
                const cs = Math.max(1, c.colSpan ?? 1)
                out.push({
                    row: r,
                    col,
                    rowSpan: Math.min(rs, rows - r),
                    colSpan: Math.min(cs, cols - col),
                    text: c.text ?? "",
                })
            }
        }
        return out
    }

    const occupied: boolean[][] = Array.from({ length: rows }, () =>
        Array<boolean>(cols).fill(false),
    )
    for (let r = 0; r < rows; r++) {
        const rowCells = table.cells[r] ?? []
        let c = 0
        for (const cell of rowCells) {
            while (c < cols && occupied[r][c]) c++
            if (c >= cols) break
            const rs = Math.min(Math.max(1, cell.rowSpan ?? 1), rows - r)
            const cs = Math.min(Math.max(1, cell.colSpan ?? 1), cols - c)
            out.push({
                row: r,
                col: c,
                rowSpan: rs,
                colSpan: cs,
                text: cell.text ?? "",
            })
            for (let rr = r; rr < r + rs; rr++) {
                for (let cc = c; cc < c + cs; cc++) {
                    occupied[rr][cc] = true
                }
            }
            c += cs
        }
    }
    return out
}

/**
 * Insert a real HWP table that mirrors a kordoc IRTable, including merged
 * cells (rowSpan/colSpan), immediately after `afterParaIdx`.
 *
 * Strategy:
 *   1. createTableEx with full (rows × cols) grid — all cells unmerged.
 *   2. Write text into every placement at its top-left (row, col).
 *      cellIdx = row * cols + col is stable pre-merge.
 *   3. For each placement with a span > 1, call mergeTableCells(row, col,
 *      row+rowSpan-1, col+colSpan-1). HWP keeps the top-left cell's content
 *      after a merge, so write-then-merge is safe.
 *
 * Returns a blank paragraph index AFTER the table.
 */
export function insertKordocTableAfter(
    doc: HwpDocument,
    sectionIdx: number,
    afterParaIdx: number,
    table: KordocTableLike,
): number {
    const rows = Math.max(0, table.rows)
    const cols = Math.max(0, table.cols)
    if (rows === 0 || cols === 0) return afterParaIdx

    const tablePara = addEmptyParagraphAfter(doc, sectionIdx, afterParaIdx)

    const createOpts = {
        sectionIdx,
        paraIdx: tablePara,
        charOffset: 0,
        rowCount: rows,
        colCount: cols,
        treatAsChar: false,
    }
    const raw = doc.createTableEx(JSON.stringify(createOpts))
    const parsed = JSON.parse(raw) as CreateTableResult
    if (!parsed.ok) {
        throw new Error(`createTableEx failed: ${raw}`)
    }
    const controlIdx = parsed.controlIdx
    const tableParentPara = parsed.paraIdx

    const placements = computeKordocTablePlacements(table)

    // Step 2: write text at top-left cellIdx of each placement (pre-merge).
    for (const p of placements) {
        if (!p.text) continue
        const cellIdx = p.row * cols + p.col
        try {
            doc.insertTextInCell(
                sectionIdx,
                tableParentPara,
                controlIdx,
                cellIdx,
                0, // cell_para_idx
                0, // char_offset
                p.text,
            )
        } catch (err) {
            console.warn(
                `[hwp-primitives] insertKordocTable writeCell(${p.row},${p.col}) failed:`,
                err,
            )
        }
    }

    // Step 3: merge spans. mergeTableCells takes grid coords, not cellIdx,
    // so merge order doesn't matter for addressing. Skip 1×1 placements.
    for (const p of placements) {
        if (p.rowSpan <= 1 && p.colSpan <= 1) continue
        try {
            doc.mergeTableCells(
                sectionIdx,
                tableParentPara,
                controlIdx,
                p.row,
                p.col,
                p.row + p.rowSpan - 1,
                p.col + p.colSpan - 1,
            )
        } catch (err) {
            console.warn(
                `[hwp-primitives] mergeTableCells(${p.row},${p.col} → ${
                    p.row + p.rowSpan - 1
                },${p.col + p.colSpan - 1}) failed:`,
                err,
            )
        }
    }

    return insertParagraphAfter(doc, sectionIdx, tableParentPara, "")
}
