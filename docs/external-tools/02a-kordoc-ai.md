# kordoc-ai

> 🟡 **패턴 차용** · TypeScript · Tauri + Gemini 3 Flash

kordoc 엔진 위에 얹은 Windows 데스크톱 앱.

## 한 줄 요약
"파서 엔진(npm) + UX 앱(Tauri)" 분리 — 같은 코어를 CLI·MCP·데스크톱에 재사용.

## 대상 / 접근
- **설치**: Windows MSI
- **GitHub**: https://github.com/chrisryugj/kordoc-ai

## 주요 기능
- AI 요약 (4×3 매트릭스)
- AI OCR (Gemini Vision)
- 문서 병합·서식 유지
- "K팀장 검토" (문서 품질 AI 검토)

## 우리가 배우는 점

1. **엔진/UX 분리** — 우리 `@rhwp/core`는 WASM 엔진, `next-ai-draw-io`는 웹 UX. 장기적으로 "Tauri로 래핑한 오프라인 교사용 데스크톱"도 같은 코어로 가능.
2. **Gemini Vision OCR** — 스캔된 HWP(이미지 PDF)를 처리할 때 OCR 필요. 우리도 "교사가 문제지 사진을 찍어 업로드하면 → OCR → 지문 감지" 경로 열 수 있음.
3. **BYOK 구조** — 사용자가 자기 API 키를 넣는 방식. 학원/개인 교사가 자비로 운영하는 시나리오에 적합.
