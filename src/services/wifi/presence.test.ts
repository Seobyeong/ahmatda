import type { NetInfoState } from '@react-native-community/netinfo';
import { classifyPresence } from './presence';

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
