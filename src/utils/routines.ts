// 아맞다 — 루틴이 어느 날 나타나는지 (docs/체크리스트-항목-속성.md 2.3)
//
// 조건이 하나도 없으면 매일. 조건이 여러 개면 하나라도 맞으면 나타난다(OR).
// 지금 조건은 요일(days)과 특정 날짜 1회(onDate) 두 가지다.
// 빈 days 배열은 "조건 없음(매일)"으로 본다 — 설정 UI에서 요일을 전부 껐다 다시 켜는
// 과도기에 루틴이 영영 사라진 것처럼 보이지 않게 (예전 isRoutineActiveOnDay와 같은 규칙).

import type { ChecklistItem } from '@/types';
import { toDateString } from './time';

type RoutineCondition = Pick<ChecklistItem, 'days' | 'onDate'>;

export function isRoutineActiveOn(routine: RoutineCondition, date: Date): boolean {
  const hasDays = !!routine.days && routine.days.length > 0;
  const hasDate = !!routine.onDate;
  if (!hasDays && !hasDate) return true;
  if (hasDays && routine.days!.includes(date.getDay())) return true;
  return hasDate && routine.onDate === toDateString(date);
}

// 특정 날짜 1회 항목인지 — 설정 화면의 "내 루틴"(반복) 목록에서는 빼고, 그날 준비 화면에서 다룬다.
export function isOneOff(routine: RoutineCondition): boolean {
  return !!routine.onDate && !(routine.days && routine.days.length > 0);
}

// 날짜가 지난 1회 항목을 정리한다. 요일 조건도 붙어 있으면 반복 루틴이라 남긴다.
export function pruneExpiredOneOffs<T extends RoutineCondition>(routines: T[], today: string): T[] {
  return routines.filter((r) => !(isOneOff(r) && r.onDate! < today));
}
