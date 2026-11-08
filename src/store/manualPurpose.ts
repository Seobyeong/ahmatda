import type { PurposeId } from '../types';

// 사용자가 그날 직접 고른 목적("목적 없음" 포함). 저장해 두고, 같은 날엔 앱을 다시 켜도
// 되살리며 캘린더 자동감지가 덮어쓰지 않는다. 날짜가 바뀌면 무시한다.
export interface ManualPurpose {
  date: string; // "YYYY-MM-DD"
  id: PurposeId | null;
}

// 오늘 고른 것일 때만 유효하다 — 어제 고른 "운동"이 오늘 아침까지 남으면 안 된다.
export function isManualPurposeToday(manual: ManualPurpose | null | undefined, today: string): boolean {
  return manual?.date === today;
}

// persist 복원 시 되살릴 목적 상태. 오늘 것이 아니면 undefined(복원하지 않음).
export function restoredPurposeState(
  manual: ManualPurpose | null | undefined,
  today: string
): { purposeId: PurposeId | null; autoDetected: false; autoDetectedEvent: null } | undefined {
  if (!manual || !isManualPurposeToday(manual, today)) return undefined;
  return { purposeId: manual.id, autoDetected: false, autoDetectedEvent: null };
}
