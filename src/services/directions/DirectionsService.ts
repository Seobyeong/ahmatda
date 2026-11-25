import { AppState, Linking } from 'react-native';
import type { MapApp } from '@/types';
import { buildPlaceSearchLink } from '@/utils/directions';

// 네이버지도 URL 스킴의 appname — Android applicationId / iOS bundle ID.
// 두 플랫폼 모두 com.ahmatda라 하나로 쓴다 (app.json ios.bundleIdentifier, android.package).
const APP_NAME = 'com.ahmatda';

// 알림 버튼으로 앱이 켜지는 중이면 화면이 뜰 때까지 기다린다. 그 안에 안 뜨면 열지 않는다 —
// 사용자가 다른 일을 하고 있을 때 지도가 갑자기 튀어나오면 안 된다.
const WAIT_ACTIVE_MS = 10_000;

function waitUntilActive(timeoutMs: number): Promise<boolean> {
  if (AppState.currentState === 'active') return Promise.resolve(true);
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      sub.remove();
      resolve(false);
    }, timeoutMs);
    const sub = AppState.addEventListener('change', (state) => {
      if (state !== 'active') return;
      clearTimeout(timer);
      sub.remove();
      resolve(true);
    });
  });
}

export const DirectionsService = {

  // 장소를 지도 앱에서 연다. 열리면 true.
  // canOpenURL은 iOS에서 LSApplicationQueriesSchemes에 없는 스킴이면 reject하고,
  // Android에서는 <queries>에 없으면 false를 준다 — 둘 다 "열 수 없음"으로 보고 대체 링크로 간다.
  async openPlace(app: MapApp, query: string): Promise<boolean> {
    const { primary, fallback } = buildPlaceSearchLink(app, query, APP_NAME);
    const candidates = [primary, fallback].filter((url): url is string => url !== null);

    for (const url of candidates) {
      try {
        const isWebLink = url.startsWith('https://');
        if (isWebLink || (await Linking.canOpenURL(url))) {
          await Linking.openURL(url);
          return true;
        }
      } catch {
        // 다음 후보로
      }
    }
    return false;
  },

  // 알림 버튼에서 부를 때 — 안드로이드는 백그라운드에서 다른 앱 화면을 띄우지 못하므로
  // 버튼이 띄운 우리 앱 화면이 앞에 온 뒤에 연다.
  async openPlaceWhenActive(app: MapApp, query: string): Promise<boolean> {
    if (!(await waitUntilActive(WAIT_ACTIVE_MS))) return false;
    return DirectionsService.openPlace(app, query);
  },
};
