// 좌표 → 시도명 근사 매핑 (에어코리아 미세먼지 API의 sidoName 파라미터용)
// 실제 행정구역 경계가 아닌 대략적인 위경도 사각 범위 기반 근사치라 경계 지역에서는
// 부정확할 수 있다. 정확한 시군구 판별에는 역지오코딩 + 주소 파싱이 필요하지만,
// 이 값은 "더 나쁜 등급의 측정소를 찾기 위한 시도 단위 필터" 용도라 근사치로 충분하다.

interface SidoBox {
  sido: string;
  latMin: number;
  latMax: number;
  lonMin: number;
  lonMax: number;
}

// 겹치는 영역은 배열 순서상 먼저 오는 항목이 우선한다 — 면적이 작은 지역을 먼저 배치.
const SIDO_BOXES: SidoBox[] = [
  { sido: '세종', latMin: 36.4, latMax: 36.7, lonMin: 127.15, lonMax: 127.4 },
  { sido: '대전', latMin: 36.2, latMax: 36.5, lonMin: 127.2, lonMax: 127.5 },
  { sido: '서울', latMin: 37.42, latMax: 37.7, lonMin: 126.76, lonMax: 127.18 },
  { sido: '인천', latMin: 37.2, latMax: 37.75, lonMin: 126.38, lonMax: 126.8 },
  { sido: '광주', latMin: 35.05, latMax: 35.25, lonMin: 126.7, lonMax: 126.95 },
  { sido: '대구', latMin: 35.7, latMax: 36.0, lonMin: 128.4, lonMax: 128.75 },
  { sido: '울산', latMin: 35.4, latMax: 35.7, lonMin: 129.1, lonMax: 129.5 },
  { sido: '부산', latMin: 34.9, latMax: 35.35, lonMin: 128.8, lonMax: 129.3 },
  { sido: '제주', latMin: 33.1, latMax: 33.6, lonMin: 126.1, lonMax: 126.99 },
  { sido: '경기', latMin: 36.9, latMax: 38.3, lonMin: 126.5, lonMax: 127.9 },
  { sido: '강원', latMin: 37.0, latMax: 38.6, lonMin: 127.5, lonMax: 129.4 },
  { sido: '충북', latMin: 36.0, latMax: 37.2, lonMin: 127.3, lonMax: 128.7 },
  { sido: '충남', latMin: 35.9, latMax: 37.0, lonMin: 126.1, lonMax: 127.5 },
  { sido: '전북', latMin: 35.4, latMax: 36.2, lonMin: 126.4, lonMax: 127.9 },
  { sido: '전남', latMin: 33.9, latMax: 35.5, lonMin: 125.0, lonMax: 127.6 },
  { sido: '경북', latMin: 35.6, latMax: 37.6, lonMin: 128.0, lonMax: 129.6 },
  { sido: '경남', latMin: 34.7, latMax: 35.9, lonMin: 127.6, lonMax: 129.3 },
];

const DEFAULT_SIDO = '서울';

export function getSidoFromCoords(lat: number, lon: number): string {
  const match = SIDO_BOXES.find(
    (box) => lat >= box.latMin && lat <= box.latMax && lon >= box.lonMin && lon <= box.lonMax
  );
  return match?.sido ?? DEFAULT_SIDO;
}
