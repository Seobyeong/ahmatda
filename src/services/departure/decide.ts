// 아맞다 — 외출 판정 (docs/외출-감지-재설계.md 3장, 결정 2)
//
// 걷기·위치가 주 신호, Wi-Fi 이탈과 [떠나기]는 부가 신호다. 신호를 모아 "정말 나갔는지"를
// 정한다. 센서 연결(5~6단계) 전에 규칙부터 고정하려고 순수 함수로 둔다 — 실제 신호는
// 각 서비스가 이벤트로 넘기고, 이 함수는 그 목록만 본다.
//
// 규칙
//   1. 외출 확정 = 주 신호 2개, 또는 주 신호 1개 + 부가 신호 1개
//   2. 신호는 DECISION_WINDOW_MS 안에 모였을 때만 묶는다 (기준은 지금 시각)
//   3. 집에 돌아왔다는 신호(Wi-Fi 재연결, 집 반경 재진입)가 오면 그 전의 이탈·걷기는 무효
//      — 현관까지 갔다가 뭘 가지러 돌아온 경우. [떠나기]는 "나갈 생각"이라 남긴다.
//   4. 권한 저하: 주 신호를 하나도 쓸 수 없으면(걷기·위치 둘 다 거부) Wi-Fi 이탈 단독으로
//      확정한다 — 지금(Wi-Fi 단독 감지)과 같은 동작. [떠나기] 단독은 확정이 아니다.
//   5. Wi-Fi만 끊기고 다른 신호가 없으면 "후보"로 둔다 (공유기 재부팅, Wi-Fi 직접 끔,
//      방 구석 약전계를 거른다).
//   6. 안전장치 (2026-11-04 사용자 결정): 걷기·위치를 쓸 수 있는데 신호가 안 오더라도
//      (앱 종료로 신호 유실 등) 집 Wi-Fi 이탈이 WIFI_FALLBACK_MS 동안 복귀 없이 이어지면
//      확정한다. 조용히 넘어가는 것이 이 앱의 가장 나쁜 실패라서다. 공유기 재부팅은 보통
//      그 전에 다시 붙는다. 이 판정만은 10분 창과 무관하게 SAFETY_MAX_AGE_MS 안의 마지막
//      Wi-Fi 상태를 본다 — 확인이 늦게 돌아도(12분 뒤) 놓치지 않게.
//   7. 집 Wi-Fi에 붙은 채 들어온 위치 이탈(onHomeWifi)은 세지 않는다 (2026-11-25 결정).
//      집 Wi-Fi가 닿는 거리는 지오펜스 반경(150m)보다 훨씬 짧으므로, 붙어 있는데 "반경 밖"이라는 건
//      GPS가 튄 것이다 — 집 안에서 걸어 다니는 걷기와 묶여 확정되면 집에서 긴급 알림이 간다.
//      판정하는 순간이 아니라 "들어온 순간"의 Wi-Fi 상태로 거른다 — 밖에서 제대로 들어온 이탈이
//      잠깐의 재연결 때문에 지워지지 않게. 들어온 순간 상태를 몰랐으면 지금처럼 센다.
//      Wi-Fi가 반경 끝까지 닿는 집의 진짜 외출은 Wi-Fi가 끊기는 순간 Wi-Fi 이탈로 이어 잡힌다.
//   8. 지금 집 Wi-Fi에 붙어 있으면(homeWifiNow) Wi-Fi 이탈은 이미 지난 일이다 — 규칙 6 안전장치로도,
//      걷기와 묶어서도 확정하지 않는다. 복귀 기록을 놓친 오래된 Wi-Fi 이탈(리스너 해제·프로세스 종료 중
//      재연결)과 집 안 걷기로 집에서 울리지 않게.

export const DECISION_WINDOW_MS = 10 * 60 * 1000;
export const WIFI_FALLBACK_MS = 5 * 60 * 1000;
// 감시 창(출발 30분 전 ~ +2시간)보다 오래된 Wi-Fi 이탈은 오늘 외출과 무관하다.
export const SAFETY_MAX_AGE_MS = 2 * 60 * 60 * 1000;

export type DepartureSignalType =
  | 'walking'        // 주 — 걷기 시작 (활동 인식)
  | 'locationExit'   // 주 — 집 반경 이탈
  | 'wifiExit'       // 부가 — 집 Wi-Fi 이탈 (디바운스 후)
  | 'leaveIntent'    // 부가 — [떠나기] 누름
  | 'wifiReturn'     // 무효화 — 집 Wi-Fi 재연결
  | 'locationEnter'; // 무효화 — 집 반경 재진입

export interface DepartureSignal {
  type: DepartureSignalType;
  at: number; // epoch ms
  onHomeWifi?: true; // locationExit만 — 들어온 순간 집 Wi-Fi에 붙어 있었음 (규칙 7)
}

// 판정하는 순간의 집 Wi-Fi 상태 (wifi/presence.ts의 HomePresence와 같은 값)
export type HomeWifiNow = 'home' | 'away' | 'unknown';

export interface SignalAvailability {
  walking: boolean;  // 활동 인식 권한 + 기기 지원
  location: boolean; // 집 지오펜스를 걸 수 있는 위치 권한
}

export type DepartureDecision =
  | { status: 'none' }
  | { status: 'candidate'; since: number }          // 신호는 있지만 아직 확정 아님
  | { status: 'confirmed'; at: number; by: DepartureSignalType[] };

const PRIMARY: ReadonlySet<DepartureSignalType> = new Set(['walking', 'locationExit']);
const SECONDARY: ReadonlySet<DepartureSignalType> = new Set(['wifiExit', 'leaveIntent']);
const RETURN: ReadonlySet<DepartureSignalType> = new Set(['wifiReturn', 'locationEnter']);

export function decideDeparture(
  signals: DepartureSignal[],
  availability: SignalAvailability,
  now: number,
  homeWifiNow: HomeWifiNow = 'unknown'
): DepartureDecision {
  const ordered = signals
    .filter((s) => s.at <= now && now - s.at <= DECISION_WINDOW_MS)
    // 규칙 7 — 집 Wi-Fi에 붙은 채 들어온 "반경 밖"은 GPS가 튄 것이다
    .filter((s) => !(s.type === 'locationExit' && s.onHomeWifi))
    // 규칙 8 — 지금 집 Wi-Fi에 붙어 있으면 Wi-Fi 이탈은 지난 일
    .filter((s) => !(homeWifiNow === 'home' && s.type === 'wifiExit'))
    .sort((a, b) => a.at - b.at);

  // 규칙 3 — 마지막 귀가 신호 이후의 신호만 본다 ([떠나기]는 귀가와 무관하게 남긴다)
  let lastReturn = -Infinity;
  for (const s of ordered) if (RETURN.has(s.type)) lastReturn = s.at;
  const live = ordered.filter(
    (s) => !RETURN.has(s.type) && (s.type === 'leaveIntent' || s.at > lastReturn)
  );
  // 규칙 6 — 10분 창과 무관하게 본다 (창 안 신호가 하나도 없어도)
  // 규칙 8 — 지금 집 Wi-Fi에 붙어 있으면 안전장치는 없다
  const fallback = homeWifiNow === 'home' ? null : wifiFallback(signals, now);
  if (live.length === 0) return fallback ?? { status: 'none' };

  // 신호를 시간순으로 하나씩 더하다가 규칙을 처음 만족하는 순간이 확정 시각이다.
  // 같은 종류가 여러 번 와도 한 번으로 센다 (걷기가 계속 들어와도 "주 신호 2개"가 아니다).
  const noPrimarySource = !availability.walking && !availability.location;
  const seen = new Set<DepartureSignalType>();
  for (const s of live) {
    seen.add(s.type);
    const primary = [...seen].filter((t) => PRIMARY.has(t)).length;
    const secondary = [...seen].filter((t) => SECONDARY.has(t)).length;

    const confirmed =
      primary >= 2 ||
      (primary >= 1 && secondary >= 1) ||
      (noPrimarySource && seen.has('wifiExit'));  // 규칙 4

    if (confirmed) return { status: 'confirmed', at: s.at, by: [...seen] };
  }

  // 규칙 6 — 마지막 Wi-Fi 상태가 "이탈"이고 5분 넘게 복귀가 없으면 확정
  if (fallback) return fallback;

  // [떠나기]만 있으면 "나갈 생각"일 뿐 신호가 아니다 — 후보로도 보지 않는다.
  const evidence = live.filter((s) => s.type !== 'leaveIntent');
  if (evidence.length === 0) return { status: 'none' };
  return { status: 'candidate', since: evidence[0].at };
}

function wifiFallback(signals: DepartureSignal[], now: number): DepartureDecision | null {
  const homeState = signals
    .filter((s) => s.at <= now && now - s.at <= SAFETY_MAX_AGE_MS && HOME_STATE.has(s.type))
    .sort((a, b) => a.at - b.at);
  const last = homeState[homeState.length - 1];
  if (!last || last.type !== 'wifiExit') return null;
  if (now - last.at < WIFI_FALLBACK_MS) return null;
  return { status: 'confirmed', at: last.at + WIFI_FALLBACK_MS, by: ['wifiExit'] };
}

// Wi-Fi 안전장치가 보는 "집에 있나" 신호. 위치 재진입도 귀가로 본다.
const HOME_STATE: ReadonlySet<DepartureSignalType> = new Set(['wifiExit', 'wifiReturn', 'locationEnter']);
