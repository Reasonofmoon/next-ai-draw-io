# RHWP × Draw.io 연동 기획서

> **목표**: 한국 영어 교사가 HWP 학습지를 업로드하면, 수능 지문마다 AI가 구조 다이어그램을 자동 생성하고, 결과를 HWP에 삽입하거나 독립 출력하는 파이프라인.
> **핵심 기술**: [RHWP](https://github.com/edwardkim/rhwp) (Rust/WASM HWP 파서) + [next-ai-draw-io](https://github.com/Reasonofmoon/next-ai-draw-io) (AI 다이어그램 생성기)

---

## 1. 현재 도구별 역할 분석

### RHWP (edwardkim/rhwp)

| 기능 | 활용 | 우리에게 필요한 것 |
|------|------|-------------------|
| HWP 파싱 | 교사 HWP 파일 → 텍스트 추출 | `@rhwp/core` npm 패키지로 브라우저에서 파싱 |
| Canvas/SVG 렌더링 | HWP 미리보기 표시 | 학습지 원본 확인용 |
| hwpctl API | 자동 편집 명령 | 다이어그램 이미지를 HWP에 삽입 |
| HWP 직렬화 | 수정된 HWP 저장 | 다이어그램 삽입 후 다시 HWP로 출력 |

### next-ai-draw-io

| 기능 | 활용 | 우리에게 필요한 것 |
|------|------|-------------------|
| AI 다이어그램 생성 | 지문 → draw.io XML | Gemini API로 구조 분석 + XML 생성 |
| draw.io 에디터 | 다이어그램 편집 | 생성된 다이어그램 미세 조정 |
| PNG/SVG 내보내기 | 이미지 출력 | HWP 삽입용 이미지 생성 |
| 공유 URL | 학생 배포 | Lightbox 링크 카톡 전송 |

---

## 2. 연동 아키텍처 — 4가지 접근법

### 접근법 A: 분리형 (Separate Pipeline) ⭐ MVP 추천

**원리**: 두 앱을 별도로 유지하되, 파일 기반으로 연결.

```
[교사] → HWP 업로드 → [RHWP 파서] → 텍스트 추출 → [next-ai-draw-io] → 다이어그램
                                                                              ↓
                                                                    [PNG/SVG 다운로드]
                                                                              ↓
                                                              [교사가 수동으로 HWP에 삽입]
```

**장점**: 가장 빠르게 구현. 기존 두 앱 코드 변경 최소.
**단점**: 교사가 수동으로 이미지를 HWP에 삽입해야 함.

**구현 포인트**:
1. next-ai-draw-io의 "Paper to Diagram" 기능에 `.hwp` 확장자 추가
2. `@rhwp/core` WASM으로 HWP → 텍스트 변환 레이어 추가
3. 변환된 텍스트를 기존 AI 파이프라인에 주입

**필요 작업**:
- `lib/hwp-utils.ts` 신규 — @rhwp/core 래퍼
- `lib/pdf-utils.ts` 수정 — HWP 파일 감지 + hwp-utils 호출
- 파일 업로드 UI에 `.hwp`, `.hwpx` 확장자 추가

---

### 접근법 B: 임베디드 (Embedded Integration) ⭐⭐ 중기 목표

**원리**: next-ai-draw-io 안에 RHWP 뷰어를 임베드. 왼쪽=HWP, 오른쪽=Draw.io.

```
┌──────────────────────────────────────────────────────┐
│  📄 HWP 뷰어 (RHWP)    │  📊 Draw.io 에디터         │
│                         │                            │
│  [수능 지문 하이라이트]   │  [구조 다이어그램]          │
│  ────────────────────   │  ────────────────────      │
│  Traditional economic   │  [Hook] ── [Counter]       │
│  theory assumed...      │       │                    │
│  ▶ However, behavioral  │  [Example] ── [Evidence]   │
│  economists have...     │       │                    │
│                         │  [Conclusion]              │
│  [지문 선택] [분석 시작]  │  [다운로드] [공유] [삽입]   │
└──────────────────────────────────────────────────────┘
```

**장점**: 교사가 한 화면에서 HWP 보면서 다이어그램 생성. UX 최고.
**단점**: RHWP 에디터 임베드 복잡도. 두 에디터 간 상태 동기화 필요.

**구현 포인트**:
1. `@rhwp/editor` npm 패키지를 iframe으로 임베드
2. 사용자가 HWP 내 텍스트 범위 선택 → postMessage로 선택 텍스트 전달
3. 선택 텍스트를 AI에 전달 → 다이어그램 생성
4. "HWP에 삽입" 버튼 → 다이어그램 PNG를 hwpctl API로 HWP에 삽입

**필요 작업**:
- `@rhwp/editor` 패키지 설치 + iframe 래퍼 컴포넌트
- HWP 텍스트 선택 → postMessage 통신 레이어
- hwpctl `InsertPicture` 명령 연동
- 레이아웃 변경 (3패널: HWP | Chat | Draw.io)

---

### 접근법 C: RHWP 플러그인 (Plugin Approach)

**원리**: RHWP 에디터에 "다이어그램 생성" 플러그인 추가. RHWP가 호스트.

```
[RHWP 에디터]
    ↓ 텍스트 선택
[플러그인: "Draw.io 다이어그램 생성"]
    ↓ API 호출
[next-ai-draw-io API 엔드포인트]
    ↓ 결과 반환
[RHWP 에디터에 이미지 삽입]
```

**장점**: RHWP 사용자에게 자연스러운 워크플로우. HWP ↔ 다이어그램 완전 자동화.
**단점**: RHWP 코드를 fork/수정해야 함. RHWP 프로젝트 의존성 증가.

**구현 포인트**:
1. RHWP의 hwpctl 확장 — `GenerateDiagram` 액션 추가
2. next-ai-draw-io의 `/api/chat` 엔드포인트를 외부 API로 노출
3. RHWP 플러그인이 API 호출 → draw.io XML → PNG 변환 → HWP 삽입

---

### 접근법 D: 배치 변환기 (Batch Converter) ⭐⭐⭐ 교사 최대 가치

**원리**: HWP 파일 전체를 분석해서 모든 영어 지문을 한 번에 다이어그램화.

```
[교사: HWP 학습지 업로드 (20번~45번 수능 문제)]
    ↓
[RHWP 파서: 텍스트 추출 + 문제 번호별 분리]
    ↓
[AI 배치 분석: 각 지문별 유형 자동 분류]
    ↓
[다이어그램 배치 생성: 지문별 최적 구조 다이어그램]
    ↓
[출력 3종]
├── 📄 다이어그램 삽입된 HWP (교사 배포용)
├── 🔗 지문별 인터랙티브 URL 모음 (학생 자습용)
└── 🎨 이미지 ZIP (블로그/교재용)
```

**장점**: 교사에게 가장 큰 시간 절약. "HWP 올리면 끝" UX.
**단점**: 구현 복잡도 최고. 문제 번호 인식, 지문 영역 감지 로직 필요.

**구현 포인트**:
1. HWP 전문 파서 — 수능/모의고사 레이아웃 패턴 인식
2. 영어 지문 영역 자동 감지 (번호 + 밑줄 + 영어 텍스트 패턴)
3. AI 배치 처리 — 여러 지문을 순차 분석
4. HWP 직렬화 — 다이어그램 이미지를 각 지문 옆에 삽입
5. ZIP 패키징 — 이미지 + URL 목록 + 수정된 HWP

---

## 3. 추천 로드맵

### Phase 0: 기술 검증 (1-2일)

**목표**: @rhwp/core로 HWP 텍스트 추출이 실제로 작동하는지 확인.

```bash
# next-ai-draw-io 프로젝트에서
npm install @rhwp/core

# 테스트: 수능 HWP 파일 텍스트 추출
```

**검증 항목**:
- [ ] @rhwp/core WASM이 Next.js 16 환경에서 로드되는가?
- [ ] HWP 파일의 영어 텍스트가 정확히 추출되는가?
- [ ] 문제 번호/영역이 구분되는가?
- [ ] HWPX 형식도 지원되는가?

### Phase 1: 분리형 MVP (1주)

**접근법 A 구현**. HWP를 "Paper to Diagram" 입력 형식에 추가.

```
교사 → HWP 업로드 → 텍스트 추출 → AI 다이어그램 → PNG/URL 출력
```

**핵심 파일**:
- `lib/hwp-utils.ts` — @rhwp/core 텍스트 추출 래퍼
- `lib/pdf-utils.ts` 수정 — `.hwp` 확장자 감지
- `components/chat-example-panel.tsx` — "HWP 학습지 분석" Quick Example 추가

### Phase 2: 배치 변환기 UI (2-3주)

**접근법 D 기본형**. HWP 전체 분석 + 지문별 다이어그램 배치 생성.

**신규 페이지**: `/hwp-batch` (또는 모달)
- HWP 업로드
- 감지된 지문 목록 표시 (체크박스 선택)
- "전체 분석" 버튼
- 결과: 지문별 다이어그램 카드 + 일괄 다운로드

### Phase 3: 임베디드 뷰어 (1-2개월)

**접근법 B**. RHWP 에디터와 Draw.io를 나란히 배치. HWP ↔ 다이어그램 양방향 연동.

---

## 4. 핵심 기술 이슈 + 해결책

### 이슈 1: WASM + Next.js 호환성

`@rhwp/core`는 WASM 모듈. Next.js SSR에서 WASM 로드 시 문제 발생 가능.

**해결책**: dynamic import + 클라이언트 전용 로딩

```typescript
// lib/hwp-utils.ts
const loadRhwpCore = async () => {
  if (typeof window === 'undefined') return null
  const rhwp = await import('@rhwp/core')
  await rhwp.default() // WASM 초기화
  return rhwp
}
```

### 이슈 2: HWP에서 영어 지문 영역 감지

수능 HWP 파일은 보통 이런 구조:
```
[18] 글의 목적으로 가장 적절한 것은?
Dear Mr. Thompson,
I am writing to inform you...
① 불만 제기  ② 초대  ③ 감사  ④ ...
```

**감지 알고리즘**:
1. 번호 패턴 `[숫자]` 또는 `숫자.` 로 문제 경계 감지
2. 영어 텍스트 비율 > 70% 인 블록 = 영어 지문
3. 보기 패턴 `①②③④⑤` 로 지문 끝 경계 감지
4. 지시문(한국어) 별도 분리

### 이슈 3: HWP에 다이어그램 이미지 재삽입

RHWP의 hwpctl API 중 이미지 삽입 가능:
```typescript
// hwpctl InsertPicture 호환 API
editor.execute('InsertPicture', {
  path: diagramPngBlob,
  width: 400,
  height: 300,
  wrappingType: 'TopAndBottom'
})
```

**주의**: RHWP의 serializer가 이미지 삽입된 HWP를 올바르게 저장하는지 검증 필요.

### 이슈 4: @rhwp/core npm 패키지 상태

2026년 4월 기준 npm에 `@rhwp/core`와 `@rhwp/editor`가 등록돼있는지 확인 필요.
없으면 GitHub 리포에서 직접 빌드해야 함.

**확인 방법**:
```bash
npm info @rhwp/core
npm info @rhwp/editor
```

---

## 5. 교사 UX 시나리오 (완성형 비전)

### 시나리오: 김영어 선생님의 수요일 밤

1. **20:00** — 내일 수업용 모의고사 학습지 준비
2. **20:01** — drawio-english.vercel.app 접속
3. **20:02** — "HWP 학습지 분석" 버튼 → 수능 분석지.hwp 업로드
4. **20:03** — 시스템 자동 감지: "18번~45번, 영어 지문 28개 발견"
5. **20:04** — "전체 분석 시작" → 진행률 바 표시
6. **20:08** — 28개 지문별 구조 다이어그램 생성 완료
   - 각 다이어그램: 기능별 색상, 논리 구조, 한국어 요약 포함
7. **20:10** — 결과 확인 + 2-3개 미세 조정 (노드 위치 드래그)
8. **20:12** — "학습지 출력" 클릭:
   - ✅ 다이어그램 삽입된 HWP 다운로드 (복사실 맡길 파일)
   - ✅ 지문별 인터랙티브 URL 28개 (학생 카톡 그룹에 전송)
   - ✅ 고화질 이미지 ZIP (블로그 포스팅용)
9. **20:15** — "선생님, 이번에도 구조 다이어그램 학습지 나온대!" — 학생 단톡방

**절약 시간**: 기존 수동 작업 2-3시간 → 자동화 15분

---

## 6. 경쟁력 분석

| 요소 | 기존 도구 | RHWP × Draw.io |
|------|----------|----------------|
| HWP 지원 | ❌ (대부분 PDF/Word만) | ✅ 네이티브 HWP 파싱 |
| AI 다이어그램 | ❌ | ✅ 지문 유형별 자동 생성 |
| 수능 특화 | ❌ | ✅ 문제 유형별 시각화 전략 |
| 교사 워크플로우 | ❌ 도구 여러 개 전환 | ✅ 원스톱 (업로드→출력) |
| 비용 | 유료 (한컴, Canva 등) | ✅ 무료 오픈소스 |
| 학생 배포 | 인쇄만 | ✅ 인쇄 + URL + 이미지 |

**시장 독점 가능성**: "HWP 학습지 → AI 구조 다이어그램" = **전 세계에서 이 도구만 가능**

---

## 7. 즉시 실행 가능한 첫 단계

### Step 1: @rhwp/core 호환성 검증 (30분)

```bash
cd F:\dev\next-ai-draw-io
npm info @rhwp/core
# 없으면: git clone https://github.com/edwardkim/rhwp.git 후 로컬 빌드
```

### Step 2: 수능 HWP 파일 준비 (교사 시뮬레이션)

- 수능/모의고사 HWP 파일 1개 확보 (EBS, 대성 등 공개 자료)
- 이 파일을 테스트 입력으로 사용

### Step 3: 텍스트 추출 PoC

```typescript
// lib/hwp-utils.ts (Proof of Concept)
import init, { parse_hwp } from '@rhwp/core'

export async function extractTextFromHwp(file: File): Promise<string> {
  await init() // WASM 초기화
  const buffer = await file.arrayBuffer()
  const doc = parse_hwp(new Uint8Array(buffer))
  return doc.text() // 전체 텍스트
}
```

### Step 4: 영어 지문 분리기 PoC

```typescript
// lib/passage-detector.ts
interface DetectedPassage {
  questionNumber: number
  questionType: string // 주제, 요지, 빈칸, 순서 등
  koreanInstruction: string
  englishPassage: string
  choices?: string[]
}

export function detectPassages(fullText: string): DetectedPassage[] {
  // 1. [숫자] 또는 숫자. 패턴으로 문제 경계 감지
  // 2. 영어 텍스트 블록 추출
  // 3. 보기 ①②③④⑤ 패턴으로 끝 경계 감지
  // 4. 지시문에서 문제 유형 추출
}
```

---

## 8. 리스크 + 완화 전략

| 리스크 | 확률 | 영향 | 완화 |
|--------|------|------|------|
| @rhwp/core npm 미등록 | 중 | 높음 | 로컬 빌드 or 번들 |
| WASM + Next.js SSR 충돌 | 중 | 중 | dynamic import + CSR only |
| HWP 파일 구조가 비표준 (교사별 차이) | 높음 | 중 | 폴백: 전체 텍스트 + AI 감지 |
| RHWP 프로젝트 라이선스 충돌 | 낮음 | 높음 | MIT 라이선스 → 상업 사용 가능 |
| 수능 지문 저작권 | 중 | 중 | 교육 목적 공정 사용 + EBS 공개 자료 활용 |

---

## 9. 요약 — 한 문장으로

> **한국 영어 교사의 HWP 학습지에서 수능 지문을 자동 추출 → AI가 유형별 구조 다이어그램 생성 → 학습지/URL/이미지 3종 출력** — RHWP(오픈소스 HWP 파서)와 next-ai-draw-io(AI 다이어그램 생성기)의 연동으로 세계 유일의 "HWP → 영어 독해 시각화" 도구.
