import { buildPlaceSearchLink, isPhysicalLocation, pickNextPlaceEvent } from './directions';
import type { CalendarEvent } from '@/types';

const ev = (time: string, title: string, location?: string): CalendarEvent => ({
  id: `${time}-${title}`,
  title,
  time,
  startDate: `2026-10-07T${time}:00`,
  location,
});

describe('isPhysicalLocation', () => {
  it('일반 장소는 오프라인 장소로 본다', () => {
    expect(isPhysicalLocation('강남역 2번 출구')).toBe(true);
  });

  it('비어 있거나 공백뿐이면 아니다', () => {
    expect(isPhysicalLocation(undefined)).toBe(false);
    expect(isPhysicalLocation('   ')).toBe(false);
  });

  it('화상회의 링크·플랫폼 이름은 제외한다', () => {
    expect(isPhysicalLocation('https://zoom.us/j/123')).toBe(false);
    expect(isPhysicalLocation('Microsoft Teams Meeting')).toBe(false);
    expect(isPhysicalLocation('Google Meet (meet.google.com/abc)')).toBe(false);
    expect(isPhysicalLocation('온라인')).toBe(false);
  });
});

describe('pickNextPlaceEvent', () => {
  it('지금 이후 장소 있는 일정 중 가장 이른 것을 고른다', () => {
    const events = [
      ev('15:00', '스터디', '스타벅스 역삼점'),
      ev('13:00', '점심', '강남역'),
      ev('12:00', '화상회의', 'https://zoom.us/j/1'),
      ev('12:30', '장소 없는 일정'),
    ];
    expect(pickNextPlaceEvent(events, '11:00')?.title).toBe('점심');
  });

  it('이미 시작한 일정은 건너뛴다', () => {
    const events = [ev('09:00', '출근', '회사'), ev('18:00', '헬스', '헬스장')];
    expect(pickNextPlaceEvent(events, '10:00')?.title).toBe('헬스');
  });

  it('지금 시작하는 일정은 아직 대상이다', () => {
    expect(pickNextPlaceEvent([ev('10:00', '회의', '본사')], '10:00')?.title).toBe('회의');
  });

  it('대상이 없으면 null', () => {
    expect(pickNextPlaceEvent([ev('09:00', '출근', '회사')], '10:00')).toBeNull();
    expect(pickNextPlaceEvent([], '10:00')).toBeNull();
  });
});

describe('buildPlaceSearchLink', () => {
  it('카카오맵은 공식 웹 링크 하나만 쓴다', () => {
    expect(buildPlaceSearchLink('kakao', ' 강남역 ', 'com.ahmatda')).toEqual({
      primary: `https://map.kakao.com/link/search/${encodeURIComponent('강남역')}`,
      fallback: null,
    });
  });

  it('네이버지도는 앱 스킴 + appname, 실패 시 카카오 웹 링크', () => {
    const link = buildPlaceSearchLink('naver', '스타벅스 역삼점', 'com.ahmatda');
    expect(link.primary).toBe(
      `nmap://search?query=${encodeURIComponent('스타벅스 역삼점')}&appname=com.ahmatda`
    );
    expect(link.fallback).toBe(
      `https://map.kakao.com/link/search/${encodeURIComponent('스타벅스 역삼점')}`
    );
  });

  it('특수문자가 URL을 깨지 않도록 인코딩한다', () => {
    const link = buildPlaceSearchLink('naver', 'A&B 카페 #2', 'com.ahmatda');
    expect(link.primary).not.toContain('&B');
    expect(link.primary).not.toContain('#');
  });
});
