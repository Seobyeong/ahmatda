import * as Location from 'expo-location';

export interface Coords {
  lat: number;
  lon: number;
}

// 온보딩에서 이미 위치 권한을 요청했다고 가정하고 여기서는 재요청하지 않는다.
// 권한이 없거나 좌표 조회에 실패하면 null — 호출부가 폴백 좌표(서울)를 사용해야 한다.
export async function getCurrentCoords(): Promise<Coords | null> {
  try {
    const permission = await Location.getForegroundPermissionsAsync();
    if (!permission.granted) return null;

    const lastKnown = await Location.getLastKnownPositionAsync({});
    const position = lastKnown ?? (await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.Balanced,
    }));

    return { lat: position.coords.latitude, lon: position.coords.longitude };
  } catch {
    return null;
  }
}
