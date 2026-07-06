import type { ForgottenRecord } from '@/types';

// "이번 주 N번 놓침" 뱃지의 판정 기준 — 최근 7일간 2회 이상 놓친 항목만 표시.
export const FORGOTTEN_WINDOW_DAYS = 7;
export const FORGOTTEN_BADGE_THRESHOLD = 2;

// "YYYY-MM-DD" 문자열 간 일수 차이 (a - b). 로컬 자정 기준이라 시간대 문제 없음.
function daysBetween(a: string, b: string): number {
  const [ay, am, ad] = a.split('-').map(Number);
  const [by, bm, bd] = b.split('-').map(Number);
  const aMs = new Date(ay, am - 1, ad).getTime();
  const bMs = new Date(by, bm - 1, bd).getTime();
  return Math.round((aMs - bMs) / (24 * 60 * 60 * 1000));
}

// 최근 windowDays일(오늘 포함) 동안 라벨별로 몇 번 놓쳤는지 집계
export function countRecentForgotten(
  history: ForgottenRecord[],
  today: string,
  windowDays: number = FORGOTTEN_WINDOW_DAYS
): Map<string, number> {
  const counts = new Map<string, number>();
  for (const record of history) {
    const age = daysBetween(today, record.date);
    if (age < 0 || age >= windowDays) continue;
    for (const label of record.labels) {
      counts.set(label, (counts.get(label) ?? 0) + 1);
    }
  }
  return counts;
}

// 뱃지 문구 생성 — 기준 미달이면 null
export function getForgottenBadge(count: number | undefined): string | null {
  if (!count || count < FORGOTTEN_BADGE_THRESHOLD) return null;
  return `이번 주 ${count}번 놓침`;
}
