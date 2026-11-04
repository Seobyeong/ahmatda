<!--
  App Store Connect > 앱 정보 > 개인정보 보호(App Privacy) 설문지에 옮겨 적을 수
  있도록, legal/privacy-policy.ko.md와 동일한 코드베이스 조사 결과를 근거로
  작성한 답변 초안입니다. App Store Connect UI 문항 구성은 수시로 바뀌므로,
  실제 제출 전 화면과 대조하세요. (iOS 빌드/제출 자체는 macOS + Apple Developer
  계정이 필요해 아직 진행하지 못한 상태 — 이 문서는 그 전 단계 준비물입니다.)

  ⚠️ [판단 필요] 표시였던 항목은 2026-07-06 사용자 확인을 거쳐 아래처럼 확정:
  위치 데이터는 "Not Linked to You" 유지(계정 자체가 없어 개인 식별 수단이
  없다는 논리 채택), 캘린더는 Apple 공식 카테고리 목록에 전용 항목이 없어
  "User Content > Other User Content"로 분류(공식 목록 확인 결과 "Calendar"
  독립 카테고리는 존재하지 않음). 남은 건 실제 제출 전 App Store Connect
  화면과 문구 대조뿐.
-->

# Apple App Privacy (개인정보 보호 "영양 라벨") 답변 초안

## 0. 핵심 질문

- **"추적(Tracking)"에 해당하는 데이터를 수집합니까?**
  아니요 — 광고 SDK, 서드파티 분석, 기기 간 사용자 매칭 없음. IDFA도 사용하지
  않음.

## 1. 위치 (Location)

| 유형 | Coarse Location | Precise Location |
|---|---|---|
| 수집함? | 예 (expo-location) | 예 |
| 귀하와 연결됨(Linked to you)? | 아니요 — 계정 자체가 없어 특정 개인과 연결할 식별자가 없음 |
| 추적에 사용됨(Used for Tracking)? | 아니요 |
| 용도 | App Functionality (날씨/미세먼지 조회) |
| 비고 | Not Linked to You로 확정(2026-07-06) — 원본 좌표는 저장·전송하지 않고, 기상청 격자좌표/시도명으로 변환한 값만 외부 API로 전송되며, 계정 자체가 없어 특정 개인과 연결할 식별자가 없음 |

**백그라운드 위치(외출 감지 재설계, 2026-11-04 추가) — 답변 변화 없음.** 집 반경·머문 장소 지오펜스와
집 위치·머무는 자리 좌표는 기기 안에서만 쓰고 전송하지 않는다. Apple 정의상 "Collect"는 기기 밖으로
보내 접근 가능한 것이고 "기기 안에서만 처리한 데이터는 수집이 아니며 공개하지 않아도 된다"
(developer.apple.com/app-store/app-privacy-details, 2026-11-04 확인). Info.plist에
`NSLocationAlwaysAndWhenInUseUsageDescription` 문구는 추가해 둠 (iOS 빌드는 macOS 확보 후).

## 1-1. 건강 및 피트니스 (Health & Fitness > Fitness)

- Apple의 Fitness 유형은 "Motion and Fitness API를 포함한 피트니스·운동 데이터"다. iOS 걷기 감지
  (CMMotionActivity)는 아직 구현 전이고, 구현해도 Android처럼 **시작 시각만 기기 안에 두고 전송하지
  않으면 "Not Collected"**. 구현할 때 `NSMotionUsageDescription` 문구가 필요하다.

## 2. 연락처 정보 (Contact Info)

이름, 이메일, 전화번호 등 — **수집하지 않음.**

## 3. 캘린더 관련 (User Content > Other User Content)

- react-native-calendar-events로 오늘 일정 제목·시각·장소를 읽되, 기기 내
  메모리에서만 일시적으로 사용하고 저장·전송하지 않음.
- 예외: 이용자가 [길찾기]를 누르면 장소 문자열을 검색어로 담아 지도 앱/웹을 연다.
  [판단 필요: 이용자가 시작한 다른 앱 호출이 Apple "Collect" 정의에 해당하는지
  App Store Connect 도움말로 확인 후 답변 확정]
- Apple 공식 데이터 유형 목록에 "Calendar" 독립 카테고리는 없음 —
  **"User Content" > "Other User Content"**로 분류하고 "Not Collected"
  (전송·보관 없음)로 답변.
- **[선택] AI 일정 해석 (AI 기능 출시 시 갱신 필요):** 이용자가 동의하고 켜면,
  키워드로 알 수 없는 일정의 **제목만** 이용자 본인의 API 키로 Anthropic(Claude API)에
  전송한다. Anthropic은 최대 30일 보관 → Apple "Collect"(요청 처리에 필요한 것보다
  오래 접근 가능) 정의에 해당할 가능성이 높음. 그 경우 "Other User Content" →
  **Collected / App Functionality / Not Linked to You / Not Used for Tracking**.
  [판단 필요: 이용자 본인 키로 보내는 구조에서 Anthropic이 Apple 정의상 "third-party
  partner"에 해당하는지 App Store Connect 도움말로 확인 후 확정]
  심사 가이드라인 5.1.2(i)의 앱 내 사전 동의는 설정 화면의 동의 알림으로 구현됨.

## 4. 식별자 (Identifiers)

- 홈 Wi-Fi BSSID: 기기 내부(AsyncStorage)에만 저장, 외부 전송 없음.
- "Device ID" 문항이 있다면 "Not Collected"(기기 밖으로 나가지 않음)로 답변.

## 5. 진단 (Diagnostics)

- 크래시 로그, 성능 데이터: **수집하지 않음** (Sentry 등 미도입 — 도입 시
  "Crash Data"/"Performance Data" 항목을 "Collected, Linked/Not Linked to
  You"로 갱신 필요).

## 6. 사용 데이터 (Usage Data)

- 제품 상호작용(화면 조회, 클릭 등) 추적/분석 SDK 없음 — **수집하지 않음.**

## 최종 제출 전 체크리스트

1. App Store Connect 실제 문항과 이 문서의 매핑이 최신인지 대조
2. Sentry 등 크래시 리포팅 도입 시 "5. 진단" 항목 갱신
3. 이 문서 자체는 macOS/Apple Developer 계정 없이도 준비 가능하지만, 실제
   제출은 App Store Connect 접근 권한이 있는 사용자만 가능
