// 아맞다 — 자기 전 정리 알림을 보낼지, 착장 피드백을 붙일지 (docs/외출-감지-재설계.md 5장) — 순수 규칙
//
// 2026-11-04 사용자 결정:
//   · 외출 안 한 날: 착장 피드백은 빼고, 다음 외출에 미리 확인할 게 있을 때만 "챙길 것" 알림을 보낸다.
//   · 외출 여부를 모르는 날(앱이 꺼져 있었음, 집 Wi-Fi 미등록 등): 외출한 것으로 본다 — 잘못 건너뛰어
//     착장 학습을 놓치는 것보다 낫다.
//   · 처음 14일 뒤(알림 성향 "필요할 때만"·"보통"): 물어볼 게 있는 날만 — 다음 외출이 평소와 다르거나
//     (비·폭염 예보, 일정 준비물, 그날만 항목) 착장 기준을 아직 맞추는 중(최근 피드백 3번 중 추웠음/더웠음).
//     "자주"는 계속 매일.

import type { AlertPreference, FeedbackType } from '@/types';
import type { PreviewItem } from '@/utils/tomorrowPreview';

export const FIRST_DAILY_DAYS = 14;
export const RECENT_FEEDBACK_COUNT = 3;
// 집에 있었다고 말하려면 관찰 사이가 이보다 벌어지면 안 된다 (백그라운드 확인은 15분~1시간 간격).
export const HOME_OBSERVATION_GAP_MS = 2 * 60 * 60 * 1000;

export type OutingStatus = 'out' | 'home' | 'unknown';
export type NightlyVariant = 'full' | 'preview' | 'skip';

// 그날 외출했는지.
//   out     — 그날 외출 흔적이 있다 (외출 확정, 집 반경 이탈, 집 밖에서 머묾, 집 Wi-Fi 밖)
//   home    — 흔적이 없고, 출발 감시 창 시작부터 지금까지 집 Wi-Fi가 2시간 넘는 빈틈 없이 관찰됐다
//   unknown — 그 밖 (관찰이 비었으면 그 사이 나갔을 수 있다)
export function classifyOuting(input: {
  date: string;             // 판단할 날 "YYYY-MM-DD"
  outDates: string[];       // 외출 흔적이 있던 날들
  homeObservations: number[]; // 집 Wi-Fi에 붙어 있던 걸 본 시각들 (epoch ms)
  from: number;             // 관찰이 시작돼야 하는 시각 (그날 출발 감시 창 시작)
  until: number;            // 판단 시각 (보통 지금)
}): OutingStatus {
  if (input.outDates.includes(input.date)) return 'out';
  if (input.until <= input.from) return 'unknown';
  const obs = input.homeObservations
    .filter((t) => t >= input.from - HOME_OBSERVATION_GAP_MS && t <= input.until)
    .sort((a, b) => a - b);
  if (obs.length === 0) return 'unknown';
  let prev = input.from;
  for (const t of obs) {
    if (t - prev > HOME_OBSERVATION_GAP_MS) return 'unknown';
    prev = Math.max(prev, t);
  }
  return input.until - prev > HOME_OBSERVATION_GAP_MS ? 'unknown' : 'home';
}

// 다음 외출이 평소(매일 루틴뿐)와 다른지. null = 알 수 없음(예보·일정을 못 가져옴).
export function nextOutingDiffers(items: PreviewItem[] | null): boolean | null {
  if (items === null) return null;
  return items.some((i) => i.kind === 'weather' || i.kind === 'purpose' || i.kind === 'oneoff');
}

// 착장 기준을 아직 맞추는 중인지 — 최근 피드백에 "추웠음/더웠음"이 있으면 학습이 아직 움직인다.
export function stillLearning(recentFeedback: FeedbackType[]): boolean {
  return recentFeedback.slice(-RECENT_FEEDBACK_COUNT).some((v) => v !== 'good');
}

export function decideNightly(input: {
  outing: OutingStatus;
  differs: boolean | null;
  recentFeedback: FeedbackType[];
  daysSinceOnboarding: number;
  alertPreference: AlertPreference;
}): NightlyVariant {
  // 모르면 "다르다"로 본다 — 예보를 못 가져왔다고 알림을 건너뛰지 않는다.
  const differs = input.differs ?? true;

  if (input.outing === 'home') return differs ? 'preview' : 'skip';

  const everyDay = input.alertPreference === 'frequent' || input.daysSinceOnboarding < FIRST_DAILY_DAYS;
  if (everyDay) return 'full';
  return differs || stillLearning(input.recentFeedback) ? 'full' : 'skip';
}

// 알림 본문에 붙일 "다음 외출에 달라지는 것" 한 줄 — 이유가 있는 항목 두 개까지
export function previewHighlight(items: PreviewItem[] | null): string | null {
  if (!items) return null;
  const notable = items.filter((i) => i.kind !== 'routine');
  if (notable.length === 0) return null;
  const shown = notable.slice(0, 2).map((i) => (i.reason ? `${i.label}(${i.reason})` : i.label));
  const more = notable.length > 2 ? ` 외 ${notable.length - 2}개` : '';
  return shown.join(', ') + more;
}
