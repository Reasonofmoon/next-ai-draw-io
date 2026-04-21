# LexDiff

> 🟡 **패턴 차용** · Gemini 3 Flash + Function Calling

FC-RAG(Function Calling RAG) 기반 AI 법률 검색 플랫폼.

## 한 줄 요약
"LLM이 직접 검색 함수를 호출" — 벡터 DB 없이도 고정밀 RAG.

## 대상 / 접근
- **URL**: https://lexdiff.gomdori.app

## 핵심 기능
- AI 법률 검색 (근거 자동 제시)
- 법령 영향 추적기 (A 조항 수정 시 B 조항에 미치는 영향)
- 조례 벤치마킹 (전국 226개 시군구)
- 위임 미비 탐지기 (상위법에 근거 없는 조례 발견)
- 신구조문 비교 (타임머신)
- BYOK + 무료 베타

## 우리가 배우는 점

1. **FC-RAG > 벡터 RAG** — Function Calling으로 LLM이 구조화된 쿼리를 짜고, 서버는 정확한 조건 검색으로 답변. 임베딩 품질에 덜 의존. 우리 `generateKoreanContent`가 어휘 해설에서 "실제 사전 뜻"을 참조해야 할 때 FC-RAG(사전 API 호출) 적용 가능.
2. **"근거 자동 제시"** — LLM 답변과 함께 소스 스니펫을 반환. 우리 콘텐츠 블록의 `reasoning` 필드를 "인용 원문"으로 채우는 방향 확장.
3. **BYOK 무료 베타** — 처음 사용자는 공용 쿼터, 헤비 유저는 자기 키. 론치 전략 참고.
