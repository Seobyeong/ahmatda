import BackgroundFetch from 'react-native-background-fetch';
import { getNextAlertDate, isWithinDepartureWindow } from '@/utils/time';
import { WifiMonitorService } from '@/services/wifi/WifiMonitorService';
import { useAppStore } from '@/store';

const DEPARTURE_TASK_ID = 'ahmatda-departure-check';

export const BackgroundTaskService = {
  // 앱 시작 시 1회 호출 — 주기적 백그라운드 폴링(최소 15분 간격) 등록.
  //
  // ⚠️ stopOnTerminate를 기본값(true)으로 둔다. 즉 사용자가 앱을 완전히 스와이프해서
  // 종료하면 폴링도 함께 멈춘다 — 이 상태에서도 계속 감지하려면 headless task와
  // Zustand persist rehydration을 우회하는 별도 설계가 필요해서 이번 범위에서 뺐다.
  // (자세한 이유는 다음 진행 목록 참고) 앱이 켜져 있거나 백그라운드에 있는 동안엔 정상 동작한다.
  async configure(): Promise<void> {
    await BackgroundFetch.configure(
      {
        minimumFetchInterval: 15,
        requiredNetworkType: BackgroundFetch.NETWORK_TYPE_NONE,
      },
      async (taskId) => {
        await BackgroundTaskService._runCheck();
        BackgroundFetch.finish(taskId);
      },
      async (taskId) => {
        BackgroundFetch.finish(taskId);
      }
    );
  },

  // 출발 알림 시각(출발 30분 전)에 맞춰 1회성 태스크를 예약한다.
  // OS 스케줄러 재량에 따라 실제 실행 시각은 다소 어긋날 수 있다 — 정밀 스케줄러가 아니다.
  async scheduleDepartureTask(departureTime: string): Promise<void> {
    // NotificationService의 출발 알림과 같은 계산을 쓴다 — 자정을 넘어가는
    // 출발 시각에서 둘이 따로 어긋나면 알림과 백그라운드 확인이 다른 날을 본다.
    const target = getNextAlertDate(departureTime);

    await BackgroundFetch.scheduleTask({
      taskId: DEPARTURE_TASK_ID,
      delay: target.getTime() - Date.now(),
      periodic: false,
      forceAlarmManager: true,
    });
  },

  async _runCheck(): Promise<void> {
    const { userSettings } = useAppStore.getState();
    if (!userSettings.onboarded) return;
    if (!isWithinDepartureWindow(userSettings.departureTime)) return;

    await WifiMonitorService.checkOnce();
  },
};
