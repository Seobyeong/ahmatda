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
export interface ChecklistItem {
  id: number;
  label: string;
  icon: string;
  tier: ItemTier;
  badge: string | null;
  note?: string;
  checked: boolean;
  temp: boolean;       // 오늘만 임시 항목
  permanent: boolean;  // 영구 루틴 항목
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
  basePerceived: number;
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
}

// 피드백 기록
export interface FeedbackRecord {
  date: string;
  val: FeedbackType;
}

// 타임라인 힌트 (착장 추천 연동)
export interface TimelineHint {
  text: string;
  color: string;
  bg: string;
}
