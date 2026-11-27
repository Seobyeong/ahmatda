// 날짜별 계획이 앱 화면 밖에서 바뀌었을 때(알림 버튼으로 공휴일에 대답) 예약을 다시 맞춘다.
// 앱 화면이 떠 있으면 App.tsx의 effect가 같은 일을 하지만, 백그라운드에서는 그게 돌지 않는다.
// 같은 내용이면 각 서비스가 알아서 건너뛰므로 두 번 돌아도 괜찮다.

import { NotificationService } from '@/services/notification/NotificationService';
import { NightlyService } from '@/services/nightly/NightlyService';
import { BackgroundTaskService } from '@/services/backgroundTask/BackgroundTaskService';
import { buildDepartureSnapshot } from '@/utils/departureSnapshot';
import { currentDepartureLabel } from '@/utils/schedule';

export async function resyncAfterDatePlanChange(): Promise<void> {
  const { useAppStore, whenHydrated, scheduleOf } = await import('@/store');
  await whenHydrated();
  const state = useAppStore.getState();
  if (!state.userSettings.onboarded) return;
  const schedule = scheduleOf(state);
  const tasks: Promise<unknown>[] = [
    NightlyService.plan({ fresh: true }),
    BackgroundTaskService.scheduleDepartureTask(schedule),
  ];
  if (state.userSettings.alertPreference !== 'minimal') {
    const snapshot = buildDepartureSnapshot(
      state.checklist, currentDepartureLabel(schedule, new Date()), state.checklistDate ?? ''
    );
    tasks.push(NotificationService.scheduleDepartureAlert(schedule, snapshot));
    tasks.push(NotificationService.updateDepartureStatus(schedule, snapshot));
  }
  await Promise.allSettled(tasks);
}
