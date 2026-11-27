// 아맞다 — 외출 일정 (요일별 외출 시간 · 쉬는 날 · 오늘만 바꾸기)
//
// 외출 시간은 "기본 시간 하나 + 바뀌는 요일만 예외 + 오늘만 바꾼 것"으로 정해진다
// (2026-11-18 결정). 날짜를 주면 그날 몇 시에 나가는지(또는 안 나가는지)를 돌려주고,
// 나머지 계산(다음 외출, 감시 창, 알림 시각)은 전부 그 위에서 한다.
//
// 자정 직후 출발("00:15")은 그 날짜의 00:15다 — 기존 계산(getNextAlertDate 등)과 같은 규칙.
// 그래서 수요일 00:15 출발의 알림·감시 창은 화요일 23:45부터 시작한다.

import { DEPARTURE_ALERT_LEAD_MS, DEPARTURE_WINDOW_MS, toDateString } from './time';

export type DayPlan = string | 'off'; // "HH:mm" 또는 쉬는 날
// 날짜를 콕 집어 정한 것 — 'usual'은 "평소(요일 계획)대로"라고 대답했다는 표시다 (공휴일 질문에 답함).
export type DatePlan = DayPlan | 'usual';

export interface DepartureSchedule {
  base: string;                                // 기본 외출 시간
  weekdays: Partial<Record<string, DayPlan>>;  // 요일 예외 — 키 '0'(일)~'6'(토)
  today: { date: string; plan: DayPlan } | null; // 그날만 바꾼 것 — date가 지나면 무시
  // 날짜별로 정한 것 — 공휴일 질문의 대답, 앱에서 등록한 일정의 나가는 시간. 키 "YYYY-MM-DD".
  dates?: Record<string, DatePlan>;
  // 공휴일 이름 — 키 "YYYY-MM-DD". 계획을 바꾸지는 않는다: 대답이 없으면 평소처럼 나가는 날이다
  // (2026-11-27 결정 — 공휴일에도 일하는 사람이 알림을 놓치지 않게). 알림 문구와 질문에만 쓴다.
  holidays?: Record<string, string>;
}

const DAY_MS = 24 * 60 * 60 * 1000;
// 다음 외출을 찾을 때 볼 범위. 요일 예외로 일주일 내내 쉬는 날이면 외출이 없다.
const SEARCH_DAYS = 8;

// 그날의 계획. 오늘만 바꾼 것 > 날짜별로 정한 것 > 요일 예외 > 기본.
export function planOn(date: Date, s: DepartureSchedule): DayPlan {
  const key = toDateString(date);
  if (s.today && s.today.date === key) return s.today.plan;
  const dated = s.dates?.[key];
  if (dated !== undefined && dated !== 'usual') return dated;
  return weeklyPlanOn(date, s);
}

// 요일 계획만 — 날짜별로 정한 것을 빼고 본 그날.
export function weeklyPlanOn(date: Date, s: Pick<DepartureSchedule, 'base' | 'weekdays'>): DayPlan {
  return s.weekdays[String(date.getDay())] ?? s.base;
}

// 대시보드 머리의 오늘 한 줄 (2026-11-28) — "출근하는 날 · 08:15 출발", "쉬는 날", "성탄절 · 08:15 출발".
// purpose는 고른 목적의 짧은 이름(출근·운동…)이다.
export function describeToday(now: Date, s: DepartureSchedule, purpose: string | null): string {
  const plan = planOn(now, s);
  const holiday = holidayOn(now, s);
  if (plan === 'off') return holiday ? `${holiday} · 쉬는 날` : '쉬는 날';
  const lead = holiday ?? (purpose ? `${purpose}하는 날` : null);
  return lead ? `${lead} · ${plan} 출발` : `${plan} 출발`;
}

// ---- 공휴일 ----

export function holidayOn(date: Date, s: DepartureSchedule): string | null {
  return s.holidays?.[toDateString(date)] ?? null;
}

// 물어봐야 하는 공휴일 — 공휴일인데 아직 대답이 없고, 대답이 없으면 평소처럼 나가는 날.
// (원래 쉬는 요일인 공휴일은 물을 게 없다.)
export function isUnansweredHoliday(date: Date, s: DepartureSchedule): boolean {
  const key = toDateString(date);
  if (!s.holidays?.[key]) return false;
  if (s.today && s.today.date === key) return false;
  if (s.dates?.[key] !== undefined) return false;
  return weeklyPlanOn(date, s) !== 'off';
}

export interface HolidayQuestion {
  name: string;     // "성탄절" / "추석 연휴"
  dates: string[];  // 대답을 받을 날짜들 (원래 나가는 날인 공휴일만)
  first: Date;
}

// 연휴로 이어 볼 최대 날수 — 설·추석에 주말·대체공휴일이 붙어도 이 안이다.
const HOLIDAY_BLOCK_MAX_DAYS = 10;

// start 날짜부터 시작하는 공휴일 묶음의 질문. start가 물어볼 공휴일이 아니면 null.
// 공휴일과 원래 쉬는 요일이 이어진 동안을 한 묶음으로 본다 — 토요일 개천절 → 일 → 월 대체공휴일.
export function holidayQuestionFrom(s: DepartureSchedule, start: Date): HolidayQuestion | null {
  if (!isUnansweredHoliday(start, s)) return null;
  const dates: string[] = [];
  const names: string[] = [];
  for (let i = 0; i < HOLIDAY_BLOCK_MAX_DAYS; i++) {
    const day = addDays(start, i);
    const name = holidayOn(day, s);
    // 공휴일이 아닌 날은 원래 쉬는 날(요일 계획이든 날짜별로 정한 쉼이든)일 때만 연휴를 잇는다.
    if (!name && planOn(day, s) !== 'off') break;
    if (name && !names.includes(name)) names.push(name);
    if (isUnansweredHoliday(day, s)) dates.push(toDateString(day));
  }
  const main = names.find((n) => n !== '대체공휴일') ?? names[0];
  const span = new Set(dates).size;
  return { name: span > 1 && !main.endsWith('연휴') ? `${main} 연휴` : main, dates, first: start };
}

// 이미 대답한 공휴일 — 오늘이나 내일 것. 대시보드가 대답을 보여주고 [바꾸기]로 지울 수 있게 한다.
export interface AnsweredHoliday {
  name: string;
  dates: string[];      // 대답한 공휴일 날짜들 (지우면 다시 묻는다)
  first: Date;
  plan: DatePlan;       // 첫날의 대답
}

export function answeredHolidayFrom(s: DepartureSchedule, now: Date): AnsweredHoliday | null {
  for (const offset of [0, 1]) {
    const start = addDays(now, offset);
    const key = toDateString(start);
    const name = holidayOn(start, s);
    const plan = s.dates?.[key];
    if (!name || plan === undefined) continue;
    const dates: string[] = [];
    for (let i = 0; i < HOLIDAY_BLOCK_MAX_DAYS; i++) {
      const day = addDays(start, i);
      const dayKey = toDateString(day);
      if (!holidayOn(day, s) && planOn(day, s) !== 'off') break;
      if (holidayOn(day, s) && s.dates?.[dayKey] !== undefined) dates.push(dayKey);
    }
    return { name, dates, first: start, plan };
  }
  return null;
}

// "성탄절이에요" / "추석 연휴예요" — 받침 따라.
export function withIeyo(word: string): string {
  const last = word.charCodeAt(word.length - 1);
  const hangul = last >= 0xac00 && last <= 0xd7a3;
  return `${word}${hangul && (last - 0xac00) % 28 === 0 ? '예요' : '이에요'}`;
}

// 지금 물어볼 공휴일 — 오늘이나 내일 시작하는 것. 오늘 것이 먼저다.
// 어제부터 이어진 연휴의 가운데 날이어도 아직 대답이 없으면 그날부터 다시 묻는다.
export function pendingHolidayQuestion(s: DepartureSchedule, now: Date): HolidayQuestion | null {
  return holidayQuestionFrom(s, addDays(now, 0)) ?? holidayQuestionFrom(s, addDays(now, 1));
}

// 그날 출발 시각(HH:mm), 쉬는 날이면 null.
export function departureTimeOn(date: Date, s: DepartureSchedule): string | null {
  const plan = planOn(date, s);
  return plan === 'off' ? null : plan;
}

function at(date: Date, time: string): Date {
  const [h, m] = time.split(':').map(Number);
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), h, m, 0, 0);
}

function addDays(date: Date, days: number): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
}

// from 날짜부터 days일 동안의 실제 출발 시각들 (시간순).
export function departuresBetween(s: DepartureSchedule, from: Date, days: number): Date[] {
  const out: Date[] = [];
  for (let i = 0; i < days; i++) {
    const day = addDays(from, i);
    const time = departureTimeOn(day, s);
    if (time) out.push(at(day, time));
  }
  return out;
}

// now 뒤의 첫 출발. 앞으로 일주일 넘게 외출이 없으면 null.
export function nextDeparture(s: DepartureSchedule, now: Date): Date | null {
  return departuresBetween(s, now, SEARCH_DAYS).find((d) => d.getTime() > now.getTime()) ?? null;
}

// now 이전(같은 시각 포함)의 마지막 출발. 지난 일주일에 없으면 null.
export function previousDeparture(s: DepartureSchedule, now: Date): Date | null {
  const list = departuresBetween(s, addDays(now, -(SEARCH_DAYS - 1)), SEARCH_DAYS);
  return [...list].reverse().find((d) => d.getTime() <= now.getTime()) ?? null;
}

// 지금 감시 창(출발 30분 전 ~ 그로부터 2시간) 안이면 창이 걸린 출발과 남은 ms. 밖이면 null.
// 쉬는 날은 창이 없다 — 출발 알림·외출 감지 긴급 알림이 쉰다.
export function currentWindow(s: DepartureSchedule, now: Date): { departure: Date; remainingMs: number } | null {
  // 창은 출발 30분 전에 시작해 1시간 30분 뒤에 끝나므로 어제~내일 출발만 보면 된다.
  for (const departure of departuresBetween(s, addDays(now, -1), 3)) {
    const start = departure.getTime() - DEPARTURE_ALERT_LEAD_MS;
    const end = start + DEPARTURE_WINDOW_MS;
    if (now.getTime() >= start && now.getTime() <= end) return { departure, remainingMs: end - now.getTime() };
  }
  return null;
}

// 다음 출발 알림 시각(출발 30분 전)과 그 출발. 이미 알림 시각이 지난 출발은 건너뛴다.
export function nextAlert(s: DepartureSchedule, now: Date): { alertAt: Date; departure: Date } | null {
  for (const departure of departuresBetween(s, now, SEARCH_DAYS + 1)) {
    const alertAt = new Date(departure.getTime() - DEPARTURE_ALERT_LEAD_MS);
    if (alertAt.getTime() > now.getTime()) return { alertAt, departure };
  }
  return null;
}

// 착장 피드백이 가리키는 외출 날짜 — 지금 이전 마지막 "출발 기준 시각"의 날짜.
// 쉬는 날도 기준 시각(기본 시간)으로 센다: 쉬는 날에도 나갈 수 있고, 건너뛰면 그 답이 지난 근무일
// 기록을 덮어써 버린다. 자정 이후 정리(00:30)면 아직 오늘 기준 시각 전이라 어제 외출이 된다.
export function feedbackOutingDate(s: DepartureSchedule, now: Date): string {
  for (let i = 0; i <= 1; i++) {
    const day = addDays(now, -i);
    if (at(day, referenceTimeOn(day, s)).getTime() <= now.getTime()) return toDateString(day);
  }
  return toDateString(addDays(now, -2));
}

// 그날 일정과 맞춰 볼 출발 시각 — 쉬는 날이면 기본 시간(일정 기준점으로만 쓴다).
export function referenceTimeOn(date: Date, s: DepartureSchedule): string {
  return departureTimeOn(date, s) ?? s.base;
}

// 오늘만 바꾼 것이 지난 날짜면 지운다 — 저장된 값이 쌓이지 않게.
export function activeToday(today: DepartureSchedule['today'], now: Date): DepartureSchedule['today'] {
  return today && today.date === toDateString(now) ? today : null;
}

// ---- 표시 ----

const DAY_NAMES = ['일', '월', '화', '수', '목', '금', '토'];

export interface DepartureCountdown {
  label: string;
  value: string;
  detail: string | null;
  soon: boolean;
}

export const COUNTDOWN_HORIZON_MIN = 12 * 60;
export const DEPARTURE_SOON_MIN = DEPARTURE_ALERT_LEAD_MS / 60000;
export const DEPARTURE_OVERDUE_MIN = 30;

function hm(d: Date): string {
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function dayWord(target: Date, now: Date): string {
  const diff = Math.round((addDays(target, 0).getTime() - addDays(now, 0).getTime()) / DAY_MS);
  if (diff === 0) return '오늘';
  if (diff === 1) return '내일';
  return `${DAY_NAMES[target.getDay()]}요일`;
}

// 대시보드 맨 위 "외출까지 남은 시간" 한 줄 (time.ts의 같은 이름 함수를 일정 기준으로 바꾼 것).
export function getScheduleCountdown(s: DepartureSchedule, now: Date): DepartureCountdown {
  const prev = previousDeparture(s, now);
  if (prev) {
    const overdue = Math.floor((now.getTime() - prev.getTime()) / 60000);
    if (overdue < DEPARTURE_OVERDUE_MIN) {
      return { label: '나갈 시간이 지났어요', value: overdue === 0 ? '지금' : `${overdue}분 지남`, detail: `${hm(prev)} 출발`, soon: true };
    }
  }

  const next = nextDeparture(s, now);
  const todayOff = planOn(now, s) === 'off';
  if (!next) return { label: '외출 일정', value: '이번 주는 쉬어요', detail: null, soon: false };

  const minutes = Math.ceil((next.getTime() - now.getTime()) / 60000);
  // 오늘 쉬는 날이면 남은 시간을 세지 않고 다음 외출만 알린다.
  if (minutes > COUNTDOWN_HORIZON_MIN || (todayOff && toDateString(next) !== toDateString(now))) {
    return {
      label: todayOff ? '오늘은 쉬어요 · 다음 외출' : '다음 외출',
      value: `${dayWord(next, now)} ${hm(next)}`,
      detail: null,
      soon: false,
    };
  }

  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  const value = h === 0 ? `${m}분` : m === 0 ? `${h}시간` : `${h}시간 ${m}분`;
  const soon = minutes <= DEPARTURE_SOON_MIN;
  return { label: soon ? '곧 나갈 시간이에요' : '외출까지', value, detail: `${hm(next)} 출발`, soon };
}

// 설정 화면 요약 — "평일 08:30 · 수 10:00 · 토·일 쉼"
export function describeSchedule(s: Pick<DepartureSchedule, 'base' | 'weekdays'>): string {
  const groups = new Map<string, number[]>();
  [1, 2, 3, 4, 5, 6, 0].forEach((d) => {
    const plan = s.weekdays[String(d)] ?? s.base;
    groups.set(plan, [...(groups.get(plan) ?? []), d]);
  });
  const days = (list: number[]) => {
    const key = [...list].sort().join();
    if (list.length === 7) return '매일';
    if (key === '1,2,3,4,5') return '평일';
    if (key === '0,6') return '주말';
    return list.map((d) => DAY_NAMES[d]).join('·');
  };
  return [...groups.entries()]
    .map(([plan, list]) => `${days(list)} ${plan === 'off' ? '쉼' : plan}`)
    .join(' · ');
}

// ---- 출발 알림 예약 계획 ----
//
// 앱을 며칠 안 열어도 알림이 끊기지 않게 요일마다 "매주 반복" 예약을 하나씩 건다 (쉬는 요일은 없음).
// 날짜를 따로 정한 날(오늘만 바꾸기·공휴일 대답·등록한 일정)과 대답 없는 공휴일은 반복으로 덮을 수 없다 —
// 그날은 한 번짜리로 따로 걸고(쉬면 안 건다), 그 요일의 반복은 그런 날이 다 지난 뒤부터 시작한다.
// 반복이 시작되기 전의 평범한 날도 한 번짜리로 건다. 앞으로 SPECIAL_HORIZON_DAYS일만 본다 —
// 그 뒤의 특별한 날은 그 사이에 앱이 다시 예약할 때 반영된다.

export const DEPARTURE_ALERT_PREFIX = 'departure-alert';
const SPECIAL_HORIZON_DAYS = 15;

// 날짜 하나짜리 출발 알림 id
export function oneOffAlertId(date: string): string {
  return `${DEPARTURE_ALERT_PREFIX}-o${date}`;
}

export interface AlertTrigger {
  id: string;
  alertAt: Date;
  departure: Date;
  weekly: boolean;
  // 대답 없는 공휴일이면 그 이름 — 알림에 "오늘은 성탄절이에요"와 [오늘은 쉬어요]를 붙인다.
  holiday?: string | null;
}

function isSpecialDay(date: Date, s: DepartureSchedule): boolean {
  const key = toDateString(date);
  return (s.today?.date === key) || s.dates?.[key] !== undefined || isUnansweredHoliday(date, s);
}

export function planDepartureAlerts(s: DepartureSchedule, now: Date): AlertTrigger[] {
  const out: AlertTrigger[] = [];
  const alertOf = (date: Date, plan: string) => {
    const departure = at(date, plan);
    return { departure, alertAt: new Date(departure.getTime() - DEPARTURE_ALERT_LEAD_MS) };
  };

  for (let day = 0; day < 7; day++) {
    const plan = s.weekdays[String(day)] ?? s.base;
    if (plan === 'off') continue;
    const occurrences = Array.from({ length: SPECIAL_HORIZON_DAYS }, (_, i) => addDays(now, i))
      .filter((d) => d.getDay() === day);
    // 반복은 마지막 특별한 날 다음 주부터 — 그 전 평범한 날은 한 번짜리로.
    let lastSpecial = -1;
    occurrences.forEach((d, i) => { if (isSpecialDay(d, s)) lastSpecial = i; });
    occurrences.forEach((d, i) => {
      if (i >= lastSpecial || isSpecialDay(d, s)) return;
      const a = alertOf(d, plan);
      if (a.alertAt.getTime() > now.getTime()) {
        out.push({ id: oneOffAlertId(toDateString(d)), ...a, weekly: false });
      }
    });
    // 반복 시작 — 마지막 특별한 날 뒤(없으면 처음부터) 알림 시각이 아직 안 지난 첫 그 요일.
    let candidate = lastSpecial >= 0 ? addDays(occurrences[lastSpecial], 7) : occurrences[0];
    for (let guard = 0; guard < 3; guard++) {
      const a = alertOf(candidate, plan);
      if (a.alertAt.getTime() > now.getTime()) {
        out.push({ id: `${DEPARTURE_ALERT_PREFIX}-d${day}`, ...a, weekly: true });
        break;
      }
      candidate = addDays(candidate, 7);
    }
  }

  for (let i = 0; i < SPECIAL_HORIZON_DAYS; i++) {
    const d = addDays(now, i);
    if (!isSpecialDay(d, s)) continue;
    const plan = planOn(d, s);
    if (plan === 'off') continue;
    const a = alertOf(d, plan);
    if (a.alertAt.getTime() <= now.getTime()) continue;
    out.push({
      id: oneOffAlertId(toDateString(d)), ...a, weekly: false,
      holiday: isUnansweredHoliday(d, s) ? holidayOn(d, s) : null,
    });
  }
  return out.sort((a, b) => a.alertAt.getTime() - b.alertAt.getTime());
}

// 지난 날짜의 날짜별 계획을 지운다 — 저장된 값이 쌓이지 않게. 어제 것은 남긴다
// (자정 직후 출발이면 어제 출발의 감시 창이 아직 열려 있을 수 있다).
export function activeDates(dates: Record<string, DatePlan> | undefined, now: Date): Record<string, DatePlan> {
  const from = toDateString(addDays(now, -1));
  return Object.fromEntries(Object.entries(dates ?? {}).filter(([d]) => d >= from));
}

// 앱 밖 표시용 출발 — 감시 창 안이면 그 출발(출발 시각이 막 지나 아직 집에 있어도 그 외출이다),
// 아니면 다음 출발.
export function currentDepartureLabel(s: DepartureSchedule, now: Date): string | null {
  const window = currentWindow(s, now);
  if (window) {
    const d = window.departure;
    return toDateString(d) === toDateString(now) ? hm(d) : `${dayWord(d, now)} ${hm(d)}`;
  }
  return nextDepartureLabel(s, now);
}

// 앱 밖 표시(위젯·잠금화면)용 다음 출발 — "08:30"(오늘) / "내일 08:30" / "월요일 08:30". 일주일 안에 없으면 null.
export function nextDepartureLabel(s: DepartureSchedule, now: Date): string | null {
  const next = nextDeparture(s, now);
  if (!next) return null;
  return toDateString(next) === toDateString(now) ? hm(next) : `${dayWord(next, now)} ${hm(next)}`;
}

// "HH:mm"
export function formatHm(d: Date): string {
  return hm(d);
}

// 다음 외출 날을 부르는 말 — "오늘" / "내일" / "월요일"
export function dayLabel(target: Date, now: Date): string {
  return dayWord(target, now);
}
