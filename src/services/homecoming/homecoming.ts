// 아맞다 — 귀가 루틴 (C4, 2026-11-28 결정)
//
// 집에 돌아오면(집 Wi-Fi 재연결·집 반경 재진입) 할 일을 한 번 알린다. 할 일은 두 가지를 합친다:
//   · 설정에서 정한 귀가 할 일 (충전기 꽂기 등) — 매번
//   · 오늘 챙겨 나간 것에서 자동 — 우산을 챙겼으면 "우산 펴서 말리기"처럼
// 할 일이 없으면 알리지 않는다. 하루 한 번. 30분 넘게 밖에 있었을 때만 (현관까지 갔다 돌아온 건 귀가가 아니다).
// 이 파일은 순수 함수만 — 저장·알림은 HomecomingService.

export const MIN_AWAY_MS = 30 * 60 * 1000;
// 이보다 오래된 나간 기록은 귀가 판단에 쓰지 않는다 (돌아온 것을 못 보고 지난 기록)
const MAX_AWAY_MS = 24 * 60 * 60 * 1000;

// 챙겨 나간 물건 → 돌아와서 할 일. 이름이 정확히 같을 때만 (사용자가 만든 비슷한 이름은 건드리지 않는다).
const AFTER_OUTING: Record<string, string> = {
  우산: '우산 펴서 말리기',
  노트북: '노트북 충전하기',
  운동복: '운동복 빨래 내놓기',
  수건: '수건 빨래 내놓기',
  텀블러: '텀블러 씻기',
  도시락: '도시락통 씻기',
};

// 오늘 할 일 — 설정한 것 먼저, 그다음 자동. 같은 문장은 한 번만.
export function homecomingTasks(userTasks: readonly string[], packedLabels: readonly string[]): string[] {
  const auto = packedLabels.map((l) => AFTER_OUTING[l.trim()]).filter((t): t is string => !!t);
  return [...new Set([...userTasks.map((t) => t.trim()).filter(Boolean), ...auto])];
}

export interface HomecomingState {
  leftAt: number | null;    // 오늘 집을 나선 시각 (그날 처음 본 이탈)
  leftDate: string | null;  // leftAt의 날짜
  sentDate: string | null;  // 귀가 알림을 보낸 날
}

export const EMPTY_HOMECOMING: HomecomingState = { leftAt: null, leftDate: null, sentDate: null };

// 나간 것을 본 순간 — 그날 처음 본 것만 남긴다 (나간 뒤 다시 본 이탈로 30분이 다시 시작되지 않게)
export function withLeft(state: HomecomingState, now: number, today: string): HomecomingState {
  if (state.leftDate === today && state.leftAt !== null) return state;
  return { ...state, leftAt: now, leftDate: today };
}

// 집에 있는 것을 본 순간 — 나간 기록이 오늘 것이면 이번에 판단하고 나간 기록을 지운다.
//   30분 넘게 밖에 있었으면 귀가(알림), 아니면 잠깐 나갔다 온 것(알림 없음 — 다음에 나가면 새로 잰다).
// 나간 기록을 남겨 두면 잠깐 나갔다 온 뒤 집에 계속 있는데도 30분이 지나 귀가로 잘못 본다.
// 보낼 수 있으면 notify — 실제로 보냈을 때만 부르는 쪽이 sentDate를 적는다 (할 일이 없거나 꺼져 있어 안 보낸
// 귀가가 그날 한 번을 써 버리지 않게). 자정을 넘겨 돌아와도 하루 안이면 귀가다.
export function arrivedHome(state: HomecomingState, now: number, today: string): { state: HomecomingState; notify: boolean } {
  if (state.leftAt === null) return { state, notify: false };
  const cleared = { ...state, leftAt: null, leftDate: null };
  const away = now - state.leftAt;
  const notify = state.sentDate !== today && away >= MIN_AWAY_MS && away < MAX_AWAY_MS;
  return { state: cleared, notify };
}

export const withSent = (state: HomecomingState, today: string): HomecomingState => ({ ...state, sentDate: today });
