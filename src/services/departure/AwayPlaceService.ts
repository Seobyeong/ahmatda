// 아맞다 — 집 밖 장소에서 머물다 떠날 때 알림 (docs/외출-감지-재설계.md 4장, 7단계)
//
// 흐름 (규칙은 awayPlace.ts):
//   tick() — 15분 백그라운드 폴링·앱 복귀·걷기 이벤트에서 부른다
//     · 머무는 중(정지 20분+)이고 집이 아니면 → 지금 자리에 지오펜스를 건다 (자리 하나만)
//     · 자리를 벗어남 + 걷기 시작이 같이 있으면 → 꺼내 쓰는 물건 알림, 자리 해제
//   지오펜스 태스크 — 자리 이탈 시각을 적고 tick()
//
// 필요한 것: 이 알림이 켜짐 + 위치 '항상 허용' + 신체 활동(정지·걷기). 하나라도 없으면 아무것도 안 한다.
// 저장하는 것: 지금 머무는 자리 하나(중심 좌표·시각). 떠나면 지운다 — 장소 이력은 남기지 않는다 (8장).
//
// 알려진 한계: Android는 앱이 종료돼 있으면 지오펜스·폴링 모두 앱을 깨우지 않는다 (v57 문서).

import AsyncStorage from '@react-native-async-storage/async-storage';
import { WifiMonitorService } from '@/services/wifi/WifiMonitorService';
import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import { NotificationService } from '@/services/notification/NotificationService';
import { observeHomeWifi } from '@/services/wifi/homeWifi';
import { isAwayPlaceAlertOn } from '@/constants/preferences';
import { getTodayString } from '@/utils/time';
import { DAILY_LIMIT, PAIR_WINDOW_MS, distanceMeters, hasLeftPlace, pickCarryItems, stayingSince } from './awayPlace';
import { HOME_RADIUS_M, HomeGeofence } from './homeGeofence';
import { markOutingToday } from '@/services/nightly/outingLog';
import { getStillStarts, getVehicleStarts, getWalkingStarts, hasMotionPermission, isMotionSupported } from '../../../modules/ahmatda-motion';

export const PLACE_GEOFENCE_TASK = 'ahmatda-place-geofence';
const PLACE_RADIUS_M = 150;
const STATE_KEY = 'away_place_state';
// 집 반경 경계에 걸친 자리(현관 앞 벤치 등)를 "집 밖 장소"로 잡지 않게 여유를 둔다.
const HOME_MARGIN_M = 50;
// JS에서 막 건 직후의 이탈은 버린다 — 등록에 쓴 위치가 이미 낡았으면(그새 움직임) OS가 곧바로
// "밖"을 알려온다. 프로세스 재시작 때 Expo가 다시 걸며 오는 이탈은 버리지 않는다: 이 지오펜스는
// 이탈만 받으므로 그건 "앱이 꺼져 있던 사이 이미 떠났다"는 진짜 신호이고, 백그라운드로 깨어나
// 이 태스크를 처음 실행할 때가 바로 그 경우다. (집 지오펜스와 다르다 — 거긴 재진입도 받는다.)
const REGISTER_GRACE_MS = 60 * 1000;
// 폴링 한 번의 실행 시간 안에 끝나게 짧게 둔다 (같은 폴링에서 AI 미리 계산도 돈다).
const FIX_TIMEOUT_MS = 10 * 1000;
// 실내 Balanced 위치는 수백 m 틀릴 수 있다. 이보다 부정확하면 자리를 잡지 않는다 —
// 집을 "집 밖 장소"로 잘못 잡으면 현관을 나설 때마다 엉뚱한 알림이 간다.
const MAX_FIX_ACCURACY_M = 100;
// 이탈 신호를 놓쳤을 때(앱 종료 등) 자리가 영원히 남지 않게: 머문 뒤 움직임이 있고 이만큼 지나도
// 이탈이 없으면 위치로 확인한다. 그래도 반나절 넘은 자리는 버린다.
const MISSED_EXIT_CHECK_MS = 10 * 60 * 1000;
const PLACE_MAX_AGE_MS = 12 * 60 * 60 * 1000;
// 사무실 안을 오갈 때마다 GPS를 켜지 않게, 놓침 확인은 이 간격보다 자주 하지 않는다.
const MISSED_EXIT_RECHECK_MS = 30 * 60 * 1000;

interface Place {
  lat: number;
  lon: number;
  since: number;         // 머물기 시작한 시각 (정지 시작)
  registeredAt: number;  // 지오펜스를 건 시각
  exitAt: number | null; // 자리를 벗어난 시각
  checkedAt?: number;    // 이탈을 놓쳤는지 마지막으로 위치로 확인한 시각
}

interface State {
  date: string;  // sent를 세는 날
  sent: number;  // 오늘 보낸 알림 수
  place: Place | null;
  // 이미 처리한 정지 시작 — 집이었거나, 자리를 잡았다 풀었거나. 같은 정지로 다시 위치를 잡지 않는다
  // (집에서 15분마다 GPS를 켜거나, 차로 떠난 뒤 도로 위에 자리를 다시 잡는 일을 막는다).
  handledStill: number | null;
}

TaskManager.defineTask<{ eventType: Location.GeofencingEventType }>(PLACE_GEOFENCE_TASK, async ({ data, error }) => {
  if (error || !data || data.eventType !== Location.GeofencingEventType.Exit) return;
  const now = Date.now();
  await serialized(async () => {
    const state = await readState();
    const place = state.place;
    if (!place || place.exitAt !== null) return;
    if (now - place.registeredAt < REGISTER_GRACE_MS) return;
    await writeState({ ...state, place: { ...place, exitAt: now } });
  });
  await AwayPlaceService.tick();
});

let queue: Promise<unknown> = Promise.resolve();
function serialized<T>(work: () => Promise<T>): Promise<T> {
  const next = queue.then(work, work);
  queue = next.catch(() => {});
  return next;
}

async function readState(): Promise<State> {
  const today = getTodayString();
  try {
    const raw = await AsyncStorage.getItem(STATE_KEY);
    const parsed = raw ? (JSON.parse(raw) as State) : null;
    if (parsed && parsed.date === today) return { ...parsed, handledStill: parsed.handledStill ?? null };
    // 날이 바뀌면 횟수만 새로 센다. 자정을 넘겨 머무는 자리는 그대로 둔다.
    return { date: today, sent: 0, place: parsed?.place ?? null, handledStill: parsed?.handledStill ?? null };
  } catch {
    return { date: today, sent: 0, place: null, handledStill: null };
  }
}

function writeState(state: State): Promise<void> {
  return AsyncStorage.setItem(STATE_KEY, JSON.stringify(state));
}

async function stopPlaceGeofence(): Promise<void> {
  try {
    if (await Location.hasStartedGeofencingAsync(PLACE_GEOFENCE_TASK)) {
      await Location.stopGeofencingAsync(PLACE_GEOFENCE_TASK);
    }
  } catch {
    // 이미 풀려 있음
  }
}

async function canRun(): Promise<boolean> {
  const { useAppStore, whenHydrated } = await import('@/store');
  await whenHydrated();
  const { userSettings } = useAppStore.getState();
  if (!userSettings.onboarded || !isAwayPlaceAlertOn(userSettings)) return false;
  if (!isMotionSupported() || !(await hasMotionPermission())) return false;
  try {
    const [fg, bg] = await Promise.all([
      Location.getForegroundPermissionsAsync(),
      Location.getBackgroundPermissionsAsync(),
    ]);
    return fg.granted && bg.granted;
  } catch {
    return false;
  }
}

// 지금 자리가 집인지. 집 좌표가 있으면 거리로, 없으면 집 Wi-Fi로. 둘 다 없으면 알 수 없으니 "집"으로
// 본다 — 집 소파를 "머문 장소"로 잡아 두면 현관을 나설 때마다 엉뚱한 알림이 간다.
// 위치를 켜기 전에 싸게 볼 수 있는 것 — 집 Wi-Fi에 붙어 있으면 집이다.
async function onHomeWifi(): Promise<boolean> {
  return (await observeHomeWifi()) === 'home';
}

async function isAtHome(here: { lat: number; lon: number }): Promise<boolean> {
  const home = await HomeGeofence.getHomeCoords();
  if (home) return distanceMeters(home, here) <= HOME_RADIUS_M + HOME_MARGIN_M;
  if (!(await WifiMonitorService.getHomeBssid())) return true;
  return (await observeHomeWifi()) !== 'away';
}

async function currentFix(): Promise<{ lat: number; lon: number } | null> {
  try {
    const position = await Promise.race([
      Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), FIX_TIMEOUT_MS)),
    ]);
    if (!position) return null;
    const accuracy = position.coords.accuracy;
    if (accuracy == null || accuracy > MAX_FIX_ACCURACY_M) return null;
    return { lat: position.coords.latitude, lon: position.coords.longitude };
  } catch {
    return null;
  }
}

async function tickOnce(): Promise<void> {
  const state = await readState();

  if (!(await canRun())) {
    if (state.place) {
      await stopPlaceGeofence();
      await writeState({ ...state, place: null });
    }
    return;
  }

  const now = Date.now();
  const walking = getWalkingStarts();
  // 머묾 판정의 "움직임"에는 탈것도 넣는다. 떠남 판정은 걷기만 본다 (자리에서 일어나 걸어 나감).
  const moving = [...walking, ...getVehicleStarts()];
  const place = state.place;

  if (place) {
    if (hasLeftPlace(place.since, place.exitAt, walking, now)) {
      await stopPlaceGeofence();
      const sent = await notifyIfNeeded(state.sent);
      await writeState({ ...state, sent, place: null, handledStill: place.since });
      return;
    }
    // 벗어났는데 걷기가 안 붙은 채 시간이 지났다 — 차로 떠났거나 GPS가 튄 것. 자리를 푼다.
    // 같은 정지로는 다시 잡지 않는다(handledStill) — 새로 움직였다 멈춰야 다음 자리가 생긴다.
    if (place.exitAt !== null && now - place.exitAt > PAIR_WINDOW_MS) {
      await clearPlace(state, place.since);
      return;
    }
    if (place.exitAt === null) {
      const missed = await exitWasMissed(place, moving, now);
      if (missed === true) await clearPlace(state, place.since);
      if (missed === false) await writeState({ ...state, place: { ...place, checkedAt: now } });
    }
    return;
  }

  if (state.sent >= DAILY_LIMIT) return;
  const since = stayingSince(getStillStarts(), moving, now);
  if (since === null || since === state.handledStill) return;

  // 집이면 이 정지는 끝날 때까지 다시 보지 않는다 (GPS를 15분마다 켜지 않게).
  if (await onHomeWifi()) {
    await writeState({ ...state, handledStill: since });
    return;
  }
  const here = await currentFix();
  if (!here) return; // 위치가 안 잡히거나 부정확 — 다음 확인 때 다시
  if (await isAtHome(here)) {
    await writeState({ ...state, handledStill: since });
    return;
  }

  const next: Place = { ...here, since, registeredAt: Date.now(), exitAt: null };
  await writeState({ ...state, place: next });
  // 집 밖에서 머물고 있다 — 자기 전 정리에는 "외출한 날"
  await markOutingToday();
  try {
    await Location.startGeofencingAsync(PLACE_GEOFENCE_TASK, [{
      identifier: 'place',
      latitude: here.lat,
      longitude: here.lon,
      radius: PLACE_RADIUS_M,
      notifyOnEnter: false,
      notifyOnExit: true,
    }]);
  } catch {
    await writeState({ ...state, place: null });
  }
}

async function clearPlace(state: State, since: number): Promise<void> {
  await stopPlaceGeofence();
  await writeState({ ...state, place: null, handledStill: since });
}

// 이탈 신호를 놓쳤는지 — 앱이 꺼져 있었거나 지오펜스가 재부팅으로 지워진 경우. 머문 뒤 움직임이
// 있었는데 한참 이탈이 없으면 지금 위치로 확인한다. 이미 멀리 있으면 놓친 것(알림은 늦어서 안 보냄).
// 반환: true = 놓쳤음(자리 해제), false = 위치로 확인했고 아직 거기 있음, null = 확인 안 함
async function exitWasMissed(place: Place, moving: number[], now: number): Promise<boolean | null> {
  if (now - place.registeredAt > PLACE_MAX_AGE_MS) return true;
  const movedAfter = moving.filter((t) => t > place.since);
  if (movedAfter.length === 0) return null;
  if (now - Math.min(...movedAfter) < MISSED_EXIT_CHECK_MS) return null;
  if (place.checkedAt !== undefined && now - place.checkedAt < MISSED_EXIT_RECHECK_MS) return null;
  const here = await currentFix();
  if (here === null) return null;
  return distanceMeters(place, here) > PLACE_RADIUS_M;
}

// 알림을 보냈으면 늘어난 횟수를 돌려준다. 꺼내 쓰는 물건을 안 챙겼으면 울리지 않는다 (횟수도 안 씀).
async function notifyIfNeeded(sent: number): Promise<number> {
  if (sent >= DAILY_LIMIT) return sent;
  const { useAppStore } = await import('@/store');
  const { checklist, checklistDate } = useAppStore.getState();
  // 오늘 체크리스트가 아니면(앱을 안 연 날) "아침에 챙긴 것"을 알 수 없다.
  if (checklistDate !== getTodayString()) return sent;
  const items = pickCarryItems(checklist);
  if (items.length === 0) return sent;
  await NotificationService.triggerPlaceLeaveAlert(items);
  return sent + 1;
}

export const AwayPlaceService = {
  tick(): Promise<void> {
    return serialized(tickOnce).catch(() => {});
  },

  // 진단 화면용
  async inspect(): Promise<{ state: State; geofenceStarted: boolean; canRun: boolean }> {
    const [state, geofenceStarted, ok] = await Promise.all([
      readState(),
      Location.hasStartedGeofencingAsync(PLACE_GEOFENCE_TASK).catch(() => false),
      canRun(),
    ]);
    return { state, geofenceStarted, canRun: ok };
  },

  // 진단 화면의 "테스트 기록 지우기" — 머무는 자리와 오늘 보낸 횟수를 지운다. 이미 처리한 정지(handledStill)는
  // 남긴다 — 지우면 지금 앉아 있는 자리를 곧바로 다시 잡아 GPS를 켜고 외출 흔적을 새로 남긴다.
  resetForTest(): Promise<void> {
    return serialized(async () => {
      await stopPlaceGeofence();
      const state = await readState();
      await writeState({ ...state, sent: 0, place: null });
    });
  },
};
