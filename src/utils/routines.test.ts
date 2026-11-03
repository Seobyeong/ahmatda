import { isOneOff, isRoutineActiveOn, pruneExpiredOneOffs } from './routines';

const wed = new Date(2026, 10, 4); // 2026-11-04 수요일

describe('isRoutineActiveOn', () => {
  it('조건이 없으면 매일', () => {
    expect(isRoutineActiveOn({}, wed)).toBe(true);
    expect(isRoutineActiveOn({ days: [] }, wed)).toBe(true);
  });

  it('요일 조건', () => {
    expect(isRoutineActiveOn({ days: [3] }, wed)).toBe(true);
    expect(isRoutineActiveOn({ days: [1, 5] }, wed)).toBe(false);
  });

  it('특정 날짜 1회는 그날만', () => {
    expect(isRoutineActiveOn({ onDate: '2026-11-04' }, wed)).toBe(true);
    expect(isRoutineActiveOn({ onDate: '2026-11-05' }, wed)).toBe(false);
  });

  it('조건이 여럿이면 하나만 맞아도 나타난다', () => {
    expect(isRoutineActiveOn({ days: [1], onDate: '2026-11-04' }, wed)).toBe(true);
    expect(isRoutineActiveOn({ days: [3], onDate: '2026-11-09' }, wed)).toBe(true);
  });
});

describe('pruneExpiredOneOffs', () => {
  it('지난 1회 항목만 지운다', () => {
    const routines = [
      { id: 'a', onDate: '2026-11-03' },
      { id: 'b', onDate: '2026-11-04' },
      { id: 'c' },
      { id: 'd', days: [1], onDate: '2026-11-01' },
    ];
    expect(pruneExpiredOneOffs(routines, '2026-11-04').map((r) => r.id)).toEqual(['b', 'c', 'd']);
  });

  it('isOneOff', () => {
    expect(isOneOff({ onDate: '2026-11-04' })).toBe(true);
    expect(isOneOff({ days: [1], onDate: '2026-11-04' })).toBe(false);
    expect(isOneOff({})).toBe(false);
  });
});
