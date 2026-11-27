// 아맞다 — [떠나기] 버튼 (docs/외출-감지-재설계.md 2장)
//
// 앱 대시보드와 잠금화면 출발 상태 알림의 액션 버튼이 같은 흐름을 쓴다.
// [떠나기]는 알림을 끄는 버튼이 아니라 "마지막 확인" 버튼이다 — 누른 뒤에도 안 챙긴 게
// 남은 채 나가면 외출 감지 쪽 긴급 알림은 그대로 나간다 (결정 1).

import { NotificationService } from '@/services/notification/NotificationService';
import { buildDepartureSnapshot, sortByUrgency } from '@/utils/departureSnapshot';
import { getTodayString } from '@/utils/time';
import { nextDepartureLabel } from '@/utils/schedule';
import type { ChecklistItem } from '@/types';

export type LeaveResult =
  | { kind: 'all-packed' }
  | { kind: 'reminded'; unchecked: ChecklistItem[] };

// store는 동적 import한다 — 이 모듈은 알림 이벤트 핸들러에서도 불리는데, 정적으로 물면
// store → … → NotificationService → 이 모듈로 순환이 생긴다 (WifiMonitorService와 같은 방식).
async function getStore() {
  const store = await import('@/store');
  // 잠금화면 액션은 앱이 종료된 상태에서도 돈다. 복원 전 기본값(빈 체크리스트)을 읽으면
  // "다 챙겼어요"로 잘못 판단한다.
  await store.whenHydrated();
  return store;
}

export async function pressLeave(): Promise<LeaveResult> {
  const { useAppStore } = await getStore();

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

// 앱 화면의 [떠나기]와 위젯 [떠나기]가 같은 토스트를 띄운다.
export function leaveResultMessage(result: LeaveResult): string {
  if (result.kind === 'all-packed') return '다 챙겼어요. 다녀오세요!';
  const names = result.unchecked.slice(0, 2).map((i) => i.label).join(', ');
  const more = result.unchecked.length > 2 ? ` 외 ${result.unchecked.length - 2}개` : '';
  return `잠깐! ${names}${more} 아직 안 챙겼어요`;
}

// 알림의 [{물건} 챙김] — 맨 앞 하나를 챙김으로 표시한다 (앱을 열지 않고). 이름으로 찾는다: 알림을 만든 뒤
// 목록이 다시 조립되면 id가 바뀐다. 알림이 어제 것이거나 이미 챙겼으면 아무것도 바꾸지 않는다.
// 바뀐 목록으로 출발 상태·마지막 확인 알림을 다시 그린다 (다음 물건 버튼이 붙는다).
export async function checkFromNotification(label: string, date: string): Promise<void> {
  const { useAppStore, scheduleOf } = await getStore();
  if (date !== getTodayString()) return;
  if (useAppStore.getState().checklistDate !== date) useAppStore.getState().startNewDay();
  const item = useAppStore.getState().checklist.find((i) => i.label === label);
  if (item && !item.checked) useAppStore.getState().toggleCheck(item.id);

  const state = useAppStore.getState();
  const schedule = scheduleOf(state);
  const snapshot = buildDepartureSnapshot(state.checklist, nextDepartureLabel(schedule, new Date()), state.checklistDate ?? '');
  await NotificationService.updateDepartureStatus(schedule, snapshot);
  // 마지막 확인 알림이 떠 있으면 어느 알림에서 눌렀든 같이 고친다 (방금 챙긴 것이 남아 있지 않게)
  const shownAt = await NotificationService.lastCheckShownAt();
  if (shownAt !== null) {
    const unchecked = sortByUrgency(state.checklist.filter((i) => !i.checked));
    if (unchecked.length === 0) await NotificationService.clearLastCheck();
    else await NotificationService.showLastCheck(unchecked, shownAt);
  }
}

// 마지막 확인 알림의 [다 챙겼어요]
export async function markAllPacked(): Promise<void> {
  const { useAppStore, scheduleOf } = await getStore();
  useAppStore.getState().checkAll();
  await NotificationService.clearLastCheck();

  // 앱이 안 떠 있으면 App.tsx의 갱신 effect가 돌지 않으니 잠금화면 상태를 여기서 직접 고친다.
  const state = useAppStore.getState();
  const schedule = scheduleOf(state);
  const snapshot = buildDepartureSnapshot(
    state.checklist,
    nextDepartureLabel(schedule, new Date()),
    state.checklistDate ?? ''
  );
  await NotificationService.updateDepartureStatus(schedule, snapshot);
}
