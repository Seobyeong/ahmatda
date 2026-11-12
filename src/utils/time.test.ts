import { getAlertTime, isWithinDepartureWindow, getNextAlertDate, getNextDailyDate, getDepartureWindowRemainingMs, getFeedbackOutingDate, getNextDepartureDate, isValidHHmm, getDepartureCountdown } from './time';

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

describe('getDepartureWindowRemainingMs', () => {
  const at = (dateStr: string) => new Date(dateStr);
  const MIN = 60 * 1000;

  it('창 밖이면 null', () => {
    expect(getDepartureWindowRemainingMs('08:15', at('2026-07-07T07:00:00'))).toBeNull();
    expect(getDepartureWindowRemainingMs('08:15', at('2026-07-07T10:00:00'))).toBeNull();
  });

  it('창이 열린 순간엔 2시간 남는다', () => {
    expect(getDepartureWindowRemainingMs('08:15', at('2026-07-07T07:45:00'))).toBe(120 * MIN);
  });

  it('창 중간이면 끝(알림 + 2시간)까지 남은 시간', () => {
    expect(getDepartureWindowRemainingMs('08:15', at('2026-07-07T08:45:00'))).toBe(60 * MIN);
  });

  it('자정을 넘긴 창도 어제 시작분으로 계산한다', () => {
    // 출발 00:15 → 창 23:45 ~ 01:45
    expect(getDepartureWindowRemainingMs('00:15', at('2026-07-08T00:45:00'))).toBe(60 * MIN);
  });
});

describe('getFeedbackOutingDate — 자기 전 피드백이 가리키는 외출 날짜', () => {
  const at = (d: number, h: number, m: number) => new Date(2026, 10, d, h, m);

  it('출발 이후 같은 날 밤이면 오늘 외출', () => {
    expect(getFeedbackOutingDate('08:15', at(3, 22, 0))).toBe('2026-11-03');
  });

  it('자정을 넘긴 정리 시각이면 전날 외출', () => {
    expect(getFeedbackOutingDate('08:15', at(4, 0, 30))).toBe('2026-11-03');
  });

  it('출발 시각 정각은 그날 외출로 본다', () => {
    expect(getFeedbackOutingDate('08:15', at(3, 8, 15))).toBe('2026-11-03');
  });

  it('출발 직전이면 아직 전날 외출', () => {
    expect(getFeedbackOutingDate('08:15', at(3, 8, 14))).toBe('2026-11-02');
  });

  it('월 경계도 넘어간다', () => {
    expect(getFeedbackOutingDate('08:15', new Date(2026, 11, 1, 0, 30))).toBe('2026-11-30');
  });
});

describe('isValidHHmm', () => {
  it.each(['00:00', '00:30', '09:05', '23:59'])('%s는 통과', (t) => expect(isValidHHmm(t)).toBe(true));
  it.each(['', '7:5', '24:00', '12:60', '7:05 pm', '12:3'])('%s는 거른다', (t) => expect(isValidHHmm(t)).toBe(false));
});

describe('getNextDepartureDate — 자기 전 정리의 "내일 준비"가 가리키는 날', () => {
  const day = (d: Date) => `${d.getMonth() + 1}/${d.getDate()} ${d.getHours()}:${d.getMinutes()}`;

  it('밤 22시면 내일 출발', () => {
    expect(day(getNextDepartureDate('08:15', new Date(2026, 10, 3, 22, 0)))).toBe('11/4 8:15');
  });

  it('자정 넘긴 00:30이면 달력상 오늘 출발', () => {
    expect(day(getNextDepartureDate('08:15', new Date(2026, 10, 4, 0, 30)))).toBe('11/4 8:15');
  });

  it('출발 시각 정각이면 이미 나간 것으로 보고 다음 날', () => {
    expect(day(getNextDepartureDate('08:15', new Date(2026, 10, 4, 8, 15)))).toBe('11/5 8:15');
  });
});

describe('getDepartureCountdown — 대시보드의 남은 시간 표시', () => {
  it('출발 전이면 남은 시간을 센다', () => {
    expect(getDepartureCountdown('08:15', new Date(2026, 10, 4, 7, 3))).toEqual({
      label: '외출까지', value: '1시간 12분', detail: '08:15 출발', soon: false,
    });
  });

  it('30분 안이면 강조한다', () => {
    const c = getDepartureCountdown('08:15', new Date(2026, 10, 4, 7, 45));
    expect(c).toMatchObject({ label: '곧 나갈 시간이에요', value: '30분', soon: true });
  });

  it('초 단위는 올림 — 59초 남았으면 1분', () => {
    expect(getDepartureCountdown('08:15', new Date(2026, 10, 4, 8, 14, 1)).value).toBe('1분');
  });

  it('정각 시간은 분을 생략한다', () => {
    expect(getDepartureCountdown('08:15', new Date(2026, 10, 4, 6, 15)).value).toBe('2시간');
  });

  it('출발 시각 직후 30분은 늦었다고 알린다', () => {
    expect(getDepartureCountdown('08:15', new Date(2026, 10, 4, 8, 15))).toMatchObject({
      label: '나갈 시간이 지났어요', value: '지금', soon: true,
    });
    expect(getDepartureCountdown('08:15', new Date(2026, 10, 4, 8, 20))).toMatchObject({
      label: '나갈 시간이 지났어요', value: '5분 지남', detail: '08:15 출발', soon: true,
    });
  });

  it('30분이 더 지나면 내일 시각만 알린다', () => {
    expect(getDepartureCountdown('08:15', new Date(2026, 10, 4, 8, 45))).toEqual({
      label: '다음 외출', value: '내일 08:15', detail: null, soon: false,
    });
  });

  it('자정을 넘는 출발도 남은 시간으로 센다', () => {
    expect(getDepartureCountdown('00:15', new Date(2026, 10, 4, 23, 50)).value).toBe('25분');
  });

  it('12시간보다 먼 오늘 출발은 "오늘"로 알린다', () => {
    expect(getDepartureCountdown('13:00', new Date(2026, 10, 4, 0, 10)).value).toBe('오늘 13:00');
  });
});
