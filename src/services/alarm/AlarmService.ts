// 아맞다 — 기상·부가 알람 예약과 울림 처리
//
// 휴대폰 알람처럼: 알람시계 방식(SET_ALARM_CLOCK)으로 정확히 울리고, 소리는 끄거나 미룰 때까지
// 반복(loopSound)하며, 잠금화면이면 알람 화면을 띄운다(fullScreenAction → AlarmOverlay).
// [5분 뒤]·[끄기]는 앱을 열지 않고 알림에서 바로 누를 수 있다 (백그라운드 이벤트).
//
// 한계 — 소리는 알림 소리라서 휴대폰 알림 음량을 따르고, 무음·진동 모드에서는 진동만 될 수 있다.
// 알람 음량으로 울리려면 네이티브 재생이 필요하다 (실기기 확인 뒤 결정).

import notifee, {
  AlarmType,
  AndroidCategory,
  AndroidImportance,
  AndroidVisibility,
  RepeatFrequency,
  TriggerType,
  type Notification,
  type TimestampTrigger,
} from '@notifee/react-native';
import { useAppStore } from '@/store';
import {
  ALARM_ID_PREFIX, SNOOZE_ID_PREFIX, SNOOZE_MS, isAlarmNotificationId, planAlarmTriggers, type Alarm,
} from '@/utils/alarms';

export const CHANNEL_ALARM = 'ahmatda-alarm';
const RING_TIMEOUT_MS = 10 * 60 * 1000; // 아무것도 안 누르면 10분 뒤 멈춘다 (휴대폰 알람과 비슷하게)

function content(alarm: Pick<Alarm, 'id' | 'time' | 'label'>, id: string, snoozed = false): Notification {
  return {
    id,
    title: `⏰ ${alarm.label.trim() || '알람'} ${alarm.time}${snoozed ? ' (다시 울림)' : ''}`,
    body: '눌러서 오늘 날씨와 챙길 것을 확인하세요',
    data: { alarmId: alarm.id, time: alarm.time, label: alarm.label },
    android: {
      channelId: CHANNEL_ALARM,
      category: AndroidCategory.ALARM,
      importance: AndroidImportance.HIGH,
      visibility: AndroidVisibility.PUBLIC,
      sound: 'default',
      loopSound: true,
      ongoing: true,
      autoCancel: false,
      lightUpScreen: true,
      timeoutAfter: RING_TIMEOUT_MS,
      vibrationPattern: [1, 800, 600, 800],
      fullScreenAction: { id: 'alarm', launchActivity: 'default' },
      pressAction: { id: 'alarm-open', launchActivity: 'default' },
      // 앱을 열지 않고 처리한다 (launchActivity 없음)
      actions: [
        { title: '5분 뒤', pressAction: { id: 'alarm-snooze' } },
        { title: '끄기', pressAction: { id: 'alarm-dismiss' } },
      ],
    },
  };
}

function alarmTrigger(timestamp: number, weekly: boolean): TimestampTrigger {
  return {
    type: TriggerType.TIMESTAMP,
    timestamp,
    alarmManager: { type: AlarmType.SET_ALARM_CLOCK },
    ...(weekly ? { repeatFrequency: RepeatFrequency.WEEKLY } : {}),
  };
}

let lastSignature: string | null = null;

export const AlarmService = {
  async setupChannel(): Promise<void> {
    await notifee.createChannel({
      id: CHANNEL_ALARM,
      name: '알람',
      importance: AndroidImportance.HIGH,
      visibility: AndroidVisibility.PUBLIC,
      sound: 'default',
      vibration: true,
      vibrationPattern: [1, 800, 600, 800],
      bypassDnd: true,
    });
  },

  // 알람 목록대로 예약을 맞춘다 — 계획에 없는 알람 예약은 지우고, 있는 건 덮어쓴다.
  // 연달아 불려도(켜고 바로 끄기, 울림 직후 한 번 알람 끄기) 겹쳐 돌지 않게 한 줄로 세운다 —
  // 겹치면 옛 목록으로 도는 쪽이 방금 지운 예약을 다시 걸 수 있다.
  // 예약 실패(정확한 알람 권한 없음 등)는 false.
  sync(alarms: Alarm[]): Promise<boolean> {
    const run = () => syncOnce(alarms);
    syncQueue = syncQueue.then(run, run);
    return syncQueue;
  },

  // 울리기 시작했을 때(도착 이벤트 · 앱을 열었더니 떠 있음) — 화면에 알람 창을 띄우고,
  // 한 번만 울리는 알람이면 끈다 (안 그러면 앱을 열 때마다 다음 날로 다시 예약된다).
  onRing(notification: { id?: string; data?: Record<string, unknown> } | undefined): void {
    const id = notification?.id;
    if (!isAlarmNotificationId(id)) return;
    const alarmId = String(notification?.data?.alarmId ?? '');
    useAppStore.getState().setRingingAlarm({ notificationId: id!, alarmId });
    disableIfOnce(alarmId);
  },

  // 지금 떠 있는(울리는) 알람 알림으로 알람 창을 맞춘다 — 앱을 열 때, 알람 창이 떠 있는 동안 주기적으로.
  // 10분 시간 초과나 알림 쪽 버튼으로 이미 꺼졌으면 창을 닫는다 (잠금화면 위 표시·화면 켜짐도 같이 풀린다).
  async checkRinging(): Promise<void> {
    const ringing = await ringingNotifications();
    const current = useAppStore.getState().ringingAlarm;
    if (ringing.length === 0) {
      if (current) useAppStore.getState().setRingingAlarm(null);
      return;
    }
    if (!current || !ringing.some((r) => r.id === current.notificationId)) AlarmService.onRing(ringing[0]);
  },

  // 알림의 [끄기] — 그 알림만 내린다 (같은 id의 매주 반복 예약은 남긴다). 다른 알람이 아직 울리면 창이 그쪽으로.
  async dismiss(notificationId: string, data?: Record<string, unknown>): Promise<void> {
    await notifee.cancelDisplayedNotification(notificationId);
    disableIfOnce(String(data?.alarmId ?? ''));
    await AlarmService.checkRinging();
  },

  // 알람 창의 [끄기] — 같이 울리는 알람(같은 시각 두 개, 다시 울림이 겹침)을 모두 끈다.
  async dismissAll(): Promise<void> {
    const ringing = await ringingNotifications();
    await Promise.all(ringing.map((r) => notifee.cancelDisplayedNotification(r.id)));
    ringing.forEach((r) => disableIfOnce(String(r.data?.alarmId ?? '')));
    useAppStore.getState().setRingingAlarm(null);
  },

  // 5분 뒤 다시 — 다시 울림을 먼저 예약하고, 된 뒤에만 지금 것을 내린다.
  // 예약이 실패하면(정확한 알람 권한 회수 등) 계속 울리게 두고 false — 조용해졌는데 다시 안 울리면 늦잠을 잔다.
  async snooze(notificationId: string, data: Record<string, unknown> | undefined): Promise<boolean> {
    const alarmId = String(data?.alarmId ?? '');
    const alarm = useAppStore.getState().alarms.find((a) => a.id === alarmId) ?? {
      id: alarmId,
      time: String(data?.time ?? ''),
      label: String(data?.label ?? ''),
    };
    try {
      await notifee.createTriggerNotification(
        content(alarm, `${SNOOZE_ID_PREFIX}${alarmId}`, true),
        alarmTrigger(Date.now() + SNOOZE_MS, false)
      );
    } catch {
      return false;
    }
    // 다시 울림 자신을 미루는 경우 — 방금 같은 id로 예약을 새로 걸었으니 떠 있는 것만 내린다.
    await notifee.cancelDisplayedNotification(notificationId);
    disableIfOnce(alarmId);
    await AlarmService.checkRinging();
    return true;
  },

  // 알람 창의 [5분 뒤] — 같이 울리는 알람을 모두 미룬다. 하나라도 실패하면 false.
  async snoozeAll(): Promise<boolean> {
    const ringing = await ringingNotifications();
    const results = await Promise.all(ringing.map((r) => AlarmService.snooze(r.id, r.data)));
    return results.every(Boolean);
  },

  // 알람을 끄거나 시각을 바꾸면 걸려 있던 다시 울림도 없앤다 (사용자가 끈 알람이 5분 뒤 울리면 안 된다).
  async cancelSnooze(alarmId: string): Promise<void> {
    const id = `${SNOOZE_ID_PREFIX}${alarmId}`;
    await notifee.cancelTriggerNotification(id);
    await notifee.cancelDisplayedNotification(id);
  },
};

let syncQueue: Promise<boolean> = Promise.resolve(true);

async function syncOnce(alarms: Alarm[]): Promise<boolean> {
  const plan = planAlarmTriggers(alarms, new Date());
  const existing = await notifee.getTriggerNotificationIds();
  const wanted = new Set(plan.map((t) => t.id));
  const signature = JSON.stringify(alarms);
  if (signature === lastSignature && [...wanted].every((id) => existing.includes(id))) return true;

  const stale = existing.filter(
    (id) => id.startsWith(ALARM_ID_PREFIX) && !id.startsWith(SNOOZE_ID_PREFIX) && !wanted.has(id)
  );
  await Promise.all(stale.map((id) => notifee.cancelTriggerNotification(id)));
  // 지워진 알람의 다시 울림도 없앤다. 꺼진 알람은 두는데, 한 번 알람은 울리는 순간 꺼지므로
  // 그 뒤 [5분 뒤]로 잡은 다시 울림이 다른 알람을 고칠 때 지워지면 안 되기 때문이다.
  // (사용자가 직접 끄거나 시각을 바꾼 경우는 설정 화면이 cancelSnooze로 따로 지운다.)
  const alive = new Set(alarms.map((a) => a.id));
  await Promise.all(
    existing
      .filter((id) => id.startsWith(SNOOZE_ID_PREFIX) && !alive.has(id.slice(SNOOZE_ID_PREFIX.length)))
      .map((id) => notifee.cancelTriggerNotification(id))
  );

  try {
    for (const t of plan) {
      const alarm = alarms.find((a) => a.id === t.alarmId)!;
      await notifee.createTriggerNotification(content(alarm, t.id), alarmTrigger(t.timestamp, t.weekly));
    }
    lastSignature = signature;
    return true;
  } catch {
    lastSignature = null;
    return false;
  }
}

// 지금 떠 있는 알람 알림들 (울리는 중)
async function ringingNotifications(): Promise<Array<{ id: string; data?: Record<string, unknown> }>> {
  const displayed = await notifee.getDisplayedNotifications();
  return displayed
    .map((d) => ({ id: d.id ?? d.notification.id ?? '', data: d.notification.data as Record<string, unknown> | undefined }))
    .filter((d) => isAlarmNotificationId(d.id));
}

// 한 번만 울리는 알람은 울렸으면 끈다 — 울림 도착 이벤트를 못 받았어도(앱이 죽어 있던 경우)
// 끄기·미루기를 누르면 여기서 꺼진다. 안 그러면 다음에 앱을 열 때 내일로 다시 예약된다.
function disableIfOnce(alarmId: string): void {
  if (!alarmId) return;
  const store = useAppStore.getState();
  const alarm = store.alarms.find((a) => a.id === alarmId);
  if (alarm && alarm.days.length === 0 && alarm.enabled) store.updateAlarm(alarmId, { enabled: false });
}
