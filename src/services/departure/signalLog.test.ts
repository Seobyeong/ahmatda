jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);

import { appendSignal, LOG_RETENTION_MS } from './signalLog';
import type { DepartureSignal } from './decide';

const MIN = 60 * 1000;
const T0 = 1_800_000_000_000;

describe('appendSignal', () => {
  it('빈 기록에 신호를 더한다', () => {
    expect(appendSignal([], { type: 'wifiExit', at: T0 }, T0)).toEqual([{ type: 'wifiExit', at: T0 }]);
  });

  it('같은 출처의 마지막 상태와 같으면 처음 시각을 유지한다 (폴링이 "집 밖"을 반복해서 봐도)', () => {
    const log: DepartureSignal[] = [{ type: 'wifiExit', at: T0 }];
    expect(appendSignal(log, { type: 'wifiExit', at: T0 + 15 * MIN }, T0 + 15 * MIN)).toEqual(log);
  });

  it('지오펜스 재등록이 다시 보낸 이탈도 처음 시각을 유지한다', () => {
    const log: DepartureSignal[] = [{ type: 'locationExit', at: T0 }];
    expect(appendSignal(log, { type: 'locationExit', at: T0 + 30 * MIN }, T0 + 30 * MIN)).toEqual(log);
  });

  it('상태가 바뀌면 더한다 (이탈 → 복귀 → 이탈)', () => {
    let log: DepartureSignal[] = [];
    log = appendSignal(log, { type: 'wifiExit', at: T0 }, T0);
    log = appendSignal(log, { type: 'wifiReturn', at: T0 + MIN }, T0 + MIN);
    log = appendSignal(log, { type: 'wifiExit', at: T0 + 2 * MIN }, T0 + 2 * MIN);
    expect(log.map((s) => s.type)).toEqual(['wifiExit', 'wifiReturn', 'wifiExit']);
  });

  it('Wi-Fi와 위치는 따로 센다 — Wi-Fi 이탈 뒤의 위치 이탈은 중복이 아니다', () => {
    const log: DepartureSignal[] = [{ type: 'wifiExit', at: T0 }];
    const next = appendSignal(log, { type: 'locationExit', at: T0 + MIN }, T0 + MIN);
    expect(next.map((s) => s.type)).toEqual(['wifiExit', 'locationExit']);
  });

  it('보관 기간이 지난 신호는 버린다 — 어제 이탈이 남아 오늘 이탈을 중복으로 막지 않는다', () => {
    const log: DepartureSignal[] = [{ type: 'wifiExit', at: T0 }];
    const now = T0 + LOG_RETENTION_MS + MIN;
    expect(appendSignal(log, { type: 'wifiExit', at: now }, now)).toEqual([{ type: 'wifiExit', at: now }]);
  });

  it('늦게 기록된 신호도 시간순으로 넣는다 (디바운스 뒤에 처음 끊긴 시각으로 기록)', () => {
    const log: DepartureSignal[] = [{ type: 'locationExit', at: T0 + MIN }];
    const next = appendSignal(log, { type: 'wifiExit', at: T0 }, T0 + 2 * MIN);
    expect(next.map((s) => s.type)).toEqual(['wifiExit', 'locationExit']);
  });
});
