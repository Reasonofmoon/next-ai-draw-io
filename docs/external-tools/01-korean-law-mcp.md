# Korean Law MCP

> 🟡 **패턴 차용** · TypeScript

법제처 41개 REST API를 **16개 MCP 도구**로 압축한 법령·판례 검색 시스템.

## 한 줄 요약
"N개 저수준 API → M개 유스케이스 도구로 압축"의 교과서 사례.

## 대상 / 접근
- **MCP 서버**: `korean-law-mcp.fly.dev`
- **GitHub**: https://github.com/chrisryugj/korean-law-mcp

## 도구 목록 (16종)

```
verify_citations        ← AI 환각 검증 (핵심)
chain_full_research     chain_law_system       chain_action_basis
chain_dispute_prep      chain_amendment_track  chain_ordinance_compare
chain_procedure_detail  chain_document_review
search_law              get_law_text           get_annexes
search_decisions        get_decision_text
discover_tools          execute_tool
```

**핵심 3 분류**
- `verify_*` — AI가 생성한 인용의 실존성 검증 (환각 방지)
- `chain_*` — 여러 저수준 API를 하나의 실무 시나리오로 묶은 고수준 도구
- `search_*` / `get_*` — 원시 CRUD 에 가까운 저수준 도구

## 우리가 배우는 점

1. **verify_citations 패턴** — 우리 `generateKoreanContent`가 본문에서 인용(문장 위치, 어휘 등)을 할 때, 실제 원문과 대조해 환각 여부 검증하는 별도 도구 분리 가능.
2. **chain_* 네이밍** — 우리가 MCP 서버를 내놓을 미래에, `chain_generate_worksheet`(지문 감지 + 콘텐츠 생성 + HWP 삽입을 한 번에) 같은 고수준 도구 설계에 참고.
3. **discover_tools / execute_tool** — 메타 도구. LLM이 어떤 도구가 있는지 스스로 탐색 후 실행. 도구가 많아질 때 필수 패턴.

## 라이선스
GitHub 확인 필요 (일반적으로 MIT/Apache 계열로 배포)
