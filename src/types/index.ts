// 아맞다 — 전역 타입 정의

// 외출 목적 ID
export type PurposeId = 'work' | 'workout' | 'study' | 'date' | 'trip';

// 피드백 타입
export type FeedbackType = 'cold' | 'good' | 'hot';

// 체크리스트 아이템 tier
// 0 = 오늘만 임시, 1 = 날씨 트리거, 2 = 목적별, 3 = 일상 루틴
export type ItemTier = 0 | 1 | 2 | 3;

// 날씨 타입
export type WeatherType = 'sunny' | 'cloudy' | 'rainy' | 'drizzle' | 'snowy' | 'hot';

// 날씨 경보 타입
export type WeatherAlert = 'rain' | 'cold' | 'heat' | null;

// 체크리스트 아이템
// id가 string인 이유: 나중에 계정/기기 동기화를 붙일 때 두 기기에서 만든 항목의
// id가 겹치면 한쪽이 조용히 덮어써진다. 기기 로컬 카운터로는 이걸 막을 수 없다.
export interface ChecklistItem {
  id: string;
  label: string;
  icon: string;
  tier: ItemTier;
  badge: string | null;
  note?: string;
  checked: boolean;
  temp: boolean;       // 오늘만 임시 항목
  permanent: boolean;  // 영구 루틴 항목
  days?: number[];     // 루틴이 나타날 요일 (0=일 ~ 6=토). 없으면 매일
  onDate?: string;     // "YYYY-MM-DD" — 특정 날짜 1회 (docs/체크리스트-항목-속성.md 2.3). 지나면 정리
  // 동기화 충돌 해결(last-write-wins)용 수정 시각. permanentRoutines처럼 사용자가
  // 직접 만들고 고치는 항목에만 의미가 있고, tier 1·2 항목은 매 빌드마다 새로
  // 생성되는 파생 데이터라 설정하지 않는다.
  updatedAt?: number;
}

// 외출 목적 아이템 (PURPOSE 내 items 배열 원소)
export interface PurposeItem {
  label: string;
  icon: string;
  note: string;
}

// 외출 목적
export interface Purpose {
  id: PurposeId;
  label: string;
  shortLabel: string;
  color: string;
  calKeywords: string[];
  items: PurposeItem[];
  clothingHint: string;
}

// 시간대별 날씨 슬롯 (3h 간격, 5개: 오전/정오/오후/저녁/밤)
export interface WeatherSlot {
  label: string;
  temp: number;
  type: WeatherType;
  rain: number;       // 강수확률 0~100
  alert: WeatherAlert; // 'rain'은 눈을 포함한 강수 전체 — 눈인지는 snow로 구분
  snow?: boolean;      // 강수 형태가 눈 계열(비/눈·눈·눈날림)
}

// 현재 날씨 상태
export interface CurrentWeather {
  label: string;
  weather: WeatherType;
  temp: number;
  humidity: number;
  wind: number;
  dustLevel: '좋음' | '보통' | '나쁨' | '매우나쁨';
  rainAlert: boolean;  // 지금 강수(눈 포함) — 우산 판단 기준
  snowNow?: boolean;   // 지금 강수가 눈 계열 — 문구만 '눈'으로 바꾼다
  heatAlert: boolean;
  recommendation: string;
  recommendEmoji: string;
  calendarEvents: CalendarEvent[];
}

// 캘린더 이벤트
export interface CalendarEvent {
  id: string;
  title: string;
  time: string;  // "HH:mm" 형식
  startDate: string;
  location?: string; // 일정 장소 (자유 입력 문자열 — 좌표 아님, 화상회의 링크일 수도 있음)
}

// 길찾기를 넘길 지도 앱
export type MapApp = 'kakao' | 'naver';

// 유저 설정
// 첫 사용 설문 (docs/외출-감지-재설계.md 6장, 2026-11-04 결정)
//   minimal  필요할 때만 — 출발 전 알림 없음, 안 챙기고 나갈 때만 알림
//   normal   보통 — 출발 전 알림 + 이탈 알림 + 자기 전 정리
//   frequent 자주 — 위에 더해 집 밖에서 머물다 떠날 때도 알림 (위치 '항상 허용' 권장)
// 자기 전 정리 알림의 "2주 뒤엔 물을 게 있는 날만"(minimal/normal)은 아직 구현 전이다.
export type AlertPreference = 'minimal' | 'normal' | 'frequent';

// 주 이동수단 — 자차는 우산 기준 완화, 도보·자전거는 체감온도를 더 극단으로 본다.
export type CommuteMode = 'transit' | 'walk' | 'car';

// 알림 말투 — 캐릭터 문구 세트 또는 직접 쓴 문장 (constants/alertVoices.ts)
export type AlertVoiceId = 'basic' | 'secretary' | 'friend' | 'mom' | 'custom';

export interface UserSettings {
  departureTime: string;    // "HH:mm" 형식 — 기본 외출 시간 (요일 예외가 없는 날)
  // 요일 예외 — 키 '0'(일)~'6'(토), 값 "HH:mm" 또는 'off'(쉬는 날). 없는 요일은 기본 시간 (utils/schedule.ts)
  departureWeekdays: Partial<Record<string, string>>;
  // 자기 전 정리 시각 "HH:mm" — 착장 피드백 + 내일 준비 알림 하나가 여기서 울린다
  // (예전 20:00 피드백 + 22:00 전날 알림을 대체, docs/외출-감지-재설계.md 5장)
  nightlyCheckTime: string;
  alertPreference: AlertPreference;
  // 집 밖에서 머물다 떠날 때 알림 (docs/외출-감지-재설계.md 4장). null = 알림 성향을 따름("자주"면 켜짐).
  // 설정의 스위치로 성향과 상관없이 켜고 끌 수 있고, 성향을 다시 고르면 null로 돌아간다.
  awayPlaceAlert: boolean | null;
  commuteMode: CommuteMode | null; // null = 아직 안 고름 → 대중교통과 같은 기준
  homeBssid: string | null; // 집 Wi-Fi BSSID
  // 체감온도 보정치 Δt는 두 성분의 합이다. 한 필드에 섞으면 민감도를 다시 고를 때
  // 그동안 쌓인 학습이 통째로 덮어써지므로 반드시 분리해서 보관한다.
  //   기준값 = SENSITIVITY_DELTA[sensitivityLevel]  (사용자가 직접 고른 값)
  //   학습값 = learnedDelta                          (일일 피드백으로 ±1씩 누적)
  // 실제 Δt는 getEffectiveDelta()로 합산해서 쓴다.
  sensitivityLevel: 1 | 2 | 3 | 4 | 5;
  learnedDelta: number;
  onboarded: boolean;
  // 온보딩을 마친 날 "YYYY-MM-DD" — 자기 전 정리를 처음 14일은 매일 보내는 기준 (외출-감지-재설계 5장).
  // 이 필드 전에 온보딩한 기기는 null → App.tsx가 처음 본 날로 채운다.
  onboardedDate: string | null;
  disabledWeatherItems: string[]; // 사용자가 영구적으로 끈 날씨 트리거 항목 라벨 (예: '우산')
  disabledPurposeItems: string[]; // 사용자가 영구적으로 끈 목적별 준비물 — "purposeId:라벨" 형식
                                   // (같은 라벨이 여러 목적에 중복 등장해서 목적별로 구분 필요)
  customKeywords: Partial<Record<PurposeId, string[]>>; // 목적 자동감지에 추가할 사용자 키워드
  mapApp: MapApp; // [길찾기]를 넘길 지도 앱
  alertVoice: AlertVoiceId;   // 알림 말투
  customAlertText: string;    // 직접 쓴 알림 문장 — 빈칸 {물건} {개수} {출발}
  updatedAt?: number; // 동기화 충돌 해결용 — userSettings를 바꾸는 모든 경로가 갱신한다
}

// 피드백 기록
// 같은 날 두 기기에서 서로 다른 응답을 하면 date만으로는 뭐가 최신인지 알 수 없어서
// updatedAt으로 판단한다.
export interface FeedbackRecord {
  date: string;
  val: FeedbackType;
  updatedAt?: number;
}

// 외출(Wi-Fi 이탈) 시점에 미체크였던 항목 기록 — "자주 까먹는 항목" 학습용
// updatedAt이 없는 건 의도적이다. 이건 사용자가 고치는 값이 아니라 기기가 관측한
// 사실이라, 기기별 기록을 date 기준으로 합치면 되고 충돌 해결이 필요 없다.
// [떠나기]를 누른 기록 (docs/외출-감지-재설계.md 2장)
export interface LeaveIntent {
  date: string; // "YYYY-MM-DD"
  at: number;   // epoch ms — 외출 판정에서 신호끼리 10분 창 안에 모였는지 볼 때 쓴다
}

export interface ForgottenRecord {
  date: string;     // "YYYY-MM-DD"
  labels: string[]; // 그날 안 챙기고 나간 항목 라벨들
}

// ── AI 연결 (선택 기능, docs/AI-연결-설계.md) ──

// 사용자가 자기 API 키를 넣는 제공자. 지금은 Anthropic만 구현돼 있다.
export type AiProviderId = 'anthropic';

// 키워드에 안 걸린 일정 제목 하나에 대한 AI 해석 결과
export interface AiEventHint {
  purposeId: PurposeId | null; // 기존 5개 목적 중 하나, 해당 없으면 null
  items: string[];             // 이 일정 때문에 추가로 챙길 것 (최대 3개)
}

// AI 결과 캐시 항목. 키는 일정 제목 원문이 아니라 정규화한 제목의 해시다 —
// 개인정보처리방침상 캘린더 일정은 기기에도 저장하지 않으므로 제목 원문을 남기지 않는다.
export interface AiHintEntry {
  hint: AiEventHint | null;    // null = AI도 해석 못 함 → 같은 제목을 다시 묻지 않는다
  decision?: 'accepted' | 'rejected';
  // 여러 제목을 묶어 보낸 요청이 통째로 못 쓰게 됐을 때(거절·잘림) 표시한다. 어느 제목
  // 때문인지 알 수 없으니 "모름"으로 굳히지 않고, 다음에 한 제목씩 따로 다시 묻는다.
  retrySingly?: boolean;
  createdAt: number;
}

export interface AiUsage {
  day: string;       // "YYYY-MM-DD" — dayCalls가 어느 날 기준인지
  dayCalls: number;
  month: string;     // "YYYY-MM"
  monthCalls: number;
}

// AI 연결 상태 — 기기 로컬 전용(계정 동기화 대상 아님). 키는 기기 보안 저장소에
// 있으므로, 키 없는 다른 기기에 "켜짐"이 동기화되면 안 된다.
export interface AiState {
  enabled: boolean;
  provider: AiProviderId;
  consentedProvider: AiProviderId | null; // 동의한 제공자 — 바뀌면 다시 동의를 받는다
  status: 'ok' | 'invalidKey' | 'quotaExceeded';
  pausedDay: string | null;              // quotaExceeded일 때 멈춘 날 — 다음 날 자동 재개
  usage: AiUsage;
  hintCache: Record<string, AiHintEntry>;
}

// 타임라인 힌트 (착장 추천 연동)
export interface TimelineHint {
  text: string;
  color: string;
  bg: string;
}
