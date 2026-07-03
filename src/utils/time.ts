// "08:15" → "08:15 AM" 변환
export function formatDisplayTime(time24: string): string {
  const [hhStr, mmStr] = time24.split(':');
  const hh = parseInt(hhStr, 10);
  const mm = parseInt(mmStr, 10);
  const ampm = hh < 12 ? 'AM' : 'PM';
  const hh12 = hh === 0 ? 12 : hh > 12 ? hh - 12 : hh;
  return `${String(hh12).padStart(2, '0')}:${String(mm).padStart(2, '0')} ${ampm}`;
}

// 출발 30분 전 알림 시각 계산
// "08:15" → "07:45"
export function getAlertTime(departureTime: string): string {
  const [hhStr, mmStr] = departureTime.split(':');
  let hh = parseInt(hhStr, 10);
  let mm = parseInt(mmStr, 10);

  mm -= 30;
  if (mm < 0) {
    mm += 60;
    hh -= 1;
  }
  if (hh < 0) hh += 24;

  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}

// 오늘 날짜 "YYYY-MM-DD" 반환 (로컬 타임존 기준)
// toISOString()은 UTC 기준이라 자정 근처 KST(00:00~08:59)에서 하루 어긋날 수 있어 직접 조립한다.
export function getTodayString(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

// 오늘 자정 epoch millis (로컬 타임존 기준)
export function getTodayStartMs(): number {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  return now.getTime();
}

// 오늘 23:59:59 epoch millis
export function getTodayEndMs(): number {
  const now = new Date();
  now.setHours(23, 59, 59, 999);
  return now.getTime();
}

// "HH:mm" 형식 이벤트 시각 파싱
export function parseEventTime(isoString: string): string {
  const date = new Date(isoString);
  const hh = String(date.getHours()).padStart(2, '0');
  const mm = String(date.getMinutes()).padStart(2, '0');
  return `${hh}:${mm}`;
}

// 현재 시각 기준 슬롯 인덱스 (0~4)
// 오전(~11시)=0, 정오(11~14)=1, 오후(14~17)=2, 저녁(17~20)=3, 밤(20~)=4
export function getCurrentSlotIndex(): number {
  const hour = new Date().getHours();
  if (hour < 11) return 0;
  if (hour < 14) return 1;
  if (hour < 17) return 2;
  if (hour < 20) return 3;
  return 4;
}
