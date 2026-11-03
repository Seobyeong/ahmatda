// 아맞다 — 기상청 단기예보 응답에서 날짜를 다루는 순수 로직
//
// 네이티브 의존이 없어야 유닛테스트가 가능해서 WeatherService와 분리했다.
// (store/migrations.ts, services/wifi/presence.ts와 같은 이유·같은 구조)

// "YYYYMMDD" — toISOString()은 UTC 기준이라 자정 근처 KST에서 하루 어긋날 수 있어
// 로컬 값으로 직접 조립한다.
export function formatLocalDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}${m}${day}`;
}

// 타임라인에 쓸 예보 날짜 하나를 고른다.
//
// 단기예보는 최대 +3일치를 한 번에 돌려준다. fcstTime("1200")만으로 맵을 만들면
// 오늘·내일·모레의 같은 시각이 서로를 덮어써서 "오늘 시간대별 날씨" 자리에 다른 날
// 값이 뜬다. 그래서 한 날짜만 골라 쓴다.
//
// 오늘 것이 있으면 오늘, 없으면 가장 이른 날짜. 23시 발표분은 예보가 다음 날
// 00시부터 시작해 오늘 항목이 아예 없는데, 그 시각엔 5개 슬롯이 모두 지난 뒤라
// 다가오는 날을 보여주는 쪽이 맞다.
//
// 응답에 fcstDate가 없으면(예상 밖 스키마) undefined를 돌려줘 기존처럼 전부 통과시킨다.
export function pickForecastDate(
  items: Array<{ fcstDate?: string }>,
  now: Date
): string | undefined {
  const dates = [...new Set(items.map((i) => i.fcstDate).filter((d): d is string => !!d))].sort();
  if (dates.length === 0) return undefined;

  const today = formatLocalDate(now);
  return dates.includes(today) ? today : dates[0];
}

// ── 다음 외출 날의 예보 요약 (자기 전 정리의 "내일 준비", docs/외출-감지-재설계.md 5장) ──

export interface DayOutlook {
  rain: boolean;         // 나가 있는 동안 강수 형태가 잡히거나 강수확률이 RAIN_POP_THRESHOLD 이상
  popMax: number;        // 나가 있는 동안 최대 강수확률(%)
  maxTemp: number | null;
  minTemp: number | null;
  heat: boolean;         // 최고 33°C 이상 — 오늘 체크리스트의 폭염 기준과 같다
}

// 기상청이 "비 올 가능성이 높다"고 안내하는 수준. 30~50%는 매일 우산을 들게 만들어
// 표시 예산을 깬다.
export const RAIN_POP_THRESHOLD = 60;

// 나가 있는 시간은 모른다 — 경로 기억 전에는 출발 시각부터 21시까지로 본다.
// 21시 이후 출발(야간 근무)이면 그날 마지막 예보(23시)까지 본다.
const DEFAULT_RETURN_TIME = '2100';
const LAST_FCST_TIME = '2300';

// date("YYYYMMDD")의 fromHHmm ~ 21시 예보만 본다. 해당 범위 예보가 없으면 null
// (발표 시각에 따라 모레 이후는 응답에 없다).
export function summarizeDayOutlook(
  items: Array<{ category: string; fcstDate?: string; fcstTime?: string; fcstValue?: string }>,
  date: string,
  fromHHmm: string
): DayOutlook | null {
  // 출발 08:15면 08시 예보부터 — 정시 단위라 내림한다.
  const from = `${fromHHmm.slice(0, 2)}00`;
  const to = from > DEFAULT_RETURN_TIME ? LAST_FCST_TIME : DEFAULT_RETURN_TIME;
  const inRange = items.filter(
    (i) => i.fcstDate === date && (i.fcstTime ?? '') >= from && (i.fcstTime ?? '') <= to
  );
  if (inRange.length === 0) return null;

  const values = (cat: string) =>
    inRange.filter((i) => i.category === cat).map((i) => Number(i.fcstValue)).filter((n) => Number.isFinite(n));

  const temps = values('TMP');
  const pops = values('POP');
  const ptys = values('PTY');

  const popMax = pops.length > 0 ? Math.max(...pops) : 0;
  const maxTemp = temps.length > 0 ? Math.max(...temps) : null;
  const minTemp = temps.length > 0 ? Math.min(...temps) : null;

  return {
    rain: ptys.some((p) => p !== 0) || popMax >= RAIN_POP_THRESHOLD,
    popMax,
    maxTemp,
    minTemp,
    heat: maxTemp !== null && maxTemp >= 33,
  };
}

// 오늘 체크리스트의 우산 판단 — 지금 비가 오거나, 아직 안 지난 시간대 예보에 비가 있으면.
// 다음 외출 미리보기(summarizeDayOutlook)와 같은 기준(강수 형태 또는 강수확률 60%)이어야
// 한다. 전날 밤 "우산 — 비 예보 70%"라고 해놓고 아침에 지금 맑다고 빼면 믿고 나간 사람이 젖는다.
export function isRainExpectedToday(
  rainingNow: boolean,
  slots: Array<{ rain: number; alert: string | null }>,
  currentSlotIndex: number
): boolean {
  if (rainingNow) return true;
  return slots.slice(currentSlotIndex).some((s) => s.alert === 'rain' || s.rain >= RAIN_POP_THRESHOLD);
}

// 이동수단별 우산 규칙 — 아침 체크리스트와 다음 외출 미리보기가 같이 쓴다.
// 자차는 예보만으로는 우산을 넣지 않는다 (지금 비가 올 때만, 주차장~입구 구간).
export function usesRainForecast(commuteMode: string | null): boolean {
  return commuteMode !== 'car';
}

// 오늘 체크리스트 우산의 이유 문구. null이면 넣지 않는다.
export function getUmbrellaBadge(
  commuteMode: string | null,
  rainingNow: boolean,
  slots: Array<{ rain: number; alert: string | null }>,
  currentSlotIndex: number
): string | null {
  if (rainingNow) return '지금 비 와요';
  if (!usesRainForecast(commuteMode)) return null;
  return isRainExpectedToday(false, slots, currentSlotIndex) ? '오늘 비 예보' : null;
}
