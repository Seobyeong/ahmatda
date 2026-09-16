import { getAlertTime, isRoutineActiveOnDay, isWithinDepartureWindow, getNextAlertDate, getNextDailyDate } from './time';

describe('isRoutineActiveOnDay', () => {
  it('days가 없으면 매일 활성', () => {
    expect(isRoutineActiveOnDay(undefined, 0)).toBe(true);
    expect(isRoutineActiveOnDay(undefined, 6)).toBe(true);
  });

  it('빈 배열도 매일 활성으로 취급 (요일 전부 껐다 켜는 과도기 보호)', () => {
    expect(isRoutineActiveOnDay([], 3)).toBe(true);
  });

  it('지정된 요일에만 활성', () => {
    const monWedFri = [1, 3, 5];
    expect(isRoutineActiveOnDay(monWedFri, 1)).toBe(true);
    expect(isRoutineActiveOnDay(monWedFri, 3)).toBe(true);
    expect(isRoutineActiveOnDay(monWedFri, 5)).toBe(true);
    expect(isRoutineActiveOnDay(monWedFri, 0)).toBe(false);
    expect(isRoutineActiveOnDay(monWedFri, 2)).toBe(false);
    expect(isRoutineActiveOnDay(monWedFri, 6)).toBe(false);
  });
});

// 기존에 테스트가 없던 시간 유틸도 함께 커버
describe('getAlertTime', () => {
  it('30분 전 시각을 계산한다', () => {
    expect(getAlertTime('08:15')).toBe('07:45');
    expect(getAlertTime('08:45')).toBe('08:15');
  });

  it('시(hour) 경계를 넘는 경우', () => {
    expect(getAlertTime('09:10')).toBe('08:40');
  });

  it('자정 경계를 넘는 경우', () => {
    expect(getAlertTime('00:15')).toBe('23:45');
    expect(getAlertTime('00:00')).toBe('23:30');
  });
});

describe('isWithinDepartureWindow', () => {
  const at = (dateStr: string) => new Date(dateStr);

  it('알림 시각 전에는 창 밖', () => {
    expect(isWithinDepartureWindow('08:15', at('2026-07-07T07:00:00'))).toBe(false);
  });

  it('알림 시각부터 2시간 동안 창 안', () => {
    expect(isWithinDepartureWindow('08:15', at('2026-07-07T07:45:00'))).toBe(true);
    expect(isWithinDepartureWindow('08:15', at('2026-07-07T09:44:00'))).toBe(true);
  });

  it('창 종료 후에는 창 밖', () => {
    expect(isWithinDepartureWindow('08:15', at('2026-07-07T09:46:00'))).toBe(false);
  });

  it('자정을 넘겨 wrap되는 출발시각(00:15 → 알림 23:45)도 판정한다', () => {
    // 어제 23:45에 시작된 창이 오늘 새벽 01:45까지 이어짐
    expect(isWithinDepartureWindow('00:15', at('2026-07-07T00:30:00'))).toBe(true);
    expect(isWithinDepartureWindow('00:15', at('2026-07-07T23:50:00'))).toBe(true);
    expect(isWithinDepartureWindow('00:15', at('2026-07-07T12:00:00'))).toBe(false);
  });
});

describe('getNextAlertDate — 출발 30분 전', () => {
  const at = (iso: string) => new Date(iso);

  it('오늘 알림 시각이 아직 안 지났으면 오늘로 잡는다', () => {
    // 07:00 현재, 출발 08:15 → 알림 07:45
    expect(getNextAlertDate('08:15', at('2026-09-16T07:00:00')))
      .toEqual(at('2026-09-16T07:45:00'));
  });

  it('오늘 알림 시각이 지났으면 내일로 넘긴다', () => {
    expect(getNextAlertDate('08:15', at('2026-09-16T09:00:00')))
      .toEqual(at('2026-09-17T07:45:00'));
  });

  // 자정을 넘어가는 출발 시각 — 문자열을 오늘에 앉히던 방식이 깨지던 자리.
  it('출발이 자정 직후면 알림은 전날 밤에 온다', () => {
    // 10:00 현재, 출발 00:15 → 오늘 00:15는 지났으므로 내일 00:15,
    // 그 30분 전인 오늘 23:45가 답
    expect(getNextAlertDate('00:15', at('2026-09-16T10:00:00')))
      .toEqual(at('2026-09-16T23:45:00'));
  });

  it('그 알림 시각마저 지났으면 다시 하루를 넘긴다', () => {
    // 23:50 현재 — 오늘 23:45는 이미 지났다. 25분 뒤 출발은 이미 놓쳤으므로
    // 다음 날 출발(09-18 00:15)의 30분 전인 09-17 23:45로 잡는다.
    expect(getNextAlertDate('00:15', at('2026-09-16T23:50:00')))
      .toEqual(at('2026-09-17T23:45:00'));
  });

  it('정각 경계에서 다음 날로 넘긴다', () => {
    expect(getNextAlertDate('08:15', at('2026-09-16T07:45:00')))
      .toEqual(at('2026-09-17T07:45:00'));
  });
});

describe('getNextDailyDate', () => {
  const at = (iso: string) => new Date(iso);

  it('오늘 그 시각이 안 지났으면 오늘', () => {
    expect(getNextDailyDate(22, 0, at('2026-09-16T10:00:00')))
      .toEqual(at('2026-09-16T22:00:00'));
  });

  it('지났으면 내일', () => {
    expect(getNextDailyDate(22, 0, at('2026-09-16T23:00:00')))
      .toEqual(at('2026-09-17T22:00:00'));
  });
});
