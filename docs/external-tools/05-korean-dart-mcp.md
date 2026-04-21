# korean-dart-mcp

> 🟡 **패턴 차용** · TypeScript · MCP 서버

OpenDART 83개 API → **15개 MCP 도구**로 압축한 금융공시 분석 시스템.

## 한 줄 요약
"체인 도구" 설계의 또 다른 사례. 여러 저수준 API를 **실무 질문 단위로** 묶음.

## 대상 / 접근
- **MCP**: `claude --mcp korean-dart`
- **GitHub**: https://github.com/chrisryugj/korean-dart-mcp

## 대표 도구 15종 (발췌)

```
insider_trade_cluster     ← 임원 매수/매도 시그널 클러스터링
strong_buy_cluster        ← 강한 매수 신호 종목 군집
strong_sell_cluster       ← 강한 매도 신호 종목 군집
accounting_risk_score     ← 회계 리스크 0-100 점수화
buffett_rank              ← 버핏 5지표 자동 랭킹
...
```

## 우리가 배우는 점

1. **"투자자가 궁금한 것" 단위로 도구 쪼개기** — `insider_trade_cluster`는 "공시 검색 + 임원 리스트 + 거래 내역 + 클러스터링"을 하나로 묶음. 우리도 "교사가 궁금한 것" 단위로 도구 설계: `full_worksheet_generation(hwp_url, question_types[])` 같은.
2. **스코어링 출력 표준화** — 회계 리스크를 0-100으로 정량화. 우리 AI 생성 콘텐츠도 "난이도", "완성도" 같은 정량 스코어 반환해 교사가 필터링하게 할 수 있음.
3. **XBRL 계산 검증** — 생성 결과의 내적 일관성 체크 패턴. 우리 vocab entries의 "단어/뜻" 쌍이 일관되는지 유사 검증.
