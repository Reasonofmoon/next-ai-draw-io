# kordoc

> 🟢 **직접 사용 중** · MIT · Node.js 18+ · 순수 JS

HWP 5.x / HWPX / HWPML 2.x / PDF / XLSX / DOCX → Markdown + IRBlock 구조화 JSON.

## 한 줄 요약
우리 앱의 "HWP **읽기**" 갭을 메우는 파서. `@rhwp/core`(쓰기 엔진)과 역할 분리로 공존.

## 대상 / 접근
- **npm**: `npm install kordoc`
- **CLI**: `npx kordoc 파일.hwpx`
- **MCP**: `npx -y kordoc setup` (Claude Desktop/Cursor 자동 감지)
- **GitHub**: https://github.com/chrisryugj/kordoc

## 공개 API (실측)

```
VERSION            detectFormat       detectZipFormat
parse              parseHwp           parseHwpx
parseHwpml         parsePdf           parseXlsx          parseDocx
blocksToMarkdown   markdownToHwpx
compare            diffBlocks
extractFormFields  fillForm  fillFormFields  fillHwpx
isHwpxFile  isOldHwpFile  isPdfFile  isZipFile  isLabelCell
```

## 기본 사용법 (Node/서버)

```ts
import { parse } from "kordoc"

const buffer = await file.arrayBuffer()
const result = await parse(buffer)
if (result.success) {
    result.markdown   // string
    result.blocks     // IRBlock[]  (paragraph | heading | list | table | ...)
    result.metadata   // { format, pageCount, ... }
}
```

**주의**: kordoc dist는 ESM(`index.cjs`가 실제로 `import.meta` 사용). Next.js에서는 **dynamic `import("kordoc")`** 로 API 라우트 내부에서 호출해야 함. 우리는 `app/api/parse-hwp-markdown/route.ts`에서 이 방식 사용.

## 우리가 배우는 점 (EdTech 이식 가능 패턴)

1. **2-Pass Table Builder** — HWP 표의 rowspan/colspan을 보존하려면 1패스는 셀 수집, 2패스는 병합 해석. 우리 `insertVocabTableAfter`를 병합셀 지원으로 확장할 때 그대로 차용 가능.
2. **포맷 자동 감지 → 라우팅** — `detectFormat()` 후 `parseHwpx`/`parseHwp`/`parsePdf` 분기. 우리 `isHwpFile` 체크를 확장해 "HWPX면 kordoc, HWP면 @rhwp/core" 같은 라우팅에 적용.
3. **IRBlock 중간표현** — 포맷별 파서가 모두 같은 block union으로 수렴. 우리 `ContentBlock`(AI 생성)과 IRBlock(파싱 결과) 매핑 가능성.

## 우리 앱 통합 상태

- **Phase B-0**: ✅ npm install 완료
- **Phase B-1**: `app/api/parse-hwp-markdown/route.ts` + `lib/kordoc-adapter.ts`
- **Phase B-2**: ResultsPanel "📝 MD" 버튼 (예정)
- **Phase B-3**: 2차 지문 감지 소스로 활용 (예정)
- **Phase B-4**: 표 병합셀 지원 (선택)
- **Phase B-5**: DRM HWPX 읽기 (선택)
