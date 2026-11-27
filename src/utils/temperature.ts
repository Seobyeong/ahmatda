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

function humidityAdjust(humidity: number): number {
  if (humidity > 80) return 2;
  if (humidity > 70) return 1;
  if (humidity < 30) return -1;
  return 0;
}

function windAdjust(wind: number): number {
  if (wind > 10) return -4;
  if (wind > 5) return -2;
  if (wind > 3) return -1;
  return 0;
}

// 체감온도 계산
// T_perceived = actual + 습도보정 + 바람보정 + deltaOffset
export function calcPerceivedTemp(
  actual: number,
  humidity: number,
  wind: number,
  deltaOffset: number
): number {
  return Math.round(actual + humidityAdjust(humidity) + windAdjust(wind) + deltaOffset);
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

// 체감온도가 왜 그렇게 나왔는지 문장으로 (2026-11-28 — 화면에 계산식 대신). 계산식은 진단 화면에.
// 실제 기온은 반올림해 하나만 쓴다 (7°C와 6.9°C를 같이 쓰면 헷갈린다). 보정이 모두 정수라
// 반올림한 기온에 보정을 더한 값이 체감온도와 같다.
export function explainPerceived(
  actual: number,
  humidity: number,
  wind: number,
  deltaOffset: number,
  exposureAdj: number = 0
): string[] {
  const deg = (n: number) => `${Math.abs(n)}°`;
  const lines = [`실제 기온은 ${Math.round(actual)}°C예요.`];
  const w = windAdjust(wind);
  if (w < 0) lines.push(`바람이 ${w <= -4 ? '세게 ' : ''}불어서 ${deg(w)} 더 춥게 느껴져요.`);
  const h = humidityAdjust(humidity);
  if (h > 0) lines.push(`습해서 ${deg(h)} 더 덥게 느껴져요.`);
  if (h < 0) lines.push(`건조해서 ${deg(h)} 더 서늘하게 느껴져요.`);
  const d = Math.round(deltaOffset);
  if (d < 0) lines.push(`추위를 타는 편이라 ${deg(d)} 낮춰 잡았어요.`);
  if (d > 0) lines.push(`더위를 타는 편이라 ${deg(d)} 높여 잡았어요.`);
  if (exposureAdj !== 0) lines.push(`걷거나 자전거로 다니면 바깥에 오래 있어서 ${deg(exposureAdj)} 더 ${exposureAdj < 0 ? '춥게' : '덥게'} 잡았어요.`);
  if (lines.length === 1) lines.push('바람·습도 영향이 적어 기온 그대로 느껴질 거예요.');
  return lines;
}
