// 아맞다 — 공휴일 목록 (한국천문연구원 특일 정보, 공공데이터포털)
//
// 1년치를 한 번에 받아 기기에 둔다 (store.holidays). 인터넷이 없어도 받아 둔 목록으로 동작하고,
// 임시공휴일이 새로 지정될 수 있어 REFRESH_MS마다 다시 받는다. 10월부터는 내년 것도 받는다.
// 키는 기상청과 같은 공공데이터포털 일반 인증키를 쓴다 — 포털에서 이 API의 활용 신청이 따로 필요하다.
// 받지 못하면 목록이 비어 있을 뿐이다: 공휴일을 모르면 평소처럼 나가는 날이다.

import axios from 'axios';

const HOLIDAY_API_KEY =
  process.env.EXPO_PUBLIC_HOLIDAY_API_KEY || process.env.EXPO_PUBLIC_KMA_API_KEY || '';
const BASE_URL = 'https://apis.data.go.kr/B090041/openapi/service/SpcdeInfoService/getRestDeInfo';

export const HOLIDAY_REFRESH_MS = 30 * 24 * 60 * 60 * 1000;
// 실패한 해는 이만큼 뒤에 다시 시도한다 (앱을 켤 때마다 두드리지 않게).
export const HOLIDAY_RETRY_MS = 12 * 60 * 60 * 1000;

export interface HolidayCache {
  dates: Record<string, string>;            // "YYYY-MM-DD" → 이름
  fetched: Record<string, number>;          // 해 → 마지막으로 받은 시각(ms)
  failed?: Record<string, number>;          // 해 → 마지막으로 실패한 시각(ms)
}

export const EMPTY_HOLIDAY_CACHE: HolidayCache = { dates: {}, fetched: {} };

// API 이름을 화면에 쓰기 좋게 — 공식 이름은 그대로 두고 낯선 것만 바꾼다.
const DISPLAY_NAMES: Record<string, string> = {
  '기독탄신일': '성탄절',
  '1월1일': '신정',
};

// '대체공휴일(삼일절)' → '삼일절 대체공휴일' ("내일은 삼일절 대체공휴일이에요")
function displayName(name: string): string {
  const sub = /^대체공휴일\((.+)\)$/.exec(name);
  if (sub) return `${DISPLAY_NAMES[sub[1]] ?? sub[1]} 대체공휴일`;
  return DISPLAY_NAMES[name] ?? name;
}

interface RawItem {
  dateName?: string;
  isHoliday?: string;
  locdate?: number | string;
}

// 응답 → { "YYYY-MM-DD": 이름 }. item이 하나면 배열이 아니고, 없으면 items가 빈 문자열이다.
export function parseHolidayResponse(data: unknown): Record<string, string> {
  const body = (data as { response?: { header?: { resultCode?: string }; body?: { items?: unknown } } })?.response;
  if (body?.header?.resultCode !== '00') throw new Error('holiday api error');
  const items = body?.body?.items as { item?: RawItem | RawItem[] } | '' | undefined;
  const raw = items && typeof items === 'object' ? items.item : undefined;
  const list = raw === undefined ? [] : Array.isArray(raw) ? raw : [raw];
  const out: Record<string, string> = {};
  for (const it of list) {
    if (it.isHoliday !== 'Y' || it.locdate === undefined) continue;
    const s = String(it.locdate);
    if (!/^\d{8}$/.test(s)) continue;
    const name = (it.dateName ?? '').trim() || '공휴일';
    out[`${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`] = displayName(name);
  }
  return out;
}

// 지금 받아야 하는 해들 — 올해, 그리고 10월부터는 내년.
export function yearsToFetch(cache: HolidayCache, now: Date): number[] {
  const years = [now.getFullYear()];
  if (now.getMonth() >= 9) years.push(now.getFullYear() + 1);
  const t = now.getTime();
  return years.filter((y) => {
    const failedAt = cache.failed?.[y];
    if (failedAt !== undefined && t - failedAt < HOLIDAY_RETRY_MS) return false;
    const fetchedAt = cache.fetched[y];
    return fetchedAt === undefined || t - fetchedAt >= HOLIDAY_REFRESH_MS;
  });
}

// 받은 해의 목록으로 그 해 것을 통째로 바꾼다 — 취소된 임시공휴일이 남지 않게. 지난해 것은 버린다.
export function mergeYear(cache: HolidayCache, year: number, dates: Record<string, string>, at: number, now: Date): HolidayCache {
  const prefix = `${year}-`;
  const keepFrom = `${now.getFullYear()}-`;
  const kept = Object.fromEntries(
    Object.entries(cache.dates).filter(([d]) => !d.startsWith(prefix) && d >= keepFrom)
  );
  const fetched = Object.fromEntries(Object.entries(cache.fetched).filter(([y]) => Number(y) >= now.getFullYear()));
  const failed = { ...(cache.failed ?? {}) };
  delete failed[year];
  return { dates: { ...kept, ...dates }, fetched: { ...fetched, [year]: at }, failed };
}

async function fetchYear(year: number): Promise<Record<string, string>> {
  const response = await axios.get(BASE_URL, {
    params: { serviceKey: HOLIDAY_API_KEY, solYear: year, numOfRows: 100, pageNo: 1, _type: 'json' },
    timeout: 8000,
  });
  return parseHolidayResponse(response.data);
}

let running: Promise<void> | null = null;

export const HolidayService = {
  // 필요한 해만 받아 store에 넣는다. 실패는 조용히 넘긴다 (다음 기회에 다시).
  refresh(): Promise<void> {
    if (!HOLIDAY_API_KEY) return Promise.resolve();
    if (running) return running;
    running = (async () => {
      const { useAppStore, whenHydrated } = await import('@/store');
      await whenHydrated();
      const now = new Date();
      for (const year of yearsToFetch(useAppStore.getState().holidays, now)) {
        try {
          const dates = await fetchYear(year);
          useAppStore.getState().setHolidays(mergeYear(useAppStore.getState().holidays, year, dates, Date.now(), now));
        } catch {
          const cache = useAppStore.getState().holidays;
          useAppStore.getState().setHolidays({ ...cache, failed: { ...(cache.failed ?? {}), [year]: Date.now() } });
        }
      }
    })().finally(() => { running = null; });
    return running;
  },
};
