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

  // 알람 목록대로 예약을 맞춘다 — 계획에 없는 알람 예약은 지우고(다시 울림 예약은 둔다), 있는 건 덮어쓴다.
  // 예약 실패(정확한 알람 권한 없음 등)는 false.
  async sync(alarms: Alarm[]): Promise<boolean> {
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
  },

  // 울리기 시작했을 때(도착 이벤트 · 앱을 열었더니 떠 있음) — 화면에 알람 창을 띄우고,
  // 한 번만 울리는 알람이면 끈다 (안 그러면 앱을 열 때마다 다음 날로 다시 예약된다).
  onRing(notification: { id?: string; data?: Record<string, unknown> } | undefined): void {
    const id = notification?.id;
    if (!isAlarmNotificationId(id)) return;
    const alarmId = String(notification?.data?.alarmId ?? '');
    const store = useAppStore.getState();
    store.setRingingAlarm({ notificationId: id!, alarmId });
    const alarm = store.alarms.find((a) => a.id === alarmId);
    if (alarm && alarm.days.length === 0 && alarm.enabled) store.updateAlarm(alarmId, { enabled: false });
  },

  // 앱을 열었을 때 이미 울리고 있는 알람이 있으면 알람 창을 띄운다.
  async checkRinging(): Promise<void> {
    const displayed = await notifee.getDisplayedNotifications();
    const ringing = displayed.find((d) => isAlarmNotificationId(d.id ?? d.notification.id));
    if (ringing) {
      AlarmService.onRing({ id: ringing.id ?? ringing.notification.id, data: ringing.notification.data });
    } else if (useAppStore.getState().ringingAlarm) {
      // 알림 쪽에서 이미 껐다
      useAppStore.getState().setRingingAlarm(null);
    }
  },

  // 끄기 — 떠 있는 알림만 내린다 (같은 id의 매주 반복 예약은 남긴다).
  async dismiss(notificationId: string): Promise<void> {
    await notifee.cancelDisplayedNotification(notificationId);
    useAppStore.getState().setRingingAlarm(null);
  },

  // 5분 뒤 다시 — 지금 것을 내리고 같은 알람을 5분 뒤 한 번 더 예약한다.
  async snooze(notificationId: string, data: Record<string, unknown> | undefined): Promise<void> {
    await notifee.cancelDisplayedNotification(notificationId);
    useAppStore.getState().setRingingAlarm(null);
    const alarmId = String(data?.alarmId ?? '');
    const alarm = useAppStore.getState().alarms.find((a) => a.id === alarmId) ?? {
      id: alarmId,
      time: String(data?.time ?? ''),
      label: String(data?.label ?? ''),
    };
    await notifee.createTriggerNotification(
      content(alarm, `${SNOOZE_ID_PREFIX}${alarmId}`, true),
      alarmTrigger(Date.now() + SNOOZE_MS, false)
    );
  },
};
