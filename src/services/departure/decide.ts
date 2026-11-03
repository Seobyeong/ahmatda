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
//      방 구석 약전계를 거른다). 후보는 창이 지나면 사라진다.

export const DECISION_WINDOW_MS = 10 * 60 * 1000;

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
}

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
  now: number
): DepartureDecision {
  const ordered = signals
    .filter((s) => s.at <= now && now - s.at <= DECISION_WINDOW_MS)
    .sort((a, b) => a.at - b.at);

  // 규칙 3 — 마지막 귀가 신호 이후의 신호만 본다 ([떠나기]는 귀가와 무관하게 남긴다)
  let lastReturn = -Infinity;
  for (const s of ordered) if (RETURN.has(s.type)) lastReturn = s.at;
  const live = ordered.filter(
    (s) => !RETURN.has(s.type) && (s.type === 'leaveIntent' || s.at > lastReturn)
  );
  if (live.length === 0) return { status: 'none' };

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

  // [떠나기]만 있으면 "나갈 생각"일 뿐 신호가 아니다 — 후보로도 보지 않는다.
  const evidence = live.filter((s) => s.type !== 'leaveIntent');
  if (evidence.length === 0) return { status: 'none' };
  return { status: 'candidate', since: evidence[0].at };
}
