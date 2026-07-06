import { countRecentForgotten, getForgottenBadge } from './forgotten';
import type { ForgottenRecord } from '@/types';

describe('countRecentForgotten', () => {
  const today = '2026-07-07';

  it('빈 기록이면 빈 맵을 반환한다', () => {
    expect(countRecentForgotten([], today).size).toBe(0);
  });

  it('최근 7일 안의 기록만 집계한다', () => {
    const history: ForgottenRecord[] = [
      { date: '2026-07-07', labels: ['우산'] },        // 오늘 (포함)
      { date: '2026-07-01', labels: ['우산'] },        // 6일 전 (포함)
      { date: '2026-06-30', labels: ['우산'] },        // 7일 전 (제외)
      { date: '2026-06-01', labels: ['우산'] },        // 한참 전 (제외)
    ];
    expect(countRecentForgotten(history, today).get('우산')).toBe(2);
  });

  it('미래 날짜 기록은 무시한다', () => {
    const history: ForgottenRecord[] = [{ date: '2026-07-08', labels: ['지갑'] }];
    expect(countRecentForgotten(history, today).has('지갑')).toBe(false);
  });

  it('같은 날 여러 라벨, 여러 날 같은 라벨을 각각 집계한다', () => {
    const history: ForgottenRecord[] = [
      { date: '2026-07-06', labels: ['우산', '지갑'] },
      { date: '2026-07-05', labels: ['우산'] },
      { date: '2026-07-04', labels: ['우산', '에어팟'] },
    ];
    const counts = countRecentForgotten(history, today);
    expect(counts.get('우산')).toBe(3);
    expect(counts.get('지갑')).toBe(1);
    expect(counts.get('에어팟')).toBe(1);
  });

  it('windowDays를 줄이면 집계 범위도 줄어든다', () => {
    const history: ForgottenRecord[] = [
      { date: '2026-07-07', labels: ['우산'] },
      { date: '2026-07-05', labels: ['우산'] },
    ];
    expect(countRecentForgotten(history, today, 2).get('우산')).toBe(1);
  });

  it('월 경계를 넘는 날짜 차이도 정확히 계산한다', () => {
    const history: ForgottenRecord[] = [{ date: '2026-06-30', labels: ['열쇠'] }];
    // 6/30은 7/7 기준 7일 전이라 7일 창(0~6일 전)에서 제외
    expect(countRecentForgotten(history, '2026-07-07').has('열쇠')).toBe(false);
    // 7/6 기준으로는 6일 전이라 포함
    expect(countRecentForgotten(history, '2026-07-06').get('열쇠')).toBe(1);
  });
});

describe('getForgottenBadge', () => {
  it('2회 미만이면 null', () => {
    expect(getForgottenBadge(undefined)).toBeNull();
    expect(getForgottenBadge(0)).toBeNull();
    expect(getForgottenBadge(1)).toBeNull();
  });

  it('2회 이상이면 횟수를 포함한 문구', () => {
    expect(getForgottenBadge(2)).toBe('이번 주 2번 놓침');
    expect(getForgottenBadge(5)).toBe('이번 주 5번 놓침');
  });
});
