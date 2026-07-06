import * as Location from 'expo-location';

export interface Coords {
  lat: number;
  lon: number;
}

// getLastKnownPositionAsync()는 OS가 캐시해둔 마지막 좌표를 즉시 반환하지만,
// 사용자가 그 사이 실제로 이동했다면(여행 등) 며칠 전 값일 수도 있다. 이 정도로
// 오래된 캐시는 신선한 GPS 조회로 대체한다.
const STALE_THRESHOLD_MS = 10 * 60 * 1000; // 10분

// 온보딩에서 이미 위치 권한을 요청했다고 가정하고 여기서는 재요청하지 않는다.
// 권한이 없거나 좌표 조회에 실패하면 null — 호출부가 폴백 좌표(서울)를 사용해야 한다.
export async function getCurrentCoords(): Promise<Coords | null> {
  try {
    const permission = await Location.getForegroundPermissionsAsync();
    if (!permission.granted) return null;

    const lastKnown = await Location.getLastKnownPositionAsync({});
    const isFresh = lastKnown !== null && Date.now() - lastKnown.timestamp < STALE_THRESHOLD_MS;
    const position = isFresh ? lastKnown : await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.Balanced,
    });

    return { lat: position.coords.latitude, lon: position.coords.longitude };
  } catch {
    return null;
  }
}
