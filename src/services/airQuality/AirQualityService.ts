import axios from 'axios';
import type { CurrentWeather } from '@/types';

// 한국환경공단 에어코리아는 기상청과 별개 기관 API라 서비스키를 따로 신청해야 할 수 있다.
// data.go.kr 계정 하나로 여러 API를 신청하면 보통 같은 디코딩 키를 재사용하므로,
// 전용 키가 없으면 기상청 키를 그대로 시도해본다.
const AIRKOREA_API_KEY =
  process.env.EXPO_PUBLIC_AIRKOREA_API_KEY ?? process.env.EXPO_PUBLIC_KMA_API_KEY ?? '';
const AIRKOREA_BASE_URL = 'https://apis.data.go.kr/B552584/ArpltnInforInqireSvc';

type DustLevel = CurrentWeather['dustLevel'];

interface AirKoreaItem {
  stationName?: string;
  pm10Grade?: string;
  pm25Grade?: string;
}

const GRADE_LABEL: Record<string, DustLevel> = {
  '1': '좋음',
  '2': '보통',
  '3': '나쁨',
  '4': '매우나쁨',
};

function toGradeNumber(grade: string | undefined): number {
  const n = Number(grade);
  return Number.isFinite(n) ? n : 0;
}

// PM10/PM2.5 등급 중 더 나쁜 쪽을 대표값으로 사용
function worseGrade(a: string | undefined, b: string | undefined): string | undefined {
  const av = toGradeNumber(a);
  const bv = toGradeNumber(b);
  if (av === 0 && bv === 0) return undefined;
  return av >= bv ? a : b;
}

export const AirQualityService = {
  // 시도 내 측정소의 미세먼지 등급 조회 (PM10/PM2.5 중 더 나쁜 등급 사용)
  // stationName을 지정하면 해당 측정소를, 없거나 못 찾으면 시도 내 첫 측정소를 사용한다.
  // 서비스키 미설정, 측정소 미발견, API 실패 시 모두 '보통'으로 안전하게 폴백
  async getDustLevel(sidoName: string, stationName?: string): Promise<DustLevel> {
    if (!AIRKOREA_API_KEY) return '보통';

    try {
      const response = await axios.get(`${AIRKOREA_BASE_URL}/getCtprvnRltmMesureDnsty`, {
        params: {
          serviceKey: AIRKOREA_API_KEY,
          returnType: 'json',
          numOfRows: 100,
          pageNo: 1,
          sidoName,
          ver: '1.3',
        },
        timeout: 5000,
      });

      const header = response.data?.response?.header;
      if (header?.resultCode !== '00') {
        throw new Error(header?.resultMsg ?? 'AirKorea API error');
      }

      // 이 API는 items를 배열로 바로 내려주는 경우가 많지만, 방어적으로 item 래핑도 함께 처리
      const rawItems = response.data?.response?.body?.items;
      const items: AirKoreaItem[] = Array.isArray(rawItems) ? rawItems : rawItems?.item ?? [];

      const station = stationName
        ? items.find((item) => item.stationName === stationName) ?? items[0]
        : items[0];
      if (!station) return '보통';

      const grade = worseGrade(station.pm10Grade, station.pm25Grade);
      return (grade ? GRADE_LABEL[grade] : undefined) ?? '보통';
    } catch {
      return '보통';
    }
  },
};
