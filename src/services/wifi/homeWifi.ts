// 아맞다 — 지금 집 Wi-Fi에 붙어 있는지 (외출 판정 규칙 7, docs/외출-감지-재설계.md 3장)
//
// 외출 판정(DepartureService)과 지오펜스 태스크(homeGeofence)가 같이 쓴다. WifiMonitorService에
// 두지 않는 이유: 그쪽은 DepartureService를 정적으로 물고 있어, 판정 쪽에서 가져다 쓰면 순환이 생긴다.

import NetInfo from '@react-native-community/netinfo';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { classifyPresence, type HomePresence } from './presence';

export const HOME_BSSID_KEY = 'home_bssid';

export async function getHomeBssid(): Promise<string | null> {
  return AsyncStorage.getItem(HOME_BSSID_KEY);
}

// 집 Wi-Fi 미등록이거나 읽다 실패하면 'unknown' — 판정은 그때 지금처럼 동작한다.
export async function currentHomeWifi(): Promise<HomePresence> {
  try {
    const homeBssid = await getHomeBssid();
    if (!homeBssid) return 'unknown';
    return classifyPresence(await NetInfo.fetch(), homeBssid);
  } catch {
    return 'unknown';
  }
}
