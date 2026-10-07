// 아맞다 — 길찾기 딥링크 (순수 로직)
//
// 경로 탐색은 직접 하지 않고 지도 앱에 넘긴다 (docs/경로-기억-설계.md).
// 네이티브 의존이 없는 부분만 여기 둬서 유닛테스트로 검증한다. 실제 열기는
// DirectionsService가 맡는다.

import type { CalendarEvent, MapApp } from '@/types';

// 캘린더 장소 칸에 화상회의 링크나 플랫폼 이름이 들어 있는 경우가 흔하다.
// 지도에서 "zoom.us"를 검색해봐야 의미가 없으니 오프라인 장소로 치지 않는다.
const ONLINE_LOCATION_PATTERN = /^https?:\/\/|zoom|teams|meet\.google|webex|온라인|화상/i;

export function isPhysicalLocation(location: string | undefined): location is string {
  if (!location) return false;
  const trimmed = location.trim();
  return trimmed.length > 0 && !ONLINE_LOCATION_PATTERN.test(trimmed);
}

// 지금 이후 일정 중 가장 이른, 실제 장소가 있는 일정.
// 이미 시작한 일정은 길찾기 대상이 아니라서(그 장소에 이미 있거나 놓쳤다) 뺀다.
export function pickNextPlaceEvent(events: CalendarEvent[], nowHHmm: string): CalendarEvent | null {
  const upcoming = events
    .filter((ev) => ev.time >= nowHHmm && isPhysicalLocation(ev.location))
    .sort((a, b) => a.time.localeCompare(b.time));
  return upcoming[0] ?? null;
}

export interface MapLink {
  // 먼저 시도할 URL — 앱 스킴이면 설치 여부를 확인해야 한다
  primary: string;
  // primary를 열 수 없을 때 쓰는 URL. 웹 링크라 항상 열린다.
  fallback: string | null;
}

// 장소 이름만 있고 좌표가 없는 1단계에서는 경로 화면이 아니라 검색 화면을 연다.
// 네이버지도 경로 스킴(nmap://route/*)은 slat/slng/dlat/dlng가 필수라 이름만으로는 못 쓴다.
//
// - 카카오맵: 공식 웹 링크(apis.map.kakao.com/web/guide "URL로 사용하기"). 사용자 환경에
//   따라 PC/모바일 카카오맵으로 연결된다. kakaomap:// 앱 스킴은 공식 문서에서 확인되지
//   않아 쓰지 않는다.
// - 네이버지도: 공식 앱 스킴(guide.ncloud-docs.com maps-url-scheme). appname 필수.
//   네이버 웹 지도 URL 형식은 공식 문서로 확인하지 못해서, 앱이 없으면 카카오 웹 링크로 연다.
export function buildPlaceSearchLink(app: MapApp, query: string, appName: string): MapLink {
  const q = encodeURIComponent(query.trim());
  const kakaoWeb = `https://map.kakao.com/link/search/${q}`;

  if (app === 'naver') {
    return {
      primary: `nmap://search?query=${q}&appname=${encodeURIComponent(appName)}`,
      fallback: kakaoWeb,
    };
  }
  return { primary: kakaoWeb, fallback: null };
}
