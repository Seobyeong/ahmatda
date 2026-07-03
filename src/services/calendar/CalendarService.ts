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
      }));
    } catch {
      return [];
    }
  },
};
