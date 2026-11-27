// 홈 위젯에서 누른 [챙김]을 체크리스트에 반영한다 (C3).
//
// 위젯은 앱 화면을 열지 않고 네이티브 쪽에 쌓아 두기만 한다(WidgetCheckReceiver). 그래서 체크리스트를 읽고
// 판단하는 곳 — 앱이 화면에 올 때, 외출 판정, [떠나기], 알림 버튼 — 이 먼저 이것을 부른다.
// 위젯에서 챙긴 우산을 외출 감지가 "안 챙김"으로 알리면 안 된다.

import { takePendingWidgetChecks } from '../../../modules/ahmatda-widget';
import { getTodayString } from '@/utils/time';

export async function applyWidgetChecks(): Promise<number> {
  // 복원을 먼저 기다린 뒤 큐를 가져와 같은 틱에 반영한다 — 가져간 뒤 기다리면 동시에 부른 쪽이
  // 빈 큐를 보고 반영 전 목록을 읽거나, 실패 시 큐를 잃는다.
  const { useAppStore, whenHydrated } = await import('@/store');
  await whenHydrated();
  const today = getTodayString();
  const todays = takePendingWidgetChecks().filter((p) => p.date === today);
  if (todays.length === 0) return 0;
  // 앱을 오늘 한 번도 안 열었으면 목록이 어제 것이다 — 위젯은 오늘 요약에서만 줄을 보여 준다
  if (useAppStore.getState().checklistDate !== today) useAppStore.getState().startNewDay();
  let applied = 0;
  for (const { label } of todays) {
    const item = useAppStore.getState().checklist.find((i) => i.label === label);
    if (item && !item.checked) {
      useAppStore.getState().toggleCheck(item.id);
      applied++;
    }
  }
  if (applied > 0) await refreshOutsideApp().catch(() => {});
  return applied;
}

// 앱 화면이 없으면(외출 판정·알림 버튼) App.tsx의 갱신 effect가 돌지 않는다 — 잠금화면 출발 상태·예약된 출발
// 알림·위젯을 여기서 맞춘다. 위젯으로 챙긴 우산이 출발 알림에 그대로 남지 않게.
async function refreshOutsideApp(): Promise<void> {
  const { useAppStore, scheduleOf } = await import('@/store');
  const { buildDepartureSnapshot } = await import('@/utils/departureSnapshot');
  const { currentDepartureLabel } = await import('@/utils/schedule');
  const { NotificationService } = await import('@/services/notification/NotificationService');
  const { setWidgetSnapshot } = await import('../../../modules/ahmatda-widget');
  const state = useAppStore.getState();
  const schedule = scheduleOf(state);
  const snapshot = buildDepartureSnapshot(state.checklist, currentDepartureLabel(schedule, new Date()), state.checklistDate ?? '');
  setWidgetSnapshot(snapshot);
  if (state.userSettings.alertPreference === 'minimal') return;
  await Promise.allSettled([
    NotificationService.updateDepartureStatus(schedule, snapshot),
    NotificationService.scheduleDepartureAlert(schedule, snapshot),
  ]);
}
