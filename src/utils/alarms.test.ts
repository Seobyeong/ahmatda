import {
  buildWakeSummary, describeDays, describeWhen, isAlarmNotificationId, nextAt, nextRing, nextWeekdayAt,
  planAlarmTriggers, triggerIdFor, type Alarm,
} from './alarms';
import type { ChecklistItem, CurrentWeather } from '@/types';

// 2026-11-18은 수요일(3)
const wed0800 = new Date(2026, 10, 18, 8, 0);

describe('다음 울릴 시각', () => {
  it('오늘 그 요일이고 시각 전이면 오늘, 지났으면 다음 주', () => {
    expect(nextWeekdayAt('09:00', 3, wed0800)).toEqual(new Date(2026, 10, 18, 9, 0));
    expect(nextWeekdayAt('07:00', 3, wed0800)).toEqual(new Date(2026, 10, 25, 7, 0));
    expect(nextWeekdayAt('08:00', 3, wed0800)).toEqual(new Date(2026, 10, 25, 8, 0)); // 정각은 지난 것
  });
  it('다른 요일은 이번 주 안에서', () => {
    expect(nextWeekdayAt('07:00', 5, wed0800)).toEqual(new Date(2026, 10, 20, 7, 0)); // 금
    expect(nextWeekdayAt('07:00', 1, wed0800)).toEqual(new Date(2026, 10, 23, 7, 0)); // 다음 월
  });
  it('한 번 알람은 오늘 지났으면 내일', () => {
    expect(nextAt('09:00', wed0800)).toEqual(new Date(2026, 10, 18, 9, 0));
    expect(nextAt('07:30', wed0800)).toEqual(new Date(2026, 10, 19, 7, 30));
  });
});

describe('planAlarmTriggers', () => {
  const alarm = (p: Partial<Alarm>): Alarm => ({ id: 'a', time: '07:00', days: [], enabled: true, label: '', ...p });
  it('반복 요일마다 매주 트리거, 꺼진 알람은 없음', () => {
    const plan = planAlarmTriggers([alarm({ days: [5, 1, 1] }), alarm({ id: 'b', enabled: false })], wed0800);
    expect(plan.map((t) => t.id)).toEqual([triggerIdFor('a', 1), triggerIdFor('a', 5)]);
    expect(plan.every((t) => t.weekly)).toBe(true);
  });
  it('요일이 없으면 한 번짜리', () => {
    const [t] = planAlarmTriggers([alarm({})], wed0800);
    expect(t).toMatchObject({ id: 'alarm-a-once', weekly: false, timestamp: new Date(2026, 10, 19, 7, 0).getTime() });
  });
  it('가장 가까운 다음 알람', () => {
    expect(nextRing([alarm({ days: [5] }), alarm({ id: 'b', time: '09:00' })], wed0800)).toEqual(new Date(2026, 10, 18, 9, 0));
    expect(nextRing([], wed0800)).toBeNull();
  });
  it('알람 알림 id 구분', () => {
    expect(isAlarmNotificationId('alarm-a-d1')).toBe(true);
    expect(isAlarmNotificationId('alarm-snooze-a')).toBe(true);
    expect(isAlarmNotificationId('place-leave')).toBe(false);
    expect(isAlarmNotificationId(undefined)).toBe(false);
  });
});

describe('표시 문구', () => {
  it('요일 묶음', () => {
    expect(describeDays([])).toBe('한 번');
    expect(describeDays([0, 1, 2, 3, 4, 5, 6])).toBe('매일');
    expect(describeDays([5, 4, 3, 2, 1])).toBe('평일');
    expect(describeDays([6, 0])).toBe('주말');
    expect(describeDays([0, 1, 3])).toBe('월·수·일');
  });
  it('언제', () => {
    expect(describeWhen(new Date(2026, 10, 18, 9, 0), wed0800)).toBe('오늘 09:00');
    expect(describeWhen(new Date(2026, 10, 19, 7, 0), wed0800)).toBe('내일 07:00');
    expect(describeWhen(new Date(2026, 10, 21, 7, 5), wed0800)).toBe('11/21(토) 07:05');
  });
});

describe('buildWakeSummary', () => {
  const item = (label: string, tier: 0 | 1 | 2 | 3, p: Partial<ChecklistItem> = {}): ChecklistItem =>
    ({ id: label, label, icon: '', tier, badge: null, checked: false, temp: false, permanent: false, ...p });
  it('날씨 항목과 안 챙긴 것을 급한 순으로', () => {
    const weather = { label: '비 · 12°C' } as CurrentWeather;
    const s = buildWakeSummary(weather, [
      item('지갑', 3), item('우산', 1, { badge: '지금 비 와요' }), item('노트북', 2), item('열쇠', 3, { checked: true }),
    ]);
    expect(s).toEqual({ weather: '비 · 12°C', weatherItems: ['우산(지금 비 와요)'], items: '챙길 것 3개 · 우산, 노트북 외 1개' });
  });
  it('날씨 없음 · 다 챙김 · 빈 목록', () => {
    expect(buildWakeSummary(null, [item('지갑', 3, { checked: true })])).toMatchObject({ weather: null, items: '챙길 것을 다 챙겼어요' });
    expect(buildWakeSummary(null, []).items).toBe('챙길 것 없음');
  });
});
