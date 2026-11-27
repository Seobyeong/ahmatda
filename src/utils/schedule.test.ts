import {
  currentWindow, describeSchedule, departureTimeOn, feedbackOutingDate, getScheduleCountdown, nextAlert,
  nextDeparture, previousDeparture, referenceTimeOn, type DepartureSchedule,
} from './schedule';

// 2026-11-18 수(3). 평일 08:30, 수 10:00, 토·일 쉼
const s: DepartureSchedule = { base: '08:30', weekdays: { '3': '10:00', '6': 'off', '0': 'off' }, today: null };
const d = (day: number, h = 0, m = 0) => new Date(2026, 10, day, h, m);

describe('그날 외출 시간', () => {
  it('오늘만 > 요일 예외 > 기본', () => {
    expect(departureTimeOn(d(17), s)).toBe('08:30'); // 화
    expect(departureTimeOn(d(18), s)).toBe('10:00'); // 수
    expect(departureTimeOn(d(21), s)).toBeNull();    // 토
    const skip = { ...s, today: { date: '2026-11-18', plan: 'off' as const } };
    expect(departureTimeOn(d(18), skip)).toBeNull();
    expect(departureTimeOn(d(25), skip)).toBe('10:00'); // 다음 주 수요일은 원래대로
    const moved = { ...s, today: { date: '2026-11-21', plan: '11:00' } };
    expect(departureTimeOn(d(21), moved)).toBe('11:00'); // 쉬는 날에도 오늘만 나갈 수 있다
  });
  it('쉬는 날의 일정 기준 시각은 기본 시간', () => {
    expect(referenceTimeOn(d(21), s)).toBe('08:30');
  });
});

describe('다음·이전 외출', () => {
  it('금요일 저녁이면 다음 외출은 월요일', () => {
    expect(nextDeparture(s, d(20, 19))).toEqual(d(23, 8, 30));
  });
  it('오늘 출발 전이면 오늘', () => {
    expect(nextDeparture(s, d(18, 9))).toEqual(d(18, 10));
  });
  it('일주일 내내 쉬면 없음', () => {
    const allOff = { base: 'off', weekdays: {}, today: null } as DepartureSchedule;
    expect(nextDeparture(allOff, d(18))).toBeNull();
    expect(nextAlert(allOff, d(18))).toBeNull();
  });
  it('이전 외출 — 월요일 아침이면 금요일', () => {
    expect(previousDeparture(s, d(23, 7))).toEqual(d(20, 8, 30));
    // 피드백은 쉬는 날도 기준 시각(기본 08:30)으로 센다 — 월 07:00이면 아직 오늘 전이라 일요일
    expect(feedbackOutingDate(s, d(23, 7))).toBe('2026-11-22');
    expect(feedbackOutingDate(s, d(21, 22))).toBe('2026-11-21'); // 토요일(쉬는 날) 밤 답은 토요일 것
    expect(feedbackOutingDate(s, d(19, 0, 30))).toBe('2026-11-18'); // 자정 넘은 정리는 어제 외출
  });
});

describe('감시 창 (출발 30분 전부터 2시간)', () => {
  it('수요일은 09:30~11:30', () => {
    expect(currentWindow(s, d(18, 9, 29))).toBeNull();
    expect(currentWindow(s, d(18, 9, 30))?.departure).toEqual(d(18, 10));
    expect(currentWindow(s, d(18, 11, 30))?.remainingMs).toBe(0);
    expect(currentWindow(s, d(18, 11, 31))).toBeNull();
  });
  it('쉬는 날은 창이 없다', () => {
    expect(currentWindow(s, d(21, 8, 30))).toBeNull();
  });
  it('자정 직후 출발은 전날 밤에 창이 열린다', () => {
    const late: DepartureSchedule = { base: '00:15', weekdays: {}, today: null };
    expect(currentWindow(late, d(17, 23, 50))?.departure).toEqual(d(18, 0, 15));
    expect(nextAlert(late, d(17, 23, 0))?.alertAt).toEqual(d(17, 23, 45));
  });
  it('다음 알림 — 알림 시각이 지난 출발은 건너뛴다', () => {
    expect(nextAlert(s, d(18, 9, 40))).toEqual({ alertAt: d(19, 8), departure: d(19, 8, 30) });
  });
});

describe('남은 시간 줄', () => {
  it('출발 30분 안이면 강조', () => {
    expect(getScheduleCountdown(s, d(18, 9, 40))).toEqual({ label: '곧 나갈 시간이에요', value: '20분', detail: '10:00 출발', soon: true });
  });
  it('지났으면 30분 동안 늦었다고', () => {
    expect(getScheduleCountdown(s, d(18, 10, 5))).toMatchObject({ label: '나갈 시간이 지났어요', value: '5분 지남' });
  });
  it('쉬는 날은 다음 외출 요일을 알린다', () => {
    expect(getScheduleCountdown(s, d(21, 9))).toEqual({ label: '오늘은 쉬어요 · 다음 외출', value: '월요일 08:30', detail: null, soon: false });
  });
  it('오늘 건너뛰면 내일 외출', () => {
    const skip = { ...s, today: { date: '2026-11-18', plan: 'off' as const } };
    expect(getScheduleCountdown(skip, d(18, 7))).toMatchObject({ label: '오늘은 쉬어요 · 다음 외출', value: '내일 08:30' });
  });
});

describe('describeSchedule', () => {
  it('묶어서 보여준다', () => {
    expect(describeSchedule(s)).toBe('월·화·목·금 08:30 · 수 10:00 · 주말 쉼');
    expect(describeSchedule({ base: '08:30', weekdays: {} })).toBe('매일 08:30');
    expect(describeSchedule({ base: '08:30', weekdays: { '0': 'off', '6': 'off' } })).toBe('평일 08:30 · 주말 쉼');
  });
});

import { planDepartureAlerts } from './schedule';

describe('planDepartureAlerts', () => {
  it('쉬는 요일 빼고 요일마다 매주 하나, 가까운 순', () => {
    const plan = planDepartureAlerts(s, d(18, 9, 40)); // 수 10:00 알림(09:30)은 지남
    expect(plan.map((p) => p.id)).toEqual([
      'departure-alert-d4', 'departure-alert-d5', 'departure-alert-d1', 'departure-alert-d2', 'departure-alert-d3',
    ]);
    expect(plan[0]).toMatchObject({ alertAt: d(19, 8), weekly: true });
    expect(plan[4].alertAt).toEqual(d(25, 9, 30)); // 수요일은 다음 주
  });
  it('오늘 건너뛰면 오늘 요일은 다음 주부터', () => {
    const skip = { ...s, today: { date: '2026-11-18', plan: 'off' as const } };
    const plan = planDepartureAlerts(skip, d(18, 7));
    expect(plan.find((p) => p.id === 'departure-alert-d3')?.alertAt).toEqual(d(25, 9, 30));
    expect(plan.some((p) => p.id === 'departure-alert-o2026-11-18')).toBe(false);
  });
  it('오늘만 시간을 바꾸면 한 번짜리가 추가된다', () => {
    const moved = { ...s, today: { date: '2026-11-18', plan: '11:00' } };
    const plan = planDepartureAlerts(moved, d(18, 7));
    expect(plan[0]).toEqual({ id: 'departure-alert-o2026-11-18', alertAt: d(18, 10, 30), departure: d(18, 11), weekly: false, holiday: null });
  });
});

import { currentDepartureLabel } from './schedule';

describe('currentDepartureLabel', () => {
  it('감시 창 안이면 출발이 지나도 그 출발, 아니면 다음 출발', () => {
    expect(currentDepartureLabel(s, d(18, 10, 20))).toBe('10:00');
    expect(currentDepartureLabel(s, d(18, 12))).toBe('내일 08:30');
    expect(currentDepartureLabel(s, d(20, 22))).toBe('월요일 08:30');
  });
});

import { answeredHolidayFrom, holidayQuestionFrom, isUnansweredHoliday, pendingHolidayQuestion, planOn, activeDates, withIeyo } from './schedule';

describe('날짜별 계획과 공휴일', () => {
  // 11-19(목) 공휴일 가정, 11-20(금)도 공휴일, 11-21~22 주말(원래 쉼), 11-23(월) 대체공휴일
  const hol: DepartureSchedule = {
    ...s,
    holidays: { '2026-11-19': '추석', '2026-11-20': '추석', '2026-11-23': '대체공휴일', '2026-11-28': '토요공휴일' },
  };

  it('대답 없는 공휴일은 평소처럼 나간다', () => {
    expect(planOn(d(19), hol)).toBe('08:30');
    expect(isUnansweredHoliday(d(19), hol)).toBe(true);
    expect(isUnansweredHoliday(d(28), hol)).toBe(false); // 원래 쉬는 토요일은 물을 게 없다
  });

  it('날짜별 대답 — 쉼·다른 시간·평소대로', () => {
    const answered = { ...hol, dates: { '2026-11-19': 'off', '2026-11-20': '13:00', '2026-11-23': 'usual' } as const };
    expect(planOn(d(19), answered)).toBe('off');
    expect(planOn(d(20), answered)).toBe('13:00');
    expect(planOn(d(23), answered)).toBe('08:30');
    expect(isUnansweredHoliday(d(23), answered)).toBe(false);
    // 오늘만 바꾸기가 날짜별 대답보다 앞선다
    expect(planOn(d(19), { ...answered, today: { date: '2026-11-19', plan: '10:00' } })).toBe('10:00');
  });

  it('연휴는 주말을 넘어 대체공휴일까지 한 번에 묻는다', () => {
    const q = holidayQuestionFrom(hol, d(19));
    expect(q).toMatchObject({ name: '추석 연휴', dates: ['2026-11-19', '2026-11-20', '2026-11-23'] });
    expect(holidayQuestionFrom(hol, d(18))).toBeNull();
    // 수요일 밤에 보면 내일 시작하는 연휴
    expect(pendingHolidayQuestion(hol, d(18, 22))?.dates[0]).toBe('2026-11-19');
    // 하루만 대답했으면 남은 날만 묻는다
    const part = { ...hol, dates: { '2026-11-19': 'off' } as const };
    expect(pendingHolidayQuestion(part, d(19, 9))?.dates).toEqual(['2026-11-20', '2026-11-23']);
  });

  it('공휴일·날짜별 계획이 있는 요일은 그날을 한 번짜리로, 반복은 그 뒤부터', () => {
    const plan = planDepartureAlerts(hol, d(18, 7)); // 수 07:00
    const thu = plan.filter((p) => p.departure.getDay() === 4);
    // 목 19일 공휴일(대답 없음) → 한 번짜리 + 공휴일 표시, 반복은 26일부터
    expect(thu).toContainEqual({ id: 'departure-alert-o2026-11-19', alertAt: d(19, 8), departure: d(19, 8, 30), weekly: false, holiday: '추석' });
    expect(thu.find((p) => p.weekly)?.departure).toEqual(d(26, 8, 30));
    // 월 23일 대체공휴일 → 월요일 반복은 30일부터
    expect(plan.find((p) => p.id === 'departure-alert-d1')?.departure).toEqual(d(30, 8, 30));
  });

  it('쉬기로 한 공휴일은 알림이 없고, 그 앞의 평범한 같은 요일은 한 번짜리로 남는다', () => {
    const later = { ...s, dates: { '2026-11-26': 'off' } as const }; // 다음 주 목요일만 쉼
    const plan = planDepartureAlerts(later, d(18, 7));
    const thu = plan.filter((p) => p.departure.getDay() === 4);
    expect(thu.map((p) => [p.id, p.weekly])).toEqual([
      ['departure-alert-o2026-11-19', false],
      ['departure-alert-d4', true],
    ]);
    expect(thu[1].departure).toEqual(d(26 + 7, 8, 30));
  });

  it('지난 날짜별 계획은 어제 것까지만 남긴다', () => {
    expect(activeDates({ '2026-11-16': 'off', '2026-11-17': 'off', '2026-11-18': '10:00' }, d(18, 9)))
      .toEqual({ '2026-11-17': 'off', '2026-11-18': '10:00' });
  });
});

describe('공휴일 대답 보기·문구', () => {
  const hol: DepartureSchedule = { ...s, holidays: { '2026-11-19': '추석', '2026-11-20': '추석' }, dates: { '2026-11-19': 'off', '2026-11-20': 'off' } };
  it('내일 대답한 연휴를 묶어서 돌려준다', () => {
    expect(answeredHolidayFrom(hol, d(18, 21))).toMatchObject({ name: '추석', dates: ['2026-11-19', '2026-11-20'], plan: 'off' });
    expect(answeredHolidayFrom(s, d(18, 21))).toBeNull();
  });
  it('쉬기로 한 평일이 연휴를 잇는다', () => {
    const bridge: DepartureSchedule = { ...s, holidays: { '2026-11-19': '추석', '2026-11-23': '대체공휴일' }, dates: { '2026-11-20': 'off' } };
    expect(holidayQuestionFrom(bridge, d(19))?.dates).toEqual(['2026-11-19', '2026-11-23']);
  });
  it('받침에 맞는 어미', () => {
    expect(withIeyo('성탄절')).toBe('성탄절이에요');
    expect(withIeyo('추석 연휴')).toBe('추석 연휴예요');
  });
});
