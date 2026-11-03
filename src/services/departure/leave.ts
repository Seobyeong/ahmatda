// 아맞다 — [떠나기] 버튼 (docs/외출-감지-재설계.md 2장)
//
// 앱 대시보드와 잠금화면 출발 상태 알림의 액션 버튼이 같은 흐름을 쓴다.
// [떠나기]는 알림을 끄는 버튼이 아니라 "마지막 확인" 버튼이다 — 누른 뒤에도 안 챙긴 게
// 남은 채 나가면 외출 감지 쪽 긴급 알림은 그대로 나간다 (결정 1).

import { NotificationService } from '@/services/notification/NotificationService';
import { buildDepartureSnapshot, sortByUrgency } from '@/utils/departureSnapshot';
import { getTodayString } from '@/utils/time';
import type { ChecklistItem } from '@/types';

export type LeaveResult =
  | { kind: 'all-packed' }
  | { kind: 'reminded'; unchecked: ChecklistItem[] };

// store는 동적 import한다 — 이 모듈은 알림 이벤트 핸들러에서도 불리는데, 정적으로 물면
// store → … → NotificationService → 이 모듈로 순환이 생긴다 (WifiMonitorService와 같은 방식).
async function getStore() {
  const { useAppStore, whenHydrated } = await import('@/store');
  // 잠금화면 액션은 앱이 종료된 상태에서도 돈다. 복원 전 기본값(빈 체크리스트)을 읽으면
  // "다 챙겼어요"로 잘못 판단한다.
  await whenHydrated();
  return useAppStore;
}

export async function pressLeave(): Promise<LeaveResult> {
  const useAppStore = await getStore();

  // 앱을 오늘 한 번도 안 열었으면 체크리스트는 아직 어제 것이다 (WifiMonitorService.checkOnce와 같은 이유).
  if (useAppStore.getState().checklistDate !== getTodayString()) {
    useAppStore.getState().startNewDay();
  }

  useAppStore.getState().recordLeaveIntent();

  const unchecked = sortByUrgency(useAppStore.getState().checklist.filter((i) => !i.checked));
  if (unchecked.length === 0) {
    await NotificationService.clearLastCheck();
    // 다 챙겼고 나간다고 했으니 잠금화면에 고정해둘 이유가 없다.
    await NotificationService.clearDepartureStatus();
    return { kind: 'all-packed' };
  }

  await NotificationService.showLastCheck(unchecked);
  return { kind: 'reminded', unchecked };
}

// 마지막 확인 알림의 [다 챙겼어요]
export async function markAllPacked(): Promise<void> {
  const useAppStore = await getStore();
  useAppStore.getState().checkAll();
  await NotificationService.clearLastCheck();

  // 앱이 안 떠 있으면 App.tsx의 갱신 effect가 돌지 않으니 잠금화면 상태를 여기서 직접 고친다.
  const state = useAppStore.getState();
  const snapshot = buildDepartureSnapshot(
    state.checklist,
    state.userSettings.departureTime,
    state.checklistDate ?? ''
  );
  await NotificationService.updateDepartureStatus(state.userSettings.departureTime, snapshot);
}
