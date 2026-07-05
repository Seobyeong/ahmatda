import { getSidoFromCoords } from './sido';

describe('getSidoFromCoords', () => {
  it('주요 도시 좌표를 올바른 시도로 매핑한다', () => {
    expect(getSidoFromCoords(37.5665, 126.978)).toBe('서울'); // 서울시청
    expect(getSidoFromCoords(35.1796, 129.0756)).toBe('부산'); // 부산시청
    expect(getSidoFromCoords(33.4996, 126.5312)).toBe('제주'); // 제주도청
  });

  it('어떤 사각 범위에도 안 걸리면 기본값(서울)을 반환한다', () => {
    expect(getSidoFromCoords(0, 0)).toBe('서울');
  });

  it('여러 시도 범위가 겹치면 배열에서 먼저 오는 항목이 우선한다', () => {
    // (36.5, 127.35)는 세종(latMin 36.4~36.7, lonMin 127.15~127.4)과
    // 충북(latMin 36.0~37.2, lonMin 127.3~128.7) 범위에 모두 걸치는 지점.
    // SIDO_BOXES 배열에서 세종이 충북보다 먼저 오므로 세종이 반환돼야 한다.
    expect(getSidoFromCoords(36.5, 127.35)).toBe('세종');
  });
});
