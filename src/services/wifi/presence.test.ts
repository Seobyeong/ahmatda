import type { NetInfoState } from '@react-native-community/netinfo';
import { classifyPresence, homeWifiLesson, readSsid, sameRouter, withLearnedBssid, withSeenBssid, MAX_HOME_BSSIDS, type HomeWifi } from './presence';

const HOME = 'aa:bb:cc:dd:ee:ff';

// NetInfoState는 필드가 많지만 판정에 쓰이는 건 type과 details.bssid뿐이다.
const wifi = (bssid: string | null | undefined) =>
  ({ type: 'wifi', details: { bssid } } as unknown as NetInfoState);
const cellular = () => ({ type: 'cellular', details: {} } as unknown as NetInfoState);

describe('classifyPresence', () => {
  it('집 BSSID와 일치하면 home', () => {
    expect(classifyPresence(wifi(HOME), HOME)).toBe('home');
  });

  it('다른 Wi-Fi에 붙어 있으면 away', () => {
    expect(classifyPresence(wifi('11:22:33:44:55:66'), HOME)).toBe('away');
  });

  it('Wi-Fi가 아니면 away', () => {
    expect(classifyPresence(cellular(), HOME)).toBe('away');
  });

  // 핵심 — 이걸 away로 처리하면 집에 앉아 있는데 긴급 알림이 뜬다.
  it('Wi-Fi에 붙어 있는데 BSSID를 읽을 수 없으면 unknown', () => {
    expect(classifyPresence(wifi(null), HOME)).toBe('unknown');
    expect(classifyPresence(wifi(undefined), HOME)).toBe('unknown');
  });

  it('Android의 권한 없음 자리표시자도 unknown', () => {
    expect(classifyPresence(wifi('02:00:00:00:00:00'), HOME)).toBe('unknown');
  });

  // 기기·OEM에 따라 BSSID가 대문자로 온다. 대소문자를 안 맞추면 자리표시자를
  // 못 알아보고 away로 새서, 이 판정이 막으려던 오탐이 그대로 재현된다.
  it('대문자로 와도 자리표시자를 알아본다', () => {
    expect(classifyPresence(wifi('02:00:00:00:00:00'.toUpperCase()), HOME)).toBe('unknown');
  });

  it('집 BSSID 비교도 대소문자를 가리지 않는다', () => {
    expect(classifyPresence(wifi(HOME.toUpperCase()), HOME)).toBe('home');
    expect(classifyPresence(wifi(HOME), HOME.toUpperCase())).toBe('home');
  });
});

// 듀얼밴드·메시 공유기 (2026-11-25 자동 학습)
const net = (bssid: string | null, ssid: string | null) =>
  ({ type: 'wifi', details: { bssid, ssid } } as unknown as NetInfoState);
const NAMED: HomeWifi = { bssids: [HOME], ssid: 'MyHome' };
const BAND_5G = 'aa:bb:cc:dd:ee:fe';   // 같은 공유기 — 끝 바이트만 다름
const MESH = '12:34:56:78:9a:bc';      // 메시 노드 — 완전히 다름

describe('classifyPresence — 집 Wi-Fi 여러 BSSID', () => {
  it('학습한 BSSID도 home', () => {
    expect(classifyPresence(net(MESH, 'MyHome'), { bssids: [HOME, MESH], ssid: 'MyHome' })).toBe('home');
  });

  it('같은 이름인데 아직 모르는 BSSID는 unknown — 집 5GHz일 수도, 같은 기본 이름의 카페일 수도', () => {
    expect(classifyPresence(net(MESH, 'MyHome'), NAMED)).toBe('unknown');
  });

  it('이름이 다르면 away, 이름을 아직 모르면(예전 등록) 지금처럼 away', () => {
    expect(classifyPresence(net(MESH, 'Cafe'), NAMED)).toBe('away');
    expect(classifyPresence(net(MESH, 'MyHome'), { bssids: [HOME], ssid: null })).toBe('away');
  });
});

describe('readSsid', () => {
  it('Android 따옴표를 벗기고, 권한 없음 표시는 null', () => {
    expect(readSsid(net(HOME, '"MyHome"'))).toBe('MyHome');
    expect(readSsid(net(HOME, '<unknown ssid>'))).toBeNull();
    expect(readSsid(net(HOME, null))).toBeNull();
    expect(readSsid(cellular())).toBeNull();
  });
});

describe('sameRouter', () => {
  it('첫·끝 바이트만 다르면 같은 공유기', () => {
    expect(sameRouter(HOME, BAND_5G)).toBe(true);
    expect(sameRouter(HOME, 'ab:bb:cc:dd:ee:ff')).toBe(true);
    expect(sameRouter(HOME, MESH)).toBe(false);
    expect(sameRouter(HOME, 'garbage')).toBe(false);
  });
});

describe('homeWifiLesson', () => {
  it('등록한 BSSID에 붙었는데 이름을 모르면 이름을 배운다', () => {
    expect(homeWifiLesson(net(HOME, 'MyHome'), { bssids: [HOME], ssid: null })).toEqual({ kind: 'learnSsid', ssid: 'MyHome' });
    expect(homeWifiLesson(net(HOME, 'MyHome'), NAMED)).toEqual({ kind: 'none' });
  });

  it('같은 이름 + 같은 공유기면 바로 배운다', () => {
    expect(homeWifiLesson(net(BAND_5G, 'MyHome'), NAMED)).toEqual({ kind: 'learnBssid', bssid: BAND_5G });
  });

  it('같은 이름 + 다른 공유기는 위치 확인이 필요하다', () => {
    expect(homeWifiLesson(net(MESH, 'MyHome'), NAMED)).toEqual({ kind: 'needsLocation', bssid: MESH });
  });

  it('이름이 다르거나 모르면, BSSID를 못 읽으면 아무것도 안 배운다', () => {
    expect(homeWifiLesson(net(BAND_5G, 'Cafe'), NAMED)).toEqual({ kind: 'none' });
    expect(homeWifiLesson(net(BAND_5G, 'MyHome'), { bssids: [HOME], ssid: null })).toEqual({ kind: 'none' });
    expect(homeWifiLesson(net('02:00:00:00:00:00', 'MyHome'), NAMED)).toEqual({ kind: 'none' });
    expect(homeWifiLesson(cellular(), NAMED)).toEqual({ kind: 'none' });
  });

  it('목록이 가득 차도 계속 배운다 — 등록한 첫 번째는 남기고 가장 먼저 배운 것을 뺀다', () => {
    const full: HomeWifi = { bssids: Array.from({ length: MAX_HOME_BSSIDS }, (_, i) => `aa:bb:cc:dd:ee:${String(i).padStart(2, '0')}`), ssid: 'MyHome' };
    expect(homeWifiLesson(net(MESH, 'MyHome'), full).kind).not.toBe('none');
    const next = withLearnedBssid(full, 'AA:BB:CC:DD:EE:99');
    expect(next.bssids).toHaveLength(MAX_HOME_BSSIDS);
    expect(next.bssids[0]).toBe(full.bssids[0]);
    expect(next.bssids).not.toContain(full.bssids[1]);
    expect(next.bssids[MAX_HOME_BSSIDS - 1]).toBe('aa:bb:cc:dd:ee:99');
    expect(withLearnedBssid({ bssids: ['aa:bb:cc:dd:ee:00'], ssid: 'MyHome' }, 'aa:bb:cc:dd:ee:01').bssids)
      .toEqual(['aa:bb:cc:dd:ee:00', 'aa:bb:cc:dd:ee:01']);
  });

  it('붙은 노드는 맨 뒤로 옮겨 가득 찰 때 빠지지 않는다 — 등록한 첫 번째는 그대로', () => {
    const home: HomeWifi = { bssids: ['aa:00:00:00:00:00', 'aa:00:00:00:00:01', 'aa:00:00:00:00:02'], ssid: 'MyHome' };
    expect(withSeenBssid(home, 'AA:00:00:00:00:01')?.bssids)
      .toEqual(['aa:00:00:00:00:00', 'aa:00:00:00:00:02', 'aa:00:00:00:00:01']);
    expect(withSeenBssid(home, 'aa:00:00:00:00:00')).toBeNull();
    expect(withSeenBssid(home, 'aa:00:00:00:00:02')).toBeNull();
    expect(withSeenBssid(home, 'bb:00:00:00:00:00')).toBeNull();
  });
});
