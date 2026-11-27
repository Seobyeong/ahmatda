import BackgroundFetch from 'react-native-background-fetch';
import { currentWindow, nextAlert, type DepartureSchedule } from '@/utils/schedule';
import { WifiMonitorService } from '@/services/wifi/WifiMonitorService';
import { scheduleOf, taggedPurposes, useAppStore } from '@/store';
import { untaggedEvents } from '@/constants/purposes';
import { CalendarService } from '@/services/calendar/CalendarService';
import { AiHintService } from '@/services/ai/AiHintService';
import { AwayPlaceService } from '@/services/departure/AwayPlaceService';
import { OutingLog } from '@/services/nightly/outingLog';
import { NightlyService } from '@/services/nightly/NightlyService';

const DEPARTURE_TASK_ID = 'ahmatda-departure-check';
const PLAN_BUDGET_MS = 15 * 1000;

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
        // AI 미리 계산은 주기 폴링에서만 한다. 출발 알림 태스크는 알림 판단만 하고 끝내야
        // 한다 — 알림 시각이 AI 응답 시간에 영향받으면 안 된다(AI 연결 설계 4장 규칙 4).
        if (taskId !== DEPARTURE_TASK_ID) {
          // 집 밖 머묾 확인(감시 창과 무관하게 하루 종일, 켜져 있을 때만)과 AI 미리 계산은 서로 무관하다.
          // 위치 조회가 길어져도 OS 백그라운드 실행 시간 안에 둘 다 끝나게 같이 돌린다.
          // 자기 전 정리: 집 Wi-Fi 안/밖을 한 번 보고(외출했는지), 오늘 밤 알림을 다시 계획한다.
          await Promise.all([
            AwayPlaceService.tick(),
            BackgroundTaskService._precomputeAiHints(),
            // 자기 전 계획은 위치·예보를 받을 수 있어 시간 상한을 둔다 (finish가 늦으면 OS가 폴링을 줄인다)
            Promise.race([
              OutingLog.observeWifi().then(() => NightlyService.plan()),
              new Promise<void>((resolve) => setTimeout(resolve, PLAN_BUDGET_MS)),
            ]),
          ]);
        }
        BackgroundFetch.finish(taskId);
      },
      async (taskId) => {
        BackgroundFetch.finish(taskId);
      }
    );
  },

  // 출발 알림 시각(출발 30분 전)에 맞춰 1회성 태스크를 예약한다.
  // OS 스케줄러 재량에 따라 실제 실행 시각은 다소 어긋날 수 있다 — 정밀 스케줄러가 아니다.
  async scheduleDepartureTask(schedule: DepartureSchedule): Promise<void> {
    // NotificationService의 출발 알림과 같은 계산을 쓴다 (utils/schedule.ts) — 둘이 따로
    // 어긋나면 알림과 백그라운드 확인이 다른 날을 본다. 쉬는 날은 건너뛴다.
    const next = nextAlert(schedule, new Date());
    if (!next) return;
    const target = next.alertAt;

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
    if (currentWindow(scheduleOf(useAppStore.getState()), new Date()) === null) return;

    await WifiMonitorService.checkOnce();
  },

  // 오늘·내일 일정의 AI 해석을 미리 채운다 — 아침에 앱을 열 때 캐시가 이미 차 있게.
  // AI가 꺼져 있거나 보낼 제목이 없으면 AiHintService가 호출 없이 바로 끝낸다.
  async _precomputeAiHints(): Promise<void> {
    if (!useAppStore.getState().ai.enabled) return;
    try {
      const [today, tomorrow] = await Promise.all([
        CalendarService.getEventsForDay(0),
        CalendarService.getEventsForDay(1),
      ]);
      // 앱에서 목적을 직접 고른 일정은 보내지 않는다.
      await AiHintService.precompute(untaggedEvents([...today, ...tomorrow], taggedPurposes(useAppStore.getState())));
    } catch {
      // 백그라운드 작업은 조용히 실패한다 — finish()는 호출부가 보장
    }
  },
};
