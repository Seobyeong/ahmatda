// 아맞다 — 집 밖 장소에서 머물다 떠날 때 (docs/외출-감지-재설계.md 4장, 7단계) — 순수 규칙
//
// Android에는 방문(Visits) API가 없어서 이렇게 한다:
//   1. 정지가 STAY_MS 넘게 이어지면(마지막 움직임 이후 첫 정지 기준) "머묾"
//   2. 머문 자리에 지오펜스를 건다 (AwayPlaceService)
//   3. 그 자리를 벗어남 + 걷기 시작이 PAIR_WINDOW_MS 안에 같이 있으면 "떠남"
//   4. 아침에 챙긴 것 중 꺼내 쓰는 물건만 알린다. 없으면 울리지 않는다.
// 한 장소에서는 한 번, 하루 DAILY_LIMIT번까지 (2026-11-04 사용자 결정).

import type { ChecklistItem } from '@/types';
import { DECISION_WINDOW_MS } from './decide';

export const STAY_MS = 20 * 60 * 1000;
export const PAIR_WINDOW_MS = DECISION_WINDOW_MS;
export const DAILY_LIMIT = 3;

// 꺼내 쓰는 물건 — 이름에 이 단어가 들어가면 대상 (2026-11-04 결정: 정해진 단어 목록).
// 집 밖에서 꺼냈다가 그 자리에 두고 오기 쉬운 것만. 입고 있는 것(외투)·소모품(마스크)은 뺀다.
export const CARRY_KEYWORDS = [
  '충전기', '보조배터리', '배터리', '케이블',
  '우산', '양산',
  '텀블러', '물병',
  '노트북', '태블릿', '아이패드',
  '이어폰', '에어팟', '헤드폰',
  '카드', '지갑', '교통카드', '사원증', '학생증',
  '안경', '선글라스',
  '열쇠', '차키', '집키', '키',
] as const;

// '키'는 한 글자라 다른 낱말 안에 들어가기 쉽다 ("키보드", "스키", "쿠키") — 낱말 전체가 같을 때만.
// 붙여 쓰는 "차키"·"집키"는 목록에 따로 둔다.
const WHOLE_WORD_ONLY: ReadonlySet<string> = new Set(['키']);

export function isCarryItem(label: string): boolean {
  const words = label.split(/[\s·,/()]+/).filter(Boolean);
  return CARRY_KEYWORDS.some((k) => (WHOLE_WORD_ONLY.has(k) ? words.includes(k) : label.includes(k)));
}

// 아침에 챙긴(체크한) 것 중 꺼내 쓰는 물건
export function pickCarryItems(checklist: ChecklistItem[]): ChecklistItem[] {
  return checklist.filter((i) => i.checked && isCarryItem(i.label));
}

// 지금 머무는 중이면 머물기 시작한 시각, 아니면 null.
// 마지막 움직임 이후의 첫 정지부터 센다 (네이티브가 그 뒤 반복 정지는 기록하지 않는다).
export function stayingSince(stillStarts: number[], movingStarts: number[], now: number): number | null {
  const lastMoving = Math.max(-Infinity, ...movingStarts.filter((t) => t <= now));
  const since = stillStarts.filter((t) => t > lastMoving && t <= now).sort((a, b) => a - b)[0];
  if (since === undefined) return null;
  return now - since >= STAY_MS ? since : null;
}

// 머문 곳을 떠났는지 — 자리 이탈과 걷기 시작이 PAIR_WINDOW_MS 안에 같이 있어야 한다.
// 걷기는 이탈보다 먼저 올 때가 많다 (일어나 걸어 나가다 반경을 벗어남). 다만 머물기 시작한 뒤의
// 걷기여야 한다 — 그 전 걷기는 이 장소에 들어올 때의 움직임이다.
export function hasLeftPlace(
  placeSince: number,
  exitAt: number | null,
  movingStarts: number[],
  now: number
): boolean {
  if (exitAt === null || exitAt > now || now - exitAt > PAIR_WINDOW_MS) return false;
  return movingStarts.some((t) => t > placeSince && t <= now && Math.abs(t - exitAt) <= PAIR_WINDOW_MS);
}

// 두 좌표 사이 거리(m) — 머문 곳이 집 반경 안인지 볼 때
export function distanceMeters(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const R = 6_371_000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
