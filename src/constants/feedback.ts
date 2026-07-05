import { FeedbackType } from '@/types';

export const FEEDBACK_DELTA: Record<FeedbackType, number> = {
  cold: -1,
  good:  0,
  hot:  +1,
};

export const SENSITIVITY_DELTA: Record<1|2|3|4|5, number> = {
  1: -2,
  2: -1,
  3:  0,
  4: +1,
  5: +2,
};

export const SENSITIVITY_LABELS: Record<1 | 2 | 3 | 4 | 5, string> = {
  1: '매우 추위 탐',
  2: '추위 탐',
  3: '보통',
  4: '더위 탐',
  5: '매우 더위 탐',
};

export const FEEDBACK_MESSAGES: Record<FeedbackType, string> = {
  cold: '🧤 Δt -1°C 조정 — 내일은 더 따뜻하게 추천할게요.',
  good: '😊 완벽한 착장! 보정치 유지할게요.',
  hot:  '😅 Δt +1°C 조정 — 내일은 더 가볍게 추천할게요.',
};
