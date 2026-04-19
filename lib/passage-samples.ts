/**
 * Preset English reading passages covering different CSAT question types.
 * Used by the test-hwp page to verify visual quality of Phase 1 templates
 * without depending on HWP passage detection.
 *
 * Each sample is a realistic short CSAT-style passage (trimmed for token cost).
 */

import type { DetectedPassage } from "@/lib/hwp-utils"

export interface SamplePassage {
    label: string
    passage: DetectedPassage
}

export const SAMPLE_PASSAGES: SamplePassage[] = [
    {
        label: "Q20 요지 — Behavioral Economics",
        passage: {
            questionNumber: 20,
            questionType: "요지",
            koreanInstruction: "글의 요지로 가장 적절한 것은?",
            englishPassage:
                "Traditional economic theory assumed that rational actors always maximize utility. However, behavioral economists have shown that humans systematically deviate from this rationality. Tversky and Kahneman demonstrated how cognitive biases such as loss aversion and framing effects dominate everyday decision-making. These findings suggest that economic models must incorporate psychological realism — not merely mathematical elegance — to predict real-world behavior reliably.",
            choices: [],
            pageNumber: 0,
            sectionIdx: 0,
            insertAfterParaIdx: 0,
        },
    },
    {
        label: "Q23 주제 — Forest Ecosystem Services",
        passage: {
            questionNumber: 23,
            questionType: "주제",
            koreanInstruction: "다음 글의 주제로 가장 적절한 것은?",
            englishPassage:
                "Managers of natural resources typically face market incentives that provide financial rewards for extraction. An owner of forested land has incentives to cut trees rather than manage the forest for carbon capture, wildlife habitat, flood protection, and other ecosystem services. These services yield no direct revenue to the owner, so they rarely influence management decisions. However, the economic value of such services can easily exceed the timber revenue — a UN estimate suggests tropical-forest services are worth three times more per hectare than extractive uses.",
            choices: [],
            pageNumber: 0,
            sectionIdx: 0,
            insertAfterParaIdx: 0,
        },
    },
    {
        label: "Q31 빈칸 — Attention & Stress",
        passage: {
            questionNumber: 31,
            questionType: "빈칸 추론",
            koreanInstruction: "다음 빈칸에 들어갈 말로 가장 적절한 것은?",
            englishPassage:
                "The way you focus your attention plays a critical role in how you cope with stress. Scattered attention harms your ability to let go of stress, because even though your attention is scattered, it remains narrowly focused — you dwell only on stressful fragments. When your attentional spotlight widens, you put any situation in broader perspective; a single anxiety-provoking detail carries less weight than the bigger picture. A wider focus therefore ______.",
            choices: [],
            pageNumber: 0,
            sectionIdx: 0,
            insertAfterParaIdx: 0,
        },
    },
    {
        label: "Q36 순서 — Negotiation",
        passage: {
            questionNumber: 36,
            questionType: "순서 배열",
            koreanInstruction: "다음 글의 순서로 가장 적절한 것은?",
            englishPassage:
                "Negotiation can be defined as an attempt to explore and reconcile conflicting positions in order to reach an acceptable outcome. (C) Whatever the nature of that outcome — which may in fact favor one party more than another — the purpose is to surface areas of common interest and conflict. (A) Areas of disagreement can and often do remain; they may become the subject of future negotiation, or indeed remain unreconciled. (B) In such forms of negotiation, the activity serves functions other than reconciling interests — delay, publicity, distraction, or intelligence gathering.",
            choices: [],
            pageNumber: 0,
            sectionIdx: 0,
            insertAfterParaIdx: 0,
        },
    },
    {
        label: "Q19 심경/분위기 — David's Bus",
        passage: {
            questionNumber: 19,
            questionType: "심경/분위기",
            koreanInstruction:
                "다음 글에 드러난 David의 심경 변화로 가장 적절한 것은?",
            englishPassage:
                "David was starting a new job in Vancouver and was waiting for his bus. He kept looking at his watch, then at the direction his bus was supposed to come. 'My bus isn't here yet. I can't be late on my first day,' he thought. David could not relax. When he looked up again, another bus — the very one heading to his workplace — was arriving. It stopped, the doors opened, and he climbed aboard. 'Phew! Just in time.' He leaned back into an empty seat, let out a deep sigh, and finally felt at ease.",
            choices: [],
            pageNumber: 0,
            sectionIdx: 0,
            insertAfterParaIdx: 0,
        },
    },
    {
        label: "Q24 제목 — Overtourism",
        passage: {
            questionNumber: 24,
            questionType: "제목",
            koreanInstruction: "다음 글의 제목으로 가장 적절한 것은?",
            englishPassage:
                "The concept of overtourism rests on particular assumptions about people and places — common in tourism studies and the social sciences — that treat both as clearly defined and bounded. Places are seen as stable containers with definite limits that can be filled with tourists and thus suffer overtourism. But what does it mean for a place to be full? Certain attractions, like the Eiffel Tower, have limited capacity. Yet for cities, regions, or entire countries promoted as destinations, the situation is more complex. Overtourism may relate less to physical capacity than to qualitative factors — environmental degradation, economic leakage, and shifts in local power dynamics.",
            choices: [],
            pageNumber: 0,
            sectionIdx: 0,
            insertAfterParaIdx: 0,
        },
    },
]
