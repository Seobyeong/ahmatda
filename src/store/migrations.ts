// 아맞다 — persist 저장 스키마 마이그레이션
//
// 네이티브 의존이 없는 순수 함수만 둔다. 마이그레이션은 실패해도 조용하고
// (앱이 안 켜지거나 사용자 데이터가 사라지는 형태로만 드러난다) 손으로 재현하기도
// 어려워서, 스토어 본체와 분리해 유닛테스트로 직접 검증할 수 있게 했다.
//
// 각 단계는 "그 버전에서 저장된 모양"을 받아 다음 버전 모양으로 바꾼다.
// 순서대로 연쇄 적용되므로 단계마다 한 가지 변환만 책임진다.

import { SENSITIVITY_DELTA } from '../constants/feedback';

// v0 → v1: 아이템 id를 number에서 string으로 바꿨다. 이전 빌드가 설치된 기기에
// 남아 있는 숫자 id를 문자열로 변환해줘야 체크/삭제가 동작한다(비교가 === 라서
// 타입이 다르면 아무 항목도 안 잡힌다).
export function migrateV0toV1(state: Record<string, unknown>): Record<string, unknown> {
  // 기본 루틴은 예전에 id 1·2·3으로 고정돼 있었다. 그냥 "1"·"2"·"3"으로 바꾸면
  // 새로 깐 기기의 기본 루틴(routine-default-*)과 id가 달라져서, 나중에 동기화할 때
  // 같은 '집 열쇠'가 둘로 늘어난다. 라벨까지 일치할 때만 고정 id로 맞춰준다.
  const LEGACY_DEFAULT_IDS: Record<string, { label: string; id: string }> = {
    '1': { label: '집 열쇠', id: 'routine-default-key' },
    '2': { label: '지갑', id: 'routine-default-wallet' },
    '3': { label: '에어팟', id: 'routine-default-airpods' },
  };

  const toStringId = (items: unknown[]): unknown[] =>
    items.map((item) => {
      if (!item || typeof item !== 'object') return item;
      const { id, label } = item as { id: unknown; label?: unknown };
      const legacy = LEGACY_DEFAULT_IDS[String(id)];
      const nextId = legacy && legacy.label === label ? legacy.id : String(id);
      return { ...(item as object), id: nextId };
    });

  // 없는 키를 만들어내지 않는다. 저장 데이터가 중간에 잘렸거나 손상돼 checklist/
  // permanentRoutines가 비어 있을 때 `{ permanentRoutines: undefined }`를 반환하면,
  // 뒤이어 실행되는 merge의 스프레드가 그 undefined로 defaultState의 기본 루틴을
  // 덮어쓴다. 그러면 buildChecklist가 매 실행마다 throw해서 앱이 아예 안 켜진다.
  const migrated: Record<string, unknown> = { ...state };
  if (Array.isArray(state.checklist)) migrated.checklist = toStringId(state.checklist);
  if (Array.isArray(state.permanentRoutines)) {
    migrated.permanentRoutines = toStringId(state.permanentRoutines);
  }
  return migrated;
}

// v1 → v2: deltaOffset 하나에 "사용자가 고른 기준값 + 피드백 학습값"이 섞여 있었다.
// 그 탓에 설정에서 민감도를 다시 고르면 절대값 덮어쓰기가 일어나 그동안의 학습이
// 통째로 사라졌다. 두 성분을 분리하면서, 저장된 값에서 학습분만 역산해 보존한다.
//   기존 deltaOffset = SENSITIVITY_DELTA[sensitivityLevel] + 학습분
//   → learnedDelta   = deltaOffset - SENSITIVITY_DELTA[sensitivityLevel]
export function migrateV1toV2(state: Record<string, unknown>): Record<string, unknown> {
  const settings = state.userSettings;
  if (!settings || typeof settings !== 'object') return state;

  const { deltaOffset, sensitivityLevel, ...rest } = settings as Record<string, unknown> & {
    deltaOffset?: unknown;
    sensitivityLevel?: unknown;
  };

  // 저장된 민감도가 없거나 범위를 벗어나면 기준값 0(보통)으로 본다.
  const level =
    typeof sensitivityLevel === 'number' && sensitivityLevel >= 1 && sensitivityLevel <= 5
      ? (sensitivityLevel as 1 | 2 | 3 | 4 | 5)
      : 3;
  const previousDelta = typeof deltaOffset === 'number' ? deltaOffset : 0;

  return {
    ...state,
    userSettings: {
      ...rest,
      sensitivityLevel: level,
      learnedDelta: previousDelta - SENSITIVITY_DELTA[level],
    },
  };
}

// 마이그레이션 체인 끝에 항상 적용되는 정규화.
//
// updatedAt은 커밋 5e90bdc에서 새로 생긴 필드라, 그 이전에 저장된 데이터에는 전부
// 비어 있다. 비워둔 채로 계정 동기화를 붙이면 "값이 없음"이 "아주 오래됨"으로
// 해석되어, 몇 주간 쌓은 진짜 데이터가 새로 깐 기기의 기본값에 진다.
// 업그레이드 시점을 기준 시각으로 한 번 찍어 비교 가능한 상태로 만든다.
export function seedUpdatedAt(state: Record<string, unknown>): Record<string, unknown> {
  const now = Date.now();

  const stampEach = (items: unknown): unknown =>
    Array.isArray(items)
      ? items.map((item) =>
          item && typeof item === 'object' && (item as { updatedAt?: unknown }).updatedAt == null
            ? { ...(item as object), updatedAt: now }
            : item
        )
      : items;

  const next: Record<string, unknown> = { ...state };

  const settings = state.userSettings;
  if (settings && typeof settings === 'object' && (settings as { updatedAt?: unknown }).updatedAt == null) {
    next.userSettings = { ...(settings as object), updatedAt: now };
  }
  // 없는 키를 만들어내지 않는다 (migrateV0toV1과 같은 이유).
  if (Array.isArray(state.permanentRoutines)) next.permanentRoutines = stampEach(state.permanentRoutines);
  if (Array.isArray(state.feedbackHistory)) next.feedbackHistory = stampEach(state.feedbackHistory);

  return next;
}
