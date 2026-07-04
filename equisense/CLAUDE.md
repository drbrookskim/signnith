# CLAUDE.md — EquiSense 프로젝트 행동 규범

> 이 파일은 Claude Code Agent가 본 프로젝트를 작업할 때 반드시 준수해야 할 규칙과 원칙을 정의합니다.
> 코드를 작성하기 전에 이 파일을 읽고, 모든 지시사항을 내면화하십시오.

---

## 1. 프로젝트 컨텍스트 이해

EquiSense는 4단계 주식 분석 프레임워크(펀더멘털 → 해자 → 정성적 → 기술적)를 서버리스 아키텍처 위에서 구현하는 플랫폼입니다.
모든 코드 결정은 이 4단계 분석 철학과 Serverless-first 원칙에 부합해야 합니다.

**항상 참조해야 할 문서 우선순위:**
1. `CLAUDE.md` (현재 파일) — 행동 규칙
2. `ARCHITECTURE.md` — 시스템 구조
3. `design-docs/` — 모듈별 상세 설계
4. `product-specs/` — 수용 기준(Acceptance Criteria)
5. `exec-plans/` — 마일스톤별 실행 계획

---

## 2. 코딩 원칙

### 2-1. 언어 및 런타임
- **백엔드 Lambda**: Python 3.11 이상만 사용합니다.
- **프론트엔드**: TypeScript 기반 Next.js 14 이상(App Router 패턴)을 사용합니다.
- 동일한 로직을 JavaScript와 Python 양쪽에 중복 구현하지 않습니다. 공유 로직은 Lambda Layer 또는 공용 유틸리티 패키지로 관리합니다.

### 2-2. 함수 및 모듈 설계
- 하나의 Lambda 함수는 하나의 책임만 집니다(Single Responsibility). 예: `get_fundamentals`, `trigger_rag_analysis`는 별개 함수입니다.
- 함수의 최대 실행 시간 기준: **동기 Lambda ≤ 10초**, **비동기 Worker Lambda ≤ 14분**. Lambda의 하드 타임아웃은 15분이므로, 14분을 기준으로 설정하여 1분의 종료 버퍼를 확보합니다. RAG 파이프라인처럼 단계가 여러 개이고 각 단계의 소요 시간이 불확실한 작업은 단일 Lambda에서 처리하지 않고 **AWS Step Functions**로 단계를 분리합니다. Step Functions 사용 기준: 단일 Lambda에서 처리 시 14분 초과가 예상되거나, 부분 실패 후 특정 단계부터 재시도해야 하는 경우.
- 모든 함수는 **입력 검증 → 핵심 로직 → 구조화된 응답 반환** 순서로 구성합니다.

### 2-3. 코드 스타일
- Python: `black` 포매터 및 `ruff` 린터 기준을 준수합니다. 최대 라인 길이는 100자입니다.
- TypeScript: ESLint + Prettier 설정을 따릅니다.
- 모든 공개 함수와 클래스에는 docstring(Python) 또는 JSDoc(TypeScript)을 작성합니다.
- 매직 넘버(하드코딩된 숫자/문자열)는 반드시 상수로 추출하거나 환경 변수로 관리합니다.

### 2-4. 오류 처리
- Lambda 핸들러는 절대 예외를 무시(bare `except: pass`)하지 않습니다.
- 모든 외부 API 호출은 `try/except` + 지수 백오프(exponential backoff) 재시도 로직을 포함합니다.
- 오류 응답은 반드시 `{"error": {"code": "...", "message": "...", "request_id": "..."}}` 스키마를 따릅니다.

---

## 3. 아키텍처 규칙

### 3-1. Serverless-First 원칙
- 항상 서버를 직접 프로비저닝하는 방법보다 관리형 서버리스 서비스를 먼저 검토합니다.
- Lambda 함수 간 직접 HTTP 호출은 금지합니다. 내부 비동기 통신은 **SQS** 또는 **EventBridge**만 사용합니다. API Gateway는 외부 클라이언트의 진입점(edge)으로만 사용하며, Lambda 내부 통신 경유점으로 사용하면 불필요한 비용과 레이턴시가 발생하는 안티패턴입니다.
- 공유 상태(Shared State)는 Neon(PostgreSQL) 또는 Upstash Redis에만 저장합니다. Lambda 인스턴스의 메모리는 해당 실행 컨텍스트 내의 임시 캐시로만 사용합니다.

### 3-2. 비동기 처리
- 예상 처리 시간이 3초를 초과하는 모든 작업(RAG 분석, 대용량 데이터 집계)은 비동기 SQS → Worker Lambda 패턴으로 구현합니다.
- 비동기 작업의 상태는 `jobs` 테이블(Neon DB)에 `PENDING → PROCESSING → COMPLETED | FAILED` 상태로 추적합니다.

### 3-3. 데이터 캐싱 전략
- 외부 API(FMP, Alpha Vantage, DART)의 응답은 **반드시** 캐싱합니다.
  - 재무제표: TTL 24시간
  - 주가 데이터: TTL 15분(장 중) / 24시간(장 마감 후)
  - 뉴스/공시: TTL 1시간
- 캐시 계층을 건너뛰는 `force_refresh` 파라미터는 인증된 관리자 요청에만 허용합니다.

---

## 4. 보안 규칙 (요약)

> 상세 규칙은 `SECURITY.md`를 참조하십시오.

- API 키, DB 접속 정보, 시크릿은 절대 소스 코드나 Git에 커밋하지 않습니다. **AWS Secrets Manager** 또는 **환경 변수**만 사용합니다.
- 모든 사용자 입력값(종목 코드, 날짜 등)은 정규식 또는 Pydantic 모델로 검증한 후 처리합니다.
- Lambda 함수의 IAM 역할은 최소 권한 원칙(Least Privilege)으로 설정합니다. 예: S3 읽기만 필요한 함수에 S3 쓰기 권한을 부여하지 않습니다.

---

## 5. 테스트 요구사항

- 새로운 Lambda 핸들러를 작성할 때는 반드시 단위 테스트(`pytest`)를 함께 작성합니다.
- 외부 API와의 통신은 `unittest.mock` 또는 `moto`(AWS 서비스 모킹)로 격리합니다.
- 테스트 커버리지는 **핵심 비즈니스 로직 기준 80% 이상**을 유지합니다.
- 프론트엔드 컴포넌트는 `Testing Library` 기반 렌더링 테스트를 포함합니다.

---

## 6. Git 및 협업 규칙

- 커밋 메시지는 Conventional Commits 형식을 따릅니다: `feat:`, `fix:`, `docs:`, `refactor:`, `test:`, `chore:`
- 브랜치 전략: `main`(프로덕션) ← `develop`(통합) ← `feature/모듈명-기능명`
- Pull Request는 반드시 관련 `product-specs/`의 수용 기준 번호를 본문에 명시합니다.
- `main` 브랜치에 직접 push는 금지합니다. CI/CD 파이프라인을 반드시 통과해야 합니다.

---

## 7. Claude Agent 작업 시 금지 사항

이하의 행동은 어떠한 이유로도 수행하지 않습니다.

1. `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` 등 자격증명을 코드에 직접 삽입하는 것.
2. 테스트 없이 `main` 브랜치에 코드를 직접 병합하는 것.
3. 기존 DB 스키마를 마이그레이션 스크립트 없이 변경하는 것.
4. 외부 API 응답을 캐싱 없이 직접 프론트엔드로 프록시하는 것.
5. `product-specs/`에 정의되지 않은 기능을 임의로 추가하는 것(Scope Creep 방지).

---

_Last updated: 2026-05-17 | Maintainer: EquiSense Dev Team_
