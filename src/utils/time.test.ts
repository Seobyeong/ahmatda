import { getAlertTime, isRoutineActiveOnDay, isWithinDepartureWindow } from './time';

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
