import { isWithinKorea, latLonToGrid } from './kmaGrid';

describe('latLonToGrid', () => {
  // 널리 알려진 기상청 격자 변환 기준점(서울/부산/제주)으로 회귀 테스트한다.
  it('서울시청 좌표를 nx=60, ny=127로 변환한다', () => {
    expect(latLonToGrid(37.5665, 126.978)).toEqual({ nx: 60, ny: 127 });
  });

  it('부산시청 좌표를 nx=98, ny=76으로 변환한다', () => {
    expect(latLonToGrid(35.1796, 129.0756)).toEqual({ nx: 98, ny: 76 });
  });

  it('제주도청 좌표를 nx=53, ny=38로 변환한다', () => {
    expect(latLonToGrid(33.4996, 126.5312)).toEqual({ nx: 53, ny: 38 });
  });
});

describe('isWithinKorea', () => {
  it('국내 좌표는 true를 반환한다', () => {
    expect(isWithinKorea(37.5665, 126.978)).toBe(true); // 서울
    expect(isWithinKorea(33.4996, 126.5312)).toBe(true); // 제주
  });

  it('명백한 해외 좌표는 false를 반환한다', () => {
    expect(isWithinKorea(35.6762, 139.6503)).toBe(false); // 도쿄
    expect(isWithinKorea(40.7128, -74.006)).toBe(false); // 뉴욕
  });

  it('경계값은 포함(inclusive)한다', () => {
    expect(isWithinKorea(33.0, 124.5)).toBe(true);
    expect(isWithinKorea(38.7, 131.9)).toBe(true);
  });

  it('경계 바로 바깥은 false를 반환한다', () => {
    expect(isWithinKorea(32.99, 126.978)).toBe(false);
    expect(isWithinKorea(38.71, 126.978)).toBe(false);
  });
});
