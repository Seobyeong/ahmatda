// 아맞다 — 다음 외출 날 체크리스트 미리보기 (자기 전 정리, docs/외출-감지-재설계.md 5장)
//
// 오늘 체크리스트 조립(store buildChecklist)과 같은 규칙으로, 다음 외출 날의 요일·일정·
// 예보를 넣어 "그날 무엇이 뜰지"를 미리 계산한다. 화면과 테스트가 같이 쓰는 순수 함수다.
//
// 우산 기준은 아침 조립과 같다(강수 형태 또는 강수확률 60%, forecastDate.ts) — 전날 밤
// 보여준 우산이 아침에 빠지면 안 된다. 다만 예보는 밤사이 바뀔 수 있다.
// 미세먼지는 내일 예보 API가 따로라 넣지 않는다 (아침 조립 때 실황으로 반영된다).

import {
  PURPOSES, detectPurposeFromEvents, findMatchingEvent, purposeItemKey, type CustomKeywords, type TaggedEvents,
} from '@/constants/purposes';
import { precipWord, usesRainForecast, type DayOutlook } from '@/services/weather/forecastDate';
import { getForgottenBadge } from './forgotten';
import { isOneOff, isRoutineActiveOn } from './routines';
import type { ChecklistItem, CommuteMode, PurposeId } from '@/types';

export type PreviewKind = 'weather' | 'purpose' | 'oneoff' | 'routine';

export interface PreviewItem {
  label: string;
  kind: PreviewKind;
  reason: string | null;  // 왜 뜨는지 — "비 예보 70%", "10:00 '헬스' 일정", "이번 주 2번 놓침"
  routineId?: string;     // 1회 항목 삭제용
}

export interface TomorrowPreview {
  purposeId: PurposeId | null;
  items: PreviewItem[];
}

export interface TomorrowPreviewInput {
  date: Date;
  departureTime: string;
  routines: ChecklistItem[];
  events: Array<{ id?: string; title: string; time: string }>;
  customKeywords: CustomKeywords;
  tagged?: TaggedEvents; // 앱에서 등록하며 목적을 고른 일정
  disabledWeatherItems: string[];
  disabledPurposeItems: string[];
  outlook: DayOutlook | null;
  forgottenCounts: Map<string, number>;
  commuteMode: CommuteMode | null;
}

export function buildTomorrowPreview(input: TomorrowPreviewInput): TomorrowPreview {
  const items: PreviewItem[] = [];
  const seen = new Set<string>();
  const push = (item: PreviewItem) => {
    // 날씨 "우산"과 루틴 "우산"이 겹치면 이유가 있는 쪽(먼저 넣은 것) 한 줄만 보인다.
    // 가려지는 쪽이 1회 항목이면 삭제 버튼(routineId)은 남은 줄에 붙인다 — 안 그러면 그 1회
    // 항목을 지울 곳이 없다 (설정의 "내 루틴"은 1회 항목을 보여주지 않는다).
    if (seen.has(item.label)) {
      if (item.routineId) {
        const shown = items.find((i) => i.label === item.label);
        if (shown && !shown.routineId) shown.routineId = item.routineId;
      }
      return;
    }
    seen.add(item.label);
    items.push(item);
  };

  const { outlook } = input;
  const weatherOn = (label: string) => !input.disabledWeatherItems.includes(label);
  // 자차는 아침 조립에서도 "지금 비 올 때만" 우산을 넣는다 — 전날 밤 예보로는 약속하지 않는다.
  if (outlook?.rain && usesRainForecast(input.commuteMode) && weatherOn('우산')) {
    push({ label: '우산', kind: 'weather', reason: `${precipWord(outlook.rainPty || !outlook.snow, outlook.snow)} 예보 ${outlook.popMax}%` });
  }
  if (outlook?.heat && weatherOn('물병')) {
    push({ label: '물병', kind: 'weather', reason: `최고 ${outlook.maxTemp}°C 폭염` });
  }

  const purposeId = detectPurposeFromEvents(input.events, input.departureTime, input.customKeywords, input.tagged);
  if (purposeId) {
    const event = findMatchingEvent(purposeId, input.events, input.departureTime, input.customKeywords, input.tagged);
    const reason = event ? `${event.time} '${event.title}' 일정` : null;
    PURPOSES[purposeId].items
      .filter((p) => !input.disabledPurposeItems.includes(purposeItemKey(purposeId, p.label)))
      .forEach((p) => push({ label: p.label, kind: 'purpose', reason }));
  }

  // 1회 항목을 반복 루틴보다 앞에 — 그날만 있는 일이라 잊기 쉽다.
  const active = input.routines.filter((r) => isRoutineActiveOn(r, input.date));
  active.filter(isOneOff).forEach((r) =>
    push({ label: r.label, kind: 'oneoff', reason: '이 날만', routineId: r.id })
  );
  active.filter((r) => !isOneOff(r)).forEach((r) =>
    push({ label: r.label, kind: 'routine', reason: null })
  );

  // 오늘 체크리스트와 같은 규칙 — 다른 이유가 없는 항목에만 "이번 주 N번 놓침"을 단다.
  return {
    purposeId,
    items: items.map((i) =>
      i.reason ? i : { ...i, reason: getForgottenBadge(input.forgottenCounts.get(i.label)) }
    ),
  };
}
