import { Linking } from 'react-native';
import RNCalendarEvents from 'react-native-calendar-events';
import { CalendarEvent } from '@/types';
import { getTodayStartMs, getTodayEndMs, parseEventTime } from '@/utils/time';

export const CalendarService = {

  // READ_CALENDAR 권한 요청
  // 반환: true(허용) | false(거부) — 거부해도 앱 크래시 없음
  async requestPermission(): Promise<boolean> {
    try {
      const result = await RNCalendarEvents.requestPermissions();
      return result === 'authorized';
    } catch {
      return false;
    }
  },

  // 현재 권한 상태 조회 (재요청 UI에서 "이미 거부됨"과 "아직 안 물어봄"을 구분하는 용도)
  async checkPermission(): Promise<'authorized' | 'denied' | 'restricted' | 'undetermined'> {
    try {
      return await RNCalendarEvents.checkPermissions();
    } catch {
      return 'undetermined';
    }
  },

  // 한 번 거부된 권한은 OS가 앱 내 재요청 다이얼로그를 다시 띄워주지 않으므로,
  // 앱 설정 화면으로 직접 이동시킨다.
  async openSettings(): Promise<void> {
    await Linking.openSettings();
  },

  // 오늘 일정 조회 (로컬 타임존 기준 자정 ~ 23:59)
  // 권한 없으면 빈 배열 반환
  async getTodayEvents(): Promise<CalendarEvent[]> {
    try {
      const authorized = await RNCalendarEvents.checkPermissions();
      if (authorized !== 'authorized') return [];

      const startDate = new Date(getTodayStartMs()).toISOString();
      const endDate   = new Date(getTodayEndMs()).toISOString();

      const events = await RNCalendarEvents.fetchAllEvents(startDate, endDate, []);

      return events.map(ev => ({
        id:        ev.id ?? String(Math.random()),
        title:     ev.title ?? '제목 없음',
        time:      parseEventTime(ev.startDate),
        startDate: ev.startDate,
        location:  ev.location?.trim() || undefined,
      }));
    } catch {
      return [];
    }
  },
};
