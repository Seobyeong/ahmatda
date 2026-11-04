import notifee, {
  AndroidImportance,
  AndroidNotificationSetting,
  AndroidVisibility,
  TriggerType,
  TimestampTrigger,
  RepeatFrequency,
} from '@notifee/react-native';
import { DEPARTURE_WINDOW_MS, getDepartureWindowRemainingMs, getNextAlertDate, getNextDailyDate, isValidHHmm, toDateString } from '@/utils/time';
import { departureAlertContent, type DepartureSnapshot } from '@/utils/departureSnapshot';
import { ChecklistItem } from '@/types';

const CHANNEL_REMINDER  = 'ahmatda-reminder';
const CHANNEL_CHECKLIST = 'ahmatda-checklist';
const LEGACY_CHANNEL_FEEDBACK = 'ahmatda-feedback';

// 출발 알림은 울린 뒤 그대로 "잠금화면 출발 상태"로 남는다 (Android ongoing).
// 앱이 같은 id로 내용을 갱신하고, 집을 나서거나 감시 창이 끝나면 사라진다.
const DEPARTURE_ALERT_ID = 'departure-alert';

// 자기 전 정리 알림. 예전 22:00 전날 알림 / 20:00 착장 피드백을 대체한다.
const NIGHTLY_CHECK_ID = 'nightly-check';
const LEGACY_NIGHTLY_IDS = ['day-before-alert', 'feedback-alert'];
const DEFAULT_NIGHTLY_CHECK_TIME = '22:00';

// [떠나기]를 눌렀을 때 남은 것을 잠깐 보여주는 알림 (docs/외출-감지-재설계.md 2장).
// 현관에서 신발 신는 동안 볼 정도면 충분해서 10분 뒤 스스로 사라진다.
const LAST_CHECK_ID = 'last-check';
const LAST_CHECK_TIMEOUT_MS = 10 * 60 * 1000;
const LAST_CHECK_MAX_LABELS = 3;

// 잠금화면 출발 상태 알림의 [떠나기]. launchActivity가 없어 앱을 열지 않고
// 백그라운드 이벤트로 처리된다 — 잠금을 풀지 않고 누를 수 있어야 의미가 있다.
const LEAVE_ACTION = { title: '떠나기', pressAction: { id: 'leave' } };

function departureBody(detail: string): string {
  return `출발 30분 전 · ${detail}`;
}

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
    // 착장 피드백은 자기 전 정리 알림(외출 확인 채널)으로 합쳐졌다. 옛 채널이 시스템
    // 알림 설정에 빈 항목으로 남지 않게 지운다 (없으면 아무 일도 안 한다).
    await notifee.deleteChannel(LEGACY_CHANNEL_FEEDBACK);
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

  // 당일 외출 30분 전 — 체크리스트 알림 + 모니터링 시작 신호
  //
  // 일일 반복이라 본문(아직 안 챙긴 것)은 예약 시점에 고정된다. 체크리스트가
  // 바뀔 때마다 App.tsx가 다시 예약해서 갱신하지만, 앱을 하루 종일 안 연 날에는
  // 마지막으로 알던 내용이 그대로 표시된다. 그래도 알림이 아예 안 오는 것보다는
  // 낫다는 판단 — 반복을 안 걸면 앱을 안 연 다음 날부터 알림이 영영 멈춘다.
  //
  // 아직 안 챙긴 게 있으면 울린 뒤 지우지 못하는 상태 알림(ongoing)으로 남아 잠금화면에서
  // 계속 보인다. 다 챙겼다면 고정할 이유가 없어 일반 알림으로 둔다. 내일 울릴 예약에는
  // 오늘 내용을 싣지 않는다 (departureAlertContent 참고).
  // 앱이 한 번도 안 열려 갱신·정리가 안 돼도 감시 창이 끝나면(timeoutAfter) 사라진다.
  // autoCancel을 끄는 이유: 기본값(true)이면 탭해서 앱을 여는 순간 지워지고,
  // updateDepartureStatus는 떠 있는 알림만 갱신하므로 그날 아침엔 다시 안 나타난다.
  async scheduleDepartureAlert(
    departureTime: string,
    snapshot: DepartureSnapshot
  ): Promise<void> {
    // 자정을 넘어가는 출발 시각("00:15" → 알림 "23:45")도 어긋나지 않게
    // 출발 시각에서 역산한다. getNextAlertDate 주석 참고.
    const target = getNextAlertDate(departureTime);
    const content = departureAlertContent(snapshot, toDateString(target));

    const trigger: TimestampTrigger = {
      type:            TriggerType.TIMESTAMP,
      timestamp:       target.getTime(),
      repeatFrequency: RepeatFrequency.DAILY,
      alarmManager: { allowWhileIdle: true },
    };

    await notifee.cancelTriggerNotification(DEPARTURE_ALERT_ID);
    await notifee.createTriggerNotification(
      {
        id:      DEPARTURE_ALERT_ID,
        title:   '아맞다 🎒',
        body:    departureBody(content.detail),
        android: {
          channelId:     CHANNEL_CHECKLIST,
          pressAction:   { id: 'open-checklist', launchActivity: 'default' },
          ongoing:       content.ongoing,
          autoCancel:    false,
          onlyAlertOnce: true,
          timeoutAfter:  DEPARTURE_WINDOW_MS,
          actions:       [LEAVE_ACTION],
        },
      },
      trigger
    );
  },

  // 잠금화면 출발 상태 갱신 — 이미 떠 있을 때만 내용을 바꾼다.
  //
  // 떠 있지 않으면 새로 띄우지 않는다: 집을 나서면서 지워졌거나(clearDepartureStatus)
  // 아직 출발 알림 시각 전이라는 뜻이고, 어느 쪽이든 지하철에서 체크를 하나 했다고
  // 다시 띄울 이유가 없다. 다 챙겼으면 고정을 풀어 사용자가 밀어서 지울 수 있게 한다.
  //
  // 떠 있는데 감시 창 밖이면 지난 상태다 — 출발 시각을 바꿔서 창이 옮겨갔거나 창이
  // 이미 끝났다. 앱 말고는 고정 알림을 내릴 수단이 없으니 여기서 지운다.
  async updateDepartureStatus(departureTime: string, snapshot: DepartureSnapshot): Promise<void> {
    const displayed = await notifee.getDisplayedNotifications();
    if (!displayed.some((n) => n.id === DEPARTURE_ALERT_ID)) return;

    const remainingMs = getDepartureWindowRemainingMs(departureTime);
    if (remainingMs === null) {
      await NotificationService.clearDepartureStatus();
      return;
    }

    await notifee.displayNotification({
      id:    DEPARTURE_ALERT_ID,
      title: '아맞다 🎒',
      body:  departureBody(snapshot.detail),
      android: {
        channelId:     CHANNEL_CHECKLIST,
        pressAction:   { id: 'open-checklist', launchActivity: 'default' },
        ongoing:       snapshot.remaining > 0,
        autoCancel:    false,
        onlyAlertOnce: true,
        timeoutAfter:  remainingMs,
        actions:       [LEAVE_ACTION],
      },
    });
  },

  // 알림 성향 "필요할 때만" — 출발 전 알림을 아예 쓰지 않는다. 예약과 떠 있는 것 모두 내린다.
  // (Wi-Fi 이탈 긴급 알림은 별개라 그대로 나간다.)
  async cancelDepartureAlert(): Promise<void> {
    await notifee.cancelNotification(DEPARTURE_ALERT_ID);
  },

  // 집을 나섰을 때 — 출발 상태는 더 이상 의미가 없다. 예약(내일 것)은 그대로 둔다.
  async clearDepartureStatus(): Promise<void> {
    await notifee.cancelDisplayedNotification(DEPARTURE_ALERT_ID);
  },

  // [떠나기]를 눌렀는데 남은 게 있을 때 — 헤드업으로 한 번 보여주고 10분 뒤 사라진다.
  // [다 챙겼어요]를 누르면 전부 체크되고, 그러면 외출 감지 긴급 알림도 자연히 안 나간다.
  async showLastCheck(unchecked: ChecklistItem[]): Promise<void> {
    const labels = unchecked.slice(0, LAST_CHECK_MAX_LABELS).map((i) => `· ${i.label}`).join('\n');
    const extra  = unchecked.length > LAST_CHECK_MAX_LABELS
      ? `\n외 ${unchecked.length - LAST_CHECK_MAX_LABELS}개`
      : '';

    await notifee.displayNotification({
      id:    LAST_CHECK_ID,
      title: `나가기 전에 ${unchecked.length}개 남았어요`,
      body:  `${labels}${extra}`,
      android: {
        channelId:    CHANNEL_CHECKLIST,
        importance:   AndroidImportance.HIGH,
        pressAction:  { id: 'open-checklist', launchActivity: 'default' },
        timeoutAfter: LAST_CHECK_TIMEOUT_MS,
        actions:      [{ title: '다 챙겼어요', pressAction: { id: 'all-packed' } }],
      },
    });
  },

  async clearLastCheck(): Promise<void> {
    await notifee.cancelDisplayedNotification(LAST_CHECK_ID);
  },

  // 자기 전 정리 — 사용자가 정한 시각에 매일 한 번. 예전의 20:00 착장 피드백과
  // 22:00 전날 알림을 하나로 합쳤다 (docs/외출-감지-재설계.md 5장 결정 3).
  // 본문에 "내일"을 쓰지 않는 이유: 정리 시각이 자정 이후(00:30)면 다음 외출은 달력상
  // 오늘이라 말이 틀어진다. 출발 시각만 말한다.
  //
  // 출발 알림은 여기서 예약하지 않는다 — 미체크 개수를 본문에 담아야 해서 App.tsx가
  // 개수 변화에 맞춰 따로 예약한다. 전체 취소(cancelAllNotifications)도 쓰지 않는다 —
  // 이미 떠 있는 Wi-Fi 이탈 긴급 알림까지 지워버린다. 자기 id만 취소한다.
  async scheduleNightlyCheck(departureTime: string, nightlyCheckTime: string): Promise<void> {
    const time = isValidHHmm(nightlyCheckTime) ? nightlyCheckTime : DEFAULT_NIGHTLY_CHECK_TIME;
    const [hh, mm] = time.split(':').map(Number);
    const target = getNextDailyDate(hh, mm);

    const trigger: TimestampTrigger = {
      type:            TriggerType.TIMESTAMP,
      timestamp:       target.getTime(),
      repeatFrequency: RepeatFrequency.DAILY,
      alarmManager: { allowWhileIdle: true },  // Doze Mode 대응
    };

    // 업데이트 설치 전 기기에 남아 있는 옛 예약 두 개를 지운다 — 안 지우면 셋 다 울린다.
    await Promise.all(
      [...LEGACY_NIGHTLY_IDS, NIGHTLY_CHECK_ID].map((id) => notifee.cancelTriggerNotification(id))
    );
    await notifee.createTriggerNotification(
      {
        id:    NIGHTLY_CHECK_ID,
        title: '아맞다 — 오늘 하루 어땠나요?',
        body:  `착장 피드백을 남기고, ${departureTime} 출발 전에 챙길 것도 미리 봐두세요.`,
        android: {
          channelId:   CHANNEL_REMINDER,
          // 본문을 누르면 다음 외출 준비 미리보기가 열린다 (TomorrowPreviewModal)
          pressAction: { id: 'open-tomorrow', launchActivity: 'default' },
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

  // 집 밖 장소에서 머물다 떠날 때 — 아침에 챙긴 것 중 꺼내 쓰는 물건 (docs/외출-감지-재설계.md 4장).
  // 긴급 알림보다 한 단계 부드럽게: 진동 짧게, 같은 id라 새로 오면 앞의 것을 대신한다.
  async triggerPlaceLeaveAlert(items: ChecklistItem[]): Promise<void> {
    const labels = items.slice(0, 3).map(i => `· ${i.label}`).join('\n');
    const extra  = items.length > 3 ? `\n외 ${items.length - 3}개` : '';

    await notifee.displayNotification({
      id:    'place-leave',
      title: '두고 가는 거 없나요? 👀',
      body:  `여기서 꺼내 쓴 물건 챙기셨나요?\n${labels}${extra}`,
      android: {
        channelId:   CHANNEL_CHECKLIST,
        importance:  AndroidImportance.HIGH,
        pressAction: { id: 'open-checklist', launchActivity: 'default' },
        sound:       'default',
        vibrationPattern: [0, 300],
        timeoutAfter: 30 * 60 * 1000,
      },
    });
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
    const actionId = detail.pressAction?.id;
    if (actionId === 'cold' || actionId === 'good' || actionId === 'hot') {
      // store에 직접 접근 (Zustand는 모듈 레벨에서 접근 가능).
      // 앱이 종료된 상태에서 누르면 persist 복원 전이라 기본값(learnedDelta 0)에 더한 뒤
      // 그대로 저장해버릴 수 있어 복원을 먼저 기다린다.
      // 어느 외출에 대한 답인지는 store가 앱 화면과 같은 규칙으로 정한다.
      const { useAppStore, whenHydrated } = await import('@/store');
      await whenHydrated();
      useAppStore.getState().applyFeedback(actionId);

      // 답했으면 알림을 내린다. 버튼이 살아 있으면 자정 뒤에 또 눌러 다른 날짜로
      // 기록이 갈라질 수 있다.
      if (detail.notification?.id) {
        await notifee.cancelDisplayedNotification(detail.notification.id);
      }

      // TODO: 서버 전송이 필요하면 여기서 axios 호출
      // await axios.post('/api/v1/weather/feedback', { val: actionId });
    }
    // [떠나기] / [다 챙겼어요] — leave.ts가 NotificationService를 정적으로 물고 있어 동적 import
    if (actionId === 'leave' || actionId === 'all-packed') {
      const { pressLeave, markAllPacked } = await import('@/services/departure/leave');
      if (actionId === 'leave') await pressLeave();
      else await markAllPacked();
    }
  } else if (type === EventType.PRESS && detail.pressAction?.id === 'open-checklist') {
    // 출발 알림/긴급 알림 본문을 탭해서 앱을 연 경우 — 체크리스트 섹션으로 스크롤 요청
    const { useAppStore } = await import('@/store');
    useAppStore.getState().requestScrollToChecklist();
  } else if (
    type === EventType.PRESS &&
    (detail.pressAction?.id === 'open-tomorrow' || detail.notification?.id === NIGHTLY_CHECK_ID)
  ) {
    // 자기 전 정리 알림 본문 탭 — 다음 외출 준비 화면을 연다.
    // iOS는 android.pressAction을 안 쓰고 'default'로 오므로 알림 id로도 본다.
    const { useAppStore } = await import('@/store');
    useAppStore.getState().requestTomorrowPreview();
  }
}
