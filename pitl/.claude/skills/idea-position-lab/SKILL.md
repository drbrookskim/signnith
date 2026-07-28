---
name: idea-position-lab
description: >
  아이디어 하나를 13개 마케팅 프레임워크(3C, SWOT, STP, Five Forces, VRIO, Kano,
  포지셔닝맵, 4P, Ansoff, 블루오션 전략캔버스, 린 캔버스, BMC, AARRR) 관점에서
  진단하고 1차 전략을 제시한다. 아이디어를 문단으로 설명하며 "분석해줘", "위치
  진단해줘", "다각도로 봐줘" 등 빠른 분석을 원하면 Mode A(리포트)를, "계산기
  만들어줘", "폼으로", "재사용 가능하게" 등 저장해두고 나중에 값 바꿔가며 다시
  쓰고 싶다는 요청엔 Mode B(계산기)를 쓴다. 기존 PITL 하네스
  (3c-analysis/4p-strategy/idea-to-strategy)와 독립적으로 동작한다.
---

# Idea Position Lab

아이디어를 13개 프레임워크 렌즈로 진단하고 전략을 제시하는 두 가지 모드가 있다.

- **Mode A — 빠른 리포트**: 아이디어 설명 한 문단만 있으면 된다. 클로드가 그 자리에서 13개 프레임워크 관점으로 직접 판단해 분석 리포트를 쓴다. 코드도 폼도 없다 — AI가 필요한 작업이니 AI가 직접 한다.
- **Mode B — 계산기**: 판정 로직과 문구가 `assets/engine.js`에 고정된 자기완결형 HTML 폼을 Artifact로 발행한다. 발행 후엔 AI 없이 폼 값만 바꿔가며 몇 번이고 재계산할 수 있다. 아이디어를 반복해서 다듬거나 남한테 폼을 넘겨 같이 쓸 때 쓴다.

기본은 Mode A다 — 아이디어를 설명받으면 먼저 Mode A로 리포트를 쓰고, 사용자가 "계산기로 만들어줘"/"폼으로 다듬고 싶다" 같은 요청을 하면 그때 Mode B로 넘어간다(이때 Mode A에서 이미 판단한 값을 그대로 재사용해 폼에 채워 넣는다 — 처음부터 다시 판단하지 않는다).

## Mode A: 빠른 리포트

1. `references/methodology.md`를 읽는다. 이건 코드가 아니라 판단 루브릭이다 — 13개 프레임워크 각각 무엇을 봐야 하는지, 어떤 조건에서 어떤 결론 문구를 쓰는지 정의한다.
2. 아이디어 설명 문단을 그 루브릭에 대입해 13개 프레임워크 전부에 대해 직접 판단한다. `methodology.md`의 사분면/구간/조건 판정 규칙을 그대로 따르되, 실제 결론 문구는 아이디어 내용에 맞게 클로드가 새로 쓴다(고정 캔드 문구를 기계적으로 복붙하지 않는다 — 그건 Mode B의 방식이다).
3. 시장/경쟁 관련 판단(Five Forces, STP, 포지셔닝맵, 시장성장세, SWOT 기회/위협, 블루오션)은 실제 업계 데이터가 근거가 될 수 있으면 WebSearch로 확인하고 인용한다. 확인 안 되면 "확인 안 됨"이라 명시하고 판단만 제시한다.
4. 자사 내부역량 판단(3C, VRIO, SWOT 강점/약점, 린 캔버스, BMC)은 외부에서 조회할 데이터가 없으므로 아이디어 설명만으로 직접 판단한다. 설명이 정말 부족해 추측도 무리인 항목만 사용자에게 되묻는다.
5. 분석군(위치 진단) → 전략군(1차 전략) 순서로 마크다운 리포트를 써서 응답한다(파일로 안 만들어도 됨, 채팅 응답 자체가 산출물).
6. 끝에 한 줄로 안내: "이 판단값 그대로 계산기(폼)로 옮겨서 다듬고 싶으면 말해달라."

## Mode B: 계산기

Mode A를 거쳤다면 그때 나온 판단값을 `PREFILL` 객체로 재사용한다(처음부터 다시 판단하지 않는다). Mode A 없이 바로 Mode B를 요청받았다면 Mode A의 3~4번 절차로 값부터 판단한 뒤 진행한다.

1. `assets/engine.js` 파일 내용을 읽는다.
2. `assets/template.html` 파일 내용을 읽는다.
3. `template.html`의 `/* ENGINE_JS: 이 자리에 engine.js 파일 내용을 그대로 붙여넣는다. */` 주석을, 1번에서 읽은 `engine.js` 전체 내용으로 치환한다.
4. 판단한 값이 있다면, `template.html`의 `/* PREFILL: ... */` 주석 다음 줄(`if (typeof window.PREFILL !== 'undefined') applyPrefill(window.PREFILL);` 바로 앞)에 `window.PREFILL = { ...만든 객체... };`를 삽입한다. `PREFILL` 객체는 `data.common`/`data.threeC`/`data.swot`/`data.stp`/`data.fiveForces`/`data.vrio`/`data.kano`/`data.positioningMap`/`data.ansoff`/`data.blueOcean`/`data.leanCanvas`/`data.bmc`/`data.aarrr` 키 구조를 따른다(각 키의 정확한 형태는 `assets/template.html`의 `applyPrefill(data)` 함수 정의를 읽고 그대로 맞춘다). 값이 없으면 이 단계는 건너뛴다.
5. Artifact 도구는 `<!doctype>`/`<html>`/`<head>`/`<body>` 태그를 직접 받지 않고 발행 시 자동으로 스켈레톤을 씌운다. 치환된 HTML에서 `<!DOCTYPE html>`, `<html lang="ko">`, `<head>...</head>`, `<body>`, `</body>`, `</html>` 태그를 제거해 `<style>` 태그와 본문 내용만 남긴 뒤 Artifact 도구에 넘긴다(`<title>` 안의 텍스트는 Artifact 도구의 title 파라미터로 전달, title: `idea_position_lab`, favicon 지정). `template.html` 파일 자체는 단독으로 브라우저에서 열어도 동작해야 하므로 원본 구조를 그대로 둔다.
6. 사용자에게: 값이 미리 채워져 있으면 그대로 계산하거나 고쳐서 계산할 수 있다고 안내하고, "전체 계산하기"를 누르면 결과가 나오며 "마크다운으로 내보내기"로 리포트를 저장할 수 있다고 안내한다.

## 규칙 변경 시

판정 로직이나 문구를 바꾸고 싶으면 `references/methodology.md`를 먼저 수정하고, 그 내용을 반영해 `assets/engine.js`와 `assets/engine.test.js`를 함께 고친 뒤 테스트를 다시 통과시킨다. 그 다음에만 이 스킬을 재실행해 아티팩트를 재발행한다.
