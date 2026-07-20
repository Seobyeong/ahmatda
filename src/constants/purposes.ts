import { Purpose, PurposeId } from '@/types';

export const PURPOSES: Record<PurposeId, Purpose> = {
  work: {
    id: 'work',
    label: '출근 · 비즈니스',
    shortLabel: '출근',
    emoji: '💼',
    color: 'indigo',
    calKeywords: ['미팅', '회의', '면접', '클라이언트', '출근', '업무', '발표'],
    items: [
      { label: '노트북',  icon: 'briefcase', note: '업무 필수' },
      { label: '명함',    icon: 'card',      note: '미팅 대비' },
      { label: '충전기',  icon: 'zap',       note: '하루 종일 필요' },
    ],
    clothingHint: '비즈니스 캐주얼 또는 정장을 권장해요.',
  },
  workout: {
    id: 'workout',
    label: '운동 · 헬스',
    shortLabel: '운동',
    emoji: '🏋️',
    color: 'emerald',
    calKeywords: ['운동', '헬스', '필라테스', '요가', '러닝', '수영', '클라이밍'],
    items: [
      { label: '운동복',      icon: 'shirt',     note: '갈아입을 옷' },
      { label: '텀블러',      icon: 'droplets',  note: '수분 보충' },
      { label: '수건',        icon: 'sparkles',  note: '땀 처리용' },
      { label: '헬스장 카드', icon: 'card',      note: '입장 필수' },
    ],
    clothingHint: '편하고 통기성 좋은 운동복을 입으세요.',
  },
  study: {
    id: 'study',
    label: '공부 · 카페',
    shortLabel: '공부',
    emoji: '📚',
    color: 'violet',
    calKeywords: ['스터디', '공부', '도서관', '카페', '독서', '과외', '강의'],
    items: [
      { label: '노트북',       icon: 'briefcase',  note: '작업 필수' },
      { label: '노트 · 펜',   icon: 'pencil',     note: '메모용' },
      { label: '이어폰',       icon: 'headphones', note: '집중 모드' },
      { label: '보조배터리',   icon: 'zap',        note: '장시간 대비' },
    ],
    clothingHint: '편안하고 오래 앉아있기 좋은 캐주얼 룩을 추천해요.',
  },
  date: {
    id: 'date',
    label: '데이트 · 약속',
    shortLabel: '데이트',
    emoji: '💛',
    color: 'rose',
    calKeywords: ['데이트', '약속', '만남', '식사', '영화'],
    items: [
      { label: '향수',       icon: 'sparkles', note: '첫인상 케어' },
      { label: '보조배터리', icon: 'zap',      note: '긴 외출 대비' },
      { label: '현금',       icon: 'wallet',   note: '비상용' },
    ],
    clothingHint: '깔끔하고 센스 있는 코디를 추천해요!',
  },
  trip: {
    id: 'trip',
    label: '여행 · 나들이',
    shortLabel: '여행',
    emoji: '🗺️',
    color: 'amber',
    calKeywords: ['여행', '나들이', '피크닉', '캠핑', '등산', '소풍'],
    items: [
      { label: '여권 · 신분증', icon: 'card',     note: '신원 확인' },
      { label: '보조배터리',    icon: 'zap',      note: '장거리 필수' },
      { label: '상비약',        icon: 'heart',    note: '비상 대비' },
      { label: '카메라',        icon: 'sparkles', note: '추억 남기기' },
    ],
    clothingHint: '활동하기 편한 복장과 편안한 신발을 꼭 챙기세요!',
  },
};

export const PURPOSE_ORDER: PurposeId[] = ['work', 'workout', 'study', 'date', 'trip'];

// 외출 시각 이후 이벤트를 시간순으로 앞세우고, 이미 지난 이벤트는 뒤로 보낸다.
// detectPurposeFromEvents와 findMatchingEvent가 "가장 관련 있는 이벤트"를 동일한
// 기준으로 고르도록 공유한다 — 기준이 다르면 자동감지 근거와 화면에 표시되는
// 매칭 이벤트가 서로 어긋날 수 있다.
function sortEventsByRelevance<T extends { time: string }>(events: T[], departureTime: string): T[] {
  const futureEvents = events
    .filter(ev => ev.time >= departureTime)
    .sort((a, b) => a.time.localeCompare(b.time));
  const pastEvents = events.filter(ev => ev.time < departureTime);
  return [...futureEvents, ...pastEvents];
}

// 사용자가 설정에서 목적별로 추가한 커스텀 키워드 — 기본 calKeywords에 병합해서 쓴다.
export type CustomKeywords = Partial<Record<PurposeId, string[]>>;

function keywordsFor(purposeId: PurposeId, custom?: CustomKeywords): string[] {
  const extra = custom?.[purposeId] ?? [];
  return extra.length > 0 ? [...PURPOSES[purposeId].calKeywords, ...extra] : PURPOSES[purposeId].calKeywords;
}

// 캘린더 이벤트 제목으로 목적 감지
// 외출 시각과 가장 가까운 미래 이벤트 우선
export function detectPurposeFromEvents(
  events: { title: string; time: string }[],
  departureTime: string,
  customKeywords?: CustomKeywords
): PurposeId | null {
  const ordered = sortEventsByRelevance(events, departureTime);

  for (const ev of ordered) {
    for (const pid of Object.keys(PURPOSES) as PurposeId[]) {
      if (keywordsFor(pid, customKeywords).some(kw => ev.title.includes(kw))) {
        return pid;
      }
    }
  }
  return null;
}

// 주어진 목적과 매칭되는 이벤트를 detectPurposeFromEvents와 동일한 우선순위로 찾는다.
export function findMatchingEvent<T extends { title: string; time: string }>(
  purposeId: PurposeId,
  events: T[],
  departureTime: string,
  customKeywords?: CustomKeywords
): T | null {
  const keywords = keywordsFor(purposeId, customKeywords);
  const ordered = sortEventsByRelevance(events, departureTime);
  return ordered.find(ev => keywords.some(kw => ev.title.includes(kw))) ?? null;
}
