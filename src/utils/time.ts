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

// 다음 "출발 30분 전" 시각.
//
// 문자열("23:45")을 오늘 날짜에 앉히는 방식은 자정을 넘어가는 출발 시각에서 깨진다.
// 예: 출발 "00:15" → 알림 "23:45". 지금이 23:50이면 오늘 23:45는 이미 지났으니
// 내일 23:45로 밀리는데, 정작 지켜야 할 출발은 25분 뒤인 오늘 00:15라 알림이
// 23시간 반 늦게 온다.
//
// 그래서 문자열이 아니라 출발 시각 자체를 먼저 날짜에 앉히고 거기서 30분을 뺀다.
// 자정을 넘어가면 날짜도 같이 넘어가므로 어긋날 여지가 없다.
export const DEPARTURE_ALERT_LEAD_MS = 30 * 60 * 1000;

export function getNextAlertDate(departureTime: string, now: Date = new Date()): Date {
  const [hh, mm] = departureTime.split(':').map(Number);

  const departure = new Date(now);
  departure.setHours(hh, mm, 0, 0);

  // 알림 시각이 이미 지났으면 다음 날 출발을 기준으로 다시 잡는다.
  // 출발은 미래인데 알림 시각만 지난 경우(출발 25분 전)도 여기서 한 번 더 밀린다 —
  // 이미 놓친 알림을 지금 울리는 것보다 다음 날로 넘기는 쪽이 맞다.
  let alert = new Date(departure.getTime() - DEPARTURE_ALERT_LEAD_MS);
  while (alert.getTime() <= now.getTime()) {
    departure.setDate(departure.getDate() + 1);
    alert = new Date(departure.getTime() - DEPARTURE_ALERT_LEAD_MS);
  }
  return alert;
}

// 오늘의 특정 시각(없으면 내일) — 매일 같은 시각에 도는 알림들이 공유한다.
export function getNextDailyDate(hour: number, minute: number, now: Date = new Date()): Date {
  const target = new Date(now);
  target.setHours(hour, minute, 0, 0);
  if (target.getTime() <= now.getTime()) {
    target.setDate(target.getDate() + 1);
  }
  return target;
}

// "HH:mm" 24시간 형식인지. 동기화·가져오기로 들어온 값이 깨져 있으면 알림 예약이
// Invalid Date로 실패해 매일 알림이 통째로 사라지므로, 예약 전에 거른다.
export function isValidHHmm(time: string): boolean {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(time);
}

// 다음 외출이 있는 날 — 출발 시각이 아직 안 지났으면 오늘, 지났으면 내일.
// 자기 전 정리에서 "내일 준비"가 가리키는 날이다. 정리 시각이 자정 이후(00:30)면
// 달력상 오늘이 그날이라 "+1일"로 계산하면 하루 밀린다.
export function getNextDepartureDate(departureTime: string, now: Date = new Date()): Date {
  const [hh, mm] = departureTime.split(':').map(Number);
  const departure = new Date(now);
  departure.setHours(hh, mm, 0, 0);
  if (departure.getTime() <= now.getTime()) departure.setDate(departure.getDate() + 1);
  return departure;
}

// 자기 전 정리 알림에서 받은 착장 피드백이 "어느 날 외출"에 대한 것인지.
//
// 달력 날짜를 쓰면 정리 시각을 자정 이후(00:30)로 잡은 사람의 피드백이 하루 밀려서
// 아직 나가지도 않은 오늘 외출에 기록된다. 그래서 지금 이전의 가장 최근 출발 시각이
// 속한 날짜를 쓴다 — 출발 08:15, 지금 00:30(11/04)이면 11/03 외출에 대한 피드백이다.
export function getFeedbackOutingDate(departureTime: string, now: Date = new Date()): string {
  const [hh, mm] = departureTime.split(':').map(Number);
  const departure = new Date(now);
  departure.setHours(hh, mm, 0, 0);
  if (departure.getTime() > now.getTime()) departure.setDate(departure.getDate() - 1);
  return toDateString(departure);
}

// 오늘 날짜 "YYYY-MM-DD" 반환 (로컬 타임존 기준)
// toISOString()은 UTC 기준이라 자정 근처 KST(00:00~08:59)에서 하루 어긋날 수 있어 직접 조립한다.
export function getTodayString(): string {
  return toDateString(new Date());
}

// 임의 시각의 로컬 날짜 "YYYY-MM-DD"
export function toDateString(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

// 출발 알림 시각(출발 30분 전) 기준 감시 창 길이 — Wi-Fi 이탈 감지가 이 시간만큼만
// 활성화된다(배터리 보호). WifiMonitorService, BackgroundTaskService가 공유한다.
export const DEPARTURE_WINDOW_MS = 2 * 60 * 60 * 1000;

// 지금이 출발 알림 시각 기준 감시 창(alertTime ~ alertTime + DEPARTURE_WINDOW_MS) 안인지 판정.
// alertTime이 자정을 넘겨 wrap되는 경우(예: departureTime "00:15" → alertTime "23:45")
// 오늘 날짜에 앉힌 창은 실제로는 어제 저녁에 시작된 창이므로, 오늘/어제 두 기준으로
// 앉힌 창을 모두 확인해서 자정 근처 출발시각도 올바르게 판정한다.
export function isWithinDepartureWindow(departureTime: string, now: Date = new Date()): boolean {
  return getDepartureWindowRemainingMs(departureTime, now) !== null;
}

// 지금 감시 창 안이면 창이 닫힐 때까지 남은 ms, 밖이면 null.
// 잠금화면 고정 알림이 창이 끝나면 저절로 사라지도록(timeoutAfter) 쓰인다.
export function getDepartureWindowRemainingMs(departureTime: string, now: Date = new Date()): number | null {
  const alertTime = getAlertTime(departureTime);
  const [hh, mm] = alertTime.split(':').map(Number);

  for (const dayOffset of [0, -1]) {
    const start = new Date(now);
    start.setDate(start.getDate() + dayOffset);
    start.setHours(hh, mm, 0, 0);
    const end = new Date(start.getTime() + DEPARTURE_WINDOW_MS);
    if (now >= start && now <= end) return end.getTime() - now.getTime();
  }
  return null;
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

// 대시보드 맨 위 "외출까지 남은 시간" 한 줄.
// 12시간 안이면 남은 시간을 세고, 그보다 멀면(방금 나간 직후 등) 다음 외출 시각만 알린다.
export const COUNTDOWN_HORIZON_MIN = 12 * 60;
export const DEPARTURE_SOON_MIN = DEPARTURE_ALERT_LEAD_MS / 60000; // 출발 전 알림과 같은 기준
// 출발 시각이 지나도 이만큼은 "늦었다"고 알린다 — 정각이 되자마자 "내일 08:15"로 바뀌면
// 아직 짐을 싸는 사람에게 가장 급한 순간에 경고가 사라진다.
export const DEPARTURE_OVERDUE_MIN = 30;

export interface DepartureCountdown {
  label: string;  // 작은 글씨 — "외출까지" / "곧 나갈 시간이에요" / "다음 외출"
  value: string;  // 큰 글씨 — "1시간 12분" / "내일 08:15"
  detail: string | null; // 남은 시간을 셀 때 옆에 붙는 출발 시각 — "08:15 출발"
  soon: boolean;  // 30분 안 — 강조 표시
}

export function getDepartureCountdown(departureTime: string, now: Date = new Date()): DepartureCountdown {
  const next = getNextDepartureDate(departureTime, now);
  const minutes = Math.ceil((next.getTime() - now.getTime()) / 60000);

  const previous = new Date(next);
  previous.setDate(previous.getDate() - 1);
  const overdue = Math.floor((now.getTime() - previous.getTime()) / 60000);
  if (overdue < DEPARTURE_OVERDUE_MIN) {
    return {
      label: '나갈 시간이 지났어요',
      value: overdue === 0 ? '지금' : `${overdue}분 지남`,
      detail: `${departureTime} 출발`,
      soon: true,
    };
  }

  if (minutes > COUNTDOWN_HORIZON_MIN) {
    const day = toDateString(next) === toDateString(now) ? '오늘' : '내일';
    return { label: '다음 외출', value: `${day} ${departureTime}`, detail: null, soon: false };
  }

  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  const value = h === 0 ? `${m}분` : m === 0 ? `${h}시간` : `${h}시간 ${m}분`;
  const soon = minutes <= DEPARTURE_SOON_MIN;
  return { label: soon ? '곧 나갈 시간이에요' : '외출까지', value, detail: `${departureTime} 출발`, soon };
}
