// 아맞다 — 집 반경 지오펜스 (docs/외출-감지-재설계.md 3장 위치 신호, 6단계)
//
// 집 좌표 둘레에 원을 걸고, 벗어나면 locationExit, 다시 들어오면 locationEnter를 기록한다.
// expo-location v57 지오펜싱 (docs.expo.dev/versions/v57.0.0/sdk/location):
//   - 태스크는 TaskManager.defineTask로 "최상위 범위"에서 정의해야 한다 — 이 모듈을 App.tsx가
//     맨 위에서 import한다. 앱이 백그라운드에서 깨어날 때는 화면 없이 번들만 돌기 때문이다.
//   - Android는 포그라운드 + 백그라운드(항상 허용) 위치 권한이 둘 다 있어야 한다.
//   - Android는 앱이 종료된 상태에서 지오펜스 이벤트가 와도 앱을 다시 띄우지 않는다.
//     그 경우는 걷기(네이티브 리시버가 기록)·Wi-Fi 안전장치·백그라운드 폴링이 메운다.
//
// 저장하는 것: 집 좌표 하나 (기기 안, AsyncStorage). 이동 경로나 현재 좌표는 저장하지 않는다.

import AsyncStorage from '@react-native-async-storage/async-storage';
import { Alert, Linking } from 'react-native';
import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import { SignalLog } from './signalLog';

export const HOME_GEOFENCE_TASK = 'ahmatda-home-geofence';
// Google은 지오펜스 반경을 최소 100~150m로 권한다 (그보다 작으면 실내 GPS 오차로 오탐이 잦다).
export const HOME_RADIUS_M = 150;

// 위치 '항상 허용' 요청 전에 보여주는 안내 (Google Play "눈에 띄는 공개" — 무엇을, 왜, 앱을 안 쓸 때도
// 쓴다는 것을 런타임 요청보다 먼저 앱 안에서 밝힌다). 온보딩과 설정이 같은 문구를 쓴다.
export const BACKGROUND_LOCATION_DISCLOSURE = {
  title: '위치 항상 허용',
  body:
    `아맞다는 앱을 닫았거나 사용하지 않을 때도 위치 정보를 사용해, 등록한 집에서 ${HOME_RADIUS_M}m쯤 ` +
    '벗어나는 순간을 확인하고 안 챙긴 물건이 있으면 알려드려요. ' +
    "'집 밖에서 떠날 때 알림'을 켜면 오래 머문 곳을 떠나는 순간도 확인해요.\n\n" +
    '위치는 이 기기 안에서 판단에만 쓰고, 이동 기록을 저장하거나 기기 밖으로 보내지 않아요. ' +
    '저장하는 건 등록한 집 위치와, 지금 머무는 곳 하나(떠나면 지움)뿐이에요.\n\n' +
    "다음 화면에서 '항상 허용'을 골라주세요. 허용하지 않아도 걷기와 Wi-Fi로 외출을 확인해요.",
} as const;

const HOME_COORDS_KEY = 'home_coords';
const REGISTERED_KEY  = 'home_geofence_registered'; // { lat, lon, at } — 어떤 좌표로 언제 걸었는지

// 지오펜스를 걸면 OS가 지금 상태(안/밖)를 곧바로 한 번 알려준다 — Expo Android 구현이
// INITIAL_TRIGGER_ENTER | EXIT로 건다 (expo-location GeofencingTaskConsumer.kt). 그건 "방금 나감"이
// 아니므로 걸린 직후 이만큼은 버린다. 거는 때는 둘이다: JS에서 새로 걸 때(REGISTERED_KEY.at),
// 그리고 앱 프로세스가 새로 뜰 때 Expo가 태스크를 복원하며 네이티브에서 다시 걸 때(이 모듈이
// 로드된 시각으로 잡는다). 특히 후자를 안 거르면, 이미 나간 뒤 경계 근처에서 프로세스가 다시 뜨며
// GPS 오차로 "안"이 보고될 때 locationEnter가 앞선 이탈과 Wi-Fi 안전장치를 무효로 만든다.
// 이 창 밖의 반복 알림은 signalLog가 "마지막 상태와 같으면 처음 시각 유지"로 흡수한다.
// (걷기 구독 재등록 때의 가짜 ENTER와 같은 문제)
const REGISTER_GRACE_MS = 60 * 1000;
const processStartedAt = Date.now();

// 실내에서는 고정밀 위치가 끝내 안 잡힐 수 있다 — 버튼이 "확인 중"에 갇히지 않게.
const HOME_FIX_TIMEOUT_MS = 20 * 1000;

export interface HomeCoords {
  lat: number;
  lon: number;
}

interface Registered extends HomeCoords {
  at: number;
}

interface GeofenceTaskData {
  eventType: Location.GeofencingEventType;
  region: Location.LocationRegion;
}

TaskManager.defineTask<GeofenceTaskData>(HOME_GEOFENCE_TASK, async ({ data, error }) => {
  if (error || !data) return;
  const now = Date.now();
  const registered = await readJson<Registered>(REGISTERED_KEY);
  const registeredAt = Math.max(registered?.at ?? 0, processStartedAt);
  if (now - registeredAt < REGISTER_GRACE_MS) return;

  if (data.eventType === Location.GeofencingEventType.Exit) {
    await SignalLog.record('locationExit', now);
  } else if (data.eventType === Location.GeofencingEventType.Enter) {
    await SignalLog.record('locationEnter', now);
  } else {
    return;
  }

  // 동적 import — DepartureService는 store·알림을 물고 있어 정적으로 물면 순환이 생긴다.
  const { DepartureService } = await import('./DepartureService');
  await DepartureService.evaluate();
});

async function readJson<T>(key: string): Promise<T | null> {
  try {
    const raw = await AsyncStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

async function hasBothPermissions(): Promise<boolean> {
  const [fg, bg] = await Promise.all([
    Location.getForegroundPermissionsAsync(),
    Location.getBackgroundPermissionsAsync(),
  ]);
  return fg.granted && bg.granted;
}

export const HomeGeofence = {
  getHomeCoords(): Promise<HomeCoords | null> {
    return readJson<HomeCoords>(HOME_COORDS_KEY);
  },

  // 온보딩·설정의 [지금 위치를 집으로] — 캐시된 좌표가 아니라 지금 위치를 새로 잡는다
  // (며칠 전 다른 곳의 캐시가 집으로 저장되면 매일 오탐이 난다). 포그라운드 권한만 필요하다.
  // 반환: 저장 실패면 null, 저장했으면 지오펜스가 실제로 걸렸는지(active — '항상 허용'이 있어야 함).
  async registerCurrentLocationAsHome(): Promise<{ coords: HomeCoords; active: boolean } | null> {
    try {
      const fg = await Location.getForegroundPermissionsAsync();
      if (!fg.granted) return null;
      const position = await Promise.race([
        Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High }),
        new Promise<null>((resolve) => setTimeout(() => resolve(null), HOME_FIX_TIMEOUT_MS)),
      ]);
      if (!position) return null;
      const coords = { lat: position.coords.latitude, lon: position.coords.longitude };
      await AsyncStorage.setItem(HOME_COORDS_KEY, JSON.stringify(coords));
      return { coords, active: await HomeGeofence.sync() };
    } catch {
      return null;
    }
  },

  // 위치 '항상 허용' 요청 — 온보딩과 설정이 같이 쓴다. Play "눈에 띄는 공개"를 런타임 요청보다
  // 먼저 보여주고, 다시 물을 수 없는 상태(canAskAgain=false)면 OS 설정으로 보낸다.
  // Android 11+는 요청하면 시스템 설정 화면으로 넘어가서, 결과는 돌아온 뒤 다시 조회해야 정확하다.
  async promptBackgroundPermission(): Promise<'granted' | 'denied' | 'dismissed' | 'settings'> {
    const current = await Location.getBackgroundPermissionsAsync().catch(() => null);
    if (current?.granted) {
      await HomeGeofence.sync();
      return 'granted';
    }
    if (current && current.status === 'denied' && !current.canAskAgain) {
      await Linking.openSettings().catch(() => {});
      return 'settings';
    }
    const proceed = await new Promise<boolean>((resolve) => {
      Alert.alert(BACKGROUND_LOCATION_DISCLOSURE.title, BACKGROUND_LOCATION_DISCLOSURE.body, [
        { text: '나중에', style: 'cancel', onPress: () => resolve(false) },
        { text: '계속', onPress: () => resolve(true) },
      ], { cancelable: true, onDismiss: () => resolve(false) });
    });
    if (!proceed) return 'dismissed';
    try {
      const result = await Location.requestBackgroundPermissionsAsync();
      if (!result.granted) return 'denied';
      await HomeGeofence.sync();
      return 'granted';
    } catch {
      return 'denied';
    }
  },

  // 권한·집 좌표에 맞춰 지오펜스를 걸거나 푼다. 앱 시작·포그라운드 복귀·권한 허용·집 등록 직후에
  // 부른다. 이미 같은 좌표로 걸려 있으면 다시 걸지 않는다 — 다시 걸 때마다 OS가 지금 상태를
  // 알려와서 가짜 신호가 생길 수 있다.
  // 반환값: 지금 위치 신호를 쓸 수 있는지 (외출 판정의 availability.location).
  async sync(): Promise<boolean> {
    try {
      const coords = await HomeGeofence.getHomeCoords();
      const started = await Location.hasStartedGeofencingAsync(HOME_GEOFENCE_TASK);

      if (!coords || !(await hasBothPermissions())) {
        if (started) await Location.stopGeofencingAsync(HOME_GEOFENCE_TASK);
        await AsyncStorage.removeItem(REGISTERED_KEY);
        return false;
      }

      const registered = await readJson<Registered>(REGISTERED_KEY);
      const sameCoords = registered?.lat === coords.lat && registered?.lon === coords.lon;
      if (started && sameCoords) return true;

      await AsyncStorage.setItem(REGISTERED_KEY, JSON.stringify({ ...coords, at: Date.now() }));
      await Location.startGeofencingAsync(HOME_GEOFENCE_TASK, [{
        identifier: 'home',
        latitude: coords.lat,
        longitude: coords.lon,
        radius: HOME_RADIUS_M,
        notifyOnEnter: true,
        notifyOnExit: true,
      }]);
      return true;
    } catch {
      return false;
    }
  },

  // 판정용 — 권한을 다시 묻지 않고 지금 상태만 본다. 백그라운드 태스크 안에서도 불린다.
  async isAvailable(): Promise<boolean> {
    try {
      if (!(await HomeGeofence.getHomeCoords())) return false;
      if (!(await hasBothPermissions())) return false;
      return await Location.hasStartedGeofencingAsync(HOME_GEOFENCE_TASK);
    } catch {
      return false;
    }
  },
};
