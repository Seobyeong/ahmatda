import { EMPTY_HOLIDAY_CACHE, HOLIDAY_REFRESH_MS, mergeYear, parseHolidayResponse, yearsToFetch } from './HolidayService';

const ok = (items: unknown) => ({ response: { header: { resultCode: '00' }, body: { items } } });

describe('parseHolidayResponse', () => {
  it('여러 개 · 하나 · 없음', () => {
    expect(parseHolidayResponse(ok({ item: [
      { dateName: '추석', isHoliday: 'Y', locdate: 20260924 },
      { dateName: '기독탄신일', isHoliday: 'Y', locdate: 20261225 },
      { dateName: '어떤 기념일', isHoliday: 'N', locdate: 20261226 },
    ] }))).toEqual({ '2026-09-24': '추석', '2026-12-25': '성탄절' });
    expect(parseHolidayResponse(ok({ item: { dateName: '1월1일', isHoliday: 'Y', locdate: '20270101' } })))
      .toEqual({ '2027-01-01': '신정' });
    expect(parseHolidayResponse(ok(''))).toEqual({});
    expect(parseHolidayResponse(ok({ item: [
      { dateName: '대체공휴일(삼일절)', isHoliday: 'Y', locdate: 20260302 },
      { dateName: '대체공휴일(기독탄신일)', isHoliday: 'Y', locdate: 20271227 },
    ] }))).toEqual({ '2026-03-02': '삼일절 대체공휴일', '2027-12-27': '성탄절 대체공휴일' });
  });
  it('오류 응답은 던진다', () => {
    expect(() => parseHolidayResponse({ OpenAPI_ServiceResponse: {} })).toThrow();
  });
});

describe('받을 해', () => {
  const nov = new Date(2026, 10, 27);
  it('10월부터 내년도, 받은 지 30일 안이면 건너뜀', () => {
    expect(yearsToFetch(EMPTY_HOLIDAY_CACHE, new Date(2026, 3, 1))).toEqual([2026]);
    expect(yearsToFetch(EMPTY_HOLIDAY_CACHE, nov)).toEqual([2026, 2027]);
    expect(yearsToFetch({ dates: {}, fetched: { 2026: nov.getTime() - 1000 } }, nov)).toEqual([2027]);
    expect(yearsToFetch({ dates: {}, fetched: { 2026: nov.getTime() - HOLIDAY_REFRESH_MS } }, nov)).toEqual([2026, 2027]);
  });
  it('최근에 실패한 해는 잠시 쉰다', () => {
    expect(yearsToFetch({ dates: {}, fetched: {}, failed: { 2027: nov.getTime() - 1000 } }, nov)).toEqual([2026]);
  });
  it('그 해 것을 통째로 바꾸고 지난해는 버린다', () => {
    const cache = { dates: { '2025-12-25': '성탄절', '2026-10-02': '임시공휴일', '2027-01-01': '신정' }, fetched: { 2025: 1 } };
    expect(mergeYear(cache, 2026, { '2026-12-25': '성탄절' }, 5, nov)).toEqual({
      dates: { '2027-01-01': '신정', '2026-12-25': '성탄절' },
      fetched: { 2026: 5 },
      failed: {},
    });
  });
});
