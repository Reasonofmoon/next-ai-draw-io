# 축 1 보강: 구조적 레이아웃 (Structural Layout)

> **이전 문제**: 첫 프로토타입(01-flow.md)은 모든 문장을 수직 일렬로 배치 → 학생에게 "순서대로 읽자"는 메시지만 전달. 수능 독해에서 필요한 "논리적 역할 구분"이 안 드러남.
> **이 문서의 목표**: 지문의 논리 구조에 따라 **공간 배치를 달리**하는 6가지 구조 패턴 정의.

---

## 1. 구조적 vs 선형적

| 관점 | 선형적 | 구조적 |
|------|-------|--------|
| 배치 | 모든 노드가 같은 수직선 | 기능별로 다른 위치 |
| 학생 인지 | "읽는 순서" | "논리적 역할" |
| 적합한 지문 | 서사/절차 (단순 순서) | 논증/대조/분석 (역할 구분 필요) |
| 수능 문제 | 29-30번(순서배열) | 빈칸 추론, 주제, 요지, 함축 전반 |

**수능 독해 지문 대부분은 구조적 배치가 적합하다** — 단순 시간 순서인 경우가 거의 없기 때문.

---

## 2. 6가지 구조 패턴

AI가 지문 분석 후 이 중 하나를 **자동 선택**하도록 한다.

### 2.1 Contrast-Resolution (대조-통합) ⭐ 가장 빈번

**형태**:
```
  [A 관점]              [B 관점]
      │                    │
      └────[대조 축]───────┘
                │
         [통합/결론]
```

**트리거 단서**:
- however, but, in contrast, on the other hand
- 시간 표지 (traditional vs modern, old vs new)
- Thesis-Counter 쌍 존재

**수능 예시**: 본 샘플 지문(행동경제학)

**좌우 배치 규칙**:
- 좌측: Hook, Thesis (전통/기존 관점) — 보통 비판받는 쪽
- 우측: Counter, Example, Evidence (새 관점의 근거)
- 중앙 하단: Conclusion (통합)

---

### 2.2 Central-Radial (중심-방사) — 정의/설명 지문

**형태**:
```
           [Evidence 1]
                │
 [Example] ── [핵심 개념] ── [Analogy]
                │
           [Elaboration]
```

**트리거 단서**:
- "X is defined as...", "X refers to..."
- 하나의 핵심 개념을 여러 각도로 설명
- for example, such as, for instance 다중 등장

**수능 예시**: "생체 모방 기술" 같은 개념 설명문

**배치 규칙**:
- 중앙: Thesis (핵심 정의/개념)
- 사방: Evidence, Example, Analogy, Elaboration (네 각도)

---

### 2.3 Problem-Solution (문제-해결)

**형태**:
```
   [문제 진술]
        │
   [원인 분석]
        │
   [해결책 A] ── [해결책 B] ── [해결책 C]
        │         │             │
        └─────[통합 효과]────────┘
```

**트리거 단서**:
- "The issue is...", "challenge", "problem"
- "However, we can...", "one solution", "address this"
- to solve, to address, to overcome

**수능 예시**: 환경/사회 문제 지문

**배치 규칙**:
- 상단: Problem + Cause (단일 열)
- 중단: Solutions (수평 병렬)
- 하단: Outcome (통합)

---

### 2.4 Cause-Effect-Chain (인과 연쇄)

**형태**:
```
[원인 1] → [결과 1/원인 2] → [결과 2/원인 3] → [최종 결과]
```

**트리거 단서**:
- because, since, as a result, therefore, consequently (연속적)
- 각 문장이 앞 문장의 결과를 다시 원인으로 사용

**수능 예시**: 과학 프로세스, 경제 연쇄 반응

**배치 규칙**:
- 수평 직렬 (좌→우)
- 엣지 두껍게 + flowAnimation (연쇄 강조)
- **이건 선형적 배치가 정당한 유일한 케이스**

---

### 2.5 Hierarchy-Support (계층-지지)

**형태**:
```
              [주제]
                │
       ┌────────┼────────┐
   [근거1]   [근거2]   [근거3]
      │         │         │
  [세부]      [세부]     [세부]
```

**트리거 단서**:
- 주제문 + 3개 이상의 병렬 근거
- first, second, third / one, another, finally
- 각 근거가 주제와 직접 연결되지만 서로 독립적

**수능 예시**: 에세이형 주제 증명 지문

**배치 규칙**:
- 상단: Thesis
- 중단: 3-4개 Evidence 수평 배치
- 하단: 각 Evidence 아래 세부 Elaboration

---

### 2.6 Concession-Assertion (양보-주장)

**형태**:
```
    [양보: ~인 것은 사실]
             │
        (그러나)
             ▼
   [핵심 주장: 진짜 중요한 것]
             │
       [근거 1, 2, 3]
```

**트리거 단서**:
- although, even though, while, despite
- "It's true that... but...", "Granted..."
- 양보 구문이 지문 앞부분에 등장

**수능 예시**: 함축 추론 지문, 논설문

**배치 규칙**:
- 상단: Concession (투명도 낮게, opacity=60)
- 중단: Main Assertion (강조, 두꺼운 테두리)
- 하단: Supporting Evidence

---

## 3. 패턴 선택 알고리즘 (AI 지침)

AI가 지문을 받으면 **이 순서로** 검사:

1. **양보 구문**(although, while, despite)이 앞부분에 있나? → 2.6 Concession-Assertion
2. **명확한 대조**(however + Thesis vs Counter)가 있나? → 2.1 Contrast-Resolution
3. **문제-해결 프레임**(problem... solution)인가? → 2.3 Problem-Solution
4. **인과 연쇄**(3개 이상의 because/therefore)인가? → 2.4 Cause-Effect-Chain
5. **3개 이상의 병렬 근거**(first, second, third)인가? → 2.5 Hierarchy-Support
6. **하나의 개념 + 다각도 설명**인가? → 2.2 Central-Radial
7. 그 외 → 기본 수직 선형 (01-flow.md)

---

## 4. 샘플 지문 재분석 — Contrast-Resolution 적용

### 지문 (동일)
```
(1) Traditional economic theory assumed that humans make rational decisions. 
(2) However, behavioral economists have challenged this view. 
(3) For example, Daniel Kahneman showed that people often rely on mental shortcuts called heuristics. 
(4) These shortcuts lead to predictable biases in judgment. 
(5) As a result, markets sometimes behave irrationally, contrary to classical predictions. 
(6) Therefore, modern economic models must incorporate psychological insights.
```

### 구조 분석

- **좌측 (전통 관점)**: (1) Traditional theory
- **우측 (새 관점)**: (2) Counter → (3) Example → (4) Elaboration → (5) Evidence
- **중앙 하단 (통합)**: (6) Conclusion

### 기대 레이아웃

```
┌────────────────┐                    ┌────────────────┐
│  (1) Hook      │                    │  (2) Counter   │
│  전통 경제이론  │ ──── however ───▶  │  행동경제학 등장│
└────────────────┘                    └────────────────┘
                                              │
                                         for example
                                              ▼
                                      ┌────────────────┐
                                      │  (3) Example   │
                                      │  카너먼 휴리스틱 │
                                      └────────────────┘
                                              │
                                         (부연)
                                              ▼
                                      ┌────────────────┐
                                      │  (4) Elaboration│
                                      │  판단 편향      │
                                      └────────────────┘
                                              │
                                         as a result
                                              ▼
                                      ┌────────────────┐
                                      │  (5) Evidence  │
                                      │  비합리적 시장  │
                                      └────────────────┘
                                              │
                                         therefore
                                              ▼
                       ┌──────────────────────────────────┐
                       │  (6) Conclusion                   │
                       │  심리학적 통찰 반영한 현대 경제학  │
                       └──────────────────────────────────┘
```

**학생이 보는 메시지**:
- 좌측 = 비판받는 쪽 (단 하나만)
- 우측 = 이 글이 주장하는 새 관점 (4개 근거가 받침)
- 하단 = 두 관점을 **통합한 결론**

---

## 5. XML 좌표 규칙

### 5.1 Contrast-Resolution

**좌측 기둥** (x=40):
- Hook/Thesis: x=40, y=20

**우측 기둥** (x=320):
- Counter: x=320, y=20
- 이후 Evidence 체인: x=320, y=140, 260, 380...

**중앙 하단** (x=180):
- Conclusion: x=180, y=(마지막 증거 + 140)

### 5.2 Central-Radial

**중앙** (x=240, y=200):
- Thesis

**4방향** (중앙에서 200px씩):
- 북: x=240, y=20
- 남: x=240, y=380
- 동: x=480, y=200
- 서: x=0, y=200

### 5.3 Problem-Solution

**수직 구조**:
- Problem: x=180, y=20
- Cause: x=180, y=140
- Solutions (3개 수평): x=20, 200, 380, y=260
- Outcome: x=180, y=400

### 5.4 Cause-Effect-Chain

**수평 직렬**:
- 각 노드 width=140, spacing=40
- y=100 고정, x=20, 200, 380, 560...

### 5.5 Hierarchy-Support

**피라미드**:
- Thesis: x=240, y=20 (중앙 상단)
- Evidence (3개): x=40, 240, 440, y=160
- Elaboration (3개): Evidence 바로 아래 y=280

### 5.6 Concession-Assertion

**수직 + 강조**:
- Concession: x=180, y=20, opacity=60
- Assertion: x=180, y=160, strokeWidth=3
- Evidence: x=40, 180, 320, y=300

---

## 6. 개선된 시스템 프롬프트

```
## Korean SAT English — Structural Discourse Flow Mode

Generate a draw.io diagram that visualizes the STRUCTURAL LOGIC of an English reading passage. DO NOT arrange all sentences in a single vertical line. Instead, SELECT one of 6 structural patterns based on the passage's discourse logic.

### Pattern Selection (in priority order)

1. **Concession-Assertion**: Passage starts with "although/while/despite" concession
   - Layout: Concession (faded, top) → Main Assertion (emphasized, middle) → Evidence (bottom row)

2. **Contrast-Resolution**: Clear Thesis vs Counter with "however"
   - Layout: LEFT column = old view. RIGHT column = new view + its evidence. BOTTOM CENTER = conclusion.

3. **Problem-Solution**: "problem/issue" framing with "solution/address"
   - Layout: Problem (top) → Cause (upper-mid) → Solutions 3 parallel (mid) → Outcome (bottom)

4. **Cause-Effect-Chain**: 3+ sequential because/therefore
   - Layout: Horizontal left-to-right chain. Thick animated edges.

5. **Hierarchy-Support**: Thesis + 3+ parallel evidences (first/second/third)
   - Layout: Thesis (top center) → 3 evidences (horizontal row) → elaborations below each

6. **Central-Radial**: Single concept explained from multiple angles
   - Layout: Concept at center. 4 supporting nodes radiating (N/E/S/W).

### Execution rules

- FIRST, analyze the passage and state which pattern applies (in your thinking, not in output).
- SECOND, assign each sentence a Function Tag (Hook, Thesis, Counter, Evidence, Example, Elaboration, Conclusion, etc.).
- THIRD, place nodes at coordinates matching the chosen pattern (see layout rules per pattern).
- FOURTH, connect with edges using discourse markers as labels.
- FIFTH, use fill color by function:
  - Thesis/Conclusion: #d5e8d4 (green)
  - Evidence/Example: #dae8fc (blue)
  - Counter/Concession: #f8cecc (red)
  - Transition/Elaboration: #fff2cc (yellow)
  - Hook: #e1d5e7 (purple)
- SIXTH, edges by relation:
  - 결과/결론: strokeWidth=3, #d79b00, flowAnimation=1
  - 대조: strokeWidth=2, #b85450, startArrow=classic;endArrow=classic
  - 부연: strokeWidth=1, #666666
  - 예시: dashed=1, #0066cc

### Node format
value: `<b>Sentence N</b><br><i>[Function]</i><br><br>[Korean 1-line summary]`
Width 180, Height 90

### Critical reminder
The goal is to VISUALIZE LOGICAL STRUCTURE, not reading sequence. A passage with 6 sentences should NOT be 6 nodes in a column. Use 2D space to show roles.

### Output
Use display_diagram tool with only mxCell elements. IDs from "2", parent="1".
```

---

## 7. 다음 단계

- [x] 첫 프로토타입 테스트 결과 확인 (선형적 한계 발견)
- [x] 6가지 구조 패턴 설계
- [ ] 새 프롬프트로 동일 지문 재테스트 (Contrast-Resolution 적용)
- [ ] 다른 5가지 패턴용 샘플 지문 각각 테스트
- [ ] Quick Example 카드에 "Structural Flow" 추가
- [ ] 나머지 4개 축(담화구조/키워드변형/주제/함축)도 구조 패턴 접근
