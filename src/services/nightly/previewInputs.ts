// 다음 외출 준비 미리보기에 필요한 바깥 데이터(그날 일정·예보)를 가져온다.
// 미리보기 화면(TomorrowPreviewModal)과 자기 전 정리 알림의 "다음 외출: …" 한 줄(NightlyService)이 같이 쓴다 —
// 둘이 따로 가져오면 알림에 적힌 것과 눌러서 연 화면이 어긋난다.

import { CalendarService } from '@/services/calendar/CalendarService';
import { WeatherService } from '@/services/weather/WeatherService';
import type { DayOutlook } from '@/services/weather/forecastDate';
import { getCurrentCoords } from '@/utils/location';
import type { CalendarEvent } from '@/types';

// 위치 권한이 없거나 좌표 조회에 실패했을 때만 쓰는 폴백 좌표 (서울시청)
const FALLBACK_LAT = 37.5665;
const FALLBACK_LON = 126.978;
const DAY_MS = 24 * 60 * 60 * 1000;

function dayStart(d: Date): number {
  const s = new Date(d);
  s.setHours(0, 0, 0, 0);
  return s.getTime();
}

export interface PreviewInputs {
  events: CalendarEvent[];
  outlook: DayOutlook | null; // null = 예보를 못 받음
}

// target: 다음 외출 날(getNextDepartureDate). 각 서비스가 실패를 빈 값으로 돌려준다.
export async function fetchPreviewInputs(target: Date, departureTime: string): Promise<PreviewInputs> {
  const dayOffset = Math.round((dayStart(target) - dayStart(new Date())) / DAY_MS);
  const [events, coords] = await Promise.all([
    CalendarService.getEventsForDay(dayOffset).catch(() => [] as CalendarEvent[]),
    getCurrentCoords().catch(() => null),
  ]);
  const outlook = await WeatherService.getDayOutlook(
    coords?.lat ?? FALLBACK_LAT,
    coords?.lon ?? FALLBACK_LON,
    target,
    departureTime
  ).catch(() => null);
  return { events, outlook };
}
