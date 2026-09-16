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
