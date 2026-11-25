// 아맞다 — 집 Wi-Fi 등록·학습·지금 상태 (docs/외출-감지-재설계.md 3장)
//
// 외출 판정·집 밖 머묾·자기 전 정리·Wi-Fi 감시가 모두 여기서 집 Wi-Fi를 본다.
// WifiMonitorService에 두지 않는 이유: 그쪽은 DepartureService를 정적으로 물고 있어, 판정 쪽에서
// 가져다 쓰면 순환이 생긴다.
//
// 듀얼밴드·메시 공유기 (2026-11-25 결정 — 자동 학습): 등록한 BSSID 하나에서 시작해, 같은 이름(SSID)의
// 다른 BSSID가 집으로 확인되면 목록에 더한다. 확인 방법은 presence.ts의 homeWifiLesson —
// 같은 공유기로 보이면 바로, 아니면 위치가 집 가까이(LEARN_RADIUS_M)라고 할 때만.
// 위치는 기다리지 않는다 — 판정·알림 경로가 GPS 때문에 몇 초씩 멈추면 안 된다. 최근 60초 안의 위치만
// 바로 쓰고, 없으면 앱 화면이 떠 있을 때 새 위치를 따로 잡아 두었다가 다음 판정부터 반영한다.

import NetInfo, { type NetInfoState } from '@react-native-community/netinfo';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { AppState } from 'react-native';
import * as Location from 'expo-location';
import { distanceMeters } from '@/services/departure/awayPlace';
import { classifyPresence, homeWifiLesson, readSsid, type HomePresence, type HomeWifi } from './presence';

// 처음 등록한 BSSID — "집 Wi-Fi 등록됨" 여부와 예전 버전 호환에 쓴다.
export const HOME_BSSID_KEY = 'home_bssid';
// 학습까지 포함한 집 Wi-Fi. 없으면 HOME_BSSID_KEY 하나로 시작한다.
const HOME_WIFI_KEY = 'home_wifi';

interface Stored extends HomeWifi {
  registeredAt: number; // 다시 등록하면 바뀐다 — 그 전에 시작한 학습이 결과를 써 넣지 않게
}

// 위치로 확인할 때: 이보다 오래되거나 부정확한 위치는 안 쓴다.
const FIX_MAX_AGE_MS = 60 * 1000;
const FIX_MAX_ACCURACY_M = 100;
// 배우는 건 집 가까이일 때만 — 지오펜스 반경(150m)의 절반. 오차를 더해도 이 안이어야 한다.
const LEARN_RADIUS_M = 75;
// 같은 BSSID로 새 위치를 다시 잡기까지 (카페에 앉아 있는 동안 GPS를 계속 켜지 않게)
const FRESH_FIX_RETRY_MS = 10 * 60 * 1000;

export { readSsid };

export async function getHomeBssid(): Promise<string | null> {
  return AsyncStorage.getItem(HOME_BSSID_KEY);
}

async function readStored(): Promise<Stored | null> {
  const primary = await getHomeBssid();
  if (!primary) return null;
  try {
    const raw = await AsyncStorage.getItem(HOME_WIFI_KEY);
    const parsed = raw ? (JSON.parse(raw) as Stored) : null;
    // 등록한 BSSID와 어긋난 학습 기록(예전 버전에서 다시 등록 등)은 버리고 다시 배운다.
    if (parsed && Array.isArray(parsed.bssids) && parsed.bssids[0] === primary.toLowerCase()) return parsed;
  } catch {
    // 깨진 기록은 무시하고 등록한 것 하나로 시작
  }
  return { bssids: [primary.toLowerCase()], ssid: null, registeredAt: 0 };
}

export async function getHomeWifi(): Promise<HomeWifi | null> {
  return readStored();
}

// 학습·등록 쓰기가 겹치지 않게 (Wi-Fi 리스너·폴링·새 위치 결과가 거의 동시에 올 때)
let queue: Promise<unknown> = Promise.resolve();
function serialized<T>(work: () => Promise<T>): Promise<T> {
  const next = queue.then(work, work);
  queue = next.catch(() => {});
  return next;
}

// 등록(온보딩·설정) — 학습한 것은 지운다. 다른 집으로 이사했거나 잘못 배운 걸 지우려는 것일 수 있다.
export function registerHomeWifi(bssid: string, ssid: string | null = null): Promise<void> {
  return serialized(async () => {
    const home: Stored = { bssids: [bssid.toLowerCase()], ssid, registeredAt: Date.now() };
    await AsyncStorage.multiSet([[HOME_BSSID_KEY, bssid], [HOME_WIFI_KEY, JSON.stringify(home)]]);
  });
}

// 배우지 않고 지금 상태만 — 지오펜스 태스크처럼 짧게 끝나야 하는 곳용.
export async function peekHomeWifi(): Promise<HomePresence> {
  try {
    const home = await readStored();
    if (!home) return 'unknown';
    return classifyPresence(await NetInfo.fetch(), home);
  } catch {
    return 'unknown';
  }
}

// 지금 집 Wi-Fi에 붙어 있는지 보고, 배울 게 있으면 배운다. state를 주면 그걸 쓴다(리스너).
// 집 Wi-Fi 미등록이거나 읽다 실패하면 'unknown' — 판정은 그때 지금처럼 동작한다.
// 같은 이름의 처음 보는 BSSID: 위치가 집 가까이면 배워서 'home', 집 반경 밖이 확실하면 'away',
// 모르면 'unknown'.
export function observeHomeWifi(given?: NetInfoState): Promise<HomePresence> {
  return serialized(async () => {
    try {
      const home = await readStored();
      if (!home) return 'unknown';
      const state = given ?? (await NetInfo.fetch());
      const presence = classifyPresence(state, home);
      const lesson = homeWifiLesson(state, home);

      if (lesson.kind === 'learnSsid') {
        await save({ ...home, ssid: lesson.ssid });
      } else if (lesson.kind === 'learnBssid') {
        await save({ ...home, bssids: [...home.bssids, lesson.bssid] });
        return 'home';
      } else if (lesson.kind === 'needsLocation') {
        const where = judge(await recentFix());
        if (where === 'near') {
          await save({ ...home, bssids: [...home.bssids, lesson.bssid] });
          return 'home';
        }
        if (where === 'outside') return 'away';
        maybeFreshFix(lesson.bssid, home.registeredAt);
      }
      return presence;
    } catch {
      return 'unknown';
    }
  });
}

export const currentHomeWifi = (): Promise<HomePresence> => observeHomeWifi();

async function save(home: Stored): Promise<void> {
  await AsyncStorage.setItem(HOME_WIFI_KEY, JSON.stringify(home));
}

type Home = { lat: number; lon: number; radius: number };
type Fix = { lat: number; lon: number; accuracy: number; home: Home } | null;
type Where = 'near' | 'outside' | 'unknown';

async function homeCoords(): Promise<Home | null> {
  // 동적 import — homeGeofence가 이 모듈을 정적으로 문다.
  const { HomeGeofence, HOME_RADIUS_M } = await import('@/services/departure/homeGeofence');
  const c = await HomeGeofence.getHomeCoords();
  return c ? { lat: c.lat, lon: c.lon, radius: HOME_RADIUS_M } : null;
}

function toFix(loc: Location.LocationObject | null, home: Home, notBefore: number): Fix {
  if (!loc || loc.timestamp < notBefore) return null;
  const accuracy = loc.coords.accuracy ?? Infinity;
  if (accuracy > FIX_MAX_ACCURACY_M) return null;
  return { lat: loc.coords.latitude, lon: loc.coords.longitude, accuracy, home };
}

// 최근 60초 안의 위치 (기다리지 않는다)
async function recentFix(): Promise<Fix> {
  try {
    const home = await homeCoords();
    if (!home) return null;
    const loc = await Location.getLastKnownPositionAsync({ maxAge: FIX_MAX_AGE_MS, requiredAccuracy: FIX_MAX_ACCURACY_M });
    return toFix(loc, home, Date.now() - FIX_MAX_AGE_MS);
  } catch {
    return null;
  }
}

function judge(fix: Fix): Where {
  if (!fix) return 'unknown';
  const d = distanceMeters(fix.home, fix);
  if (d + fix.accuracy <= LEARN_RADIUS_M) return 'near';
  if (d - fix.accuracy > fix.home.radius) return 'outside';
  return 'unknown';
}

// 앱 화면이 떠 있을 때만, 같은 BSSID로는 10분에 한 번 — 결과는 기다리지 않고 다음 판정부터 반영한다.
const freshTried = new Map<string, number>();
function maybeFreshFix(bssid: string, registeredAt: number): void {
  if (AppState.currentState !== 'active') return;
  const now = Date.now();
  if (now - (freshTried.get(bssid) ?? 0) < FRESH_FIX_RETRY_MS) return;
  freshTried.set(bssid, now);
  (async () => {
    const home = await homeCoords();
    if (!home) return;
    const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
    // 캐시된 예전 위치(집에 있을 때)가 오면 방금 나간 곳을 집으로 배운다 — 요청 뒤 위치만 쓴다
    if (judge(toFix(loc, home, now)) !== 'near') return;
    // 그사이 연결이 바뀌었거나 다시 등록했으면 쓰지 않는다
    const state = await NetInfo.fetch();
    await serialized(async () => {
      const stored = await readStored();
      if (!stored || stored.registeredAt !== registeredAt) return;
      const lesson = homeWifiLesson(state, stored);
      if (lesson.kind !== 'needsLocation' || lesson.bssid !== bssid) return;
      await save({ ...stored, bssids: [...stored.bssids, bssid] });
    });
  })().catch(() => {});
}
