# 배경 글로우 워시 + 글래스 Card Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `Card` 컴포넌트를 애플 스타일 글래스모피즘(반투명 + 블러)으로 바꾸고, 그 효과가 보이도록 페이지 배경에 옅은 glow 워시를 얹는다 — 재무 수치 가독성을 해치지 않는 절제된 톤으로.

**Architecture:** 순수 CSS/스타일 변경. 새 컴포넌트, 새 상태, 새 의존성 없음. `globals.css`의 디자인 토큰에 `--surface-rgb`를 추가하고 `body`에 워시 레이어를 얹은 뒤, `components/ui.tsx`의 `Card` 컴포넌트 인라인 스타일을 반투명+블러로 교체한다. `Card`는 fundamentals/swing/moat/qualitative 4개 탭에서 공유되므로 한 곳만 고치면 전체에 반영된다.

**Tech Stack:** Next.js 14+ App Router, React 19, CSS custom properties (인라인 style + globals.css), `backdrop-filter`.

## Global Constraints

- 새 자동 테스트 없음 — 스타일 전용 변경이며 검증은 로컬 dev 서버에서 4개 탭 × 라이트/다크 육안 확인 (설계 문서 3절)
- `backdrop-filter` 미지원 브라우저는 `@supports`로 기존 완전 불투명 `--surface`로 폴백 (설계 문서 2절)
- 워시 강도는 ~12–15%, Card alpha는 ~90% 안팎, blur는 `14px` — 설계 문서에 명시된 절제된 값에서 시작 (설계 문서 1·2절)
- 기존 `--bg`, `--surface`, `--line` 등 토큰 값 자체는 변경하지 않음, 새 토큰만 추가

---

### Task 1: 배경 glow 워시 추가

**Files:**
- Modify: `frontend/app/globals.css:38-42` (`body` 규칙)

**Interfaces:**
- Consumes: 기존 `--bg` 토큰 (라이트 `#fbfaf7`, 다크 `#141412`)
- Produces: `body`에 항상 적용되는 배경 워시 레이어. Task 2의 글래스 Card가 이 워시 위에 놓여 블러 효과가 시각적으로 드러난다.

- [ ] **Step 1: `body` 규칙을 워시 레이어 포함 형태로 교체**

`frontend/app/globals.css:38-42`의 기존 코드:

```css
body {
  background: var(--bg);
  color: var(--ink);
  font-family: var(--font-ui);
}
```

를 다음으로 교체:

```css
body {
  position: relative;
  background: var(--bg);
  color: var(--ink);
  font-family: var(--font-ui);
}

body::before {
  content: '';
  position: fixed;
  inset: 0;
  z-index: -1;
  pointer-events: none;
  background: radial-gradient(
    ellipse 80% 50% at 50% -5%,
    rgba(255, 255, 255, 0.14),
    rgba(255, 255, 255, 0) 70%
  );
}
```

그 다음, 다크 모드용 워시를 별도 블록 두 개로 추가한다 (선택자와 `@media`는 같은 규칙에 섞을 수 없으므로 반드시 분리):

```css
@media (prefers-color-scheme: dark) {
  body::before {
    background: radial-gradient(
      ellipse 80% 50% at 50% -5%,
      rgba(255, 255, 255, 0.06),
      rgba(255, 255, 255, 0) 70%
    );
  }
}

:root[data-theme="dark"] body::before {
  background: radial-gradient(
    ellipse 80% 50% at 50% -5%,
    rgba(255, 255, 255, 0.06),
    rgba(255, 255, 255, 0) 70%
  );
}
```

이 두 블록을 `frontend/app/globals.css`의 기존 `:root[data-theme="dark"] { ... }` 블록(44번째 줄 부근) 아래에 추가한다. 라이트 모드는 `body::before`의 기본값(위 Step에서 넣은 `0.14` 알파)이 그대로 적용되므로 별도 `:root[data-theme="light"]` 오버라이드는 필요 없다.

- [ ] **Step 2: dev 서버로 육안 확인**

Run: `cd frontend && npm run dev`

브라우저에서 `http://localhost:3000` 접속 후:
- 페이지 상단부가 아주 옅게 밝아지는지 확인 (튀지 않아야 함 — 튄다면 알파값을 낮출 것)
- 브라우저 dev tools로 `<html>`에 `data-theme="dark"` 속성을 수동으로 걸어 다크 모드 워시도 확인

Expected: 상단 중심에서 은은하게 퍼지는 밝기 편차가 보이되, "배경에 얼룩이 있다"고 느껴질 정도로 튀지 않음.

- [ ] **Step 3: Commit**

```bash
cd /Users/nelcome/Codes/Claude_code_repository/equisense
git add frontend/app/globals.css
git commit -m "feat: 페이지 배경에 옅은 glow 워시 추가 (글래스 카드 대비용)"
```

---

### Task 2: `--surface-rgb` 토큰 추가

**Files:**
- Modify: `frontend/app/globals.css` — `:root`, `:root[data-theme="dark"]`, `:root[data-theme="light"]`, `@media (prefers-color-scheme: dark)` 네 블록 모두

**Interfaces:**
- Consumes: 없음 (리터럴 hex 값을 rgb 컴포넌트로 병기)
- Produces: `--surface-rgb` (라이트 `255, 255, 255` / 다크 `30, 30, 27`) — Task 3의 `Card`가 `rgba(var(--surface-rgb), alpha)`로 소비.

- [ ] **Step 1: 라이트 `:root` 블록에 추가**

`frontend/app/globals.css:11-21`의 `:root { ... }` 블록 안, `--accent: #1c6e4a;` 다음 줄에 추가:

```css
  --surface-rgb: 255, 255, 255;
```

- [ ] **Step 2: 다크 테마 블록(`:root[data-theme="dark"]`)에 추가**

같은 파일의 다크 테마 블록(44번째 줄 부근, `--accent: #1c8a58;` 다음 줄)에 추가:

```css
  --surface-rgb: 30, 30, 27;
```

- [ ] **Step 3: Task 1에서 추가한 `:root[data-theme="light"]` / `:root[data-theme="dark"]` / `@media` 블록에도 동일하게 병기**

이 저장소는 명시적 `data-theme` 오버라이드 블록을 따로 두지 않고 `@media (prefers-color-scheme: dark)` + `:root[data-theme="dark"]` 두 곳만 다크 값을 정의하는 구조다(라이트는 `:root` 기본값). Step 1·2로 충분하다 — 별도의 `:root[data-theme="light"]` 전체 재정의 블록은 만들지 않는다 (기존 파일 구조에 없음, 새로 만들면 중복 소스가 생긴다).

- [ ] **Step 4: 브라우저 devtools에서 값 확인**

`http://localhost:3000`에서 devtools console에 다음을 실행:

```js
getComputedStyle(document.body).getPropertyValue('--surface-rgb')
```

Expected: 라이트 모드에서 `" 255, 255, 255"` 출력.

- [ ] **Step 5: Commit**

```bash
cd /Users/nelcome/Codes/Claude_code_repository/equisense
git add frontend/app/globals.css
git commit -m "feat: --surface-rgb 토큰 추가 (글래스 카드용)"
```

---

### Task 3: `Card` 컴포넌트를 글래스로 전환

**Files:**
- Modify: `frontend/components/ui.tsx:128-141` (`Card` 컴포넌트)

**Interfaces:**
- Consumes: `--surface-rgb` (Task 2), `--line` (기존 토큰)
- Produces: `Card`는 계속 `{ children, style }` props를 그대로 받는 동일한 시그니처 — 4개 탭 호출부(`FundamentalsPage.tsx`, `SwingPage.tsx`, `MoatPage.tsx`, `QualitativePage.tsx`)는 수정할 필요 없음.

- [ ] **Step 1: `Card` 컴포넌트 스타일 교체**

`frontend/components/ui.tsx:128-141`의 기존 코드:

```tsx
/* ── Card shell ── */
export function Card({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={{
      background: 'var(--surface)',
      border: '1px solid var(--line)',
      borderRadius: 12,
      padding: 22,
      ...style,
    }}>
      {children}
    </div>
  )
}
```

를 다음으로 교체:

```tsx
/* ── Card shell — glass ── */
const cardGlassStyle: React.CSSProperties = {
  background: 'rgba(var(--surface-rgb), 0.9)',
  border: '1px solid var(--line)',
  borderRadius: 12,
  padding: 22,
  backdropFilter: 'blur(14px) saturate(150%)',
  WebkitBackdropFilter: 'blur(14px) saturate(150%)',
  boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.5)',
}

export function Card({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div className="eq-card-glass" style={{ ...cardGlassStyle, ...style }}>
      {children}
    </div>
  )
}
```

`eq-card-glass` 클래스는 다음 Step에서 `@supports` 폴백을 걸기 위한 훅이다 — 인라인 style은 `@supports`로 조건부 해제가 안 되므로, 인라인 style 우선순위를 낮추는 대신 폴백은 클래스 기반 CSS로 인라인 값을 덮어쓴다.

- [ ] **Step 2: `@supports` 폴백을 `globals.css`에 추가**

`frontend/app/globals.css` 끝에 추가:

```css
/* ── Card: backdrop-filter 미지원 브라우저 폴백 ── */
@supports not ((backdrop-filter: blur(1px)) or (-webkit-backdrop-filter: blur(1px))) {
  .eq-card-glass {
    background: var(--surface) !important;
    backdrop-filter: none !important;
    -webkit-backdrop-filter: none !important;
  }
}
```

`!important`는 인라인 style을 덮어쓰기 위해 필요하다 — 이 파일에서 `!important`를 쓰는 유일한 다른 이유 있는 예외이며, 목적은 딱 하나(구형 브라우저 폴백)로 한정된다.

- [ ] **Step 3: dev 서버에서 4개 탭 확인**

Run: `cd frontend && npm run dev` (이미 실행 중이면 생략)

브라우저에서 아래 4개 경로를 라이트/다크 각각 확인 (임의 티커, 예: `AAPL`):
- `/companies/AAPL/fundamentals`
- `/companies/AAPL/swing`
- `/companies/AAPL/moat`
- `/companies/AAPL/qualitative`

Expected:
- 카드 배경이 살짝 반투명해 보이되, `Stat` 숫자와 본문 텍스트는 지금과 거의 동일하게 또렷함
- devtools에서 `.eq-card-glass` 하나를 골라 `backdrop-filter: none`으로 강제 토글해봐도(= 폴백 시뮬레이션) 텍스트 가독성에 문제 없음

문제(대비가 흐려 보임)가 있으면: `cardGlassStyle`의 `0.9`를 `0.94`~`0.96`으로 올리거나 `blur(14px)`를 `blur(10px)`로 낮춘다. 이 조정은 이 Step 안에서 반복하며, 통과할 때까지 Step 3을 재실행한다.

- [ ] **Step 4: Commit**

```bash
cd /Users/nelcome/Codes/Claude_code_repository/equisense
git add frontend/components/ui.tsx frontend/app/globals.css
git commit -m "feat: Card 컴포넌트를 글래스모피즘으로 전환 (backdrop-filter 폴백 포함)"
```

---

## Self-Review Notes

- **Spec coverage:** 설계 문서 1절(워시) → Task 1, 2절(글래스 Card + 토큰 + 폴백) → Task 2·3, 3절(검증) → 각 Task의 Step 3/4 육안 확인. 커버됨.
- **Placeholder scan:** 없음 — 모든 Step에 실제 코드/명령 포함.
- **Type consistency:** `Card`의 `{ children, style }` 시그니처는 변경 없음 — 호출부(4개 탭) 수정 불필요. `cardGlassStyle`은 `Card` 내부 전용 상수로 다른 Task에서 참조하지 않음.
