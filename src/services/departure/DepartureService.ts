// 아맞다 — 외출 판정을 실제 알림에 잇는 곳 (docs/외출-감지-재설계.md 3장, 6단계)
//
// 신호 출처는 넷이다: 걷기 시작(네이티브 모듈), 집 반경 이탈·재진입(지오펜스 태스크),
// 집 Wi-Fi 이탈·복귀(Wi-Fi 리스너·백그라운드 폴링), [떠나기](store). 어느 쪽에서 신호가 들어오든
// evaluate()를 부르면 전부 모아 decideDeparture로 판정하고, 확정이면 긴급 알림을 보낸다.
//
// 판정이 "후보"에 머물면(예: Wi-Fi만 끊기고 걷기·위치가 아직 안 옴) 안전장치 시각에 한 번 더
// 본다. 이 타이머는 앱 프로세스가 살아 있을 때만 돈다 — 죽어 있으면 15분 백그라운드 폴링이
// 같은 판정을 다시 한다 (안전장치는 2시간 안의 Wi-Fi 상태를 보므로 늦어도 놓치지 않는다).

import AsyncStorage from '@react-native-async-storage/async-storage';
import { NotificationService } from '@/services/notification/NotificationService';
import { getTodayString, isWithinDepartureWindow } from '@/utils/time';
import type { ChecklistItem } from '@/types';
import { decideDeparture, WIFI_FALLBACK_MS, type DepartureSignal, type SignalAvailability } from './decide';
import { SignalLog } from './signalLog';
import { HomeGeofence } from './homeGeofence';
import { markOutingToday } from '@/services/nightly/outingLog';
import { getWalkingStarts, hasMotionPermission, isMotionSupported } from '../../../modules/ahmatda-motion';

// 기존 Wi-Fi 단독 감지와 같은 키 — 업데이트 당일 이미 알린 사용자에게 다시 울리지 않게.
const ALERT_DATE_KEY = 'wifi_alert_date';
// 외출이 확정된 날 (다 챙기고 나가서 알림이 없던 날 포함) — Wi-Fi 리스너가 더 돌 이유가 없다.
const DEPARTED_DATE_KEY = 'departure_confirmed_date';
const RECHECK_SLACK_MS = 5_000;

let recheckTimer: ReturnType<typeof setTimeout> | null = null;

// 확정이 어느 경로(Wi-Fi·지오펜스·걷기·재확인 타이머·폴링)에서 났든 앱 화면 쪽에 알린다 —
// 토스트와 Wi-Fi 리스너 정리. 앱 프로세스가 살아 있을 때만 의미가 있다.
type DepartedListener = (unchecked: ChecklistItem[]) => void;
const listeners = new Set<DepartedListener>();

// 판정이 겹치면(지오펜스와 Wi-Fi 리스너가 거의 동시에) 둘 다 "아직 안 알림"을 읽고 두 번 울린다.
let running: Promise<ChecklistItem[] | null> = Promise.resolve(null);

async function getAvailability(): Promise<SignalAvailability> {
  const [walking, location] = await Promise.all([
    isMotionSupported() ? hasMotionPermission() : Promise.resolve(false),
    HomeGeofence.isAvailable(),
  ]);
  return { walking, location };
}

async function collectSignals(leaveIntent: { date: string; at: number } | null): Promise<DepartureSignal[]> {
  const signals: DepartureSignal[] = [...(await SignalLog.getAll())];
  for (const at of getWalkingStarts()) signals.push({ type: 'walking', at });
  if (leaveIntent && leaveIntent.date === getTodayString()) {
    signals.push({ type: 'leaveIntent', at: leaveIntent.at });
  }
  return signals;
}

function scheduleRecheck(): void {
  if (recheckTimer) clearTimeout(recheckTimer);
  recheckTimer = setTimeout(() => {
    recheckTimer = null;
    DepartureService.evaluate().catch(() => {});
  }, WIFI_FALLBACK_MS + RECHECK_SLACK_MS);
}

async function evaluateOnce(): Promise<ChecklistItem[] | null> {
  // 지오펜스·걷기는 앱이 화면 없이 깨어난 상태에서도 들어온다. 복원 전 기본값을 읽으면
  // 출발 시각·체크리스트가 전부 틀린다 (leave.ts와 같은 이유).
  const { useAppStore, whenHydrated } = await import('@/store');
  await whenHydrated();

  const { userSettings, leaveIntent } = useAppStore.getState();
  if (!userSettings.onboarded) return null;
  // 출발 감시 창(출발 30분 전 ~ +2시간) 밖의 이탈은 오늘 출발이 아니다 — 저녁 산책 등.
  if (!isWithinDepartureWindow(userSettings.departureTime)) return null;

  const today = getTodayString();
  if ((await AsyncStorage.getItem(ALERT_DATE_KEY)) === today) return null;

  const decision = decideDeparture(await collectSignals(leaveIntent), await getAvailability(), Date.now());
  if (decision.status === 'candidate') scheduleRecheck();
  if (decision.status !== 'confirmed') return null;

  if (recheckTimer) { clearTimeout(recheckTimer); recheckTimer = null; }
  await AsyncStorage.setItem(DEPARTED_DATE_KEY, today);
  // 자기 전 정리가 "오늘 외출함"으로 보게 (착장 피드백을 붙인다)
  await markOutingToday();

  // 집을 나섰으니 잠금화면 출발 상태는 내린다 (다 챙기고 나간 날도 포함)
  await NotificationService.clearDepartureStatus();

  // 앱을 오늘 한 번도 안 열었으면 checklist는 아직 어제 것이다. 그대로 쓰면 어제 항목으로 알리고
  // 어제 라벨을 오늘 "놓침"으로 기록한다. buildChecklist가 아니라 startNewDay인 이유는
  // 당일 한정 상태(todayFeedback 등)까지 함께 넘겨야 해서다.
  if (useAppStore.getState().checklistDate !== today) {
    useAppStore.getState().startNewDay();
  }

  const unchecked = useAppStore.getState().checklist.filter((i) => !i.checked);
  if (unchecked.length === 0) {
    listeners.forEach((l) => l([]));
    return null;
  }

  await NotificationService.triggerUrgentAlert(unchecked);
  await AsyncStorage.setItem(ALERT_DATE_KEY, today);
  // "자주 까먹는 항목" 학습 — 최근 7일간 2회 이상 놓친 항목에 "이번 주 N번 놓침" 뱃지가 붙는다.
  useAppStore.getState().recordForgotten(unchecked.map((i) => i.label));
  listeners.forEach((l) => l(unchecked));
  return unchecked;
}

export const DepartureService = {
  // 신호가 들어올 때마다 부른다. 알림을 보냈으면 안 챙긴 항목을, 아니면 null을 돌려준다.
  evaluate(): Promise<ChecklistItem[] | null> {
    const next = running.then(evaluateOnce, evaluateOnce);
    running = next.catch(() => null);
    return next;
  },

  // 외출 확정 시 호출 (안 챙긴 게 없으면 빈 배열). 해제 함수를 돌려준다.
  onDeparted(listener: DepartedListener): () => void {
    listeners.add(listener);
    return () => { listeners.delete(listener); };
  },

  // 오늘 이미 외출이 확정됐는지 — Wi-Fi 리스너를 다시 걸지 않으려고 본다.
  async hasDepartedToday(): Promise<boolean> {
    return (await AsyncStorage.getItem(DEPARTED_DATE_KEY)) === getTodayString();
  },

  // 앱 언마운트 시
  cancelRecheck(): void {
    if (recheckTimer) { clearTimeout(recheckTimer); recheckTimer = null; }
  },
};
