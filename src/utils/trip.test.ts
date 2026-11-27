import { baseTripLabels, upcomingTrips, mergeWeatherItems, pruneTrips, tripDates, tripWhen, weatherTripItems, type Trip } from './trip';

const outlook = (o: Partial<{ rain: boolean; snow: boolean; minTemp: number | null; maxTemp: number | null; heat: boolean }>) => ({
  rain: false, popMax: 0, maxTemp: 15, minTemp: 8, heat: false, snow: false, rainPty: false, ...o,
});

const trip = (id: string, start: string, end: string): Trip => ({ id, name: id, start, end, destination: null, items: [] });

describe('여행 짐', () => {
  it('묵는 밤 수에 따라 기본 짐', () => {
    expect(baseTripLabels(0)).toEqual(['신분증', '휴대폰 충전기', '보조배터리']);
    expect(baseTripLabels(2)).toContain('속옷 3벌');
    expect(tripDates({ start: '2026-12-30', end: '2027-01-01' })).toEqual(['2026-12-30', '2026-12-31', '2027-01-01']);
  });

  it('날짜별 예보 → 날씨 짐 (같은 짐은 처음 날만)', () => {
    expect(weatherTripItems([
      { date: '2026-12-03', outlook: outlook({ rain: true }) },
      { date: '2026-12-04', outlook: outlook({ rain: true, minTemp: 2, maxTemp: 14 }) },
      { date: '2026-12-05', outlook: null },
    ])).toEqual([
      { label: '우산', reason: '12/3 비 예보' },
      { label: '두꺼운 겉옷', reason: '12/4 최저 2°C' },
      { label: '얇은 겉옷', reason: '12/4 일교차 12°C' },
    ]);
  });

  it('예보가 바뀌면 날씨 짐을 고치되 챙긴 것은 남긴다', () => {
    let n = 0;
    const items = [
      { id: 'a', label: '우산', checked: true, kind: 'weather' as const, reason: '12/3 비 예보' },
      { id: 'b', label: '선크림', checked: false, kind: 'weather' as const, reason: 'x' },
      { id: 'c', label: '신분증', checked: false, kind: 'base' as const },
    ];
    const merged = mergeWeatherItems(items, [{ label: '두꺼운 겉옷', reason: '12/4 최저 1°C' }], () => `n${n++}`);
    expect(merged.map((i) => i.label)).toEqual(['우산', '신분증', '두꺼운 겉옷']);
    // 뺀 날씨 짐은 되살리지 않는다
    expect(mergeWeatherItems([], [{ label: '우산', reason: 'x' }], () => 'z', ['우산'])).toEqual([]);
  });

  it('대시보드에 보일 여행·정리·언제', () => {
    const trips = [trip('far', '2026-12-20', '2026-12-22'), trip('soon', '2026-12-01', '2026-12-03'), trip('old', '2026-11-20', '2026-11-21')];
    expect(upcomingTrips(trips, '2026-11-28').map((t) => t.id)).toEqual(['soon', 'far']);
    expect(pruneTrips(trips, '2026-11-28').map((t) => t.id)).toEqual(['far', 'soon']);
    expect(tripWhen(trips[1], '2026-11-30')).toBe('내일 출발');
    expect(tripWhen(trips[1], '2026-12-02')).toBe('여행 중 · 2/3일째');
  });
});
