// 연속 다 챙김 (C7, 2026-11-28) — 다 챙김 배너에만 "N일째"를 작게 보여 준다. 끊겨도 따로 말하지 않는다.
// 나가지 않는 날(쉬는 요일·쉬는 공휴일·오늘만 건너뜀)은 세지도 끊지도 않는다. 오늘을 아직 안 챙겼으면 어제부터 센다.

import { planOn, type DepartureSchedule } from './schedule';
import { toDateString } from './time';

export const STREAK_SHOW_FROM = 3;
const MAX_LOOKBACK_DAYS = 60;

// restDays: 그날만 쉰다고 한 날 — schedule의 날짜별 계획은 지난 날이 지워져서 따로 받는다.
export function packedStreak(
  packedDays: readonly string[], schedule: DepartureSchedule, now: Date, restDays: readonly string[] = []
): number {
  const packed = new Set(packedDays);
  const rest = new Set(restDays);
  let count = 0;
  for (let back = 0; back < MAX_LOOKBACK_DAYS; back++) {
    const day = new Date(now.getFullYear(), now.getMonth(), now.getDate() - back);
    const key = toDateString(day);
    if (packed.has(key)) {
      count++;
      continue;
    }
    if (back === 0) continue; // 오늘은 아직 진행 중
    if (rest.has(key) || planOn(day, schedule) === 'off') continue;
    break;
  }
  return count;
}
