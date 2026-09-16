import { SENSITIVITY_DELTA } from '@/constants/feedback';

// 실제 적용되는 체감온도 보정치 Δt.
// 사용자가 직접 고른 기준값(민감도)과 일일 피드백으로 쌓인 학습값을 합산한다.
// 둘을 한 필드에 섞어두면 민감도를 다시 고를 때 학습값이 사라지므로 분리해서 보관하고,
// 쓰는 쪽에서 이 함수로 합친다.
export function getEffectiveDelta(
  sensitivityLevel: 1 | 2 | 3 | 4 | 5,
  learnedDelta: number
): number {
  return SENSITIVITY_DELTA[sensitivityLevel] + learnedDelta;
}

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
