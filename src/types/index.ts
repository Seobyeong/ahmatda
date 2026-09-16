// 아맞다 — 전역 타입 정의

// 외출 목적 ID
export type PurposeId = 'work' | 'workout' | 'study' | 'date' | 'trip';

// 피드백 타입
export type FeedbackType = 'cold' | 'good' | 'hot';

// 체크리스트 아이템 tier
// 0 = 오늘만 임시, 1 = 날씨 트리거, 2 = 목적별, 3 = 일상 루틴
export type ItemTier = 0 | 1 | 2 | 3;

// 날씨 타입
export type WeatherType = 'sunny' | 'cloudy' | 'rainy' | 'drizzle' | 'hot';

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
  emoji: string;
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
  alert: WeatherAlert;
}

// 현재 날씨 상태
export interface CurrentWeather {
  label: string;
  weather: WeatherType;
  temp: number;
  humidity: number;
  wind: number;
  dustLevel: '좋음' | '보통' | '나쁨' | '매우나쁨';
  rainAlert: boolean;
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
}

// 유저 설정
export interface UserSettings {
  departureTime: string;    // "HH:mm" 형식
  deltaOffset: number;      // 체감온도 보정치
  homeBssid: string | null; // 집 Wi-Fi BSSID
  sensitivityLevel: 1 | 2 | 3 | 4 | 5;
  onboarded: boolean;
  disabledWeatherItems: string[]; // 사용자가 영구적으로 끈 날씨 트리거 항목 라벨 (예: '우산')
  disabledPurposeItems: string[]; // 사용자가 영구적으로 끈 목적별 준비물 — "purposeId:라벨" 형식
                                   // (같은 라벨이 여러 목적에 중복 등장해서 목적별로 구분 필요)
  customKeywords: Partial<Record<PurposeId, string[]>>; // 목적 자동감지에 추가할 사용자 키워드
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
export interface ForgottenRecord {
  date: string;     // "YYYY-MM-DD"
  labels: string[]; // 그날 안 챙기고 나간 항목 라벨들
}

// 타임라인 힌트 (착장 추천 연동)
export interface TimelineHint {
  text: string;
  color: string;
  bg: string;
}
