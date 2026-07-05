import notifee, {
  AndroidImportance,
  AndroidNotificationSetting,
  AndroidVisibility,
  TriggerType,
  TimestampTrigger,
  RepeatFrequency,
} from '@notifee/react-native';
import { getAlertTime } from '@/utils/time';
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
  async scheduleDayBeforeAlert(departureTime: string): Promise<void> {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(22, 0, 0, 0);

    const trigger: TimestampTrigger = {
      type:                    TriggerType.TIMESTAMP,
      timestamp:               tomorrow.getTime(),
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
  async scheduleDepartureAlert(
    departureTime: string,
    checklistCount: number
  ): Promise<void> {
    const alertTime = getAlertTime(departureTime);  // "07:45" 형식
    const [hh, mm]  = alertTime.split(':').map(Number);

    const today = new Date();
    today.setHours(hh, mm, 0, 0);

    // 이미 지난 시각이면 내일로
    if (today.getTime() < Date.now()) {
      today.setDate(today.getDate() + 1);
    }

    const trigger: TimestampTrigger = {
      type:      TriggerType.TIMESTAMP,
      timestamp: today.getTime(),
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
    const today = new Date();
    today.setHours(20, 0, 0, 0);
    if (today.getTime() < Date.now()) {
      today.setDate(today.getDate() + 1);
    }

    const trigger: TimestampTrigger = {
      type:      TriggerType.TIMESTAMP,
      timestamp: today.getTime(),
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

  // 모든 예약 알림 취소 후 재등록
  // 외출 시간이 바뀌거나 날짜가 바뀔 때 호출
  async rescheduleAll(departureTime: string, checklistCount: number): Promise<void> {
    await notifee.cancelAllNotifications();
    await Promise.all([
      NotificationService.scheduleDayBeforeAlert(departureTime),
      NotificationService.scheduleDepartureAlert(departureTime, checklistCount),
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
