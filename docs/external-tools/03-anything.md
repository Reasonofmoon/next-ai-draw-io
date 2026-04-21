# Anything (Docufinder)

> 🟡 **패턴 차용** · 폐쇄망 대응

로컬 문서 수천 개를 1초 안에 본문 검색하는 데스크톱 앱.

## 한 줄 요약
**RRF 하이브리드 검색** (키워드 BM25 + 시맨틱 임베딩) + 완전 오프라인.

## 대상 / 접근
- **설치**: Windows MSI
- **GitHub Releases**: https://github.com/chrisryugj/Docufinder/releases

## 핵심 기술 스택
- **SQLite FTS5** — 키워드 역색인
- **usearch HNSW** — 시맨틱 벡터 검색 (고속 근사 최근접)
- **RRF(Reciprocal Rank Fusion)** — 두 랭킹을 합치는 점수 함수
- **BYOK RAG** — 사용자 API 키로 RAG 질의응답 (선택)

## 우리가 배우는 점

1. **교사의 HWP 자산 재검색** — 교사가 과거에 생성한 수십/수백 개 학습지(HWP)를 로컬에 쌓아두고 "`빈칸 추론`" 유형 모두 찾기 같은 검색이 필요해지는 시점. RRF 그대로 차용 가능.
2. **완전 오프라인 우선** — 학교 내부망은 외부 인터넷 차단인 경우가 많음. 우리 앱도 "로컬 캐시 + BYOK" 모드 옵션 고려.
3. **SQLite FTS5 + usearch 조합** — 서버 DB 없이 클라이언트 단독으로 하이브리드 검색 구현. IndexedDB + 유사 패턴으로 웹에도 이식 가능.
