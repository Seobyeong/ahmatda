import { buildDepartureSnapshot, departureAlertContent, STALE_DEPARTURE_DETAIL } from './departureSnapshot';
import type { ChecklistItem, ItemTier } from '@/types';

const item = (label: string, tier: ItemTier, checked = false): ChecklistItem => ({
  id: label,
  label,
  icon: '',
  tier,
  badge: null,
  checked,
  temp: tier === 0,
  permanent: tier === 3,
});

describe('buildDepartureSnapshot', () => {
  it('출발 시각과 날짜를 담는다', () => {
    const s = buildDepartureSnapshot([], '08:15', '2026-10-07');
    expect(s.title).toBe('08:15 출발');
    expect(s.date).toBe('2026-10-07');
  });

  it('날씨 항목을 루틴보다 먼저 보여준다', () => {
    const s = buildDepartureSnapshot(
      [item('집 열쇠', 3), item('노트북', 2), item('우산', 1)],
      '08:15',
      '2026-10-07'
    );
    expect(s.detail).toBe('우산 · 노트북 외 1개');
    expect(s.remaining).toBe(3);
  });

  it('체크한 항목은 빼고, 두 개 이하면 "외 N개"를 붙이지 않는다', () => {
    const s = buildDepartureSnapshot(
      [item('우산', 1, true), item('지갑', 3), item('충전기', 2)],
      '08:15',
      '2026-10-07'
    );
    expect(s.detail).toBe('충전기 · 지갑');
    expect(s.remaining).toBe(2);
  });

  it('전부 챙겼으면 준비 완료', () => {
    const s = buildDepartureSnapshot([item('지갑', 3, true)], '08:15', '2026-10-07');
    expect(s.detail).toBe('준비 완료');
    expect(s.remaining).toBe(0);
  });

  it('목록이 비어 있으면 준비 완료가 아니라 챙길 것 없음', () => {
    expect(buildDepartureSnapshot([], '08:15', '2026-10-07').detail).toBe('챙길 것 없음');
  });

  it('같은 tier 안에서는 원래 순서를 지킨다', () => {
    const s = buildDepartureSnapshot(
      [item('노트북', 2), item('명함', 2), item('충전기', 2)],
      '08:15',
      '2026-10-07'
    );
    expect(s.detail).toBe('노트북 · 명함 외 1개');
  });
});

describe('departureAlertContent', () => {
  const snap = (date: string, detail: string, remaining: number) =>
    ({ date, title: '08:15 출발', detail, remaining });

  it('울릴 날의 체크리스트면 그 내용을 싣고, 남은 게 있을 때만 고정한다', () => {
    expect(departureAlertContent(snap('2026-10-07', '우산 · 노트북', 2), '2026-10-07'))
      .toEqual({ detail: '우산 · 노트북', ongoing: true });
    expect(departureAlertContent(snap('2026-10-07', '준비 완료', 0), '2026-10-07'))
      .toEqual({ detail: '준비 완료', ongoing: false });
  });

  it('내일 울릴 예약에는 오늘 내용을 싣지 않는다', () => {
    expect(departureAlertContent(snap('2026-10-07', '준비 완료', 0), '2026-10-08'))
      .toEqual({ detail: STALE_DEPARTURE_DETAIL, ongoing: true });
    expect(departureAlertContent(snap('2026-10-07', '우산', 1), '2026-10-08').detail)
      .toBe(STALE_DEPARTURE_DETAIL);
  });
});
