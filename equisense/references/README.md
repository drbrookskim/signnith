# references/ — 외부 레퍼런스

이 디렉토리는 EquiSense 설계 및 구현에 참고한 외부 문서, 논문, 공식 문서 링크를 모읍니다.
직접 링크가 끊어질 경우를 대비해 핵심 내용을 요약본으로 보관합니다.

## 분류

### 아키텍처 레퍼런스
- [AWS Serverless Land Patterns](https://serverlessland.com/patterns) — Lambda + SQS + Step Functions 패턴 카탈로그
- [Vercel Edge Functions Docs](https://vercel.com/docs/functions/edge-functions) — 엣지 함수 설계 가이드
- [Neon Serverless PostgreSQL Docs](https://neon.tech/docs) — 서버리스 PostgreSQL 연결 풀링 설정

### 투자 분석 레퍼런스
- [Morningstar Moat Methodology](https://www.morningstar.com/lp/ec-moat) — 경제적 해자 점수화 방법론 원본
- [Aswath Damodaran: Valuation Lectures](https://pages.stern.nyu.edu/~adamodar/) — 펀더멘털 분석 이론적 배경

### RAG 파이프라인 레퍼런스
- [Anthropic Prompt Engineering Guide](https://docs.anthropic.com/en/docs/build-with-claude/prompt-engineering/overview) — 프롬프트 설계 원칙
- [Pinecone RAG Best Practices](https://docs.pinecone.io/guides/gen-ai/rag-overview) — 벡터 DB 활용 RAG 설계

### 보안 레퍼런스
- [OWASP API Security Top 10](https://owasp.org/www-project-api-security/) — API 보안 체크리스트
- [AWS IAM Best Practices](https://docs.aws.amazon.com/IAM/latest/UserGuide/best-practices.html) — 최소 권한 원칙 구현 가이드

## 파일 목록

| 파일명 | 내용 |
|--------|------|
| `serverless-patterns-summary.md` | 프로젝트에 적용한 서버리스 패턴 요약 |
| `moat-scoring-methodology.md` | 해자 점수화 방법론 내부 정리본 |
| `rag-chunking-strategies.md` | 청킹 전략 비교 및 선택 근거 |
