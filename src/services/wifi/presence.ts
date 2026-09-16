// 아맞다 — 집에 있는지 판정하는 순수 로직
//
// 네이티브 의존이 없어야 유닛테스트가 가능해서 WifiMonitorService와 분리했다.
// 이 판정이 틀리면 집에 앉아 있는데 긴급 알림이 뜨는 형태로 드러나므로, 경계
// 케이스를 테스트로 고정해둔다.

import type { NetInfoState } from '@react-native-community/netinfo';

// Android가 위치 권한/위치 서비스 없이 Wi-Fi 정보를 돌려줄 때 쓰는 자리표시자 값.
// 비교 전에 항상 소문자로 맞춘다 — 기기·OEM에 따라 대문자로 오는 경우가 있고,
// 그러면 자리표시자를 못 알아봐서 "집이 아님"으로 새버린다. 이 판정이 막으려는
// 바로 그 오탐이다. 등록 시점과 감지 시점의 표기가 갈리는 경우도 같이 막힌다.
const UNKNOWN_BSSID = '02:00:00:00:00:00';

export type HomePresence = 'home' | 'away' | 'unknown';

// "밖"과 "알 수 없음"을 반드시 구분한다.
// Android는 위치 서비스가 꺼져 있거나 ACCESS_FINE_LOCATION이 없으면 Wi-Fi에 붙어
// 있어도 BSSID를 null 또는 자리표시자로 준다. 이걸 "집이 아님"으로 처리하면
// 집 소파에 앉아 있는데 긴급 알림이 뜨고, 그날 알림 dedup 키까지 소진되어
// 진짜 외출 알림이 막히며, 실제로는 챙긴 항목들이 "놓침"으로 기록된다.
export function classifyPresence(state: NetInfoState, homeBssid: string): HomePresence {
  // Wi-Fi에 붙어 있지 않으면 집을 벗어난 것으로 본다(이탈 감지의 핵심 신호).
  if (state.type !== 'wifi') return 'away';

  const raw = (state.details as { bssid?: string })?.bssid ?? null;
  if (raw === null) return 'unknown';

  const bssid = raw.toLowerCase();
  if (bssid === UNKNOWN_BSSID) return 'unknown';

  return bssid === homeBssid.toLowerCase() ? 'home' : 'away';
}
