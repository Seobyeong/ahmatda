import { buildPersonalizePlan, isEmptyPlan, parsePersonalization } from './importPlan';
import { buildPersonalizeTemplate } from './template';
import type { ChecklistItem, UserSettings } from '@/types';

const settings: UserSettings = {
  departureTime: '08:15',
  nightlyCheckTime: '22:00',
  alertPreference: 'normal',
  awayPlaceAlert: null,
  commuteMode: null,
  homeBssid: null,
  sensitivityLevel: 3,
  learnedDelta: 0,
  onboarded: true,
  disabledWeatherItems: [],
  disabledPurposeItems: [],
  customKeywords: { workout: ['PT'] },
  mapApp: 'kakao',
};

const routine = (label: string): ChecklistItem => ({
  id: label, label, icon: 'key', tier: 3, badge: null, checked: false, temp: false, permanent: true,
});
const current = { userSettings: settings, permanentRoutines: [routine('지갑')] };

describe('parsePersonalization', () => {
  it('설명 문장과 코드블록이 섞인 AI 답변에서 블록을 찾는다', () => {
    const text = '좋아요! 정리하면 이렇습니다.\n```json\n{ "ahmatda": 1, "departureTime": "07:50" }\n```\n도움이 되길!';
    expect(parsePersonalization(text)).toEqual({ ok: true, data: { ahmatda: 1, departureTime: '07:50' } });
  });

  it('스마트 따옴표로 바뀌어 복사돼도 읽는다', () => {
    const text = '{ “ahmatda”: 1, “departureTime”: “07:50” }';
    expect(parsePersonalization(text).ok).toBe(true);
  });

  it('앞에 다른 중괄호가 있어도, 문자열 안의 괄호가 있어도 맞는 블록을 고른다', () => {
    const text = '예시 {a} 와 { "ahmatda": 1, "routines": [{ "label": "도시락 {반찬}" }] }';
    const result = parsePersonalization(text);
    expect(result.ok && (result.data.routines as { label: string }[])[0].label).toBe('도시락 {반찬}');
  });

  it('블록이 없거나 버전이 다르면 이유를 알려준다', () => {
    expect(parsePersonalization('그냥 문장')).toMatchObject({ ok: false });
    const other = parsePersonalization('{ "ahmatda": 2 }');
    expect(other.ok === false && other.error).toContain('버전');
  });
});

describe('buildPersonalizePlan', () => {
  it('바뀌는 값과 추가할 항목만 계획에 담는다', () => {
    const plan = buildPersonalizePlan(
      {
        departureTime: '7:50',
        sensitivity: 2,
        routines: [{ label: '사원증', days: [5, 1, 2, 3, 4, 1] }, { label: '텀블러' }],
        keywords: { work: ['출장'], trip: ['제주'] },
        disabledPurposeItems: { work: ['명함'] },
      },
      current
    );
    expect(plan).toEqual({
      departureTime: { from: '08:15', to: '07:50' },
      sensitivity: { from: 3, to: 2 },
      routines: [{ label: '사원증', days: [1, 2, 3, 4, 5] }, { label: '텀블러' }],
      keywords: [{ purposeId: 'work', keyword: '출장' }, { purposeId: 'trip', keyword: '제주' }],
      disableItems: [{ purposeId: 'work', label: '명함' }],
      skipped: [],
    });
  });

  it('기존 값을 덮어쓰지 않는다 — 이미 있는 루틴·키워드는 건너뛴다', () => {
    const plan = buildPersonalizePlan(
      { routines: [{ label: '지갑', days: [1] }], keywords: { workout: ['PT'], study: ['회의'] } },
      current
    );
    expect(plan.routines).toEqual([]);
    expect(plan.keywords).toEqual([]);
    // 같은 목적에 이미 있는 PT는 조용히, 다른 목적(work)의 기본 키워드 '회의'는 이유와 함께
    expect(plan.skipped).toEqual([
      "루틴 '지갑'은(는) 이미 있어요.",
      "키워드 '회의'은(는) 이미 '출근'에 쓰이고 있어요.",
    ]);
  });

  it('요일 7개나 빈 배열은 매일로, 잘못된 요일은 그 루틴만 건너뛴다', () => {
    const plan = buildPersonalizePlan(
      { routines: [{ label: 'A', days: [0, 1, 2, 3, 4, 5, 6] }, { label: 'B', days: [] }, { label: 'C', days: [7] }] },
      current
    );
    expect(plan.routines).toEqual([{ label: 'A' }, { label: 'B' }]);
    expect(plan.skipped).toHaveLength(1);
  });

  it('형식이 틀린 값, 모르는 목적, 없는 기본 준비물은 반영하지 않는다', () => {
    const plan = buildPersonalizePlan(
      {
        departureTime: '25:00',
        sensitivity: 9,
        keywords: { shopping: ['마트'] },
        disabledPurposeItems: { work: ['우주복'] },
        unknownField: true,
      },
      current
    );
    expect(isEmptyPlan(plan)).toBe(true);
    expect(plan.skipped).toHaveLength(3);
  });

  it('지금과 같은 값이면 바꿀 것으로 보지 않는다', () => {
    expect(isEmptyPlan(buildPersonalizePlan({ departureTime: '08:15', sensitivity: 3 }, current))).toBe(true);
  });
});

describe('템플릿과 파서의 짝', () => {
  const template = buildPersonalizeTemplate();
  const exampleBlock = template.slice(template.indexOf('{'), template.lastIndexOf('}') + 1);

  it('템플릿의 예시 형식을 AI가 그대로 따라 출력하면 읽힌다', () => {
    expect(parsePersonalization(exampleBlock).ok).toBe(true);
  });

  it('템플릿 자체를 실수로 붙여넣으면 예시 값을 가져오지 않는다', () => {
    const result = parsePersonalization(template);
    expect(result.ok === false && result.error).toContain('템플릿');
  });
});
