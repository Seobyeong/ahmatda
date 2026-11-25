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

// 등록할 때도 거른다 — 자리표시자를 집으로 저장하면 영영 집으로 보이지 않는다.
export function isUsableBssid(raw: string | null | undefined): raw is string {
  return !!raw && raw.toLowerCase() !== UNKNOWN_BSSID;
}

export type HomePresence = 'home' | 'away' | 'unknown';

// 집 Wi-Fi — 듀얼밴드 공유기(2.4/5GHz)와 메시 공유기는 같은 이름(SSID)에 BSSID가 여럿이다 (2026-11-25 결정:
// 자동 학습). 처음 등록한 BSSID 하나에서 시작해, 같은 이름의 다른 BSSID가 "집"으로 확인되면 더해 간다.
export interface HomeWifi {
  bssids: string[];      // 소문자. 첫 번째가 사용자가 등록한 것
  ssid: string | null;   // 등록 때 못 읽었으면 null — 등록한 BSSID에 붙었을 때 배운다
}

export const MAX_HOME_BSSIDS = 8;

const asHome = (home: HomeWifi | string): HomeWifi =>
  typeof home === 'string' ? { bssids: [home.toLowerCase()], ssid: null } : home;

function readBssid(state: NetInfoState): string | null {
  const raw = (state.details as { bssid?: string } | null)?.bssid ?? null;
  if (raw === null) return null;
  const bssid = raw.toLowerCase();
  return bssid === UNKNOWN_BSSID ? null : bssid;
}

// Android는 SSID를 따옴표로 감싸 주기도 하고, 권한이 없으면 '<unknown ssid>'를 준다.
export function readSsid(state: NetInfoState): string | null {
  if (state.type !== 'wifi') return null;
  const raw = (state.details as { ssid?: string } | null)?.ssid ?? null;
  if (!raw) return null;
  const ssid = raw.replace(/^"(.*)"$/, '$1');
  return ssid === '' || ssid === '<unknown ssid>' ? null : ssid;
}

// "밖"과 "알 수 없음"을 반드시 구분한다.
// Android는 위치 서비스가 꺼져 있거나 ACCESS_FINE_LOCATION이 없으면 Wi-Fi에 붙어
// 있어도 BSSID를 null 또는 자리표시자로 준다. 이걸 "집이 아님"으로 처리하면
// 집 소파에 앉아 있는데 긴급 알림이 뜨고, 그날 알림 dedup 키까지 소진되어
// 진짜 외출 알림이 막히며, 실제로는 챙긴 항목들이 "놓침"으로 기록된다.
// 같은 이름인데 아직 모르는 BSSID도 'unknown'이다 — 집의 5GHz·메시 노드일 수도, 같은 기본 이름
// ("iptime" 등)의 다른 곳일 수도 있다. 'unknown'은 아무것도 기록하지 않아 어느 쪽이든 안전하다.
export function classifyPresence(state: NetInfoState, home: HomeWifi | string): HomePresence {
  // Wi-Fi에 붙어 있지 않으면 집을 벗어난 것으로 본다(이탈 감지의 핵심 신호).
  if (state.type !== 'wifi') return 'away';

  const bssid = readBssid(state);
  if (bssid === null) return 'unknown';

  const h = asHome(home);
  if (h.bssids.some((b) => b.toLowerCase() === bssid)) return 'home';
  if (h.ssid !== null && readSsid(state) === h.ssid) return 'unknown';
  return 'away';
}

// 같은 공유기의 다른 대역은 BSSID가 보통 첫 바이트(로컬 관리 비트)나 끝 바이트만 다르다.
// 가운데 4바이트가 같고 이름까지 같으면 같은 공유기로 본다. 보장되는 규칙은 아니라서,
// 어긋나는 공유기는 아래 위치 확인으로 배운다.
export function sameRouter(a: string, b: string): boolean {
  const x = a.toLowerCase().split(':');
  const y = b.toLowerCase().split(':');
  if (x.length !== 6 || y.length !== 6) return false;
  return x.slice(1, 5).join(':') === y.slice(1, 5).join(':');
}

// 지금 연결에서 집 Wi-Fi에 대해 배울 것.
//   learnSsid      — 등록한 BSSID에 붙었는데 이름을 아직 모름
//   learnBssid     — 같은 이름 + 같은 공유기로 보이는 BSSID → 바로 집으로 더한다
//   needsLocation  — 같은 이름인데 다른 공유기(메시 노드 등) → 집 반경 안인지 위치로 확인해야 더한다
export type HomeWifiLesson =
  | { kind: 'none' }
  | { kind: 'learnSsid'; ssid: string }
  | { kind: 'learnBssid'; bssid: string }
  | { kind: 'needsLocation'; bssid: string };

export function homeWifiLesson(state: NetInfoState, home: HomeWifi): HomeWifiLesson {
  if (state.type !== 'wifi') return { kind: 'none' };
  const bssid = readBssid(state);
  const ssid = readSsid(state);
  if (bssid === null || ssid === null) return { kind: 'none' };
  const known = home.bssids.some((b) => b.toLowerCase() === bssid);
  if (known) return home.ssid === null ? { kind: 'learnSsid', ssid } : { kind: 'none' };
  if (home.ssid === null || ssid !== home.ssid) return { kind: 'none' };
  if (home.bssids.length >= MAX_HOME_BSSIDS) return { kind: 'none' };
  return home.bssids.some((b) => sameRouter(b, bssid))
    ? { kind: 'learnBssid', bssid }
    : { kind: 'needsLocation', bssid };
}
