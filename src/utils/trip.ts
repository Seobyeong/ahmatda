// 아맞다 — 여행·며칠 외출 짐 목록 (C5, 2026-11-28 결정: 일상 체크리스트와 따로 둔 짐 목록)
//
// 이름·날짜 범위·목적지(선택)를 정하면 기본 짐 + 날짜별 날씨 짐을 묶은 목록을 만든다.
// 날씨 짐은 목적지 예보가 닿는 날(단기예보 약 3일)만 — 그 뒤 날은 출발이 가까워지면 다시 받아 채운다.
// 출발 전날 밤 자기 전 정리 알림에 남은 짐 수를 붙인다 (NightlyService).

import type { DayOutlook } from '@/services/weather/forecastDate';

export interface TripItem {
  id: string;
  label: string;
  checked: boolean;
  kind: 'base' | 'weather' | 'custom';
  reason?: string; // 날씨 짐의 이유 — "12/3 비 예보"
}

export interface Trip {
  id: string;
  name: string;
  start: string; // YYYY-MM-DD
  end: string;   // YYYY-MM-DD (당일치기면 start와 같다)
  destination: string | null;
  items: TripItem[];
  // 사용자가 뺀 날씨 짐 — 예보를 다시 받아도 되살리지 않는다
  dismissed?: string[];
}

export const MAX_TRIP_NIGHTS = 14;
// 끝난 여행은 며칠 뒤 정리한다
const KEEP_AFTER_END_DAYS = 3;

const DAY_MS = 24 * 60 * 60 * 1000;

function parse(date: string): Date {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function addDays(date: string, days: number): string {
  const d = parse(date);
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function tripNights(trip: Pick<Trip, 'start' | 'end'>): number {
  return Math.max(0, Math.round((parse(trip.end).getTime() - parse(trip.start).getTime()) / DAY_MS));
}

export function tripDates(trip: Pick<Trip, 'start' | 'end'>): string[] {
  return Array.from({ length: tripNights(trip) + 1 }, (_, i) => addDays(trip.start, i));
}

// 기본 짐 — 묵는 밤 수에 따라. 당일치기면 꼭 필요한 것만.
export function baseTripLabels(nights: number): string[] {
  const always = ['신분증', '휴대폰 충전기', '보조배터리'];
  if (nights === 0) return always;
  const days = nights + 1;
  return [
    ...always,
    '칫솔·치약',
    '세면도구',
    `속옷 ${days}벌`,
    `양말 ${days}켤레`,
    '잠옷',
    '상비약',
  ];
}

const short = (date: string) => `${Number(date.slice(5, 7))}/${Number(date.slice(8, 10))}`;

// 날짜별 예보 → 날씨 짐. 같은 짐은 한 번, 이유에는 처음 해당하는 날을 적는다.
export function weatherTripItems(outlooks: Array<{ date: string; outlook: DayOutlook | null }>): Array<{ label: string; reason: string }> {
  const out = new Map<string, string>();
  const add = (label: string, reason: string) => { if (!out.has(label)) out.set(label, reason); };
  for (const { date, outlook: o } of outlooks) {
    if (!o) continue;
    if (o.snow) add('방한 장갑', `${short(date)} 눈 예보`);
    if (o.rain || o.snow) add('우산', `${short(date)} ${o.snow ? '눈' : '비'} 예보`);
    if (o.minTemp !== null && o.minTemp <= 5) add('두꺼운 겉옷', `${short(date)} 최저 ${o.minTemp}°C`);
    if (o.heat) add('선크림', `${short(date)} 최고 ${o.maxTemp}°C`);
    if (o.minTemp !== null && o.maxTemp !== null && o.maxTemp - o.minTemp >= 10) {
      add('얇은 겉옷', `${short(date)} 일교차 ${o.maxTemp - o.minTemp}°C`);
    }
  }
  return [...out.entries()].map(([label, reason]) => ({ label, reason }));
}

// 날씨 짐을 새 예보로 바꾼다 — 챙긴 표시는 같은 이름이면 남기고, 사라진 날씨 짐은 아직 안 챙겼을 때만 뺀다.
export function mergeWeatherItems(
  items: TripItem[], fresh: Array<{ label: string; reason: string }>, newId: () => string, dismissed: readonly string[] = []
): TripItem[] {
  fresh = fresh.filter((f) => !dismissed.includes(f.label));
  const freshLabels = new Set(fresh.map((f) => f.label));
  const kept = items.filter((i) => i.kind !== 'weather' || freshLabels.has(i.label) || i.checked);
  const labels = new Set(kept.map((i) => i.label));
  const updated = kept.map((i) => {
    const f = fresh.find((x) => x.label === i.label);
    return i.kind === 'weather' && f ? { ...i, reason: f.reason } : i;
  });
  const added = fresh
    .filter((f) => !labels.has(f.label))
    .map((f) => ({ id: newId(), label: f.label, checked: false, kind: 'weather' as const, reason: f.reason }));
  return [...updated, ...added];
}

export type TripPhase = 'upcoming' | 'ongoing' | 'past';

export function tripPhase(trip: Pick<Trip, 'start' | 'end'>, today: string): TripPhase {
  if (today < trip.start) return 'upcoming';
  if (today <= trip.end) return 'ongoing';
  return 'past';
}

// 대시보드에 보일 여행 — 끝나지 않은 것 전부, 출발 순
export function upcomingTrips(trips: readonly Trip[], today: string): Trip[] {
  return [...trips].filter((t) => t.end >= today).sort((a, b) => a.start.localeCompare(b.start));
}

export function pruneTrips(trips: readonly Trip[], today: string): Trip[] {
  const cutoff = addDays(today, -KEEP_AFTER_END_DAYS);
  return trips.filter((t) => t.end >= cutoff);
}

// "3일 뒤 출발" / "내일 출발" / "여행 중 · 2/3일째"
export function tripWhen(trip: Pick<Trip, 'start' | 'end'>, today: string): string {
  const phase = tripPhase(trip, today);
  if (phase === 'ongoing') {
    const day = Math.round((parse(today).getTime() - parse(trip.start).getTime()) / DAY_MS) + 1;
    return `여행 중 · ${day}/${tripNights(trip) + 1}일째`;
  }
  if (phase === 'past') return '끝난 여행';
  const until = Math.round((parse(trip.start).getTime() - parse(today).getTime()) / DAY_MS);
  return until === 1 ? '내일 출발' : `${until}일 뒤 출발`;
}
