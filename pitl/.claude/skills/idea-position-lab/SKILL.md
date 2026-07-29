---
name: idea-position-lab
description: >
  "Idea Campus"의 Lab 도구. 아이디어 하나를 13개 마케팅 프레임워크(3C, SWOT, STP,
  Five Forces, VRIO, Kano, 포지셔닝맵, 4P, Ansoff, 블루오션 전략캔버스, 린 캔버스,
  BMC, AARRR) 관점에서 진단하고 1차 전략을 제시한다. 아이디어를 문단으로 설명받으면
  기본적으로 먼저 Mode A(Lab Template — 값을 가볍게 추정해 채운 폼, "Digging"으로
  직접 확인·확정)를 발행한다. 그 폼에서 확정한 값을 갖고 "리포트로 만들어줘",
  "Lab Report로 보여줘" 같은 요청을 하면 Mode B(Lab Report — 확정값 기준 서술형
  리포트)를 쓴다. "위치 진단해줘", "다각도로 봐줘"처럼 폼 없이 즉석 분석만 원할
  때는 Mode B를 바로 써도 된다(이땐 추정값 기준임을 명시). 기존 PITL 하네스
  (3c-analysis/4p-strategy/idea-to-strategy)와 독립적으로 동작한다.
---

# Idea Campus > Lab

아이디어를 13개 프레임워크 렌즈로 진단하고 전략을 제시하는 두 산출물이 있다 — 재사용 가능한 폼 도구는 **Idea Campus > Lab Template**, 그 위에서 확정된 값을 근거로 쓴 서술형 결과물은 **Idea Campus > Lab Report**.

- **Mode A — Lab Template (기본, 먼저 만든다)**: 판정 로직과 문구가 `assets/engine.js`에 고정된 HTML 폼을 Artifact로 발행한다. 처음엔 클로드가 아이디어 설명만으로 가볍게 판단해 값을 미리 채워주지만(추측이니 확인 필요), 사용자가 "Digging"으로 직접 확인·수정하며 최종값을 확정하는 게 목적이다. 폼 값을 바꿔 다시 "Digging"을 누르는 재계산 자체는 클로드 없이 즉시 되지만(엔진이 이미 페이지 안에 있으므로), 새 콘텐츠 생성(값 재판단, Lab Report 작성, 페이지 재발행)은 전부 클로드가 필요하다 — "AI 없이"가 이 스킬의 목표는 아니다.
- **Mode B — Lab Report (나중, 확정 후 만든다)**: Lab Template에서 사용자가 "Digging"으로 확인·확정한 값을 그대로 받아, 그 값에 맞춰 이 아이디어 전용 서술형 리포트를 쓴다. 확정 전 값으로 미리 써두지 않는다 — 값이 바뀌면 리포트도 안 맞게 되므로, 항상 확정된 값 → 리포트 순서를 지킨다.

기본 흐름: 아이디어를 설명받으면 먼저 Mode A로 Lab Template을 만들어 발행한다(값은 가볍게 추정해 채워 넣되, "확인 필요" 상태임을 안내). 사용자가 폼에서 값을 확인·수정하고 "Digging"으로 결과를 확정한 뒤 "리포트로 만들어줘"/"Lab Report로 보여줘" 같은 요청을 하면, 그때 그 확정값을 받아 Mode B로 Lab Report를 쓴다.

## Mode A: Lab Template

1. `assets/engine.js` 파일 내용을 읽는다.
2. `references/methodology.md`를 참고해 아이디어 설명만으로 13개 프레임워크 값을 가볍게 추정한다(시장/경쟁 관련은 WebSearch로 확인 가능하면 확인하고, 자사 내부역량은 설명 문장에서 직접 판단한다 — 정말 부족한 항목만 비워둔다). 이 값은 확정이 아니라 출발점이라는 걸 사용자에게 분명히 한다.
3. `assets/template.html` 파일 내용을 읽는다.
4. `template.html`의 `/* ENGINE_JS: 이 자리에 engine.js 파일 내용을 그대로 붙여넣는다. */` 주석을, 1번에서 읽은 `engine.js` 전체 내용으로 치환한다.
5. 2번에서 추정한 값이 있다면, `template.html`의 `/* PREFILL: ... */` 주석 다음 줄(`if (typeof window.PREFILL !== 'undefined') applyPrefill(window.PREFILL);` 바로 앞)에 `window.PREFILL = { ...만든 객체... };`를 삽입한다. `PREFILL` 객체는 `data.common`/`data.threeC`/`data.swot`/`data.stp`/`data.fiveForces`/`data.vrio`/`data.kano`/`data.positioningMap`/`data.ansoff`/`data.blueOcean`/`data.leanCanvas`/`data.bmc`/`data.aarrr` 키 구조를 따른다(각 키의 정확한 형태는 `assets/template.html`의 `applyPrefill(data)` 함수 정의를 읽고 그대로 맞춘다). 값이 없으면 이 단계는 건너뛴다.
6. Artifact 도구는 `<!doctype>`/`<html>`/`<head>`/`<body>` 태그를 직접 받지 않고 발행 시 자동으로 스켈레톤을 씌운다. 치환된 HTML에서 `<!DOCTYPE html>`, `<html lang="ko">`, `<head>...</head>`, `<body>`, `</body>`, `</html>` 태그를 제거해 `<style>` 태그와 본문 내용만 남긴 뒤 Artifact 도구에 넘긴다(`<title>` 안의 텍스트는 Artifact 도구의 title 파라미터로 전달, title: `idea_campus_lab_template`, favicon 지정). `template.html` 파일 자체는 단독으로 브라우저에서 열어도 동작해야 하므로 원본 구조를 그대로 둔다.
7. 사용자에게: 채워진 값은 클로드의 추정값이라 확인·수정이 필요하다고 안내하고, "Digging"을 누르면 결과가 나오며, 값을 확정한 뒤 "마크다운으로 내보내기"로 저장하거나 채팅에서 "Lab Report로 만들어줘"라고 하면 그 확정값 기준으로 서술형 리포트를 발행해준다고 안내한다. 폼의 "공통 입력" 섹션 바로 아래엔 "Diagnosis" 버튼이 있는데, 발행된 정적 페이지는 클로드를 직접 호출할 수 없어서(Artifact 런타임 capability는 downloads/mcp뿐) 누르면 공통입력값을 진단 요청 문구로 클립보드에 복사해준다 — 사용자가 그걸 채팅에 붙여넣으면 이 스킬의 1~2번 절차를 다시 타면서 새 PREFILL로 재발행하면 된다.

## Mode B: Lab Report

트리거: 사용자가 Lab Template에서 확정한 값을 갖고 리포트를 요청할 때. 확정값은 사용자가 내보낸 `.md` 파일 내용을 붙여넣거나, 폼에서 무엇을 확인·수정했는지 채팅으로 알려주는 형태로 온다. Mode A 없이 곧바로 리포트만 요청받았다면(폼 확정 과정 없이), 그 자리에서 Mode A의 2번 절차로 값을 판단한 뒤 "이건 확정값이 아니라 추정값 기준 리포트"라고 명시하고 진행한다.

1. 확정값(또는 추정값)을 근거로, `references/methodology.md`의 사분면/구간/조건 판정 규칙에 맞춰 각 프레임워크 결론을 이 아이디어에 맞는 문장으로 새로 쓴다(고정 캔드 문구를 기계적으로 복붙하지 않는다 — 받은 값과 어긋나는 판정을 새로 만들지 않는다, 판정 자체는 받은 값 그대로 따른다).
2. 리포트 맨 위에 제목 `# Idea Campus > Lab Report`를 붙인다. 분석군(위치 진단) → 전략군(1차 전략) 순서로 마크다운 리포트를 쓴다.
3. 완성된 마크다운을 `.md` 파일로 저장하고 Artifact 도구로 발행한다(파일 그대로 렌더링됨, favicon 지정, description은 아이디어 한줄 요약). 채팅 응답에는 리포트 본문 대신 핵심 요약과 발행된 URL을 안내한다 — 리포트 전체를 채팅에 다시 붙여넣지 않는다.

## 규칙 변경 시

판정 로직이나 문구를 바꾸고 싶으면 `references/methodology.md`를 먼저 수정하고, 그 내용을 반영해 `assets/engine.js`와 `assets/engine.test.js`를 함께 고친 뒤 테스트를 다시 통과시킨다. 그 다음에만 이 스킬을 재실행해 아티팩트를 재발행한다.
