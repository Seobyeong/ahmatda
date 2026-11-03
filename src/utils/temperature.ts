import { SENSITIVITY_DELTA } from '@/constants/feedback';
import type { CommuteMode } from '@/types';

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

// 도보·자전거는 바깥에 오래 노출된다 — 추운 날은 더 춥게, 더운 날은 더 덥게 1°C 민다.
// Δt 하나로는 양쪽을 같이 표현할 수 없어서(Δt는 한 방향 이동) 따로 둔다.
// 쾌적 구간(18~26°C)에서는 건드리지 않는다.
export const EXPOSURE_COMFORT_LOW = 18;
export const EXPOSURE_COMFORT_HIGH = 26;

export function getExposureAdjust(perceived: number, commuteMode: CommuteMode | null): number {
  if (commuteMode !== 'walk') return 0;
  if (perceived < EXPOSURE_COMFORT_LOW) return -1;
  if (perceived > EXPOSURE_COMFORT_HIGH) return 1;
  return 0;
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
  result: number,
  exposureAdj: number = 0
): string {
  const exposure = exposureAdj !== 0 ? ` + 도보(${exposureAdj > 0 ? '+' : ''}${exposureAdj}°)` : '';
  return `${actual}° + f(H:${humidity}%, W:${wind}m/s) + Δt(${deltaOffset >= 0 ? '+' : ''}${deltaOffset}°)${exposure} ≒ ${result}°C`;
}
