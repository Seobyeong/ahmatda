import { Linking } from 'react-native';
import type { MapApp } from '@/types';
import { buildPlaceSearchLink } from '@/utils/directions';

// 네이버지도 URL 스킴의 appname — Android applicationId / iOS bundle ID.
// 두 플랫폼 모두 com.ahmatda라 하나로 쓴다 (app.json ios.bundleIdentifier, android.package).
const APP_NAME = 'com.ahmatda';

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
};
