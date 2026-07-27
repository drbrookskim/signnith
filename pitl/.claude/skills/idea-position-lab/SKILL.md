---
name: idea-position-lab
description: >
  생성형 AI 없이도 재사용 가능한 규칙기반 상품기획 위치진단 도구. 13개 마케팅 프레임워크
  (3C, SWOT, STP, Five Forces, VRIO, Kano, 포지셔닝맵, 4P, Ansoff, 블루오션 전략캔버스,
  린 캔버스, BMC, AARRR)로 아이디어의 현재 위치를 진단하고 1차 전략을 제시한다.
  "위치 진단해줘", "포지션 분석기 만들어줘", "idea position lab" 요청 시 사용.
  기존 PITL 하네스(3c-analysis/4p-strategy/idea-to-strategy)와 독립적으로 동작한다.
---

# Idea Position Lab

주식 기술적 분석처럼, 정해진 규칙으로 아이디어의 시장 위치를 판정하고 정형화된 1차 전략을 매칭하는 계산기를 만든다. 판정 로직과 문구는 전부 `assets/engine.js`에 고정되어 있으며, 이 스킬의 역할은 그 로직을 담은 자기완결형 HTML을 만들어 Artifact로 발행하는 것뿐이다.

## 실행 절차

1. `assets/engine.js` 파일 내용을 읽는다.
2. `assets/template.html` 파일 내용을 읽는다.
3. `template.html`의 `/* ENGINE_JS: 이 자리에 engine.js 파일 내용을 그대로 붙여넣는다. */` 주석을, 1번에서 읽은 `engine.js` 전체 내용으로 치환한다.
4. Artifact 도구는 `<!doctype>`/`<html>`/`<head>`/`<body>` 태그를 직접 받지 않고 발행 시 자동으로 스켈레톤을 씌운다. 치환된 HTML에서 `<!DOCTYPE html>`, `<html lang="ko">`, `<head>...</head>`, `<body>`, `</body>`, `</html>` 태그를 제거해 `<style>` 태그와 본문 내용만 남긴 뒤 Artifact 도구에 넘긴다(`<title>` 안의 텍스트는 Artifact 도구의 title 파라미터로 전달, title: `idea_position_lab`, favicon 지정). `template.html` 파일 자체는 단독으로 브라우저에서 열어도 동작해야 하므로 원본 구조를 그대로 둔다.
5. 사용자에게: 폼을 채우고 "전체 계산하기"를 누르면 결과가 나오며, "마크다운으로 내보내기"로 리포트를 저장할 수 있다고 안내한다.

## 규칙 변경 시

판정 로직이나 문구를 바꾸고 싶으면 `references/methodology.md`를 먼저 수정하고, 그 내용을 반영해 `assets/engine.js`와 `assets/engine.test.js`를 함께 고친 뒤 테스트를 다시 통과시킨다. 그 다음에만 이 스킬을 재실행해 아티팩트를 재발행한다.
