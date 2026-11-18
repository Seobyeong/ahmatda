// 아맞다 — 기상·부가 알람 (휴대폰 알람처럼 끌 때까지 울림, 요일 반복, 5분 뒤 다시 울림)
//
// 예약 계획과 끌 때 보여줄 요약을 만드는 순수 함수. 실제 예약·소리는 services/alarm/AlarmService.ts.

import type { ChecklistItem, CurrentWeather } from '@/types';
import { sortByUrgency } from './departureSnapshot';

export interface Alarm {
  id: string;
  time: string;    // "HH:mm"
  days: number[];  // 울릴 요일 0(일)~6(토). 비어 있으면 한 번만 울리고 꺼진다.
  enabled: boolean;
  label: string;   // 비어 있으면 '알람'
  updatedAt?: number; // 동기화 충돌 해결용 (최근 것이 이긴다)
}

export const ALARM_ID_PREFIX = 'alarm-';
export const SNOOZE_ID_PREFIX = 'alarm-snooze-';
export const SNOOZE_MS = 5 * 60 * 1000;

export interface AlarmTrigger {
  id: string;        // 알림 id — 울리면 떠 있는 알림도 같은 id
  alarmId: string;
  timestamp: number;
  weekly: boolean;
}

const DAY_MS = 24 * 60 * 60 * 1000;

function atTime(base: Date, time: string): Date {
  const [h, m] = time.split(':').map(Number);
  const d = new Date(base);
  d.setHours(h, m, 0, 0);
  return d;
}

// now 이후 처음 오는 그 요일의 그 시각. 오늘이 그 요일이어도 시각이 지났으면 다음 주.
export function nextWeekdayAt(time: string, day: number, now: Date): Date {
  const today = atTime(now, time);
  let diff = (day - now.getDay() + 7) % 7;
  if (diff === 0 && today.getTime() <= now.getTime()) diff = 7;
  const d = new Date(today);
  d.setDate(d.getDate() + diff);
  return d;
}

// now 이후 처음 오는 그 시각 (오늘 지났으면 내일).
export function nextAt(time: string, now: Date): Date {
  const today = atTime(now, time);
  if (today.getTime() > now.getTime()) return today;
  const d = new Date(today);
  d.setDate(d.getDate() + 1);
  return d;
}

export function triggerIdFor(alarmId: string, day: number | null): string {
  return `${ALARM_ID_PREFIX}${alarmId}-${day === null ? 'once' : `d${day}`}`;
}

// 켜진 알람마다 예약할 트리거 — 반복 요일 하나당 매주 반복 트리거 하나.
export function planAlarmTriggers(alarms: Alarm[], now: Date): AlarmTrigger[] {
  return alarms
    .filter((a) => a.enabled)
    .flatMap((a): AlarmTrigger[] =>
      a.days.length === 0
        ? [{ id: triggerIdFor(a.id, null), alarmId: a.id, timestamp: nextAt(a.time, now).getTime(), weekly: false }]
        : [...new Set(a.days)].sort().map((day) => ({
            id: triggerIdFor(a.id, day),
            alarmId: a.id,
            timestamp: nextWeekdayAt(a.time, day, now).getTime(),
            weekly: true,
          }))
    );
}

// 알림 id가 알람(또는 다시 울림)인지
export function isAlarmNotificationId(id: string | undefined): boolean {
  return !!id && id.startsWith(ALARM_ID_PREFIX);
}

// 가장 가까운 다음 울림 — 설정 화면의 "다음 알람: 내일 07:00" 표시용. 없으면 null.
export function nextRing(alarms: Alarm[], now: Date): Date | null {
  const times = planAlarmTriggers(alarms, now).map((t) => t.timestamp);
  return times.length > 0 ? new Date(Math.min(...times)) : null;
}

const DAY_NAMES = ['일', '월', '화', '수', '목', '금', '토'];

// "매일" / "평일" / "주말" / "월·수·금" / "한 번"
export function describeDays(days: number[]): string {
  const set = [...new Set(days)].sort();
  if (set.length === 0) return '한 번';
  if (set.length === 7) return '매일';
  if (set.join() === '1,2,3,4,5') return '평일';
  if (set.join() === '0,6') return '주말';
  // 월요일부터 읽히게 일요일을 뒤로
  return [...set.filter((d) => d !== 0), ...set.filter((d) => d === 0)].map((d) => DAY_NAMES[d]).join('·');
}

// "오늘 07:00" / "내일 07:00" / "11/21(금) 07:00"
export function describeWhen(at: Date, now: Date): string {
  const hm = `${String(at.getHours()).padStart(2, '0')}:${String(at.getMinutes()).padStart(2, '0')}`;
  const dayStart = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const diff = Math.round((dayStart(at) - dayStart(now)) / DAY_MS);
  if (diff === 0) return `오늘 ${hm}`;
  if (diff === 1) return `내일 ${hm}`;
  return `${at.getMonth() + 1}/${at.getDate()}(${DAY_NAMES[at.getDay()]}) ${hm}`;
}

export interface WakeSummary {
  weather: string | null; // "비 · 12°C (체감 10°C)" — 아직 못 불러왔으면 null
  weatherItems: string[]; // 날씨 때문에 오늘 챙길 것 — 우산·마스크·물병
  items: string;          // "챙길 것 4개 · 우산, 노트북 외 2개" | "챙길 것을 다 챙겼어요" | "챙길 것 없음"
}

const SUMMARY_LABELS = 2;

// 알람을 끌 때 보여줄 오늘 요약. 체크리스트는 날씨·일정이 반영된 오늘 목록이다.
export function buildWakeSummary(weather: CurrentWeather | null, checklist: ChecklistItem[]): WakeSummary {
  const unchecked = sortByUrgency(checklist.filter((i) => !i.checked));
  const shown = unchecked.slice(0, SUMMARY_LABELS).map((i) => i.label);
  const rest = unchecked.length - shown.length;

  let items: string;
  if (checklist.length === 0) items = '챙길 것 없음';
  else if (unchecked.length === 0) items = '챙길 것을 다 챙겼어요';
  else items = `챙길 것 ${unchecked.length}개 · ${shown.join(', ')}${rest > 0 ? ` 외 ${rest}개` : ''}`;

  return {
    weather: weather?.label ?? null,
    weatherItems: checklist.filter((i) => i.tier === 1).map((i) => (i.badge ? `${i.label}(${i.badge})` : i.label)),
    items,
  };
}
