/**
 * DebugDrawer — Phase 3 of the /test-hwp redesign.
 *
 * Collapsible container for developer-only tools that used to sit smack in
 * the middle of the main workflow (PNG-direct insert, sample batch, manual
 * single-passage paste, debug log). The handle is always visible; contents
 * toggle in and out.
 *
 * Phase 3 keeps the contents as `children` (JSX stays in page.tsx), so no
 * state plumbing has to move. Later phases can split individual tabs into
 * their own components if the drawer gets crowded.
 *
 * Open/close state is persisted in sessionStorage so a teacher who expanded
 * it once doesn't have to re-open on every re-render. The drawer also
 * responds to `Ctrl+\` and the `?debug=1` query flag as escape hatches.
 */

"use client"

import { type CSSProperties, type ReactNode, useEffect, useState } from "react"
import { T } from "@/lib/workbench-tokens"

export interface DebugDrawerProps {
    children: ReactNode
    /** Override title shown on the handle. */
    title?: string
}

const STORAGE_KEY = "workbench:debug-drawer:open"

function readInitialOpen(): boolean {
    if (typeof window === "undefined") return false
    try {
        const qs = new URLSearchParams(window.location.search)
        if (qs.get("debug") === "1") return true
        return sessionStorage.getItem(STORAGE_KEY) === "1"
    } catch {
        return false
    }
}

export function DebugDrawer({
    children,
    title = "🛠 개발자 도구",
}: DebugDrawerProps) {
    const [open, setOpen] = useState(false)

    // Hydrate open state on mount (avoid SSR hydration mismatch)
    useEffect(() => {
        setOpen(readInitialOpen())
    }, [])

    // Ctrl+\ toggle
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if (e.ctrlKey && e.key === "\\") {
                e.preventDefault()
                setOpen((v) => {
                    const next = !v
                    try {
                        sessionStorage.setItem(STORAGE_KEY, next ? "1" : "0")
                    } catch {}
                    return next
                })
            }
        }
        window.addEventListener("keydown", onKey)
        return () => window.removeEventListener("keydown", onKey)
    }, [])

    const handleClick = () => {
        setOpen((v) => {
            const next = !v
            try {
                sessionStorage.setItem(STORAGE_KEY, next ? "1" : "0")
            } catch {}
            return next
        })
    }

    const wrapper: CSSProperties = {
        marginTop: 40,
        border: `1px dashed ${T.paper400}`,
        borderRadius: 12,
        background: T.paper50,
        overflow: "hidden",
    }

    const handle: CSSProperties = {
        width: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "12px 18px",
        background: T.paper100,
        border: "none",
        cursor: "pointer",
        fontFamily: T.fontSans,
        fontSize: 14,
        fontWeight: 600,
        color: T.ink700,
        textAlign: "left",
    }

    const hintText: CSSProperties = {
        fontSize: 11,
        color: T.ink500,
        fontWeight: 500,
    }

    const body: CSSProperties = {
        padding: "20px 18px",
        borderTop: `1px solid ${T.paper300}`,
    }

    return (
        <div style={wrapper}>
            <button
                type="button"
                onClick={handleClick}
                style={handle}
                aria-expanded={open}
                aria-controls="debug-drawer-body"
            >
                <span>
                    {title} {open ? "▼" : "▲"}
                </span>
                <span style={hintText}>
                    Ctrl + \ · 샘플 배치 · 수동 붙여넣기 · PNG 직접 삽입
                </span>
            </button>
            {open ? (
                <div id="debug-drawer-body" style={body}>
                    {children}
                </div>
            ) : null}
        </div>
    )
}

export default DebugDrawer
