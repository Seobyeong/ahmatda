// 아맞다 — 자기 전 정리 알림 계획 (docs/외출-감지-재설계.md 5장)
//
// 예전에는 매일 반복 알림 하나였다. 날마다 보낼지·피드백을 붙일지가 달라져서, 앞으로 PLAN_DAYS일 치를
// 하루 하나씩 따로 예약하고, 마지막 날부터는 매일 반복 알림을 건다. 기본은 "평소처럼(피드백 포함) 보냄"이고,
// 오늘 밤 것만 알림 시각 DECIDE_BEFORE_MS 안에 들어왔을 때 실제로 판단해 바꾼다(건너뜀 / 피드백 없이 챙길 것만).
//   → 앱이 꺼진 채 몇 주가 지나도 기본 알림은 계속 온다 (조용히 끊기지 않는다).
//
// plan()을 부르는 곳: 앱 시작·복귀, 15분 백그라운드 확인, 설정 변경, 외출 흔적이 새로 생겼을 때.

import { NotificationService, type NightlyEntry } from '@/services/notification/NotificationService';
import { buildTomorrowPreview, type PreviewItem } from '@/utils/tomorrowPreview';
import { countRecentForgotten } from '@/utils/forgotten';
import {
  DEPARTURE_ALERT_LEAD_MS, getNextDailyDate, getTodayString, isValidHHmm, toDateString,
} from '@/utils/time';
import {
  dayLabel, feedbackOutingDate, formatHm, holidayQuestionFrom, nextDeparture, nextDepartureLabel, referenceTimeOn,
  type DepartureSchedule,
} from '@/utils/schedule';
import type { NightlyHoliday } from '@/services/notification/NotificationService';
import { fetchPreviewInputs } from './previewInputs';
import { classifyOuting, decideNightly, nextOutingDiffers, previewHighlight } from './nightlyRules';
import { OutingLog } from './outingLog';

const PLAN_DAYS = 7;
const DECIDE_BEFORE_MS = 3 * 60 * 60 * 1000;
const DEFAULT_TIME = '22:00';
const DAY_MS = 24 * 60 * 60 * 1000;
// 폴링마다 예보를 다시 받지 않게 — 같은 날 미리보기는 30분 동안 다시 쓴다 (설정이 바뀌면 fresh로 무시).
const PREVIEW_TTL_MS = 30 * 60 * 1000;
// 백그라운드 확인의 실행 시간 안에 끝나게 — 넘으면 "모름"으로 보고(보내는 쪽) 넘어간다.
const PREVIEW_TIMEOUT_MS = 10 * 1000;

let previewCache: { key: string; at: number; items: PreviewItem[] | null } | null = null;

let running: Promise<void> = Promise.resolve();

function dayStart(d: Date): number {
  const s = new Date(d);
  s.setHours(0, 0, 0, 0);
  return s.getTime();
}

function localDate(date: string): Date {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function localMidnight(date: string): number {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(y, m - 1, d).getTime();
}

// 그날 출발 감시 창 시작(출발 30분 전) — 이때부터 집에 있었는지 본다.
// 출발 시각을 그날에 앉힌 뒤 30분을 뺀다 — "00:15" 출발이면 창은 전날 23:45부터다 (getNextAlertDate와 같은 이유).
function windowStartOf(date: string, departureTime: string): number {
  const [y, m, d] = date.split('-').map(Number);
  const [hh, mm] = departureTime.split(':').map(Number);
  return new Date(y, m - 1, d, hh, mm, 0, 0).getTime() - DEPARTURE_ALERT_LEAD_MS;
}

// 이 밤 알림이 물어볼 공휴일 — 다음 날 시작하는 대답 없는 공휴일(연휴는 한 번에).
// 새벽(04시 전)에 울리는 정리 알림이면 "다음 날"은 그날이다.
function holidayFor(at: Date, schedule: DepartureSchedule): NightlyHoliday | null {
  const target = new Date(at.getFullYear(), at.getMonth(), at.getDate() + (at.getHours() < 4 ? 0 : 1));
  const q = holidayQuestionFrom(schedule, target);
  return q && q.dates.length > 0 ? { name: q.name, dates: q.dates, dayLabel: dayLabel(target, at) } : null;
}

async function nextOutingPreview(fireAt: Date, fresh: boolean): Promise<PreviewItem[] | null> {
  const { useAppStore, scheduleOf } = await import('@/store');
  const state = useAppStore.getState();
  const s = state.userSettings;
  // 다음 외출 — 쉬는 날은 건너뛴다. 일주일 안에 외출이 없으면 미리볼 것도 없다.
  const next = nextDeparture(scheduleOf(state, fireAt), fireAt);
  if (!next) return null;
  const time = formatHm(next);
  const key = `${toDateString(next)}|${time}`;
  if (!fresh && previewCache && previewCache.key === key && Date.now() - previewCache.at < PREVIEW_TTL_MS) {
    return previewCache.items;
  }

  const inputs = await Promise.race([
    fetchPreviewInputs(next, time),
    new Promise<null>((resolve) => setTimeout(() => resolve(null), PREVIEW_TIMEOUT_MS)),
  ]);
  if (!inputs) return null;
  const { events, outlook } = inputs;

  const preview = buildTomorrowPreview({
    date: next,
    departureTime: time,
    routines: state.permanentRoutines,
    events,
    customKeywords: s.customKeywords,
    disabledWeatherItems: s.disabledWeatherItems,
    disabledPurposeItems: s.disabledPurposeItems,
    outlook,
    forgottenCounts: countRecentForgotten(state.forgottenHistory, getTodayString()),
    commuteMode: s.commuteMode,
  });
  // 예보를 못 받았고 다른 이유로 달라지는 것도 없으면 "모름" — 날씨 때문에 달라질 수 있다.
  const notable = preview.items.some((i) => i.kind !== 'routine');
  const items = outlook === null && !notable ? null : preview.items;
  previewCache = { key, at: Date.now(), items };
  return items;
}

async function planOnce(fresh: boolean): Promise<void> {
  const { useAppStore, whenHydrated, scheduleOf } = await import('@/store');
  await whenHydrated();
  const state = useAppStore.getState();
  const s = state.userSettings;
  if (!s.onboarded) return;
  const schedule = scheduleOf(state);

  const time = isValidHHmm(s.nightlyCheckTime) ? s.nightlyCheckTime : DEFAULT_TIME;
  const [hh, mm] = time.split(':').map(Number);
  const now = new Date();
  const first = getNextDailyDate(hh, mm, now);
  const fires = Array.from({ length: PLAN_DAYS }, (_, i) => {
    const d = new Date(first);
    d.setDate(d.getDate() + i);
    return d;
  });

  // 마지막 날부터는 매일 반복 — 앱이 다시 안 돌아도 기본 알림이 끊기지 않게 (다시 돌면 한 칸씩 밀린다).
  // 칸마다 그 밤 다음 외출 ("내일 08:30" / "월요일 08:30"). 매일 반복 칸은 날마다 달라서 시각을 말하지 않는다.
  const entries: NightlyEntry[] = fires.map((at, i) => {
    const repeat = i === fires.length - 1;
    const atSchedule = scheduleOf(state, at);
    return {
      at, variant: 'full', highlight: null, repeat,
      departure: repeat ? null : nextDepartureLabel(atSchedule, at),
      // 매일 반복 칸은 날마다 달라서 묻지 않는다 (그 전에 앱이 다시 계획한다).
      holiday: repeat ? null : holidayFor(at, atSchedule),
    };
  });

  if (first.getTime() - now.getTime() <= DECIDE_BEFORE_MS) {
    const reviewed = feedbackOutingDate(schedule, first);
    const log = await OutingLog.get();
    const outing = classifyOuting({
      date: reviewed,
      outDates: log.outDates,
      homeObservations: log.homeObservations,
      from: windowStartOf(reviewed, referenceTimeOn(localDate(reviewed), schedule)),
      until: now.getTime(),
    });
    const items = await nextOutingPreview(first, fresh).catch(() => null);
    // 온보딩 날짜가 없으면(이 기능 전에 온보딩한 기기) 오늘부터 센다 — App.tsx가 곧 채운다.
    const onboardedStart = s.onboardedDate ? localMidnight(s.onboardedDate) : dayStart(now);
    entries[0] = {
      at: first,
      variant: decideNightly({
        outing,
        differs: nextOutingDiffers(items),
        recentFeedback: state.feedbackHistory.map((f) => f.val),
        daysSinceOnboarding: Math.round((dayStart(now) - onboardedStart) / DAY_MS),
        alertPreference: s.alertPreference,
      }),
      highlight: previewHighlight(items),
      repeat: false,
      departure: entries[0].departure,
      holiday: entries[0].holiday,
    };
    // 물어볼 공휴일이 있으면 건너뛰지 않는다 — 대답을 받을 기회가 이 알림이다.
    if (entries[0].holiday && entries[0].variant === 'skip') entries[0].variant = 'preview';
  }

  await NotificationService.scheduleNightlyChecks(entries);
}

export const NightlyService = {
  // fresh: 미리보기 캐시를 쓰지 않는다 — 루틴·항목 설정이 바뀌어 "다음 외출: …"이 달라질 때.
  plan(options: { fresh?: boolean } = {}): Promise<void> {
    const work = () => planOnce(options.fresh ?? false);
    const next = running.then(work, work).catch(() => {});
    running = next;
    return next;
  },
};
