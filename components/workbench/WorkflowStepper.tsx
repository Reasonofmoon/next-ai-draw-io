/**
 * WorkflowStepper — Phase 4 of the /test-hwp redesign.
 *
 * Purely visual top-bar indicator for the 4-step teacher workflow:
 *   1. 파일 올리기  2. 지문 고르기  3. 콘텐츠 생성  4. 삽입 & 다운로드
 *
 * Current step is DERIVED (never owned) — the page decides. The stepper
 * reports clicks to its parent for optional navigation; by default the
 * parent can ignore them (pure indicator). Steps beyond the reached one
 * are disabled so teachers can't jump to gated phases.
 *
 * A11y: renders as <ol role="list">; the active step is marked via
 * `aria-current="step"`; pill buttons receive discriminative aria-labels.
 */

import type { CSSProperties } from "react"
import { T } from "@/lib/workbench-tokens"

export type WorkflowStep = 1 | 2 | 3 | 4

export interface WorkflowStepperProps {
    currentStep: WorkflowStep
    /** Highest step that's reachable given current app state. */
    reachedStep: WorkflowStep
    onJump?: (step: WorkflowStep) => void
}

const STEPS: { n: WorkflowStep; icon: string; label: string }[] = [
    { n: 1, icon: "📄", label: "파일 올리기" },
    { n: 2, icon: "☑️", label: "지문 고르기" },
    { n: 3, icon: "🧠", label: "콘텐츠 생성" },
    { n: 4, icon: "🖨️", label: "삽입 & 다운로드" },
]

const bar: CSSProperties = {
    display: "flex",
    alignItems: "center",
    gap: 0,
    padding: "14px 24px",
    background: T.paper50,
    borderBottom: `1px solid ${T.paper300}`,
    boxShadow: T.shadowSoft,
}

const pill = (
    state: "done" | "current" | "reachable" | "locked",
): CSSProperties => {
    const bg =
        state === "current"
            ? T.inkBlue
            : state === "done"
              ? T.sage
              : state === "reachable"
                ? T.paper100
                : T.paper200
    const fg = state === "current" || state === "done" ? "#fff" : T.ink500
    return {
        display: "inline-flex",
        alignItems: "center",
        gap: 8,
        padding: "8px 14px",
        borderRadius: 999,
        background: bg,
        color: fg,
        fontFamily: T.fontSans,
        fontSize: 13,
        fontWeight: state === "current" ? 700 : 500,
        border: `1px solid ${state === "current" ? T.inkBlue : T.paper300}`,
        cursor: state === "locked" ? "not-allowed" : "pointer",
        transition: "background 200ms, transform 120ms",
        outline: "none",
    }
}

const connector = (active: boolean): CSSProperties => ({
    flex: 1,
    height: 2,
    margin: "0 8px",
    background: active ? T.sage : T.paper300,
    borderRadius: 1,
})

export function WorkflowStepper({
    currentStep,
    reachedStep,
    onJump,
}: WorkflowStepperProps) {
    return (
        <nav aria-label="워크플로우 진행" style={bar}>
            <ol
                style={{
                    display: "flex",
                    alignItems: "center",
                    flex: 1,
                    margin: 0,
                    padding: 0,
                    listStyle: "none",
                }}
            >
                {STEPS.map((s, i) => {
                    const state: "done" | "current" | "reachable" | "locked" =
                        s.n < currentStep
                            ? "done"
                            : s.n === currentStep
                              ? "current"
                              : s.n <= reachedStep
                                ? "reachable"
                                : "locked"
                    const disabled = state === "locked"
                    return (
                        <li
                            key={s.n}
                            style={{
                                display: "flex",
                                alignItems: "center",
                                flex: i < STEPS.length - 1 ? 1 : 0,
                            }}
                        >
                            <button
                                type="button"
                                onClick={() => !disabled && onJump?.(s.n)}
                                disabled={disabled}
                                aria-current={
                                    state === "current" ? "step" : undefined
                                }
                                aria-label={`Step ${s.n} — ${s.label}${
                                    state === "done" ? " (완료)" : ""
                                }`}
                                style={pill(state)}
                            >
                                <span>{s.icon}</span>
                                <span>
                                    {s.n}. {s.label}
                                </span>
                            </button>
                            {i < STEPS.length - 1 ? (
                                <span
                                    style={connector(
                                        s.n < currentStep ||
                                            (s.n === currentStep &&
                                                reachedStep > currentStep),
                                    )}
                                    aria-hidden
                                />
                            ) : null}
                        </li>
                    )
                })}
            </ol>
        </nav>
    )
}

export default WorkflowStepper
