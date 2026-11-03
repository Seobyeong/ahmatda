// 첫 사용 설문 선택지 (docs/외출-감지-재설계.md 6장) — 온보딩과 설정 화면이 같이 쓴다.
// 설명 문구는 지금 실제로 하는 일만 말한다. 아직 없는 기능은 "(준비 중)"으로 표시한다.

import type { AlertPreference, CommuteMode } from '@/types';

export interface Choice<T extends string> {
  value: T;
  label: string;
  description: string;
}

export const ALERT_PREFERENCE_CHOICES: Choice<AlertPreference>[] = [
  { value: 'minimal',  label: '필요할 때만', description: '출발 전 알림 없이, 안 챙기고 나갈 때와 자기 전에만 알려요' },
  { value: 'normal',   label: '보통',        description: '출발 30분 전, 안 챙기고 나갈 때, 자기 전에 알려요' },
  { value: 'frequent', label: '자주',        description: '보통에 더해 집 밖에서 머물다 떠날 때도 알려요 (준비 중)' },
];

export const COMMUTE_CHOICES: Choice<CommuteMode>[] = [
  { value: 'transit', label: '대중교통',    description: '기본 기준으로 챙겨요' },
  { value: 'walk',    label: '도보·자전거', description: '바깥에 오래 있으니 추위·더위를 1°C 더 크게 봐요' },
  { value: 'car',     label: '자차',        description: '우산은 예보가 아니라 지금 비가 올 때만 챙겨요' },
];
