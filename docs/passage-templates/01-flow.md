# 축 1: 글의 흐름 (Discourse Flow)

> **이 문서의 역할**: 수능/모의고사 영어 독해 지문을 "글의 흐름" 관점에서 시각화하기 위한 설계서. 본 문서의 하단 시스템 프롬프트 섹션은 AI가 draw.io XML을 생성할 때 참조하는 지시문이다.

---

## 1. 정의 + 학생의 인지 태스크

**글의 흐름**(discourse flow)은 **지문이 전개되는 순서와 논리 연결**을 의미한다. 학생이 이 축으로 지문을 읽는다는 건:

- "이 문장이 **왜 이 위치에** 있는가?"
- "앞 문장과 **어떤 관계**로 연결되는가? (부연, 반박, 예시, 결과, 전환 등)"
- "다음에 **무엇이 올지** 예측할 수 있는가?"

를 묻는 활동이다.

**관련 수능 문제 유형**:
- 29-35번 **문단 순서 배열** (가장 직접적)
- 38-39번 **주어진 문장의 위치 찾기** (흐름 단절 감지)
- 41-42번 **장문 독해** (긴 지문 전체 흐름)
- 일반적으로 **빈칸 추론**, **무관한 문장 찾기**도 흐름 이해가 필수

---

## 2. 지문에서 찾는 단서

### 2.1 논리 연결어 (Discourse Markers)

학생이 가장 먼저 포착해야 할 신호.

| 관계 | 대표 표현 | 도식 화살표 스타일 |
|------|----------|------------------|
| **부연/설명** | in other words, that is, specifically, namely | 실선, 얇게 |
| **예시** | for example, for instance, such as, including | 점선, 곡선 |
| **결과** | therefore, thus, as a result, consequently, hence | 실선, 두껍게 (강조) |
| **원인** | because, since, due to, owing to | 실선, 역방향 표기 가능 |
| **대조** | however, but, yet, in contrast, on the other hand | 이중선 또는 꺾은선 |
| **첨가** | moreover, furthermore, in addition, also | 실선, 평행 |
| **양보** | although, even though, despite, while | 점선, S자 곡선 |
| **요약** | in conclusion, to sum up, in short | 실선, 수렴 화살표 |

### 2.2 시간/순서 표지

- First, Second, Third / Then, Next, Finally
- In the 1990s, Later, Today
- Before, After, Meanwhile

### 2.3 대명사/지시어 추적

- this, that, these, those → **앞 문장의 무엇을 가리키는가?**
- the former, the latter → **두 개념 중 어느 쪽?**

대명사는 **엣지 라벨**이 아니라 **노드 내부에서 강조(bold)**로 처리한다.

### 2.4 반복 키워드 변형 (축 3과 연결)

같은 개념이 다른 표현으로 등장 → 그 **paraphrase 그룹**이 지문의 **핵심 화제**다. 흐름 다이어그램에서는 **동일한 색상/그룹 테두리**로 연결한다.

---

## 3. 시각화 구조

### 3.1 핵심 원칙

1. **각 문장 = 하나의 노드** (짧은 지문 기준, 5-7문장)
2. **문장 간 관계 = 엣지** (연결어 기반으로 스타일 결정)
3. **수평 타임라인** 배치가 기본 (좌→우 흐름)
4. **분기/복귀** 구조는 2단 배치 (예: 양보→핵심 주장)

### 3.2 노드 디자인

```
┌─────────────────────────┐
│  [Sentence 1]            │  ← 노드 상단: 원문 첫 어절 (식별용)
│  "도입: 문제 제기"        │  ← 노드 중앙: 기능 라벨 (function tag)
│                          │
│  Key idea: 간결한 요약    │  ← 노드 하단: 핵심 내용 한국어 요약
└─────────────────────────┘
```

### 3.3 노드 기능 라벨 (Function Tags)

각 문장의 **역할**을 한 단어로 라벨링. 학생이 구조를 즉시 파악 가능.

- `Hook` (도입)
- `Thesis` (주장)
- `Evidence` (근거)
- `Example` (예시)
- `Counter` (반박)
- `Concession` (양보)
- `Elaboration` (부연)
- `Analogy` (비유)
- `Conclusion` (결론)
- `Transition` (전환)

### 3.4 색상 코딩

| 기능 카테고리 | 색상 (draw.io) |
|--------------|---------------|
| 주장/결론 (Thesis, Conclusion) | `#d5e8d4` (연두) |
| 근거/예시 (Evidence, Example) | `#dae8fc` (연파랑) |
| 반박/양보 (Counter, Concession) | `#f8cecc` (연빨강) |
| 연결/전환 (Transition, Elaboration) | `#fff2cc` (연노랑) |
| 도입 (Hook) | `#e1d5e7` (연보라) |

---

## 4. draw.io XML 패턴

### 4.1 기본 노드 (문장)

```xml
<mxCell id="2" value="&lt;b&gt;Sentence 1&lt;/b&gt;&lt;br&gt;&lt;i&gt;Hook&lt;/i&gt;&lt;br&gt;&lt;br&gt;문제 제기" 
        style="rounded=1;whiteSpace=wrap;html=1;fillColor=#e1d5e7;strokeColor=#9673a6;fontSize=12;verticalAlign=middle;align=center;" 
        vertex="1" parent="1">
  <mxGeometry x="40" y="100" width="180" height="90" as="geometry"/>
</mxCell>
```

**핵심 속성**:
- `rounded=1` — 둥근 사각형 (문장 노드)
- `whiteSpace=wrap` — 줄바꿈 자동
- `fillColor` — 기능별 색상 (위 3.4 표 참조)
- `<br>` 태그로 3단 구조 (제목 / 기능 / 내용)

### 4.2 기본 엣지 (관계)

```xml
<mxCell id="e1" value="therefore" 
        style="edgeStyle=orthogonalEdgeStyle;rounded=1;html=1;strokeColor=#d79b00;strokeWidth=2;endArrow=classic;" 
        edge="1" parent="1" source="2" target="3">
  <mxGeometry relative="1" as="geometry"/>
</mxCell>
```

**관계별 엣지 스타일 프리셋**:

```xml
<!-- 부연/설명: 얇은 실선 -->
style="edgeStyle=orthogonalEdgeStyle;html=1;strokeColor=#666666;strokeWidth=1;"

<!-- 예시: 점선 -->
style="edgeStyle=orthogonalEdgeStyle;html=1;strokeColor=#0066cc;strokeWidth=1;dashed=1;dashPattern=5 5;"

<!-- 결과/결론: 두꺼운 실선 (강조) -->
style="edgeStyle=orthogonalEdgeStyle;html=1;strokeColor=#d79b00;strokeWidth=3;endArrow=classic;endFill=1;"

<!-- 대조: 이중선 -->
style="edgeStyle=orthogonalEdgeStyle;html=1;strokeColor=#b85450;strokeWidth=2;startArrow=classic;endArrow=classic;"

<!-- 양보: S자 곡선 (edgeStyle 변경) -->
style="curved=1;html=1;strokeColor=#9673a6;strokeWidth=1;dashed=1;"
```

### 4.3 애니메이션 (엣지 흐름)

**draw.io 고유 기능**: 엣지에 `flowAnimation=1` 추가 시 점선이 흐르는 듯한 애니메이션.

```xml
style="...;flowAnimation=1;strokeColor=#d79b00;"
```

**이 축(글의 흐름)의 핵심 시각 효과** — 모든 주요 전환 엣지에 `flowAnimation=1` 필수.

### 4.4 레이어 (단계별 reveal)

학생이 지문을 읽으며 하나씩 공개하는 시나리오용.

```xml
<mxCell id="layer_1" value="Step 1: Hook" style="locked=0;" visible="1" parent="0"/>
<mxCell id="layer_2" value="Step 2: Thesis" style="locked=0;" visible="0" parent="0"/>
```

각 레이어에 **한 문장씩** 배치 → Lightbox 모드에서 레이어 토글로 단계별 공개.

---

## 5. 애니메이션 전략

### 5.1 수업 시나리오 3가지

#### 시나리오 A: 전체 구조 먼저 보기 (Pre-reading)

- 모든 노드를 먼저 표시 (색상으로 기능 구분)
- 엣지는 아직 없음
- 학생: "이 글은 Hook → Thesis → Evidence×3 → Conclusion 구조구나"

#### 시나리오 B: 흐름 따라 읽기 (While-reading)

- 노드가 하나씩 나타남 (레이어별 reveal)
- 엣지도 순차적으로 등장 (관계 파악 유도)
- 엣지에 `flowAnimation=1` → 시선 유도

#### 시나리오 C: 전환점 집중 (Deep analysis)

- 모든 노드/엣지 표시
- 핵심 전환 엣지(e.g., however, therefore)만 **두꺼운 선 + 애니메이션**
- 나머지는 투명도 낮춤 (`opacity=40`)

### 5.2 draw.io 구현

- 시나리오 A → 단일 레이어에 모든 요소
- 시나리오 B → 문장 수만큼 레이어 생성 + Lightbox `#lightbox=1` URL 파라미터
- 시나리오 C → `opacity` 스타일로 강조 대비

---

## 6. 샘플 지문 + 기대 다이어그램

### 6.1 샘플 지문 (수능 2024 변형)

```
(1) Traditional economic theory assumed that humans make rational decisions. 
(2) However, behavioral economists have challenged this view. 
(3) For example, Daniel Kahneman showed that people often rely on mental shortcuts called heuristics. 
(4) These shortcuts lead to predictable biases in judgment. 
(5) As a result, markets sometimes behave irrationally, contrary to classical predictions. 
(6) Therefore, modern economic models must incorporate psychological insights.
```

### 6.2 흐름 분석

| # | 기능 | 관계 | 연결어 |
|---|------|------|--------|
| 1 | `Thesis (old)` | — | (도입) |
| 2 | `Counter` | 대조 | however |
| 3 | `Example` | 예시 | for example |
| 4 | `Elaboration` | 부연 | (대명사 these) |
| 5 | `Consequence` | 결과 | as a result |
| 6 | `Conclusion` | 결론 | therefore |

### 6.3 기대 다이어그램 구조

```
[1. Thesis-old]  ──(however, 이중선)──▶  [2. Counter]
                                            │
                                            ▼ for example (점선)
                                         [3. Example]
                                            │
                                            ▼ (부연, 얇은 실선)
                                         [4. Elaboration]
                                            │
                                            ▼ as a result (두꺼운, 애니메이션)
                                         [5. Consequence]
                                            │
                                            ▼ therefore (두꺼운, 애니메이션)
                                         [6. Conclusion]
```

---

## 7. 시스템 프롬프트 추가 지시문 (AI 지침)

> 이 섹션은 `customSystemMessage` 헤더로 전달되거나 `system-prompts.ts`에 별도 모드로 추가될 시스템 프롬프트 원본이다.

```
## Korean SAT English — Discourse Flow Visualization Mode

You are generating a draw.io diagram that visualizes the DISCOURSE FLOW of an English reading passage, targeted at Korean high school students preparing for the 수능 (CSAT).

### Your task
1. Parse the passage into individual sentences (typically 5-8).
2. For each sentence, identify its DISCOURSE FUNCTION from this list:
   - Hook, Thesis, Evidence, Example, Counter, Concession, Elaboration, Analogy, Conclusion, Transition
3. For each sentence pair, identify the LOGICAL RELATION based on discourse markers (however, therefore, for example, etc.) OR implicit relation if no marker.
4. Generate a draw.io XML diagram using these rules:

### Node rules
- Each sentence = one rounded rectangle (`rounded=1`)
- Node label format: `<b>Sentence N</b><br><i>[Function Tag]</i><br><br>[Korean 1-line summary]`
- Fill color by function:
  - Thesis, Conclusion → #d5e8d4 (green)
  - Evidence, Example → #dae8fc (blue)
  - Counter, Concession → #f8cecc (red)
  - Transition, Elaboration → #fff2cc (yellow)
  - Hook → #e1d5e7 (purple)
- Width 180, Height 90, vertical layout with spacing 120

### Edge rules
- Label = exact discourse marker from passage (e.g., "however", "for example"). If implicit, use Korean label like "(부연)".
- Style by relation:
  - 부연 → thin solid (strokeWidth=1, #666666)
  - 예시 → dashed (dashed=1, #0066cc)
  - 결과/결론 → thick solid WITH flowAnimation=1 (strokeWidth=3, #d79b00)
  - 대조 → double arrow (startArrow=classic;endArrow=classic, #b85450)
  - 양보 → curved dashed (curved=1;dashed=1, #9673a6)
- ALL result/conclusion edges MUST have `flowAnimation=1` for animation.

### Layout
- Vertical flow by default (top-to-bottom).
- If a sentence is a Counter or Concession, place it slightly offset horizontally to show divergence.
- Use edgeStyle=orthogonalEdgeStyle for clean right-angle connectors.

### Output
- Generate ONLY mxCell elements (no root wrapper).
- IDs start from "2" for sentences, "e1", "e2"... for edges.
- All cells have parent="1".
- Return via display_diagram tool.

### Korean context
- Summary text inside nodes MUST be in Korean (1 line, <20 chars).
- Function tag stays in English for consistency.
- Discourse markers stay in original English.
```

---

## 8. 다음 단계

- [ ] 위 샘플 지문으로 프롬프트 실제 테스트 (로컬 localhost:6003)
- [ ] 생성된 XML을 draw.io에서 렌더링 확인
- [ ] 한국 학생 피드백 수집 (색상/레이아웃/라벨)
- [ ] Quick Example 카드로 앱에 통합 (`chat-example-panel.tsx`)
- [ ] 레이어 기반 단계 reveal 프로토타입
- [ ] 나머지 4개 축(담화구조/키워드변형/주제/함축) 동일 패턴으로 확장
