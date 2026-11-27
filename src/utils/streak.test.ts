import { packedStreak } from './streak';
import type { DepartureSchedule } from './schedule';

const s: DepartureSchedule = { base: '08:15', weekdays: { 0: 'off', 6: 'off' }, today: null };
const now = new Date(2026, 10, 30, 9, 0); // 월요일

describe('packedStreak', () => {
  it('쉬는 날은 건너뛰고 센다', () => {
    // 금(27)·목(26) 다 챙김, 토·일은 쉬는 날, 오늘(월) 다 챙김
    expect(packedStreak(['2026-11-26', '2026-11-27', '2026-11-30'], s, now)).toBe(3);
  });
  it('오늘 아직이면 어제까지', () => {
    expect(packedStreak(['2026-11-26', '2026-11-27'], s, now)).toBe(2);
  });
  it('나가는 날을 놓치면 끊긴다', () => {
    expect(packedStreak(['2026-11-25', '2026-11-27', '2026-11-30'], s, now)).toBe(2);
  });
  it('그날만 쉰다고 한 날(지난 날)도 건너뛴다', () => {
    expect(packedStreak(['2026-11-25', '2026-11-27', '2026-11-30'], s, now, ['2026-11-26'])).toBe(3);
  });
  it('쉬는 날에 다 챙긴 것도 센다', () => {
    expect(packedStreak(['2026-11-27', '2026-11-29', '2026-11-30'], s, now)).toBe(3);
  });
});
