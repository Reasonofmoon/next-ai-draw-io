/**
 * StepPane — Phase 7 scaffold for center-panel step partitioning.
 *
 * Each step (Upload / Select / Generate / Export) gets a thin pane that
 * the page.tsx can slot children into. Right now the *content* still
 * lives inline in page.tsx (gated by `{hwpFile && ...}` conditions);
 * these wrappers exist so future passes can migrate the JSX into proper
 * Step* components without another shell-level refactor.
 *
 * Responsibility today: consistent heading tone + a11y landmarks.
 */

import type { CSSProperties, ReactNode } from "react"
import { T } from "@/lib/workbench-tokens"

export interface StepPaneProps {
    step: 1 | 2 | 3 | 4
    title: string
    subtitle?: string
    active: boolean
    children: ReactNode
}

const wrapper = (active: boolean): CSSProperties => ({
    opacity: active ? 1 : 0.55,
    pointerEvents: active ? "auto" : "none",
    transition: "opacity 200ms",
    marginBottom: 24,
})

const heading: CSSProperties = {
    display: "flex",
    alignItems: "baseline",
    gap: 10,
    marginBottom: 14,
    paddingBottom: 8,
    borderBottom: `1px dashed ${T.paper300}`,
}

const stepBadge: CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    width: 26,
    height: 26,
    borderRadius: "50%",
    background: T.inkBlue,
    color: "#fff",
    fontFamily: T.fontSans,
    fontWeight: 700,
    fontSize: 13,
}

const titleStyle: CSSProperties = {
    fontFamily: T.fontDisplay,
    fontSize: 24,
    color: T.ink900,
    margin: 0,
}

const subStyle: CSSProperties = {
    fontSize: 12,
    color: T.ink500,
    marginLeft: 8,
}

export function StepPane({
    step,
    title,
    subtitle,
    active,
    children,
}: StepPaneProps) {
    return (
        <section
            aria-label={`Step ${step} — ${title}`}
            aria-current={active ? "step" : undefined}
            style={wrapper(active)}
        >
            <div style={heading}>
                <span style={stepBadge}>{step}</span>
                <h2 style={titleStyle}>{title}</h2>
                {subtitle ? <span style={subStyle}>{subtitle}</span> : null}
            </div>
            {children}
        </section>
    )
}

export default StepPane
