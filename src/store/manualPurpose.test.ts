import { isManualPurposeToday, restoredPurposeState } from './manualPurpose';

// 직접 고른 목적이 앱 재시작 때 "목적 없음"으로 돌아가던 버그(2026-11-09 에뮬레이터 촬영 중 발견).

describe('isManualPurposeToday', () => {
  it('오늘 고른 것이면 참', () => {
    expect(isManualPurposeToday({ date: '2026-11-09', id: 'work' }, '2026-11-09')).toBe(true);
  });

  it('어제 고른 것은 거짓 — 다음 날엔 자동감지가 다시 정한다', () => {
    expect(isManualPurposeToday({ date: '2026-11-08', id: 'work' }, '2026-11-09')).toBe(false);
  });

  it('고른 적이 없으면 거짓', () => {
    expect(isManualPurposeToday(null, '2026-11-09')).toBe(false);
    expect(isManualPurposeToday(undefined, '2026-11-09')).toBe(false);
  });
});

describe('restoredPurposeState', () => {
  it('오늘 고른 목적을 수동 선택 상태로 되살린다', () => {
    expect(restoredPurposeState({ date: '2026-11-09', id: 'workout' }, '2026-11-09')).toEqual({
      purposeId: 'workout',
      autoDetected: false,
      autoDetectedEvent: null,
    });
  });

  it('"목적 없음"을 직접 고른 것도 되살린다 — 자동감지가 다시 붙이면 안 된다', () => {
    expect(restoredPurposeState({ date: '2026-11-09', id: null }, '2026-11-09')).toEqual({
      purposeId: null,
      autoDetected: false,
      autoDetectedEvent: null,
    });
  });

  it('날짜가 지났으면 복원하지 않는다', () => {
    expect(restoredPurposeState({ date: '2026-11-08', id: 'workout' }, '2026-11-09')).toBeUndefined();
  });
});
