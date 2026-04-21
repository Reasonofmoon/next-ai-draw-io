# External Tools Reference Vault

류주임([chris.gomdori.app](https://chris.gomdori.app/)) 포트폴리오에서 수집한 한국 도메인 특화 생산성 도구 10종의 레퍼런스. 우리 `next-ai-draw-io` EdTech 파이프라인과 접점이 있는 도구는 실제 통합, 나머지는 **패턴 학습용**으로 보관.

## 인덱스 (통합 가능성 등급)

| # | 도구 | 등급 | 핵심 | 파일 |
|---|---|---|---|---|
| 01 | Korean Law MCP | 🟡 | 41 API → 16 MCP 도구 압축 | [01-korean-law-mcp.md](./01-korean-law-mcp.md) |
| 02 | **kordoc** | 🟢 | HWP/HWPX/PDF/Office → Markdown | [02-kordoc.md](./02-kordoc.md) |
| 02a | kordoc-ai | 🟡 | Tauri + Gemini 데스크톱 | [02a-kordoc-ai.md](./02a-kordoc-ai.md) |
| 03 | Anything | 🟡 | 폐쇄망 RRF 하이브리드 검색 | [03-anything.md](./03-anything.md) |
| 04 | LexDiff | 🟡 | FC-RAG 법률 검색 | [04-lexdiff.md](./04-lexdiff.md) |
| 05 | korean-dart-mcp | 🟡 | 83 API → 15 도구, 체인 패턴 | [05-korean-dart-mcp.md](./05-korean-dart-mcp.md) |
| 06 | gjdong | ⚪ | 주소 정규화 | [06-gjdong.md](./06-gjdong.md) |
| 07 | Shift Scheduler | ⚪ | 교대근무 자동 배정 | [07-shift-scheduler.md](./07-shift-scheduler.md) |
| 08 | Lunch Picker | ⚪ | 위치 기반 랜덤 픽 | [08-lunch-picker.md](./08-lunch-picker.md) |
| 09 | Duty Roster | ⚪ | 당직 분리 | [09-duty-roster.md](./09-duty-roster.md) |

**등급 의미**
- 🟢 **직접 사용** — 우리 앱에 통합됨/예정 (Part B 참조)
- 🟡 **패턴 차용** — API 설계·아키텍처 차용
- ⚪ **참고만** — 도메인이 달라 EdTech와 무관

## 레퍼런스 패턴 요약 (도구 관통 테마)

1. **"N개 API → 10~16 도구로 압축"** (Korean Law MCP, DART MCP) — LLM tool calling 한계를 역이용한 DX 설계. 우리 Korean content API도 `generateKoreanContent` 하나에 모든 블록 타입을 몰아넣는 대신, 이 패턴을 참고해 "체인 도구"를 외부에 노출할 가치가 생긴 시점에 적용.

2. **한국 도메인 딥 다이빙** — HWP·HWPX·법제처·DART·조례. 해외 도구가 절대 대체 못 하는 영역만 정조준. 우리 CSAT 영어 콘텐츠 파이프라인도 같은 논리(한국 교사 실무 UX)로 우위.

3. **BYOK + 오프라인 우선** (Anything, LexDiff, kordoc-ai) — 공무원/교사 보안요건을 만족하며 "서버 없는" 배포. 우리 앱 BYOK 옵션 고려 지점.

4. **파서 엔진과 UX 앱 분리** (kordoc vs kordoc-ai) — 엔진은 MIT npm, UX는 별도 Tauri 앱. 재사용성 극대화.

## 라이선스 / 출처

- 모든 도구: [chris.gomdori.app](https://chris.gomdori.app/)
- GitHub 허브: [github.com/chrisryugj](https://github.com/chrisryugj)
- kordoc 라이선스: **MIT** (직접 의존)
- 나머지 도구: 패턴 참고만 — 코드 복사 금지
