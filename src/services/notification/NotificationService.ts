import notifee, {
  AndroidImportance,
  AndroidNotificationSetting,
  AndroidVisibility,
  TriggerType,
  TimestampTrigger,
  RepeatFrequency,
} from '@notifee/react-native';
import { getNextAlertDate, getNextDailyDate } from '@/utils/time';
import { ChecklistItem, FeedbackType } from '@/types';

const CHANNEL_REMINDER  = 'ahmatda-reminder';
const CHANNEL_CHECKLIST = 'ahmatda-checklist';
const CHANNEL_FEEDBACK  = 'ahmatda-feedback';

export const NotificationService = {

  // 앱 시작 시 최초 1회 채널 생성
  async setupChannels(): Promise<void> {
    await notifee.createChannel({
      id:         CHANNEL_REMINDER,
      name:       '외출 확인 알림',
      importance: AndroidImportance.HIGH,
      visibility: AndroidVisibility.PUBLIC,
      sound:      'default',
    });
    await notifee.createChannel({
      id:         CHANNEL_CHECKLIST,
      name:       '체크리스트 알림',
      importance: AndroidImportance.HIGH,
      visibility: AndroidVisibility.PUBLIC,
      sound:      'default',
      vibration:  true,
    });
    await notifee.createChannel({
      id:         CHANNEL_FEEDBACK,
      name:       '착장 피드백 알림',
      importance: AndroidImportance.DEFAULT,
      visibility: AndroidVisibility.PUBLIC,
    });
  },

  // 정확한 알람(SCHEDULE_EXACT_ALARM) 권한 상태 확인.
  // Android 12+에서만 의미가 있고, NOT_SUPPORTED(iOS/구버전 Android)는 권한이 필요 없다는
  // 뜻이므로 "허용됨"과 동일하게 취급한다. DISABLED일 때만 사용자에게 안내가 필요하다.
  async isExactAlarmPermitted(): Promise<boolean> {
    const settings = await notifee.getNotificationSettings();
    return settings.android.alarm !== AndroidNotificationSetting.DISABLED;
  },

  // 정확한 알람 설정 화면으로 이동 (USE_EXACT_ALARM 없이 SCHEDULE_EXACT_ALARM만 쓰므로
  // Android 12+에서는 사용자가 이 화면에서 직접 허용해야 한다)
  async openExactAlarmSettings(): Promise<void> {
    await notifee.openAlarmPermissionSettings();
  },

  // 전날 22:00 — "내일도 출발하시나요?" 알림 예약
  // 무조건 +1일로 잡으면 오늘 밤 22:00을 통째로 건너뛴다(아침에 온보딩하면 첫날 밤이
  // 버려진다). 형제 알림들과 같이 "오늘로 잡고, 지났으면 내일" 규칙을 쓴다.
  async scheduleDayBeforeAlert(departureTime: string): Promise<void> {
    const target = getNextDailyDate(22, 0);

    const trigger: TimestampTrigger = {
      type:                    TriggerType.TIMESTAMP,
      timestamp:               target.getTime(),
      repeatFrequency:         RepeatFrequency.DAILY,
      alarmManager: {
        allowWhileIdle: true,  // Doze Mode 대응
      },
    };

    await notifee.cancelTriggerNotification('day-before-alert');
    await notifee.createTriggerNotification(
      {
        id:      'day-before-alert',
        title:   '아맞다 ⏰',
        body:    `내일 ${departureTime}에 외출 예정이에요. 일정 확인 중...`,
        android: { channelId: CHANNEL_REMINDER, pressAction: { id: 'default' } },
      },
      trigger
    );
  },

  // 당일 외출 30분 전 — 체크리스트 알림 + 모니터링 시작 신호
  //
  // 일일 반복이라 본문의 "N개"는 예약 시점에 고정된다. 앱을 열거나 체크 개수가
  // 바뀔 때마다 App.tsx가 다시 예약해서 갱신하지만, 앱을 하루 종일 안 연 날에는
  // 마지막으로 알던 개수가 그대로 표시된다. 그래도 알림이 아예 안 오는 것보다는
  // 낫다는 판단 — 반복을 안 걸면 앱을 안 연 다음 날부터 알림이 영영 멈춘다.
  async scheduleDepartureAlert(
    departureTime: string,
    checklistCount: number
  ): Promise<void> {
    // 자정을 넘어가는 출발 시각("00:15" → 알림 "23:45")도 어긋나지 않게
    // 출발 시각에서 역산한다. getNextAlertDate 주석 참고.
    const target = getNextAlertDate(departureTime);

    const trigger: TimestampTrigger = {
      type:            TriggerType.TIMESTAMP,
      timestamp:       target.getTime(),
      repeatFrequency: RepeatFrequency.DAILY,
      alarmManager: { allowWhileIdle: true },
    };

    await notifee.cancelTriggerNotification('departure-alert');
    await notifee.createTriggerNotification(
      {
        id:      'departure-alert',
        title:   '아맞다 🎒',
        body:    `출발 30분 전! 체크리스트 ${checklistCount}개 확인하세요.`,
        android: {
          channelId:   CHANNEL_CHECKLIST,
          pressAction: { id: 'open-checklist', launchActivity: 'default' },
        },
      },
      trigger
    );
  },

  // 당일 20:00 — 착장 피드백 알림 (액션 버튼 3개)
  async scheduleFeedbackAlert(): Promise<void> {
    const target = getNextDailyDate(20, 0);

    const trigger: TimestampTrigger = {
      type:            TriggerType.TIMESTAMP,
      timestamp:       target.getTime(),
      repeatFrequency: RepeatFrequency.DAILY,
      alarmManager: { allowWhileIdle: true },
    };

    await notifee.cancelTriggerNotification('feedback-alert');
    await notifee.createTriggerNotification(
      {
        id:    'feedback-alert',
        title: '아맞다 — 오늘 착장 어땠나요?',
        body:  '피드백을 남기면 내일 추천이 더 정확해져요.',
        android: {
          channelId: CHANNEL_FEEDBACK,
          actions: [
            { title: '🥶 추웠음', pressAction: { id: 'cold' } },
            { title: '😊 적당함', pressAction: { id: 'good' } },
            { title: '🥵 더웠음', pressAction: { id: 'hot'  } },
          ],
        },
      },
      trigger
    );
  },

  // 긴급 알림 — Wi-Fi 이탈 시 미체크 항목 경고
  async triggerUrgentAlert(uncheckedItems: ChecklistItem[]): Promise<void> {
    const itemLabels  = uncheckedItems.slice(0, 3).map(i => `· ${i.label}`).join('\n');
    const extraCount  = uncheckedItems.length > 3 ? `\n외 ${uncheckedItems.length - 3}개` : '';

    await notifee.displayNotification({
      title:   '아 맞다! 🚨',
      body:    `아직 안 챙긴 것이 있어요:\n${itemLabels}${extraCount}`,
      android: {
        channelId:   CHANNEL_CHECKLIST,
        importance:  AndroidImportance.HIGH,
        pressAction: { id: 'open-checklist', launchActivity: 'default' },
        sound:       'default',
        vibrationPattern: [0, 500, 200, 500],
      },
    });
  },

  // 매일 도는 알림 재등록 — 온보딩이 끝났거나 외출 시각이 바뀌었을 때 호출.
  //
  // 출발 알림은 여기서 예약하지 않는다. 그 알림만 미체크 개수를 본문에 담아야 해서
  // App.tsx가 개수 변화에 맞춰 따로 예약하는데, 여기서도 예약하면 앱을 켤 때마다
  // 같은 알림을 두 번 취소·재생성하게 된다(두 effect의 의존성이 겹쳐 항상 함께 돈다).
  //
  // 예전에는 시작 전에 cancelAllNotifications()로 싹 지웠는데, 그건 예약분뿐 아니라
  // 이미 표시 중인 알림까지 지운다 — Wi-Fi 이탈 긴급 알림이 알림창에 떠 있는 상태에서
  // 앱을 열면 정작 확인해야 할 그 알림이 사라졌다. 각 schedule* 함수가 자기 id를 먼저
  // 취소하므로 전체 취소는 처음부터 필요 없었다.
  async rescheduleDailyAlerts(departureTime: string): Promise<void> {
    await Promise.all([
      NotificationService.scheduleDayBeforeAlert(departureTime),
      NotificationService.scheduleFeedbackAlert(),
    ]);
  },
};

// 알림 이벤트 핸들러 — App.tsx의 onForegroundEvent(포그라운드)와
// notifee.onBackgroundEvent(백그라운드) 양쪽에서 공유해서 쓴다.
export async function handleNotificationEvent(
  type: number,
  detail: { notification?: { id?: string }; pressAction?: { id?: string } }
): Promise<void> {
  const { EventType } = await import('@notifee/react-native');

  if (type === EventType.ACTION_PRESS) {
    const actionId = detail.pressAction?.id as FeedbackType | undefined;
    if (actionId && ['cold', 'good', 'hot'].includes(actionId)) {
      // store에 직접 접근 (Zustand는 모듈 레벨에서 접근 가능)
      const { useAppStore } = await import('@/store');
      useAppStore.getState().applyFeedback(actionId);

      // TODO: 서버 전송이 필요하면 여기서 axios 호출
      // await axios.post('/api/v1/weather/feedback', { val: actionId });
    }
  } else if (type === EventType.PRESS && detail.pressAction?.id === 'open-checklist') {
    // 출발 알림/긴급 알림 본문을 탭해서 앱을 연 경우 — 체크리스트 섹션으로 스크롤 요청
    const { useAppStore } = await import('@/store');
    useAppStore.getState().requestScrollToChecklist();
  }
}
