import { migrateV0toV1, migrateV1toV2, seedUpdatedAt } from './migrations';

// persist 마이그레이션은 실패해도 조용하다 — 앱이 안 켜지거나 사용자 데이터가
// 사라지는 형태로만 드러난다. 그래서 각 단계를 순수 함수로 분리해 직접 검증한다.

describe('migrateV0toV1 — 아이템 id number → string', () => {
  it('숫자 id를 문자열로 바꾼다', () => {
    const result = migrateV0toV1({
      checklist: [{ id: 1700000000001, label: '우산' }],
    });
    expect(result.checklist).toEqual([{ id: '1700000000001', label: '우산' }]);
  });

  it('기본 루틴은 라벨까지 일치할 때만 고정 id로 맞춘다', () => {
    const result = migrateV0toV1({
      permanentRoutines: [
        { id: 1, label: '집 열쇠' },
        { id: 2, label: '지갑' },
        { id: 3, label: '에어팟' },
      ],
    });
    expect(result.permanentRoutines).toEqual([
      { id: 'routine-default-key', label: '집 열쇠' },
      { id: 'routine-default-wallet', label: '지갑' },
      { id: 'routine-default-airpods', label: '에어팟' },
    ]);
  });

  it('id는 같아도 라벨이 다르면 고정 id를 쓰지 않는다', () => {
    const result = migrateV0toV1({
      permanentRoutines: [{ id: 1, label: '사원증' }],
    });
    expect(result.permanentRoutines).toEqual([{ id: '1', label: '사원증' }]);
  });

  // 회귀 방지: 예전엔 없는 키를 `undefined`로 만들어 반환했고, 그러면 merge의
  // 스프레드가 기본 루틴을 덮어써서 buildChecklist가 매 실행마다 throw했다.
  it('없는 키를 undefined로 만들어내지 않는다', () => {
    const result = migrateV0toV1({ checklistDate: '2026-09-16' });
    expect('permanentRoutines' in result).toBe(false);
    expect('checklist' in result).toBe(false);
  });

  it('배열이 아닌 값이 들어와도 키를 덮어쓰지 않는다', () => {
    const result = migrateV0toV1({ permanentRoutines: null });
    expect(result.permanentRoutines).toBeNull();
  });
});

describe('migrateV1toV2 — deltaOffset을 learnedDelta로 분리', () => {
  it('저장된 deltaOffset에서 민감도 기준값을 빼 학습분을 역산한다', () => {
    // 민감도 4(기준 +1)에서 "추웠음"을 4번 눌러 deltaOffset이 -3이 된 상태
    const result = migrateV1toV2({
      userSettings: { sensitivityLevel: 4, deltaOffset: -3, departureTime: '08:15' },
    });
    expect(result.userSettings).toEqual({
      sensitivityLevel: 4,
      learnedDelta: -4, // -3 - (+1)
      departureTime: '08:15',
    });
  });

  it('학습 이력이 없으면 learnedDelta는 0이 된다', () => {
    const result = migrateV1toV2({
      userSettings: { sensitivityLevel: 1, deltaOffset: -2 },
    });
    expect(result.userSettings).toEqual({ sensitivityLevel: 1, learnedDelta: 0 });
  });

  it('deltaOffset 필드를 남기지 않는다', () => {
    const result = migrateV1toV2({
      userSettings: { sensitivityLevel: 3, deltaOffset: 2 },
    });
    expect('deltaOffset' in (result.userSettings as object)).toBe(false);
  });

  it('민감도가 없거나 범위를 벗어나면 보통(3)으로 본다', () => {
    expect(migrateV1toV2({ userSettings: { deltaOffset: 2 } }).userSettings).toEqual({
      sensitivityLevel: 3,
      learnedDelta: 2,
    });
    expect(migrateV1toV2({ userSettings: { sensitivityLevel: 9, deltaOffset: 2 } }).userSettings)
      .toEqual({ sensitivityLevel: 3, learnedDelta: 2 });
  });

  it('userSettings가 없으면 그대로 통과시킨다', () => {
    const state = { checklistDate: '2026-09-16' };
    expect(migrateV1toV2(state)).toEqual(state);
  });
});

describe('v0 → v2 연쇄 적용', () => {
  it('두 단계를 순서대로 통과해도 데이터가 보존된다', () => {
    const v0 = {
      permanentRoutines: [{ id: 1, label: '집 열쇠' }],
      userSettings: { sensitivityLevel: 2, deltaOffset: -3 },
    };
    const result = migrateV1toV2(migrateV0toV1(v0));

    expect(result.permanentRoutines).toEqual([{ id: 'routine-default-key', label: '집 열쇠' }]);
    expect(result.userSettings).toEqual({ sensitivityLevel: 2, learnedDelta: -2 }); // -3 - (-1)
  });
});

describe('seedUpdatedAt — 업그레이드 데이터에 동기화 타임스탬프 부여', () => {
  it('비어 있는 updatedAt을 채운다', () => {
    const before = Date.now();
    const result = seedUpdatedAt({
      userSettings: { departureTime: '08:15' },
      permanentRoutines: [{ id: 'a', label: '지갑' }],
      feedbackHistory: [{ date: '2026-09-15', val: 'cold' }],
    });

    const settings = result.userSettings as { updatedAt: number };
    expect(settings.updatedAt).toBeGreaterThanOrEqual(before);
    expect((result.permanentRoutines as Array<{ updatedAt: number }>)[0].updatedAt)
      .toBeGreaterThanOrEqual(before);
    expect((result.feedbackHistory as Array<{ updatedAt: number }>)[0].updatedAt)
      .toBeGreaterThanOrEqual(before);
  });

  it('이미 있는 updatedAt은 덮어쓰지 않는다', () => {
    const result = seedUpdatedAt({
      userSettings: { departureTime: '08:15', updatedAt: 111 },
      permanentRoutines: [{ id: 'a', updatedAt: 222 }],
    });
    expect((result.userSettings as { updatedAt: number }).updatedAt).toBe(111);
    expect((result.permanentRoutines as Array<{ updatedAt: number }>)[0].updatedAt).toBe(222);
  });

  it('없는 키를 만들어내지 않는다', () => {
    const result = seedUpdatedAt({ checklistDate: '2026-09-16' });
    expect('permanentRoutines' in result).toBe(false);
    expect('feedbackHistory' in result).toBe(false);
    expect('userSettings' in result).toBe(false);
  });
});
