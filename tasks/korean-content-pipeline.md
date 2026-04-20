# Korean Content + Template Rendering Pipeline

> **Status**: Planning → Phase 1 next
> **Owner**: Reasonofmoon
> **Created**: 2026-04-20
> **Goal**: 감지된 영어 지문 각각에 대해 (1) 사용자 프롬프트 기반 한글 해설/어휘 생성, (2) AI가 콘텐츠 타입에 맞는 서식 프리셋 선택, (3) 3종 템플릿(시험지/해설지/어휘노트) 중 하나로 HWP 렌더링. 어휘 생성은 반드시 다이어그램보다 먼저.

## 1. Scope

### In scope
- 프롬프트-driven 한글 콘텐츠 생성 (해석 / 요약 / 어휘 / 문법 / 해설 / 자유 요청)
- 어휘 → 다이어그램 → HWP 삽입 순서 강제
- HWP 글상자(textbox) + 표(table) 프리미티브 렌더링
- 템플릿 3종: `exam-2col` / `answer-1col` / `vocab-note`
- Level 1 서식 프리셋 (AI가 4개 중 선택)
- 지문 단위 배치 (N개 지문 일괄 처리)

### Out of scope (향후)
- 시각적 HWP 템플릿 파일 업로드 (Phase 6+)
- AI가 서식 자유 생성 (Level 2/3)
- 다국어 콘텐츠 (영↔중/일)
- PDF / DOCX export

---

## 2. Architecture

```
HWP 파싱 → 지문 감지 (regex + AI fallback)
  ↓
사용자 프롬프트 입력 ("해석 + 핵심 어휘 6개 + 오답 해설")
  ↓
[NEW] /api/generate-korean-content     ← Phase 1
  → returns: blocks[] (type, content, stylePreset, renderAs)
  ↓  (vocab block 보장 후)
[EXISTING] /api/generate-passage-diagram  ← 기존, 어휘 블록이 먼저 끝난 후 실행
  ↓
[NEW] template-engine.renderToHwp(template, blocks, diagramPng)  ← Phase 3/4
  → HWP section/paragraph 배열
  ↓
기존 HWP 삽입 로직 재활용 (sectionIdx + insertAfterParaIdx)
```

### Pipeline ordering (핵심 제약)

> **어휘가 다이어그램보다 먼저 생성**되어야 함 — 다이어그램 프롬프트가 어휘 블록을 참조할 수 있어야 "어휘 + 다이어그램 일관성"이 보장됨.

```ts
async function enrichPassage(passage, userPrompt, template) {
  const content = await generateKoreanContent(passage, userPrompt)  // blocks[] with vocab
  const vocabBlock = content.blocks.find(b => b.type === "vocabulary")
  const diagram = await generateDiagram(passage, { vocabHint: vocabBlock })  // vocab-aware
  return { content, diagram }
}
```

---

## 3. Data models (Zod schemas)

```ts
// lib/korean-content-generator.ts

const VocabEntrySchema = z.object({
  word: z.string(),
  meaning: z.string(),
  example: z.string().optional(),
})

const BlockSchema = z.object({
  type: z.enum([
    "vocabulary",       // 어휘 표
    "translation",      // 한글 해석
    "summary",          // 요약
    "grammar",          // 문법/구문 포인트
    "answer_explanation", // 정답/오답 해설
    "background",       // 배경지식
    "custom",           // 프롬프트 자유 요청
  ]),
  title: z.string().max(40),
  stylePreset: z.enum([
    "heading-accent",
    "body-plain",
    "body-muted",
    "callout-box",
  ]),
  renderAs: z.enum(["textbox", "table"]),
  content: z.union([
    z.string().max(4000),                    // paragraph
    z.array(VocabEntrySchema).max(15),       // vocab rows
  ]),
})

const ContentResponseSchema = z.object({
  blocks: z.array(BlockSchema).max(8),
})
```

AI는 **renderAs**와 **stylePreset**을 직접 고른다 (Level 1). 서버에서 허용 리스트로 clamp.

---

## 4. Format presets (Level 1)

4개 고정 스타일. AI는 이 중에서만 선택.

| preset | 용도 | HWP 서식 |
|---|---|---|
| `heading-accent` | 블록 제목 | 12pt bold, teal(#0F766E) 배경 흰 글씨, 좌측 4px accent bar |
| `body-plain` | 일반 본문 (해석·요약) | 11pt regular, 검정, 줄간격 1.3 |
| `body-muted` | 보조 설명 (배경지식) | 10pt regular, #475569 회색, 줄간격 1.2 |
| `callout-box` | 강조 (정답 포인트) | 11pt, #FEF3C7 연노랑 배경, 1px #F59E0B 테두리 |

**AI 매핑 예시** (프롬프트로 지시):
- `vocabulary` → 자동으로 표(table) + `body-plain` 셀 + `heading-accent` 헤더
- `translation` → `body-plain` 글상자
- `answer_explanation` → `callout-box` 글상자
- `background` → `body-muted` 글상자

---

## 5. Templates (3종 하드코딩)

| 템플릿 ID | 이름 | 용도 | 허용 블록 | 레이아웃 |
|---|---|---|---|---|
| `exam-2col` | 시험지 A4 2단 | 문제 푸는 학생용 | `vocabulary`(간단), `custom`(힌트 1줄) | 2단, 지문 + 다이어그램만 |
| `answer-1col` | 해설지 세로 1단 | 교사·자습용 | 전부 허용 | 1단, 지문 → 어휘 → 다이어그램 → 해설 → 배경 |
| `vocab-note` | 어휘노트 | 단어장 | `vocabulary`만 | 1단, 지문별 어휘표만 집약 |

템플릿은 `lib/hwp-template-engine.ts`에서 다음 인터페이스로 정의:

```ts
interface Template {
  id: string
  name: string
  allowedBlockTypes: BlockType[]
  pageColumns: 1 | 2
  blockOrder: BlockType[]           // 렌더 순서
  includeDiagram: boolean
  includeOriginalPassage: boolean
}
```

---

## 6. HWP primitives (Phase 4)

`lib/hwp-utils.ts`에 다음 함수 추가:

```ts
// 글상자 (사각형 안에 문단)
function buildTextboxXml(text: string, preset: StylePreset): string

// 표 (N행 × M열)
function buildTableXml(rows: string[][], preset: StylePreset, hasHeader: boolean): string

// 기존 insertPngAt과 유사한 시그니처
function insertTextboxAt(hwp, sectionIdx, paraIdx, xml): HwpDoc
function insertTableAt(hwp, sectionIdx, paraIdx, xml): HwpDoc
```

HWP XML primitive는 `GSO` (Graphic Shape Object) / `TABLE` 태그 기반. 참고: 기존 `insertPng` 구현에서 이미 GSO 래핑 패턴 확보됨.

---

## 7. UI additions (test-hwp page)

신규 섹션을 `app/[lang]/test-hwp/page.tsx`에 추가:

```
┌─ 🧠 AI 한글 콘텐츠 생성 ────────────────────────┐
│ [템플릿] ▼ 해설지 세로 1단                      │
│ [프롬프트] "해석 + 핵심 어휘 6개 + 오답 해설"  │
│                                                 │
│ ☑ vocab → diagram 순서 자동 강제 (권장)        │
│                                                 │
│ [🚀 N개 지문 일괄 생성]                         │
└─────────────────────────────────────────────────┘

[미리보기 패널] - inline-ai style (지문별 아코디언)
  ▼ Q18 주제 파악
    📝 해석:  ...
    📚 어휘 (표): creativity | 창의성 ...
    🎨 다이어그램: [PNG 썸네일]
    💡 해설: ③번이 답인 이유...
  ▶ Q19 빈칸 추론
  ...
```

---

## 8. Files to create/modify

### 신규
```
tasks/korean-content-pipeline.md         ← 이 문서
lib/korean-content-generator.ts          # Zod schemas + client
lib/hwp-template-engine.ts               # Template 정의 + 렌더
lib/hwp-format-rules.ts                  # Level 1 프리셋 + AI 프롬프트
lib/hwp-primitives.ts                    # 글상자/표 XML 빌더
app/api/generate-korean-content/route.ts # AI 엔드포인트
components/test-hwp/KoreanContentPanel.tsx
components/test-hwp/TemplateSelector.tsx
components/test-hwp/EnrichmentPreview.tsx
```

### 수정
```
app/[lang]/test-hwp/page.tsx             # 신규 UI 섹션 추가
lib/passage-pipeline.ts                  # enrichPassage 오케스트레이션 추가
lib/hwp-utils.ts                         # insertTextboxAt/insertTableAt 노출
```

---

## 9. Phased rollout

| Phase | 범위 | 완료 기준 |
|---|---|---|
| **P1** | `generate-korean-content` API + Zod schema + 간단 UI 패널 (템플릿/프롬프트 없이 text-only) | 지문 1개에 대해 blocks[] JSON 반환 + 화면 표시 |
| **P2** | 서식 프리셋 + AI 매핑 | AI가 block마다 stylePreset 정확히 선택 (수동 검증) |
| **P3** | 템플릿 3종 정의 + TemplateSelector UI | 템플릿 선택 시 allowed blocks / order 필터링 |
| **P4** | HWP 글상자 + 표 프리미티브 + 실제 삽입 | 해설지 템플릿으로 배치 실행 → 다운로드 HWP에 어휘표 + 해설 박스 정상 표시 |
| **P5** | 어휘→다이어그램 순서 강제 + vocab-aware diagram 프롬프트 | 다이어그램이 어휘 블록의 핵심어를 반영 |
| **P6+** | (향후) 비주얼 템플릿 업로드, Level 2 서식, 미리보기 side-by-side | — |

각 Phase 종료 시 **커밋 분리** (conventional commits: `feat(p1-korean): ...`).

---

## 10. Open questions / risks

1. **HWP 글상자 XML 호환성** — GSO 태그가 한글 2018 / 한글 오피스 / LibreOffice 버전에 따라 호환 이슈 가능성. Phase 4 시작 시 최소 테스트 파일 3종으로 확인.
2. **표 셀 안 줄바꿈** — 어휘 예문이 길 경우. 예문 필드는 `.slice(0, 60)`로 clamp 고려.
3. **AI 출력 길이** — 8 blocks × 4000 chars = 32KB. generateObject max output token 확인 필요.
4. **프롬프트 → 블록 타입 매핑 실패** — 사용자가 "수능 대비 팁 추가" 같은 자유 요청 시 `custom` 타입으로 fallback. 프롬프트에서 enum 강제.
5. **어휘 표 셀 개수** — 2열(word/meaning) vs 3열(+example). 3열은 2단 레이아웃에서 공간 부족. 템플릿별 기본값 다르게.

---

## 11. Inspiration: inline-ai.com

- ✅ 사이드바 비교 패널 → `EnrichmentPreview.tsx`로 반영
- ✅ "AI 제안 근거" → 각 block에 `reasoning?: string` 옵션 필드 추가 고려 (Phase 2)
- ✅ 문서 구조 인식 자동 위치 결정 → 이미 확보됨 (sectionIdx/insertAfterParaIdx)
- ✅ 양식 자동 채움 (표/각주) → Phase 4 글상자/표 프리미티브로 동일 패턴

---

## Next action
→ Phase 1 착수: `lib/korean-content-generator.ts` + `app/api/generate-korean-content/route.ts` 스캐폴딩
