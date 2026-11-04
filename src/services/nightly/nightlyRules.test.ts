import { classifyOuting, decideNightly, nextOutingDiffers, previewHighlight, stillLearning } from './nightlyRules';
import type { PreviewItem } from '@/utils/tomorrowPreview';

const H = 60 * 60 * 1000;
const FROM = new Date(2026, 10, 4, 7, 45).getTime(); // 11/04 출발 감시 창 시작
const DATE = '2026-11-04';

describe('classifyOuting', () => {
  const base = { date: DATE, outDates: [] as string[], from: FROM };

  it('그날 외출 흔적이 있으면 out', () => {
    expect(classifyOuting({ ...base, outDates: [DATE], homeObservations: [], until: FROM + 14 * H })).toBe('out');
  });

  it('창 시작부터 지금까지 2시간 넘는 빈틈 없이 집이면 home', () => {
    const obs = Array.from({ length: 15 }, (_, i) => FROM + i * H);
    expect(classifyOuting({ ...base, homeObservations: obs, until: FROM + 14 * H + 30 * 60 * 1000 })).toBe('home');
  });

  it('관찰 사이 빈틈이 2시간 넘으면 unknown (그 사이 나갔을 수 있다)', () => {
    const obs = [FROM, FROM + H, FROM + 5 * H, FROM + 6 * H];
    expect(classifyOuting({ ...base, homeObservations: obs, until: FROM + 6.5 * H })).toBe('unknown');
  });

  it('마지막 관찰이 2시간 넘게 지났으면 unknown', () => {
    const obs = [FROM, FROM + H, FROM + 2 * H];
    expect(classifyOuting({ ...base, homeObservations: obs, until: FROM + 5 * H })).toBe('unknown');
  });

  it('관찰이 없으면 unknown (집 Wi-Fi 미등록, 앱이 꺼져 있었음)', () => {
    expect(classifyOuting({ ...base, homeObservations: [], until: FROM + 14 * H })).toBe('unknown');
  });

  it('창 시작 직전 관찰도 출발 시점 집에 있던 근거로 쓴다', () => {
    const obs = [FROM - 30 * 60 * 1000, FROM + 1.5 * H, FROM + 3 * H];
    expect(classifyOuting({ ...base, homeObservations: obs, until: FROM + 3.5 * H })).toBe('home');
  });

  it('다른 날 외출 흔적은 상관없다', () => {
    expect(classifyOuting({ ...base, outDates: ['2026-11-03'], homeObservations: [], until: FROM + H })).toBe('unknown');
  });
});

const item = (label: string, kind: PreviewItem['kind'], reason: string | null = null): PreviewItem => ({ label, kind, reason });

describe('nextOutingDiffers', () => {
  it('매일 루틴뿐이면 false', () => {
    expect(nextOutingDiffers([item('지갑', 'routine')])).toBe(false);
  });
  it.each(['weather', 'purpose', 'oneoff'] as const)('%s 항목이 있으면 true', (kind) => {
    expect(nextOutingDiffers([item('x', kind)])).toBe(true);
  });
  it('모르면 null', () => expect(nextOutingDiffers(null)).toBeNull());
});

describe('stillLearning', () => {
  it('최근 3번이 다 적당함이면 false', () => expect(stillLearning(['cold', 'good', 'good', 'good'])).toBe(false));
  it('최근 3번에 추웠음/더웠음이 있으면 true', () => expect(stillLearning(['good', 'hot', 'good'])).toBe(true));
  it('피드백이 없으면 false', () => expect(stillLearning([])).toBe(false));
});

describe('decideNightly', () => {
  const base = { recentFeedback: ['good', 'good', 'good'] as const, daysSinceOnboarding: 30, alertPreference: 'normal' as const };

  it('외출 안 한 날 + 다음 외출이 다름 → 피드백 없이 챙길 것만', () => {
    expect(decideNightly({ ...base, recentFeedback: [...base.recentFeedback], outing: 'home', differs: true })).toBe('preview');
  });
  it('외출 안 한 날 + 다음 외출이 평소와 같음 → 건너뜀 (처음 14일 안이어도)', () => {
    expect(decideNightly({ ...base, recentFeedback: [], daysSinceOnboarding: 2, outing: 'home', differs: false })).toBe('skip');
  });
  it('처음 14일은 외출한 날 매일 보낸다', () => {
    expect(decideNightly({ ...base, recentFeedback: [], daysSinceOnboarding: 13, outing: 'out', differs: false })).toBe('full');
  });
  it('14일 뒤 + 평소와 같음 + 학습 안정 → 건너뜀', () => {
    expect(decideNightly({ ...base, recentFeedback: [...base.recentFeedback], outing: 'out', differs: false })).toBe('skip');
  });
  it('14일 뒤 + 학습 중 → 보냄', () => {
    expect(decideNightly({ ...base, recentFeedback: ['good', 'cold'], outing: 'out', differs: false })).toBe('full');
  });
  it('14일 뒤 + 다음 외출이 다름 → 보냄', () => {
    expect(decideNightly({ ...base, recentFeedback: [...base.recentFeedback], outing: 'out', differs: true })).toBe('full');
  });
  it('외출 여부를 모르면 외출한 것으로 본다', () => {
    expect(decideNightly({ ...base, recentFeedback: [], daysSinceOnboarding: 1, outing: 'unknown', differs: false })).toBe('full');
  });
  it('"자주"는 14일 뒤에도 매일', () => {
    expect(decideNightly({ ...base, recentFeedback: [...base.recentFeedback], alertPreference: 'frequent', outing: 'out', differs: false })).toBe('full');
  });
  it('예보를 못 가져오면 "다름"으로 본다 — 건너뛰지 않는다', () => {
    expect(decideNightly({ ...base, recentFeedback: [...base.recentFeedback], outing: 'out', differs: null })).toBe('full');
    expect(decideNightly({ ...base, recentFeedback: [], outing: 'home', differs: null })).toBe('preview');
  });
});

describe('previewHighlight', () => {
  it('이유 있는 항목 두 개까지', () => {
    expect(previewHighlight([
      item('지갑', 'routine'), item('우산', 'weather', '비 예보 70%'), item('운동화', 'purpose', "10:00 '헬스' 일정"), item('서류', 'oneoff', '이 날만'),
    ])).toBe("우산(비 예보 70%), 운동화(10:00 '헬스' 일정) 외 1개");
  });
  it('루틴뿐이거나 모르면 null', () => {
    expect(previewHighlight([item('지갑', 'routine')])).toBeNull();
    expect(previewHighlight(null)).toBeNull();
  });
});
