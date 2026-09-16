import { pickForecastDate } from './forecastDate';

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
