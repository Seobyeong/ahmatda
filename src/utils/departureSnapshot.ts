// 아맞다 — 앱 밖 표시용 출발 요약 (홈 위젯 · 잠금화면 알림 공용)
//
// 표시 계층이 몸에서 멀어질수록 표시 예산이 작아진다 (docs/표시계층-확장-구상.md).
// 위젯과 잠금화면은 앱 화면보다 작으니 "몇 시에 나가는지 + 아직 안 챙긴 것 두세 개"만
// 담는다. 플랫폼과 무관한 순수 함수라 iOS 위젯(expo-widgets)을 붙일 때도 그대로 쓴다.

import type { ChecklistItem, ItemTier } from '@/types';

export interface DepartureSnapshot {
  date: string;   // "YYYY-MM-DD" — 위젯이 날짜가 지난 요약을 걸러내는 데 쓴다
  title: string;  // "08:15 출발" / "내일 08:30 출발" / "외출 일정 없음"
  detail: string; // "우산 · 노트북 외 2개" | "준비 완료"
  remaining: number;
  labels?: string[]; // detail에 이름이 나온 안 챙긴 물건 (급한 순) — 알림 말투의 {물건}
}

// 날씨 항목이 가장 급하다 — 오늘만 필요하고, 평소 루틴과 달라서 잊기 쉽다.
// 매일 같은 루틴은 몸이 기억하는 경우가 많아 맨 뒤로 보낸다.
const TIER_PRIORITY: Record<ItemTier, number> = { 1: 0, 2: 1, 0: 2, 3: 3 };

export const SNAPSHOT_MAX_LABELS = 2;

// 안 챙긴 항목을 급한 순서로 — 앱 밖 표시(위젯·잠금화면·마지막 확인 알림)가 같은 순서를 쓴다.
export function sortByUrgency(items: ChecklistItem[]): ChecklistItem[] {
  return [...items].sort((a, b) => TIER_PRIORITY[a.tier] - TIER_PRIORITY[b.tier]);
}

export function buildDepartureSnapshot(
  checklist: ChecklistItem[],
  departureTime: string | null, // 다음 출발 표시 (nextDepartureLabel) — null이면 일주일 안에 외출 없음
  today: string
): DepartureSnapshot {
  const unchecked = sortByUrgency(checklist.filter((item) => !item.checked));

  const shown = unchecked.slice(0, SNAPSHOT_MAX_LABELS).map((item) => item.label);
  const rest = unchecked.length - shown.length;

  let detail: string;
  if (checklist.length === 0) detail = '챙길 것 없음';
  else if (unchecked.length === 0) detail = '준비 완료';
  else detail = shown.join(' · ') + (rest > 0 ? ` 외 ${rest}개` : '');

  const title = departureTime ? `${departureTime} 출발` : '외출 일정 없음';
  return { date: today, title, detail, remaining: unchecked.length, labels: shown };
}

export const STALE_DEPARTURE_DETAIL = '오늘 챙길 것을 확인하세요';

// 예약 출발 알림의 내용. 알림은 매일 반복이라, 오늘 알림 시각이 지난 뒤 다시 예약하면
// 실제로 울리는 건 내일이다. 그때 오늘 체크리스트("준비 완료", 어제 놓친 "우산")를
// 그대로 실으면 틀린 말을 하게 되므로, 울릴 날과 체크리스트 날짜가 같을 때만 구체적으로
// 말하고 아니면 일반 문구 + 고정(앱을 열어 확인할 때까지 잠금화면에 남긴다)으로 둔다.
export function departureAlertContent(
  snapshot: DepartureSnapshot,
  alertDate: string
): { detail: string; ongoing: boolean } {
  if (snapshot.date !== alertDate) return { detail: STALE_DEPARTURE_DETAIL, ongoing: true };
  return { detail: snapshot.detail, ongoing: snapshot.remaining > 0 };
}
