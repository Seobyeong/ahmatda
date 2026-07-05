// 체감온도 계산
// T_perceived = actual + 습도보정 + 바람보정 + deltaOffset
export function calcPerceivedTemp(
  actual: number,
  humidity: number,
  wind: number,
  deltaOffset: number
): number {
  let humidityAdj = 0;
  if (humidity > 80) humidityAdj = 2;
  else if (humidity > 70) humidityAdj = 1;
  else if (humidity < 30) humidityAdj = -1;

  let windAdj = 0;
  if (wind > 10) windAdj = -4;
  else if (wind > 5) windAdj = -2;
  else if (wind > 3) windAdj = -1;

  return Math.round(actual + humidityAdj + windAdj + deltaOffset);
}

// 온도 포맷
export function formatTemp(value: number): string {
  return `${value}°C`;
}

// 체감온도 수식 문자열 (UI 표시용)
export function formatPerceivedFormula(
  actual: number,
  humidity: number,
  wind: number,
  deltaOffset: number,
  result: number
): string {
  return `${actual}° + f(H:${humidity}%, W:${wind}m/s) + Δt(${deltaOffset >= 0 ? '+' : ''}${deltaOffset}°) ≒ ${result}°C`;
}
