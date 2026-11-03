import { isRainExpectedToday, pickForecastDate, summarizeDayOutlook } from './forecastDate';

// 단기예보는 최대 +3일치를 한 번에 돌려준다. 한 날짜만 골라내지 못하면
// "오늘 시간대별 날씨" 자리에 내일·모레 값이 섞여 들어간다.
describe('pickForecastDate', () => {
  const now = new Date('2026-09-16T09:00:00');

  it('오늘 예보가 있으면 오늘을 고른다', () => {
    const items = [
      { fcstDate: '20260916' },
      { fcstDate: '20260917' },
      { fcstDate: '20260918' },
    ];
    expect(pickForecastDate(items, now)).toBe('20260916');
  });

  it('응답 순서가 뒤섞여 있어도 오늘을 고른다', () => {
    const items = [{ fcstDate: '20260918' }, { fcstDate: '20260916' }];
    expect(pickForecastDate(items, now)).toBe('20260916');
  });

  // 23시 발표분은 예보가 다음 날 00시부터 시작해 오늘 항목이 없다.
  it('오늘 예보가 없으면 가장 이른 날짜를 고른다', () => {
    const items = [{ fcstDate: '20260918' }, { fcstDate: '20260917' }];
    expect(pickForecastDate(items, now)).toBe('20260917');
  });

  it('fcstDate가 없으면 undefined — 기존처럼 전부 통과시킨다', () => {
    expect(pickForecastDate([{}, {}], now)).toBeUndefined();
    expect(pickForecastDate([], now)).toBeUndefined();
  });
});

describe('summarizeDayOutlook — 다음 외출 날 예보 요약', () => {
  const item = (fcstDate: string, fcstTime: string, category: string, fcstValue: string) =>
    ({ category, fcstDate, fcstTime, fcstValue });

  it('출발 시각 이후 ~ 21시만 본다', () => {
    const items = [
      item('20261104', '0600', 'POP', '90'),  // 출발 전 — 무시
      item('20261104', '0800', 'POP', '20'),
      item('20261104', '0800', 'TMP', '9'),
      item('20261104', '1500', 'POP', '30'),
      item('20261104', '1500', 'TMP', '17'),
      item('20261104', '2200', 'PTY', '1'),   // 21시 이후 — 무시
      item('20261105', '1200', 'PTY', '1'),   // 다른 날 — 무시
    ];
    expect(summarizeDayOutlook(items, '20261104', '08:15')).toEqual({
      rain: false, popMax: 30, maxTemp: 17, minTemp: 9, heat: false,
    });
  });

  it('강수확률 60% 이상이나 강수 형태가 있으면 비', () => {
    expect(summarizeDayOutlook([item('20261104', '1200', 'POP', '60')], '20261104', '08:00')?.rain).toBe(true);
    expect(summarizeDayOutlook([item('20261104', '1200', 'PTY', '3')], '20261104', '08:00')?.rain).toBe(true);
    expect(summarizeDayOutlook([item('20261104', '1200', 'POP', '50')], '20261104', '08:00')?.rain).toBe(false);
  });

  it('최고 33°C 이상이면 폭염', () => {
    expect(summarizeDayOutlook([item('20261104', '1400', 'TMP', '33')], '20261104', '08:00')?.heat).toBe(true);
  });

  it('범위 예보가 없으면 null', () => {
    expect(summarizeDayOutlook([item('20261105', '1200', 'POP', '90')], '20261104', '08:00')).toBeNull();
  });
});

describe('summarizeDayOutlook — 야간 출발', () => {
  it('21시 이후 출발이면 23시 예보까지 본다', () => {
    const items = [{ category: 'POP', fcstDate: '20261104', fcstTime: '2300', fcstValue: '80' }];
    expect(summarizeDayOutlook(items, '20261104', '22:30')?.rain).toBe(true);
  });
});

describe('isRainExpectedToday — 아침 체크리스트 우산 기준', () => {
  const slot = (rain: number, alert: string | null = null) => ({ rain, alert });

  it('지금 비가 오면 우산', () => {
    expect(isRainExpectedToday(true, [], 0)).toBe(true);
  });

  it('지금 맑아도 남은 시간대 강수확률 60% 이상이면 우산', () => {
    expect(isRainExpectedToday(false, [slot(10), slot(10), slot(70)], 0)).toBe(true);
  });

  it('이미 지난 시간대의 비는 보지 않는다', () => {
    expect(isRainExpectedToday(false, [slot(90, 'rain'), slot(10), slot(20)], 1)).toBe(false);
  });

  it('60% 미만이면 우산 없음', () => {
    expect(isRainExpectedToday(false, [slot(50), slot(40)], 0)).toBe(false);
  });
});
