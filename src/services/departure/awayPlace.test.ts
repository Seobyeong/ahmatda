import { distanceMeters, hasLeftPlace, isCarryItem, pickCarryItems, stayingSince, STAY_MS } from './awayPlace';
import type { ChecklistItem } from '@/types';

const MIN = 60 * 1000;
const T0 = 1_800_000_000_000;

const item = (label: string, checked: boolean): ChecklistItem => ({
  id: label, label, icon: '', tier: 1, badge: null, checked, temp: false, permanent: false,
});

describe('isCarryItem', () => {
  it.each(['충전기', '휴대폰 충전기', '보조배터리', '우산', '접이식 양산', '텀블러', '노트북', '에어팟', '교통카드', '지갑', '집 키', '차키'])(
    '%s → 대상', (label) => expect(isCarryItem(label)).toBe(true)
  );
  it.each(['외투', '마스크', '키보드', '스키복', '쿠키', '도시락'])(
    '%s → 대상 아님', (label) => expect(isCarryItem(label)).toBe(false)
  );
});

describe('pickCarryItems', () => {
  it('아침에 챙긴(체크한) 꺼내 쓰는 물건만', () => {
    const list = [item('충전기', true), item('우산', false), item('외투', true), item('텀블러', true)];
    expect(pickCarryItems(list).map((i) => i.label)).toEqual(['충전기', '텀블러']);
  });
});

describe('stayingSince', () => {
  it('마지막 움직임 뒤 정지가 20분 넘으면 그 정지 시각', () => {
    expect(stayingSince([T0], [T0 - 5 * MIN], T0 + STAY_MS)).toBe(T0);
  });

  it('20분이 안 됐으면 null', () => {
    expect(stayingSince([T0], [], T0 + STAY_MS - 1)).toBeNull();
  });

  it('정지 뒤에 다시 움직였으면 null', () => {
    expect(stayingSince([T0], [T0 + 10 * MIN], T0 + 40 * MIN)).toBeNull();
  });

  it('움직임 뒤 정지가 여러 번이면 첫 정지부터 센다', () => {
    expect(stayingSince([T0 - 60 * MIN, T0, T0 + 10 * MIN], [T0 - 5 * MIN], T0 + 25 * MIN)).toBe(T0);
  });

  it('정지 기록이 없으면 null (걷는 중이거나 신체 활동 권한 없음)', () => {
    expect(stayingSince([], [T0], T0 + 60 * MIN)).toBeNull();
  });
});

describe('hasLeftPlace', () => {
  const since = T0;
  const exitAt = T0 + 60 * MIN;

  it('이탈 전에 걷기 시작 (일어나 걸어 나가다 반경을 벗어남)', () => {
    expect(hasLeftPlace(since, exitAt, [exitAt - 2 * MIN], exitAt)).toBe(true);
  });

  it('이탈 뒤에 걷기 시작', () => {
    expect(hasLeftPlace(since, exitAt, [exitAt + 3 * MIN], exitAt + 3 * MIN)).toBe(true);
  });

  it('걷기가 없으면 아님 (GPS가 튐, 차로 떠남)', () => {
    expect(hasLeftPlace(since, exitAt, [], exitAt + MIN)).toBe(false);
  });

  it('머물기 전 걷기(이 장소에 들어올 때)는 세지 않는다', () => {
    expect(hasLeftPlace(since, since + 5 * MIN, [since - MIN], since + 5 * MIN)).toBe(false);
  });

  it('이탈과 걷기가 10분 넘게 떨어져 있으면 아님', () => {
    expect(hasLeftPlace(since, exitAt, [exitAt - 15 * MIN], exitAt)).toBe(false);
  });

  it('이탈이 너무 오래전이면 아님', () => {
    expect(hasLeftPlace(since, exitAt, [exitAt], exitAt + 11 * MIN)).toBe(false);
  });

  it('이탈 기록이 없으면 아님', () => {
    expect(hasLeftPlace(since, null, [T0 + 30 * MIN], T0 + 30 * MIN)).toBe(false);
  });
});

describe('distanceMeters', () => {
  it('위도 0.001도 ≈ 111m', () => {
    const d = distanceMeters({ lat: 37.5, lon: 127 }, { lat: 37.501, lon: 127 });
    expect(d).toBeGreaterThan(105);
    expect(d).toBeLessThan(117);
  });
});
