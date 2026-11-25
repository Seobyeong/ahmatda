import { DECISION_WINDOW_MS, WIFI_FALLBACK_MS, decideDeparture, type DepartureSignal, type SignalAvailability } from './decide';

const MIN = 60 * 1000;
const T0 = new Date(2026, 10, 4, 8, 0).getTime();
const at = (minutes: number) => T0 + minutes * MIN;
const sig = (type: DepartureSignal['type'], minutes: number): DepartureSignal => ({ type, at: at(minutes) });

const ALL: SignalAvailability = { walking: true, location: true };
const NONE: SignalAvailability = { walking: false, location: false };

describe('decideDeparture — 확정 규칙', () => {
  it('주 신호 2개(걷기 + 위치 이탈)면 확정, 확정 시각은 두 번째 신호', () => {
    const d = decideDeparture([sig('walking', 0), sig('locationExit', 3)], ALL, at(4));
    expect(d).toEqual({ status: 'confirmed', at: at(3), by: ['walking', 'locationExit'] });
  });

  it('주 신호 1개 + Wi-Fi 이탈이면 확정 — Wi-Fi가 먼저 와도 된다', () => {
    const d = decideDeparture([sig('wifiExit', 0), sig('walking', 1)], ALL, at(2));
    expect(d).toMatchObject({ status: 'confirmed', at: at(1) });
  });

  it('주 신호 1개 + [떠나기]면 확정', () => {
    const d = decideDeparture([sig('leaveIntent', 0), sig('locationExit', 5)], ALL, at(5));
    expect(d).toMatchObject({ status: 'confirmed', at: at(5) });
  });

  it('같은 주 신호가 여러 번 와도 하나로 센다', () => {
    const d = decideDeparture([sig('walking', 0), sig('walking', 2), sig('walking', 4)], ALL, at(5));
    expect(d).toEqual({ status: 'candidate', since: at(0) });
  });
});

describe('decideDeparture — 오탐 거르기', () => {
  it('Wi-Fi만 끊기면 후보 (공유기 재부팅, Wi-Fi 직접 끔)', () => {
    expect(decideDeparture([sig('wifiExit', 0)], ALL, at(1))).toEqual({ status: 'candidate', since: at(0) });
  });

  it('Wi-Fi 이탈 + [떠나기]는 부가 신호뿐이라 확정이 아니다', () => {
    expect(decideDeparture([sig('leaveIntent', 0), sig('wifiExit', 1)], ALL, at(2)).status).toBe('candidate');
  });

  it('[떠나기]만 누르고 아무 일도 없으면 아무것도 아니다', () => {
    expect(decideDeparture([sig('leaveIntent', 0)], ALL, at(1))).toEqual({ status: 'none' });
  });

  it('창(10분)이 지난 신호는 묶지 않는다', () => {
    const d = decideDeparture([sig('walking', 0), sig('locationExit', 11)], ALL, at(11));
    expect(d).toEqual({ status: 'candidate', since: at(11) });
  });

  it('창 경계(정확히 10분 전)는 포함한다', () => {
    const d = decideDeparture([sig('wifiExit', 0), sig('walking', 10)], ALL, T0 + DECISION_WINDOW_MS);
    expect(d.status).toBe('confirmed');
  });

  it('미래 시각 신호는 무시한다', () => {
    expect(decideDeparture([sig('walking', 5)], ALL, at(1))).toEqual({ status: 'none' });
  });
});

describe('decideDeparture — 돌아온 경우', () => {
  it('Wi-Fi 재연결 이전의 이탈·걷기는 무효 — 현관에서 뭘 가지러 돌아옴', () => {
    const signals = [sig('walking', 0), sig('wifiExit', 1), sig('wifiReturn', 2), sig('wifiExit', 6)];
    expect(decideDeparture(signals, ALL, at(7))).toEqual({ status: 'candidate', since: at(6) });
  });

  it('돌아왔다 다시 나가며 걷기 시작하면 확정', () => {
    const signals = [sig('wifiExit', 1), sig('wifiReturn', 2), sig('wifiExit', 6), sig('walking', 7)];
    expect(decideDeparture(signals, ALL, at(8))).toMatchObject({ status: 'confirmed', at: at(7) });
  });

  it('[떠나기]는 돌아와도 남는다', () => {
    const signals = [sig('leaveIntent', 0), sig('locationExit', 1), sig('locationEnter', 2), sig('walking', 5)];
    expect(decideDeparture(signals, ALL, at(6))).toMatchObject({ status: 'confirmed', at: at(5), by: ['leaveIntent', 'walking'] });
  });

  it('돌아온 뒤 아무 신호가 없으면 none', () => {
    expect(decideDeparture([sig('wifiExit', 0), sig('wifiReturn', 1)], ALL, at(2))).toEqual({ status: 'none' });
  });
});

describe('decideDeparture — 집 Wi-Fi에서 들어온 GPS 튐 (규칙 7)', () => {
  const jitter = (minutes: number): DepartureSignal => ({ type: 'locationExit', at: at(minutes), onHomeWifi: true });

  it('집 Wi-Fi에 붙은 채 들어온 위치 이탈 + 걷기(집 안)는 확정이 아니다', () => {
    expect(decideDeparture([jitter(0), sig('walking', 2)], ALL, at(3))).toEqual({ status: 'candidate', since: at(2) });
  });

  it('그런 위치 이탈 + [떠나기]도 확정이 아니고, 그 이탈만이면 후보도 아니다', () => {
    expect(decideDeparture([sig('leaveIntent', 0), jitter(1)], ALL, at(2))).toEqual({ status: 'none' });
    expect(decideDeparture([jitter(0)], ALL, at(1))).toEqual({ status: 'none' });
  });

  it('공유기 재부팅 — 튄 이탈 뒤 10분 안의 Wi-Fi 이탈과 묶이지 않는다', () => {
    const onlyLocation = { walking: false, location: true };
    expect(decideDeparture([jitter(0), sig('wifiExit', 3)], onlyLocation, at(4)).status).toBe('candidate');
    expect(decideDeparture([jitter(0), sig('wifiExit', 3)], ALL, at(4)).status).toBe('candidate');
  });

  it('밖에서 들어온 위치 이탈은 판정 순간 집 Wi-Fi에 잠깐 붙어 있어도 센다', () => {
    const d = decideDeparture([sig('locationExit', 0), sig('walking', 2)], ALL, at(3), 'home');
    expect(d).toMatchObject({ status: 'confirmed', at: at(2) });
  });

  it('위치 이탈만 거른다 — 걷기 + [떠나기]는 그대로 (기존 한계, 별도 결정)', () => {
    expect(decideDeparture([sig('leaveIntent', 0), sig('walking', 1)], ALL, at(2), 'home')).toMatchObject({ status: 'confirmed' });
  });
});

describe('decideDeparture — 지금 집 Wi-Fi면 안전장치 없음 (규칙 8)', () => {
  it('복귀 기록을 놓친 오래된 Wi-Fi 이탈로 집에서 확정하지 않는다', () => {
    expect(decideDeparture([sig('wifiExit', 0)], ALL, at(20), 'home')).toEqual({ status: 'none' });
    // 지금 집 Wi-Fi면 Wi-Fi 이탈은 지난 일이라 후보도 아니다 (재확인 타이머를 걸지 않는다)
    expect(decideDeparture([sig('wifiExit', 0)], ALL, at(6), 'home')).toEqual({ status: 'none' });
  });

  it('복귀를 놓친 Wi-Fi 이탈 + 집 안 걷기로도 확정하지 않는다', () => {
    expect(decideDeparture([sig('wifiExit', 0), sig('walking', 3)], ALL, at(4), 'home')).toEqual({ status: 'candidate', since: at(3) });
    expect(decideDeparture([sig('wifiExit', 0), sig('walking', 3)], ALL, at(4), 'away')).toMatchObject({ status: 'confirmed', at: at(3) });
  });

  it('상태를 모르거나 밖이면 안전장치는 그대로', () => {
    expect(decideDeparture([sig('wifiExit', 0)], ALL, at(20), 'unknown')).toMatchObject({ status: 'confirmed', at: at(5) });
    expect(decideDeparture([sig('wifiExit', 0)], ALL, at(20), 'away')).toMatchObject({ status: 'confirmed', at: at(5) });
  });
});

describe('decideDeparture — 권한 저하', () => {
  it('걷기·위치를 둘 다 못 쓰면 Wi-Fi 이탈 단독으로 확정 (지금 동작과 같음)', () => {
    expect(decideDeparture([sig('wifiExit', 0)], NONE, at(0))).toMatchObject({ status: 'confirmed', at: at(0) });
  });

  it('그때도 [떠나기] 단독은 확정이 아니다', () => {
    expect(decideDeparture([sig('leaveIntent', 0)], NONE, at(0))).toEqual({ status: 'none' });
  });

  it('위치만 있으면(걷기 거부) 위치 + Wi-Fi로 확정, Wi-Fi 단독은 후보', () => {
    const onlyLocation = { walking: false, location: true };
    expect(decideDeparture([sig('wifiExit', 0)], onlyLocation, at(1)).status).toBe('candidate');
    expect(decideDeparture([sig('wifiExit', 0), sig('locationExit', 2)], onlyLocation, at(2)).status).toBe('confirmed');
  });
});

describe('decideDeparture — Wi-Fi 5분 안전장치', () => {
  it('걷기·위치 신호가 안 와도 Wi-Fi 이탈이 5분 이어지면 확정', () => {
    expect(decideDeparture([sig('wifiExit', 0)], ALL, at(4)).status).toBe('candidate');
    expect(decideDeparture([sig('wifiExit', 0)], ALL, at(0) + WIFI_FALLBACK_MS)).toEqual({
      status: 'confirmed', at: at(5), by: ['wifiExit'],
    });
  });

  it('확인이 늦게 돌아도(10분 창 밖) 놓치지 않는다', () => {
    expect(decideDeparture([sig('wifiExit', 0)], ALL, at(40))).toMatchObject({ status: 'confirmed', at: at(5) });
  });

  it('5분 안에 다시 붙으면(공유기 재부팅) 확정 아님', () => {
    expect(decideDeparture([sig('wifiExit', 0), sig('wifiReturn', 3)], ALL, at(10))).toEqual({ status: 'none' });
  });

  it('복귀 뒤 다시 끊긴 경우는 마지막 이탈부터 5분', () => {
    const signals = [sig('wifiExit', 0), sig('wifiReturn', 3), sig('wifiExit', 6)];
    expect(decideDeparture(signals, ALL, at(10)).status).toBe('candidate');
    expect(decideDeparture(signals, ALL, at(11))).toMatchObject({ status: 'confirmed', at: at(11) });
  });

  it('집 반경 재진입도 귀가로 본다', () => {
    expect(decideDeparture([sig('wifiExit', 0), sig('locationEnter', 2)], ALL, at(10))).toEqual({ status: 'none' });
  });

  it('2시간 넘은 이탈은 오늘 외출과 무관하다', () => {
    expect(decideDeparture([sig('wifiExit', 0)], ALL, at(121))).toEqual({ status: 'none' });
  });
});
