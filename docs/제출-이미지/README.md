# 모두의 창업 제출용 이미지

폼 업로드 제한 10장 중 **8장**. 전부 1800×1350 PNG, 장당 70~160KB(합계 약 0.9MB).
번호 순서대로 올리면 그대로 하나의 이야기가 됩니다. 캡션은
[모두의창업-제출본.md](../모두의창업-제출본.md)의 "첨부 이미지" 표를 참고하세요.

| 파일 | 내용 |
|---|---|
| `01-intro.png` | 표지 — 한 줄 소개와 세 가지 축 |
| `02-problem.png` | 문제 — 왜 항상 나간 뒤에 생각나는가 |
| `03-how-it-works.png` | 작동 원리 — 4개 입력원 → 자동 조립 → 체크리스트 (구현 완료) |
| `04-personal-baseline.png` | 핵심 차별점 1 — 같은 12도, 다른 추천 |
| `05-notification-timing.png` | 핵심 차별점 2 — 알림 단계 타임라인과 되돌아가는 비용 |
| `06-app-screens.png` | 화면 — 대시보드와 잠금화면 알림 |
| `07-roadmap.png` | 사업화 4단계와 측정 지표 |
| `08-tech.png` | 앱 구조·기술 스택·서버 없음 |

## 사실관계 주의

- `06-app-screens.png`는 **실기기 스크린샷이 아니라, 실제 UI 구조를 그대로 옮긴 도식**
  입니다. 실기기 캡처를 확보하면 이 도식은 그대로 두고 캡처를 추가해 10장을 채우세요.
- `04`는 아직 미구현인 기능(하루 리뷰 기반 기준선 학습)을 설명하는 그림이라, 하단에
  "구현 완료 / 개발 예정" 구분 라벨이 들어가 있습니다. **잘라내지 마세요.**
- `05`의 4단계 중 2차(충전기 분리)와 확장(머무름 이탈)도 개발 예정 라벨이 붙어 있습니다.

## 다시 만들거나 수정하려면

원본은 `_src/` 의 HTML + `base.css`이고, Chrome 헤드리스로 렌더링합니다.

```bash
cd docs/제출-이미지/_src
"/c/Program Files/Google/Chrome/Application/chrome.exe" \
  --headless --disable-gpu --hide-scrollbars \
  --force-device-scale-factor=1.5 --window-size=1200,900 \
  --screenshot=../01-intro.png 01-cover.html
```

캔버스는 1200×900 CSS px, 배율 1.5배로 1800×1350 PNG가 나옵니다. 플랫 컬러만 써서
파일이 가볍고, 배율을 2로 올리면 더 선명해지는 대신 용량이 약 2배가 됩니다.

`_src/` 파일명과 출력 파일명은 다음과 같이 대응합니다.

| `_src/` | 출력 |
|---|---|
| `01-cover.html` | `01-intro.png` |
| `02-problem.html` | `02-problem.png` |
| `03-how.html` | `03-how-it-works.png` |
| `04-personal.html` | `04-personal-baseline.png` |
| `05-timeline.html` | `05-notification-timing.png` |
| `06-screens.html` | `06-app-screens.png` |
| `07-roadmap.html` | `07-roadmap.png` |
| `08-tech.html` | `08-tech.png` |
