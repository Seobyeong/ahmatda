import notifee, {
  AndroidImportance,
  AndroidStyle,
  AndroidNotificationSetting,
  AndroidVisibility,
  TriggerType,
  TimestampTrigger,
  RepeatFrequency,
} from '@notifee/react-native';
import { DEPARTURE_WINDOW_MS, toDateString } from '@/utils/time';
import { departureAlertContent, sortByUrgency, type DepartureSnapshot } from '@/utils/departureSnapshot';
import { ChecklistItem } from '@/types';
import { renderAlert, type AlertKind, type AlertVars } from '@/constants/alertVoices';
import { scheduleOf, useAppStore } from '@/store';
import {
  DEPARTURE_ALERT_PREFIX, currentWindow, formatHm, holidayOn, isUnansweredHoliday, nextDeparture, oneOffAlertId,
  planDepartureAlerts, withIeyo, type DepartureSchedule,
} from '@/utils/schedule';
import { AlarmService } from '@/services/alarm/AlarmService';
import { isAlarmNotificationId } from '@/utils/alarms';

const CHANNEL_REMINDER  = 'ahmatda-reminder';
const CHANNEL_CHECKLIST = 'ahmatda-checklist';
// 귀가 루틴 — 급하지 않아 소리·진동·헤드업 없이 알림 목록에만 (C4)
const CHANNEL_HOMECOMING = 'ahmatda-homecoming';
const LEGACY_CHANNEL_FEEDBACK = 'ahmatda-feedback';

// 출발 알림은 울린 뒤 그대로 "잠금화면 출발 상태"로 남는다 (Android ongoing).
// 앱이 같은 id로 내용을 갱신하고, 집을 나서거나 감시 창이 끝나면 사라진다.
// id는 departure-alert-d{요일} (매주 반복) / departure-alert-oYYYY-MM-DD (날짜 하나짜리 — 오늘 목록·오늘만 바꾸기·공휴일·날짜별 계획).

// 자기 전 정리 알림. 예전 22:00 전날 알림 / 20:00 착장 피드백을 대체한다.
const NIGHTLY_CHECK_ID = 'nightly-check';
const LEGACY_NIGHTLY_IDS = ['day-before-alert', 'feedback-alert'];

// [떠나기]를 눌렀을 때 남은 것을 잠깐 보여주는 알림 (docs/외출-감지-재설계.md 2장).
// 현관에서 신발 신는 동안 볼 정도면 충분해서 10분 뒤 스스로 사라진다.
const LAST_CHECK_ID = 'last-check';
const LAST_CHECK_TIMEOUT_MS = 10 * 60 * 1000;
const LAST_CHECK_MAX_LABELS = 3;
const HOMECOMING_ID = 'homecoming';

// 잠금화면 출발 상태 알림의 [떠나기]. launchActivity가 없어 앱을 열지 않고
// 백그라운드 이벤트로 처리된다 — 잠금을 풀지 않고 누를 수 있어야 의미가 있다.
const LEAVE_ACTION = { title: '떠나기', pressAction: { id: 'leave' } };

// 우산 없이 나왔을 때의 수습 — 지도 앱에서 "편의점"을 검색한다. 지도 앱을 열려면 앱 화면이
// 먼저 떠 있어야 해서(안드로이드는 백그라운드에서 다른 앱 화면을 못 띄운다) launchActivity를 준다.
const FIND_STORE_ACTION = { title: '가까운 편의점', pressAction: { id: 'find-store', launchActivity: 'default' } };
const FIND_STORE_QUERY = '편의점';
// 앱이 꺼진 채 버튼으로 켜지면 같은 누름이 두 번 올 수 있다(처음 알림 PRESS + ACTION_PRESS) — 한 번만 연다.
const FIND_STORE_DEDUP_MS = 15_000;
const findStoreHandledAt = new Map<string, number>();

// 날씨 항목 '우산'만 — 사용자가 직접 넣은 "우산"(루틴)은 날씨와 무관하게 챙기는 것이라 제외한다.
function isUmbrellaItem(item: ChecklistItem): boolean {
  return item.tier === 1 && item.label === '우산';
}

function departureBody(detail: string, holiday?: string | null): string {
  const lead = holiday ? `오늘은 ${withIeyo(holiday)}. 쉬는 날이면 [오늘은 쉬어요]를 눌러 주세요.
` : '';
  return `${lead}출발 30분 전 · ${detail}`;
}

// [{물건} 챙김] — 맨 앞의 안 챙긴 것 하나를 앱을 열지 않고 챙김으로 (2026-11-28). 하나 챙기려고 앱을 열지 않게.
// 안드로이드 알림 버튼은 3개까지라 [떠나기]·[오늘은 쉬어요]와 함께 하나만 둔다. 누르면 다음 물건으로 바뀐다.
const CHECK_ITEM_ACTION_ID = 'check-item';
const CHECK_LABEL_MAX = 8;
function checkItemAction(label: string | undefined) {
  if (!label) return [];
  // 글자 단위로 자른다 (이모지 반쪽이 깨지지 않게)
  const chars = [...label];
  const short = chars.length > CHECK_LABEL_MAX ? `${chars.slice(0, CHECK_LABEL_MAX - 1).join('')}…` : label;
  return [{ title: `${short} 챙김`, pressAction: { id: CHECK_ITEM_ACTION_ID } }];
}

// 출발 알림의 버튼 — [떠나기] [{물건} 챙김] [오늘은 쉬어요]
function departureActions(checkLabel: string | undefined, holiday: string | null) {
  return [LEAVE_ACTION, ...checkItemAction(checkLabel), ...(holiday ? [HOLIDAY_OFF_ACTION] : [])];
}

// 대답 없는 공휴일의 출발 알림 — 쉬면 이 버튼 하나로 그날 알림·외출 감지를 끈다. 앱을 열지 않는다.
const HOLIDAY_OFF_ACTION = { title: '오늘은 쉬어요', pressAction: { id: 'holiday-off' } };

// 출발 알림이 걸린 날이 대답 없는 공휴일이면 그 이름
function holidayOf(schedule: DepartureSchedule, departure: Date): string | null {
  return isUnansweredHoliday(departure, schedule) ? holidayOn(departure, schedule) : null;
}

// 자기 전 정리 알림의 공휴일 질문 (NightlyEntry.holiday)
export interface NightlyHoliday {
  name: string;
  dates: string[];
  dayLabel: string; // "내일" / "금요일"
}

// 지금 고른 알림 말투로 제목·첫 줄을 만든다 (constants/alertVoices.ts).
// 백그라운드에서 불려도 호출하는 쪽이 이미 store를 읽고 있어 복원된 뒤다.
// departureTime: 이 알림이 말하는 출발 시각 ({출발}) — 없으면 지금 감시 중인 출발(출발 시각이 막
// 지나 아직 집에 있어도 그 외출이다), 그것도 없으면 다음 외출.
function voiceText(kind: AlertKind, vars: Omit<AlertVars, 'departureTime'>, departureTime?: string) {
  const state = useAppStore.getState();
  const s = state.userSettings;
  const schedule = scheduleOf(state);
  const now = new Date();
  const ref = currentWindow(schedule, now)?.departure ?? nextDeparture(schedule, now);
  const time = departureTime ?? (ref ? formatHm(ref) : s.departureTime);
  return renderAlert(kind, s.alertVoice, s.customAlertText, { ...vars, departureTime: time });
}

// 출발 알림 예약 — 체크할 때마다 불리므로 내용·시각이 그대로인 예약은 다시 걸지 않는다.
// 여러 번 연달아 불려도 겹쳐 돌지 않게 한 줄로 세운다.
const alertSignatures = new Map<string, string>();
let alertQueue: Promise<void> = Promise.resolve();

// 말투 서명 — 예약 알림은 예약할 때 문구가 고정되므로, 말투가 바뀌면 다시 예약해야 한다.
function voiceSignature(): string {
  const s = useAppStore.getState().userSettings;
  return `${s.alertVoice}|${s.customAlertText}`;
}

// 꼭 챙김 항목은 "(꼭)"을 붙인다 — 물건을 말하는 알림은 받은 목록을 sortByUrgency로 다시 세워 꼭 챙김을 맨 앞에 둔다.
function itemList(items: ChecklistItem[], max = 3): string {
  const labels = items.slice(0, max).map((i) => `· ${i.label}${i.essential ? ' (꼭)' : ''}`).join('\n');
  const extra  = items.length > max ? `\n외 ${items.length - max}개` : '';
  return `${labels}${extra}`;
}

function withLead(lead: string | null, body: string): string {
  return lead ? `${lead}\n${body}` : body;
}

// 자기 전 정리 — 날짜별 한 번짜리 알림 (scheduleNightlyChecks)
export interface NightlyEntry {
  at: Date;
  variant: 'full' | 'preview' | 'skip';
  highlight: string | null; // 다음 외출에 달라지는 것 — "우산(비 예보 70%), 운동화(10:00 '헬스' 일정)"
  repeat: boolean;          // 이 날부터 매일 반복 (계획의 마지막 칸 — 앱이 다시 안 돌아도 끊기지 않게)
  // 이 알림 다음 외출 — "내일 08:30" / "월요일 08:30". 날마다 다르므로 칸마다 따로 정한다.
  // null이면 시각을 말하지 않는다 (매일 반복 칸, 일주일 안에 외출 없음).
  departure: string | null;
  // 다음 날이 대답 없는 공휴일이면 묻는다 — 이때는 피드백 버튼 대신 [쉬어요]/[평소처럼]/[다른 시간].
  holiday?: NightlyHoliday | null;
  // 다음 날 출발하는 여행 짐 (C5) — "'부산 여행' 짐 4개 남았어요"
  trip?: string | null;
}

const NIGHTLY_ID_PREFIX = 'nightly-check-';
const NIGHTLY_TAIL_ID = 'nightly-check-tail';
let lastNightlySignature: string | null = null;

function nightlyId(entry: { at: Date; repeat: boolean }): string {
  return entry.repeat ? NIGHTLY_TAIL_ID : `${NIGHTLY_ID_PREFIX}${toDateString(entry.at)}`;
}

export function isNightlyCheckId(id: string | undefined): boolean {
  return id === NIGHTLY_CHECK_ID || (id?.startsWith(NIGHTLY_ID_PREFIX) ?? false);
}

function nightlyContent(entry: NightlyEntry) {
  const content = nightlyBase(entry);
  return entry.trip ? { ...content, body: `${content.body}\n${entry.trip}` } : content;
}

function nightlyBase(entry: NightlyEntry) {
  const noItems = { items: [], count: 0 };
  const android = {
    channelId:   CHANNEL_REMINDER,
    // 본문을 누르면 다음 외출 준비 미리보기가 열린다 (TomorrowPreviewModal)
    pressAction: { id: 'open-tomorrow', launchActivity: 'default' },
  };
  if (entry.holiday) {
    const h = entry.holiday;
    const span = h.dates.length > 1 ? ` (${h.dates.length}일)` : '';
    return {
      id:    nightlyId(entry),
      title: `${h.dayLabel}은 ${withIeyo(h.name)}${span}`,
      body:  `평소처럼 나가세요? 대답이 없으면 평소처럼 알려 드려요.${entry.highlight ? `
다음 외출: ${entry.highlight}` : ''}`,
      data:  { holidayDates: h.dates.join(',') },
      android: {
        ...android,
        actions: [
          { title: '쉬어요',     pressAction: { id: 'holiday-off' } },
          { title: '평소처럼',   pressAction: { id: 'holiday-usual' } },
          { title: '다른 시간', pressAction: { id: 'holiday-other', launchActivity: 'default' } },
        ],
      },
    };
  }
  if (entry.variant === 'preview') {
    return {
      id:    nightlyId(entry),
      title: voiceText('nightlyPreview', noItems).title,
      body:  `${entry.departure ? `${entry.departure} 출발 · ` : ''}${entry.highlight ?? '눌러서 미리 확인해 보세요'}`,
      android,
    };
  }
  const extra = entry.highlight ? `\n다음 외출: ${entry.highlight}` : '';
  return {
    id:    nightlyId(entry),
    title: voiceText('nightly', noItems).title,
    body:  `착장 피드백을 남기고, ${entry.departure ? `${entry.departure} 출발` : '다음 외출'} 전에 챙길 것도 미리 봐두세요.${extra}`,
    android: {
      ...android,
      actions: [
        { title: '🥶 추웠음', pressAction: { id: 'cold' } },
        { title: '😊 적당함', pressAction: { id: 'good' } },
        { title: '🥵 더웠음', pressAction: { id: 'hot'  } },
      ],
    },
  };
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
      id:         CHANNEL_HOMECOMING,
      name:       '집에 왔을 때 할 일',
      importance: AndroidImportance.LOW,
      visibility: AndroidVisibility.PUBLIC,
      vibration:  false,
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
    await AlarmService.setupChannel();
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

  // 외출 30분 전 — 체크리스트 알림 + 모니터링 시작 신호
  //
  // 요일마다 "매주 반복" 예약을 하나씩 건다 (쉬는 요일은 없음, utils/schedule.ts planDepartureAlerts).
  // 반복이라 본문(아직 안 챙긴 것)은 예약 시점에 고정된다. 체크리스트가 바뀔 때마다 App.tsx가
  // 다시 예약해서 갱신하지만, 앱을 안 연 날에는 일반 문구로 나간다 — 그래도 알림이 끊기는 것보다 낫다.
  // 오늘 울릴 예약에만 오늘 목록을 싣는다 (departureAlertContent 참고).
  //
  // 아직 안 챙긴 게 있으면 울린 뒤 지우지 못하는 상태 알림(ongoing)으로 남아 잠금화면에서
  // 계속 보인다. 다 챙겼다면 고정할 이유가 없어 일반 알림으로 둔다.
  // 앱이 한 번도 안 열려 갱신·정리가 안 돼도 감시 창이 끝나면(timeoutAfter) 사라진다.
  // autoCancel을 끄는 이유: 기본값(true)이면 탭해서 앱을 여는 순간 지워지고,
  // updateDepartureStatus는 떠 있는 알림만 갱신하므로 그날 아침엔 다시 안 나타난다.
  scheduleDepartureAlert(schedule: DepartureSchedule, snapshot: DepartureSnapshot): Promise<void> {
    const run = () => NotificationService._scheduleDepartureAlert(schedule, snapshot);
    alertQueue = alertQueue.then(run, run);
    return alertQueue;
  },

  async _scheduleDepartureAlert(schedule: DepartureSchedule, snapshot: DepartureSnapshot): Promise<void> {
    // 오늘 목록이 실리는 예약은 한 번짜리로 따로 건다 — 매주 반복 예약에 오늘 물건 이름을 실으면
    // 다음 주 그 요일(앱을 안 열었다면)에 지난주 물건을 말한다. 그 요일의 반복은 다음 주부터 일반 문구로.
    const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
    const plan = planDepartureAlerts(schedule, new Date()).flatMap((p) => {
      if (!p.weekly || snapshot.date !== toDateString(p.departure)) return [p];
      return [
        { ...p, id: oneOffAlertId(snapshot.date), weekly: false },
        { ...p, alertAt: new Date(p.alertAt.getTime() + WEEK_MS), departure: new Date(p.departure.getTime() + WEEK_MS) },
      ];
    });
    const wanted = new Set(plan.map((p) => p.id));

    // 계획에서 빠진 예약(쉬는 날로 바꾼 요일, 지난 '오늘만', 예전의 매일 반복 하나짜리)을 지운다.
    const existing = await notifee.getTriggerNotificationIds();
    await Promise.all(
      existing
        .filter((id) => id.startsWith(DEPARTURE_ALERT_PREFIX) && !wanted.has(id))
        .map((id) => {
          alertSignatures.delete(id);
          return notifee.cancelTriggerNotification(id);
        })
    );

    for (const p of plan) {
      const alertDay = toDateString(p.departure);
      const content = departureAlertContent(snapshot, alertDay);
      // 울릴 날의 목록을 아직 모르면(다른 날 예약) 물건을 말하지 않는다.
      const fresh = snapshot.date === alertDay;
      const title = voiceText('departure', fresh
        ? { items: snapshot.labels ?? [], count: snapshot.remaining }
        : { items: [], count: 0 }, formatHm(p.departure)).title;

      const trigger: TimestampTrigger = {
        type:         TriggerType.TIMESTAMP,
        timestamp:    p.alertAt.getTime(),
        alarmManager: { allowWhileIdle: true },
        ...(p.weekly ? { repeatFrequency: RepeatFrequency.WEEKLY } : {}),
      };
      // 다른 날 예약은 일반 문구라 체크해도 그대로다 — 같으면 건너뛴다 (보통 오늘 것 하나만 다시 건다).
      const holiday = p.holiday ?? null;
      // 울릴 날의 목록을 알 때만 물건 버튼을 단다 (다른 날 예약은 일반 문구)
      const checkLabel = fresh && snapshot.remaining > 0 ? snapshot.labels?.[0] : undefined;
      const signature = JSON.stringify([p.alertAt.getTime(), p.weekly, title, content, holiday, checkLabel ?? null]);
      if (alertSignatures.get(p.id) === signature && existing.includes(p.id)) continue;

      await notifee.createTriggerNotification(
        {
          id:      p.id,
          title,
          body:    departureBody(content.detail, holiday),
          data:    checkLabel ? { date: alertDay, checkLabel } : { date: alertDay },
          android: {
            channelId:     CHANNEL_CHECKLIST,
            pressAction:   { id: 'open-checklist', launchActivity: 'default' },
            ongoing:       content.ongoing,
            autoCancel:    false,
            onlyAlertOnce: true,
            timeoutAfter:  DEPARTURE_WINDOW_MS,
            actions:       departureActions(checkLabel, holiday),
          },
        },
        trigger
      );
      // 예약이 된 뒤에만 기억한다 — 실패했으면 다음에 다시 건다.
      alertSignatures.set(p.id, signature);
    }
  },

  // 잠금화면 출발 상태 갱신 — 이미 떠 있을 때만 내용을 바꾼다.
  //
  // 떠 있지 않으면 새로 띄우지 않는다: 집을 나서면서 지워졌거나(clearDepartureStatus)
  // 아직 출발 알림 시각 전이라는 뜻이고, 어느 쪽이든 지하철에서 체크를 하나 했다고
  // 다시 띄울 이유가 없다. 다 챙겼으면 고정을 풀어 사용자가 밀어서 지울 수 있게 한다.
  //
  // 떠 있는데 감시 창 밖이면 지난 상태다 — 외출 시간을 바꾸거나 오늘을 건너뛰어서 창이
  // 옮겨갔거나 이미 끝났다. 앱 말고는 고정 알림을 내릴 수단이 없으니 여기서 지운다.
  async updateDepartureStatus(schedule: DepartureSchedule, snapshot: DepartureSnapshot): Promise<void> {
    const displayed = (await notifee.getDisplayedNotifications())
      .find((n) => (n.id ?? '').startsWith(DEPARTURE_ALERT_PREFIX));
    if (!displayed?.id) return;

    const window = currentWindow(schedule, new Date());
    if (window === null) {
      await NotificationService.clearDepartureStatus();
      return;
    }

    const holiday = holidayOf(schedule, window.departure);
    const date = toDateString(window.departure);
    // 목록이 그날 것일 때만 물건 버튼 (어제 목록의 물건을 챙김으로 만들지 않게)
    const checkLabel = snapshot.date === date && snapshot.remaining > 0 ? snapshot.labels?.[0] : undefined;
    await notifee.displayNotification({
      id:    displayed.id,
      title: voiceText('departure', { items: snapshot.labels ?? [], count: snapshot.remaining }, formatHm(window.departure)).title,
      body:  departureBody(snapshot.detail, holiday),
      data:  checkLabel ? { date, checkLabel } : { date },
      android: {
        channelId:     CHANNEL_CHECKLIST,
        pressAction:   { id: 'open-checklist', launchActivity: 'default' },
        ongoing:       snapshot.remaining > 0,
        autoCancel:    false,
        onlyAlertOnce: true,
        timeoutAfter:  window.remainingMs,
        actions:       departureActions(checkLabel, holiday),
      },
    });
  },

  // 알림 성향 "필요할 때만" — 출발 전 알림을 아예 쓰지 않는다. 예약과 떠 있는 것 모두 내린다.
  // (Wi-Fi 이탈 긴급 알림은 별개라 그대로 나간다.)
  async cancelDepartureAlert(): Promise<void> {
    const ids = new Set([
      ...(await notifee.getTriggerNotificationIds()),
      ...(await notifee.getDisplayedNotifications()).map((n) => n.id ?? ''),
    ]);
    await Promise.all(
      [...ids].filter((id) => id.startsWith(DEPARTURE_ALERT_PREFIX)).map((id) => notifee.cancelNotification(id))
    );
  },

  // 집을 나섰을 때 — 출발 상태는 더 이상 의미가 없다. 예약(다음 것)은 그대로 둔다.
  async clearDepartureStatus(): Promise<void> {
    const displayed = await notifee.getDisplayedNotifications();
    await Promise.all(
      displayed
        .map((n) => n.id ?? '')
        .filter((id) => id.startsWith(DEPARTURE_ALERT_PREFIX))
        .map((id) => notifee.cancelDisplayedNotification(id))
    );
  },

  // [떠나기]를 눌렀는데 남은 게 있을 때 — 헤드업으로 한 번 보여주고 10분 뒤 사라진다.
  // [다 챙겼어요]를 누르면 전부 체크되고, 그러면 외출 감지 긴급 알림도 자연히 안 나간다.
  // shownAt을 주면 버튼으로 다시 그리는 것이다 — 소리·헤드업 없이, 처음 띄운 때부터 10분에 사라지게.
  async showLastCheck(items: ChecklistItem[], shownAt?: number): Promise<void> {
    const unchecked = sortByUrgency(items);
    const first = shownAt ?? Date.now();
    const timeoutAfter = Math.max(1000, LAST_CHECK_TIMEOUT_MS - (Date.now() - first));
    const text = voiceText('lastCheck', { items: unchecked.map((i) => i.label), count: unchecked.length });

    await notifee.displayNotification({
      id:    LAST_CHECK_ID,
      title: text.title,
      body:  withLead(text.lead, itemList(unchecked, LAST_CHECK_MAX_LABELS)),
      data:  { date: toDateString(new Date()), checkLabel: unchecked[0]?.label ?? '', shownAt: String(first) },
      android: {
        channelId:    CHANNEL_CHECKLIST,
        importance:   AndroidImportance.HIGH,
        pressAction:  { id: 'open-checklist', launchActivity: 'default' },
        timeoutAfter,
        onlyAlertOnce: shownAt !== undefined,
        // 하나 남았으면 [다 챙겼어요]와 같은 일이라 물건 버튼은 둘 이상일 때만
        actions:      [
          ...(unchecked.length > 1 ? checkItemAction(unchecked[0]?.label) : []),
          { title: '다 챙겼어요', pressAction: { id: 'all-packed' } },
        ],
      },
    });
  },

  // 마지막 확인 알림이 떠 있으면 처음 띄운 시각, 없으면 null
  async lastCheckShownAt(): Promise<number | null> {
    const shown = (await notifee.getDisplayedNotifications()).find((n) => n.id === LAST_CHECK_ID);
    if (!shown) return null;
    const at = Number(shown.notification?.data?.shownAt);
    return Number.isFinite(at) && at > 0 ? at : Date.now() - LAST_CHECK_TIMEOUT_MS / 2;
  },

  // 귀가 루틴 (C4) — 집에 돌아왔을 때 할 일. 조용한 채널(소리·진동·헤드업 없음)로 하루 한 번.
  async showHomecoming(tasks: string[]): Promise<void> {
    await notifee.displayNotification({
      id:    HOMECOMING_ID,
      title: '다녀오셨어요',
      body:  tasks.length > 3 ? `${tasks.slice(0, 3).join(' · ')} 외 ${tasks.length - 3}개` : tasks.join(' · '),
      android: {
        channelId:   CHANNEL_HOMECOMING,
        pressAction: { id: 'default', launchActivity: 'default' },
        style:       { type: AndroidStyle.BIGTEXT, text: tasks.map((t) => `· ${t}`).join('\n') },
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
  //
  // 날마다 보낼지·피드백을 붙일지가 달라서(NightlyService, 외출-감지-재설계 5장) 반복 알림이 아니라
  // 날짜별 한 번짜리 알림을 여러 개 예약한다. id는 nightly-check-YYYY-MM-DD.
  //   full    — 착장 피드백 버튼 + 챙길 것 미리보기 (기본)
  //   preview — 외출 안 한 날: 피드백 없이 다음 외출에 달라지는 것만
  //   skip    — 예약하지 않음
  async scheduleNightlyChecks(entries: NightlyEntry[]): Promise<void> {
    const wanted = entries.filter((e) => e.variant !== 'skip');
    const signature = JSON.stringify([voiceSignature(), entries.map((e) => [e.at.getTime(), e.variant, e.highlight, e.repeat, e.departure, e.holiday ?? null, e.trip ?? null])]);

    const existing = await notifee.getTriggerNotificationIds();
    const wantedIds = new Set(wanted.map((e) => nightlyId(e)));
    const allPresent = [...wantedIds].every((id) => existing.includes(id));
    // 15분마다 불려도 바뀐 게 없으면 알람을 다시 걸지 않는다.
    if (signature === lastNightlySignature && allPresent) return;

    // 업데이트 전 예약(옛 22:00·20:00 알림, 반복 nightly-check)과 계획에서 빠진 날을 지운다.
    const stale = existing.filter(
      (id) => LEGACY_NIGHTLY_IDS.includes(id) || id === NIGHTLY_CHECK_ID ||
        (id.startsWith(NIGHTLY_ID_PREFIX) && !wantedIds.has(id))
    );
    await Promise.all(stale.map((id) => notifee.cancelTriggerNotification(id)));

    for (const entry of wanted) {
      const trigger: TimestampTrigger = {
        type:         TriggerType.TIMESTAMP,
        timestamp:    entry.at.getTime(),
        alarmManager: { allowWhileIdle: true },  // Doze Mode 대응
        ...(entry.repeat ? { repeatFrequency: RepeatFrequency.DAILY } : {}),
      };
      await notifee.createTriggerNotification(nightlyContent(entry), trigger);
    }
    lastNightlySignature = signature;
  },

  // 긴급 알림 — 외출이 확정됐는데 안 챙긴 게 있을 때
  // 우산(날씨 항목)을 두고 나왔으면 [가까운 편의점]을 붙인다 — 돌아가지 않고 수습할 길
  // (docs/결합-서비스-설계.md 2장). 누르면 앱을 거쳐 지도 앱 검색을 연다. 위치는 앱이 쓰지 않는다.
  async triggerUrgentAlert(items: ChecklistItem[]): Promise<void> {
    const uncheckedItems = sortByUrgency(items);
    const text = voiceText('urgent', { items: uncheckedItems.map((i) => i.label), count: uncheckedItems.length });
    const noUmbrella = uncheckedItems.some(isUmbrellaItem);

    await notifee.displayNotification({
      title:   text.title,
      body:    withLead(text.lead, itemList(uncheckedItems)),
      android: {
        channelId:   CHANNEL_CHECKLIST,
        importance:  AndroidImportance.HIGH,
        pressAction: { id: 'open-checklist', launchActivity: 'default' },
        sound:       'default',
        vibrationPattern: [1, 500, 200, 500], // notifee는 0을 거부한다(양수만, 짝수 개)
        ...(noUmbrella ? { actions: [FIND_STORE_ACTION] } : {}),
      },
    });
  },

  // 설정의 [미리 받아 보기] — 고른 말투로 "아 맞다" 알림이 어떻게 오는지 실제 알림으로 보여준다.
  async previewVoice(): Promise<void> {
    const sample = ['우산', '노트북', '충전기'];
    const text = voiceText('urgent', { items: sample, count: sample.length });
    await notifee.displayNotification({
      id:    'voice-preview',
      title: text.title,
      body:  withLead(text.lead, itemList(sample.map((label) => ({ label }) as ChecklistItem))),
      android: {
        channelId:    CHANNEL_CHECKLIST,
        pressAction:  { id: 'default' },
        timeoutAfter: 60 * 1000,
      },
    });
  },

  // 집 밖 장소에서 머물다 떠날 때 — 아침에 챙긴 것 중 꺼내 쓰는 물건 (docs/외출-감지-재설계.md 4장).
  // 긴급 알림보다 한 단계 부드럽게: 진동 짧게, 같은 id라 새로 오면 앞의 것을 대신한다.
  async triggerPlaceLeaveAlert(carryItems: ChecklistItem[]): Promise<void> {
    const items = sortByUrgency(carryItems);
    const text = voiceText('placeLeave', { items: items.map((i) => i.label), count: items.length });

    await notifee.displayNotification({
      id:    'place-leave',
      title: text.title,
      body:  withLead(text.lead, itemList(items)),
      android: {
        channelId:   CHANNEL_CHECKLIST,
        importance:  AndroidImportance.HIGH,
        pressAction: { id: 'open-checklist', launchActivity: 'default' },
        sound:       'default',
        vibrationPattern: [1, 300], // notifee는 0을 거부한다(양수만, 짝수 개)
        timeoutAfter: 30 * 60 * 1000,
      },
    });
  },
};

// 알림 이벤트 핸들러 — App.tsx의 onForegroundEvent(포그라운드)와
// notifee.onBackgroundEvent(백그라운드) 양쪽에서 공유해서 쓴다.
export async function handleNotificationEvent(
  type: number,
  detail: { notification?: { id?: string; data?: Record<string, unknown> }; pressAction?: { id?: string } }
): Promise<void> {
  const { EventType } = await import('@notifee/react-native');

  // 알람 — 울리기 시작함 / 알람 알림 탭 / [5분 뒤]·[끄기]. 앱이 꺼진 채 눌러도 처리되게 복원을 기다린다.
  const notificationId = detail.notification?.id;
  if (isAlarmNotificationId(notificationId)) {
    const { whenHydrated } = await import('@/store');
    await whenHydrated();
    const actionId = detail.pressAction?.id;
    if (type === EventType.ACTION_PRESS && actionId === 'alarm-snooze') {
      await AlarmService.snooze(notificationId!, detail.notification?.data);
    } else if (type === EventType.ACTION_PRESS && actionId === 'alarm-dismiss') {
      await AlarmService.dismiss(notificationId!, detail.notification?.data);
    } else if (type === EventType.DELIVERED || type === EventType.PRESS) {
      AlarmService.onRing(detail.notification);
    }
    return;
  }

  // 긴급 알림의 [가까운 편의점]. 앱이 꺼져 있다 이 버튼으로 켜지면 App.tsx가 처음 알림을
  // PRESS로 넘기므로 두 종류를 다 받는다.
  if ((type === EventType.ACTION_PRESS || type === EventType.PRESS) && detail.pressAction?.id === 'find-store') {
    const key = detail.notification?.id ?? '';
    const now = Date.now();
    const last = findStoreHandledAt.get(key);
    if (last !== undefined && now - last < FIND_STORE_DEDUP_MS) return;
    findStoreHandledAt.set(key, now);

    const { useAppStore, whenHydrated } = await import('@/store');
    await whenHydrated();
    const { DirectionsService } = await import('@/services/directions/DirectionsService');
    const opened = await DirectionsService.openPlaceWhenActive(useAppStore.getState().userSettings.mapApp, FIND_STORE_QUERY);
    if (!opened) useAppStore.getState().showToast('지도 앱을 열지 못했어요. 지도 앱에서 "편의점"을 검색해 보세요.', null, 'error');
    return;
  }

  // 공휴일 대답 — 출발 알림의 [오늘은 쉬어요], 자기 전 정리 알림의 [쉬어요]/[평소처럼]/[다른 시간].
  // 앱이 꺼진 채 눌러도 대답이 남게 복원을 기다린다. [다른 시간]은 앱을 열어 대시보드 질문 줄에서 고른다.
  const holidayAction = detail.pressAction?.id;
  // [다른 시간] — 앱이 열리고 대시보드 질문 줄에서 고른다. 알림은 내린다: 남아 있으면 나중에 [쉬어요]가
  // 방금 고른 시간을 덮어쓴다.
  if (type === EventType.ACTION_PRESS && holidayAction === 'holiday-other') {
    if (detail.notification?.id) await notifee.cancelNotification(detail.notification.id);
    return;
  }
  if (type === EventType.ACTION_PRESS && (holidayAction === 'holiday-off' || holidayAction === 'holiday-usual')) {
    const data = detail.notification?.data ?? {};
    const dates = typeof data.holidayDates === 'string'
      ? data.holidayDates.split(',').filter(Boolean)
      : typeof data.date === 'string' ? [data.date] : [];
    if (dates.length > 0) {
      const { useAppStore, whenHydrated } = await import('@/store');
      await whenHydrated();
      useAppStore.getState().setDatePlans(dates, holidayAction === 'holiday-off' ? 'off' : 'usual');
    }
    if (detail.notification?.id) await notifee.cancelNotification(detail.notification.id);
    // 앱 화면이 없으면(백그라운드) App.tsx의 다시 맞추기가 안 돈다 — 출발 알림·정리 알림을 여기서 맞춘다.
    const { resyncAfterDatePlanChange } = await import('@/services/holiday/resync');
    await resyncAfterDatePlanChange();
    return;
  }

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
    // [{물건} 챙김] — 알림에 실린 이름과 날짜로 (leave.ts)
    if (actionId === CHECK_ITEM_ACTION_ID) {
      const data = detail.notification?.data ?? {};
      if (typeof data.checkLabel === 'string' && data.checkLabel && typeof data.date === 'string') {
        const { checkFromNotification } = await import('@/services/departure/leave');
        await checkFromNotification(data.checkLabel, data.date);
      }
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
    (detail.pressAction?.id === 'open-tomorrow' || isNightlyCheckId(detail.notification?.id))
  ) {
    // 자기 전 정리 알림 본문 탭 — 다음 외출 준비 화면을 연다.
    // iOS는 android.pressAction을 안 쓰고 'default'로 오므로 알림 id로도 본다.
    const { useAppStore } = await import('@/store');
    useAppStore.getState().requestTomorrowPreview();
  }
}
