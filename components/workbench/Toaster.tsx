/**
 * Toaster — Phase 6 of the /test-hwp redesign.
 *
 * Minimal, zero-dep toast system. The app calls `toast.info / .success /
 * .error / .warn` from anywhere; `<Toaster />` mounts once near the root
 * and renders the stack. No Radix, no portals — a single fixed <div> in
 * the top-right corner does the job for teachers' long-running generation
 * feedback.
 *
 * Accessibility: container has role="status" + aria-live="polite" so
 * screen readers announce status updates without stealing focus.
 */

"use client"

import { type CSSProperties, useEffect, useState } from "react"
import { T } from "@/lib/workbench-tokens"

export type ToastKind = "info" | "success" | "warn" | "error"

interface ToastItem {
    id: number
    kind: ToastKind
    message: string
    durationMs: number
}

type Listener = (items: ToastItem[]) => void

// ---------- imperative store (module-global singleton) ----------

let idCounter = 0
let items: ToastItem[] = []
const listeners = new Set<Listener>()

function emit() {
    for (const l of listeners) l(items)
}

function push(kind: ToastKind, message: string, durationMs = 4200) {
    const id = ++idCounter
    items = [...items, { id, kind, message, durationMs }]
    emit()
    setTimeout(() => {
        items = items.filter((t) => t.id !== id)
        emit()
    }, durationMs)
}

export const toast = {
    info: (m: string) => push("info", m),
    success: (m: string) => push("success", m),
    warn: (m: string) => push("warn", m, 6000),
    error: (m: string) => push("error", m, 8000),
}

// ---------- visual rendering ----------

const KIND_STYLE: Record<ToastKind, { bg: string; fg: string; icon: string }> =
    {
        info: { bg: T.blueWash, fg: T.inkBlue, icon: "ℹ️" },
        success: { bg: T.greenWash, fg: T.sage, icon: "✅" },
        warn: { bg: T.yellowWash, fg: T.mustard, icon: "⚠️" },
        error: { bg: T.pinkWash, fg: T.coral, icon: "❌" },
    }

const wrapper: CSSProperties = {
    position: "fixed",
    top: 18,
    right: 18,
    zIndex: 9999,
    display: "flex",
    flexDirection: "column",
    gap: 10,
    pointerEvents: "none",
    maxWidth: 360,
}

const toastCard = (kind: ToastKind): CSSProperties => ({
    pointerEvents: "auto",
    display: "flex",
    alignItems: "flex-start",
    gap: 10,
    padding: "12px 14px",
    background: KIND_STYLE[kind].bg,
    color: KIND_STYLE[kind].fg,
    border: `1px solid ${KIND_STYLE[kind].fg}`,
    borderRadius: 10,
    boxShadow: T.shadowLift,
    fontFamily: T.fontSans,
    fontSize: 13,
    lineHeight: 1.5,
    animation: "workbench-toast-in 200ms ease-out",
})

export function Toaster() {
    const [list, setList] = useState<ToastItem[]>(items)

    useEffect(() => {
        listeners.add(setList)
        return () => {
            listeners.delete(setList)
        }
    }, [])

    if (list.length === 0) return null

    return (
        <div role="status" aria-live="polite" style={wrapper}>
            <style>{`
                @keyframes workbench-toast-in {
                    from { opacity: 0; transform: translateX(16px); }
                    to { opacity: 1; transform: translateX(0); }
                }
            `}</style>
            {list.map((t) => (
                <div key={t.id} style={toastCard(t.kind)}>
                    <span>{KIND_STYLE[t.kind].icon}</span>
                    <span style={{ flex: 1, color: T.ink900 }}>
                        {t.message}
                    </span>
                </div>
            ))}
        </div>
    )
}

export default Toaster
