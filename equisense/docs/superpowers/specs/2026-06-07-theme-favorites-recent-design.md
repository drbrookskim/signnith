# 라이트/다크 테마 · 즐겨찾기 · 최근 검색어 설계

## 개요

세 가지 UX 기능을 localStorage 기반으로 구현한다.
모두 클라이언트 전용(백엔드 없음), static export 완전 호환.

---

## 1. 다크 테마

### 색상 팔레트

| 변수 | 라이트 | 다크 |
|---|---|---|
| `--bg` | `#f4f1ea` | `#141412` |
| `--surface` | `#fffdf7` | `#1e1e1b` |
| `--surface-2` | `#ece7dc` | `#272724` |
| `--surface-3` | `#e3ddcf` | `#2f2f2b` |
| `--ink` | `#1b1a15` | `#f0ece4` |
| `--ink-2` | `#5b564a` | `#a8a49c` |
| `--ink-3` | `#968f7d` | `#686460` |
| `--line` | `rgba(30,26,15,.10)` | `rgba(240,236,228,.08)` |
| `--line-2` | `rgba(30,26,15,.18)` | `rgba(240,236,228,.15)` |
| `--accent` | `#1c6e4a` | `#28a06a` |

웜톤(황갈 계열) 유지 — 차갑고 무채색인 다크그레이 대신 따뜻한 다크.

### 전환 메커니즘

- `<html data-theme="dark">` attribute 방식
- `globals.css`에 `:root[data-theme="dark"] { ... }` 블록 추가
- `<html class="dark">` 동시 적용 → 기존 Tailwind `dark:` 클래스 (GateBPanel) 자동 반응
- `localStorage` key: `eq-theme` (`'light' | 'dark'`, 기본값 `'light'`)
- **깜빡임 방지**: `app/layout.tsx` `<head>`에 인라인 `<script>` 삽입, 페인트 전 attribute 적용

### useTheme 훅

```ts
// lib/hooks/useTheme.ts
function useTheme(): { theme: Theme; toggle: () => void }
```

---

## 2. 즐겨찾기

### 데이터 구조

```ts
interface Favorite { ticker: string; name: string; market: 'KR' | 'US' }
// localStorage key: 'eq-favorites', 최대 20개, JSON 배열
```

### useFavorites 훅

```ts
// lib/hooks/useFavorites.ts
function useFavorites(): {
  favorites: Favorite[]
  isFavorite: (ticker: string) => boolean
  toggle: (f: Favorite) => void   // 추가 또는 제거
}
```

### UI 변경

**CompanyBand** (종목 페이지 상단 밴드):
- 현재가 우측에 ★/☆ 토글 버튼 추가
- 즐겨찾기면 ★ (accent 색), 아니면 ☆ (ink-3 색)
- 클릭 시 `useFavorites().toggle()` 호출

**Header** (우측 영역):
- `☆` 아이콘 버튼 추가 (즐겨찾기 있으면 `★`)
- 클릭 시 드롭다운 열림: 저장된 종목 목록 (종목명 + ticker)
- 각 항목 클릭 → 해당 종목 analysis 페이지로 이동
- 목록 비어있으면 "즐겨찾기한 종목이 없습니다" 안내

---

## 3. 최근 검색어

### 데이터 구조

```ts
interface RecentSearch { ticker: string; name: string; market: 'KR' | 'US' }
// localStorage key: 'eq-recent', 최대 5개, 최신 순
```

### useRecentSearches 훅

```ts
// lib/hooks/useRecentSearches.ts
function useRecentSearches(): {
  recents: RecentSearch[]
  add: (s: RecentSearch) => void
  remove: (ticker: string) => void
  clear: () => void
}
```

### SearchBox 변경

- `navigate()` 호출 시 `add()` 실행
- 검색창 포커스 + query 비어있을 때: 드롭다운에 최근 검색어 최대 5개 표시
- 각 항목 우측에 `×` 버튼 → 개별 삭제

---

## 4. 공유 인프라

### useLocalStorage 훅

```ts
// lib/hooks/useLocalStorage.ts
function useLocalStorage<T>(key: string, defaultValue: T): [T, (val: T) => void]
```

SSR/hydration 안전: 서버에서는 defaultValue 반환, 클라이언트 마운트 후 localStorage 읽기.

---

## 5. 헤더 레이아웃

```
[EquitySense 로고] [검색창──────────] [★ 즐겨찾기▾] [☀/🌙] [4-Layer Analysis]
```

- `[★ 즐겨찾기▾]`: 즐겨찾기 드롭다운 트리거
- `[☀/🌙]`: 테마 토글 버튼
- 두 버튼 모두 CSS 변수 인라인 스타일 (Tailwind 미사용)

---

## 6. 파일 범위

| 파일 | 변경 내용 |
|---|---|
| `frontend/app/globals.css` | 다크 테마 CSS 변수 블록 추가 |
| `frontend/app/layout.tsx` | 깜빡임 방지 인라인 스크립트 추가 |
| `frontend/lib/hooks/useLocalStorage.ts` | 신규 |
| `frontend/lib/hooks/useTheme.ts` | 신규 |
| `frontend/lib/hooks/useFavorites.ts` | 신규 |
| `frontend/lib/hooks/useRecentSearches.ts` | 신규 |
| `frontend/components/layout/Header.tsx` | 즐겨찾기 버튼 + 테마 토글 추가 |
| `frontend/components/layout/SearchBox.tsx` | 최근 검색어 표시 + 저장 |
| `frontend/components/layout/CompanyBand.tsx` | ★/☆ 즐겨찾기 토글 버튼 추가 |
