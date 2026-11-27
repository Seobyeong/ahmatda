import { EMPTY_HOMECOMING, MIN_AWAY_MS, arrivedHome, homecomingTasks, withLeft, withSent } from './homecoming';

describe('homecomingTasks', () => {
  it('설정한 할 일 먼저, 챙겨 나간 것에서 자동으로, 같은 건 한 번', () => {
    expect(homecomingTasks(['충전기 꽂기', ' '], ['우산', '지갑', '텀블러'])).toEqual(['충전기 꽂기', '우산 펴서 말리기', '텀블러 씻기']);
    expect(homecomingTasks(['우산 펴서 말리기'], ['우산'])).toEqual(['우산 펴서 말리기']);
    expect(homecomingTasks([], ['지갑'])).toEqual([]);
  });
});

describe('arrivedHome', () => {
  const t0 = new Date(2026, 10, 28, 8, 0).getTime();
  const day = '2026-11-28';
  it('30분 넘게 나갔다 오면 한 번 알린다', () => {
    const left = withLeft(EMPTY_HOMECOMING, t0, day);
    const r = arrivedHome(left, t0 + MIN_AWAY_MS, day);
    expect(r.notify).toBe(true);
    // 같은 날 또 나갔다 와도 하루 한 번 (보낸 뒤 sentDate를 적으면)
    const again = arrivedHome(withLeft(withSent(r.state, day), t0 + 3 * 3600000, day), t0 + 5 * 3600000, day);
    expect(again.notify).toBe(false);
  });
  it('잠깐 나갔다 온 것은 귀가가 아니고, 나간 기록도 지운다', () => {
    const left = withLeft(EMPTY_HOMECOMING, t0, day);
    const quick = arrivedHome(left, t0 + 5 * 60000, day);
    expect(quick.notify).toBe(false);
    // 그 뒤 집에 계속 있으면 시간이 지나도 알리지 않는다
    expect(arrivedHome(quick.state, t0 + 2 * 3600000, day).notify).toBe(false);
  });
  it('자정 넘어 돌아와도 하루 안이면 귀가, 하루 넘은 기록은 아니다', () => {
    const evening = new Date(2026, 10, 28, 19, 0).getTime();
    const left = withLeft(EMPTY_HOMECOMING, evening, day);
    expect(arrivedHome(left, evening + 5.5 * 3600000, '2026-11-29').notify).toBe(true);
    expect(arrivedHome(left, evening + 25 * 3600000, '2026-11-29').notify).toBe(false);
  });
  it('그날 처음 나간 시각을 지킨다', () => {
    const left = withLeft(EMPTY_HOMECOMING, t0, day);
    expect(withLeft(left, t0 + 1000, day)).toBe(left);
  });
});
