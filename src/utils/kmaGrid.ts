// 기상청 격자(nx, ny) 변환 — Lambert Conformal Conic 투영
// 기상청 단기예보 API가 요구하는 좌표계이며, 위경도를 그대로 보내면 요청이 거부된다.

const RE = 6371.00877; // 지구 반경(km)
const GRID = 5.0;      // 격자 간격(km)
const SLAT1 = 30.0;    // 투영 위도1(deg)
const SLAT2 = 60.0;    // 투영 위도2(deg)
const OLON = 126.0;    // 기준점 경도(deg)
const OLAT = 38.0;     // 기준점 위도(deg)
const XO = 43;         // 기준점 X좌표(GRID)
const YO = 136;        // 기준점 Y좌표(GRID)

const DEGRAD = Math.PI / 180.0;

// 위경도를 기상청 격자 좌표(nx, ny)로 변환
export function latLonToGrid(lat: number, lon: number): { nx: number; ny: number } {
  const re = RE / GRID;
  const slat1 = SLAT1 * DEGRAD;
  const slat2 = SLAT2 * DEGRAD;
  const olon = OLON * DEGRAD;
  const olat = OLAT * DEGRAD;

  let sn = Math.tan(Math.PI * 0.25 + slat2 * 0.5) / Math.tan(Math.PI * 0.25 + slat1 * 0.5);
  sn = Math.log(Math.cos(slat1) / Math.cos(slat2)) / Math.log(sn);

  let sf = Math.tan(Math.PI * 0.25 + slat1 * 0.5);
  sf = (Math.pow(sf, sn) * Math.cos(slat1)) / sn;

  let ro = Math.tan(Math.PI * 0.25 + olat * 0.5);
  ro = (re * sf) / Math.pow(ro, sn);

  let ra = Math.tan(Math.PI * 0.25 + (lat * DEGRAD) * 0.5);
  ra = (re * sf) / Math.pow(ra, sn);

  let theta = lon * DEGRAD - olon;
  if (theta > Math.PI) theta -= 2.0 * Math.PI;
  if (theta < -Math.PI) theta += 2.0 * Math.PI;
  theta *= sn;

  const nx = Math.floor(ra * Math.sin(theta) + XO + 0.5);
  const ny = Math.floor(ro - ra * Math.cos(theta) + YO + 0.5);

  return { nx, ny };
}

// 기상청 API는 국내 전용이라, 격자 좌표 자체는 계산되지만 응답은 항상 실패하거나
// 무의미한 값이 된다. 정확한 국경 판정이 아니라 "명백히 해외"인 경우만 걸러내는
// 대략적인 사각 범위(제주 포함, 독도 등 부속 도서 포함해 여유 있게 잡음).
const KOREA_LAT_MIN = 33.0;
const KOREA_LAT_MAX = 38.7;
const KOREA_LON_MIN = 124.5;
const KOREA_LON_MAX = 131.9;

export function isWithinKorea(lat: number, lon: number): boolean {
  return (
    lat >= KOREA_LAT_MIN && lat <= KOREA_LAT_MAX &&
    lon >= KOREA_LON_MIN && lon <= KOREA_LON_MAX
  );
}
