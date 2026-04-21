/**
 * WorkbenchShell — Phase 1 of the /test-hwp redesign.
 *
 * Goal: introduce a layout primitive that can carry a top bar, a left passage
 * sidebar, a right results panel, and a bottom debug drawer WITHOUT forcing
 * the page to adopt them all at once.
 *
 * Phase 1 contract: when every optional slot is undefined, the component
 * renders as a plain single-column container with the same `maxWidth` the
 * page used before (1040). This guarantees ZERO visual change while the
 * rest of the migration lands.
 *
 * Later phases activate the grid layout by passing `left` / `right` /
 * `drawer`. The component switches to a full-viewport CSS grid only when
 * at least one side slot is provided.
 */

import type { CSSProperties, ReactNode } from "react"
import { T } from "@/lib/workbench-tokens"

export interface WorkbenchShellProps {
    topBar?: ReactNode
    left?: ReactNode
    right?: ReactNode
    drawer?: ReactNode
    children: ReactNode
    /** Single-column fallback max width (px). Ignored when side slots exist. */
    maxWidth?: number
}

export function WorkbenchShell({
    topBar,
    left,
    right,
    drawer,
    children,
    maxWidth = 1040,
}: WorkbenchShellProps) {
    const hasSideSlots = Boolean(left) || Boolean(right)

    // Fallback: single-column, byte-identical to the previous wrapper.
    if (!hasSideSlots && !topBar && !drawer) {
        const wrapper: CSSProperties = {
            maxWidth,
            margin: "0 auto",
        }
        return <div style={wrapper}>{children}</div>
    }

    const gridTemplateColumns = [
        left ? "280px" : null,
        "1fr",
        right ? "360px" : null,
    ]
        .filter(Boolean)
        .join(" ")

    const shell: CSSProperties = {
        display: "grid",
        gridTemplateRows: `${topBar ? "auto " : ""}1fr${drawer ? " auto" : ""}`,
        minHeight: "100vh",
    }

    const body: CSSProperties = {
        display: "grid",
        gridTemplateColumns,
        gap: 0,
        minHeight: 0,
    }

    const leftPane: CSSProperties = {
        borderRight: `1px solid ${T.paper300}`,
        background: T.paper100,
        overflowY: "auto",
    }

    const rightPane: CSSProperties = {
        borderLeft: `1px solid ${T.paper300}`,
        background: T.paper100,
        overflowY: "auto",
    }

    const centerPane: CSSProperties = {
        overflowY: "auto",
        minWidth: 0,
    }

    return (
        <div style={shell}>
            {topBar ? <div>{topBar}</div> : null}
            <div style={body}>
                {left ? <aside style={leftPane}>{left}</aside> : null}
                <main style={centerPane}>{children}</main>
                {right ? <aside style={rightPane}>{right}</aside> : null}
            </div>
            {drawer ? <div>{drawer}</div> : null}
        </div>
    )
}

export default WorkbenchShell
