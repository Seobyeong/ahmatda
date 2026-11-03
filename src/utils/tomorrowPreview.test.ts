import { buildTomorrowPreview, type TomorrowPreviewInput } from './tomorrowPreview';
import type { ChecklistItem } from '@/types';

const routine = (id: string, label: string, extra: Partial<ChecklistItem> = {}): ChecklistItem => ({
  id, label, icon: 'check-circle', tier: 3, badge: null, checked: false, temp: false, permanent: true, ...extra,
});

const base: TomorrowPreviewInput = {
  date: new Date(2026, 10, 4), // 수요일
  departureTime: '08:15',
  routines: [],
  events: [],
  customKeywords: {},
  disabledWeatherItems: [],
  disabledPurposeItems: [],
  outlook: null,
  forgottenCounts: new Map(),
};

const labels = (input: Partial<TomorrowPreviewInput>) =>
  buildTomorrowPreview({ ...base, ...input }).items.map((i) => i.label);

describe('buildTomorrowPreview', () => {
  it('비 예보면 우산을 맨 앞에, 이유와 함께', () => {
    const preview = buildTomorrowPreview({
      ...base,
      outlook: { rain: true, popMax: 70, maxTemp: 15, minTemp: 9, heat: false },
      routines: [routine('r1', '지갑')],
    });
    expect(preview.items[0]).toEqual({ label: '우산', kind: 'weather', reason: '비 예보 70%' });
    expect(preview.items.map((i) => i.label)).toEqual(['우산', '지갑']);
  });

  it('사용자가 끈 날씨 항목은 넣지 않는다', () => {
    expect(labels({
      outlook: { rain: true, popMax: 80, maxTemp: 35, minTemp: 25, heat: true },
      disabledWeatherItems: ['우산'],
    })).toEqual(['물병']);
  });

  it('다음 날 일정으로 목적 준비물을 넣고, 끈 항목은 뺀다', () => {
    const preview = buildTomorrowPreview({
      ...base,
      events: [{ title: '헬스 PT', time: '19:00' }],
      disabledPurposeItems: ['workout:수건'],
    });
    expect(preview.purposeId).toBe('workout');
    expect(preview.items.map((i) => i.label)).toEqual(['운동복', '텀블러', '헬스장 카드']);
    expect(preview.items[0].reason).toBe("19:00 '헬스 PT' 일정");
  });

  it('요일·특정 날짜 조건을 그 날짜 기준으로 평가하고, 1회 항목을 앞에', () => {
    expect(labels({
      routines: [
        routine('a', '지갑'),
        routine('b', '헬스장 카드', { days: [1, 5] }), // 월·금 — 수요일엔 없음
        routine('c', '반품 택배', { onDate: '2026-11-04' }),
        routine('d', '우편물', { onDate: '2026-11-05' }),
      ],
    })).toEqual(['반품 택배', '지갑']);
  });

  it('겹치는 라벨은 이유가 있는 쪽 하나만', () => {
    const preview = buildTomorrowPreview({
      ...base,
      outlook: { rain: true, popMax: 60, maxTemp: 12, minTemp: 8, heat: false },
      routines: [routine('a', '우산')],
    });
    expect(preview.items).toHaveLength(1);
    expect(preview.items[0].kind).toBe('weather');
  });

  it('다른 이유가 없는 항목에 자주 놓친 횟수를 단다', () => {
    const preview = buildTomorrowPreview({
      ...base,
      routines: [routine('a', '에어팟')],
      forgottenCounts: new Map([['에어팟', 3]]),
    });
    expect(preview.items[0].reason).toBe('이번 주 3번 놓침');
  });
});

describe('buildTomorrowPreview — 1회 항목이 다른 항목에 가려질 때', () => {
  it('남은 줄에 1회 항목의 삭제 버튼을 붙인다', () => {
    const preview = buildTomorrowPreview({
      ...base,
      outlook: { rain: true, popMax: 70, maxTemp: 15, minTemp: 9, heat: false },
      routines: [routine('once', '우산', { onDate: '2026-11-04' })],
    });
    expect(preview.items).toHaveLength(1);
    expect(preview.items[0]).toMatchObject({ label: '우산', kind: 'weather', routineId: 'once' });
  });
});
