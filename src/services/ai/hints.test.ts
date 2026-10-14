import {
  DAILY_CALL_LIMIT,
  MAX_TITLES_PER_CALL,
  buildSuggestions,
  canCallToday,
  hashTitle,
  normalizeTitle,
  pickTitlesForAi,
  pruneHintCache,
  recordCall,
  sanitizeHints,
} from './hints';
import type { AiHintEntry } from '@/types';

const entry = (hint: AiHintEntry['hint'], extra: Partial<AiHintEntry> = {}): AiHintEntry => ({
  hint,
  createdAt: 1_000,
  ...extra,
});

describe('normalizeTitle / hashTitle', () => {
  it('공백·대소문자만 다른 제목은 같은 키가 된다', () => {
    expect(normalizeTitle('  PT   수업 ')).toBe('pt 수업');
    expect(hashTitle('PT 수업')).toBe(hashTitle(' pt  수업'));
  });

  it('다른 제목은 다른 키가 되고, 키에 제목 원문이 남지 않는다', () => {
    const key = hashTitle('부산 출장');
    expect(key).not.toBe(hashTitle('부산 여행'));
    expect(key).toMatch(/^[0-9a-f]{16}$/);
  });
});

describe('pickTitlesForAi', () => {
  it('로컬 키워드에 걸리는 일정은 보내지 않는다', () => {
    const events = [{ title: '팀 회의' }, { title: '부산 출장' }];
    expect(pickTitlesForAi(events, {}, {})).toEqual(['부산 출장']);
  });

  it('사용자가 추가한 키워드도 로컬 매칭으로 본다', () => {
    const events = [{ title: '부산 출장' }];
    expect(pickTitlesForAi(events, { work: ['출장'] }, {})).toEqual([]);
  });

  it('캐시에 있는 제목은 결과가 "모름"이어도 다시 묻지 않는다', () => {
    const cache = { [hashTitle('건강검진')]: entry(null) };
    expect(pickTitlesForAi([{ title: '건강검진' }], {}, cache)).toEqual([]);
  });

  it('같은 제목은 한 번만, 제목 없는 일정은 빼고 보낸다', () => {
    const events = [{ title: '소개팅' }, { title: ' 소개팅 ' }, { title: '제목 없음' }, { title: '' }];
    expect(pickTitlesForAi(events, {}, {})).toEqual(['소개팅']);
  });

  it('묶음 실패로 retrySingly 표시된 제목은 다시 보내되 혼자 보낸다', () => {
    const cache = { [hashTitle('조문')]: entry(null, { retrySingly: true }) };
    const events = [{ title: '소개팅' }, { title: '조문' }, { title: '이사' }];
    expect(pickTitlesForAi(events, {}, cache)).toEqual(['조문']);
  });

  it('한 번에 MAX_TITLES_PER_CALL개까지만 보낸다', () => {
    const events = Array.from({ length: 10 }, (_, i) => ({ title: `일정${i}` }));
    expect(pickTitlesForAi(events, {}, {})).toHaveLength(MAX_TITLES_PER_CALL);
  });
});

describe('sanitizeHints', () => {
  it('정상 응답을 제목 순서대로 정리한다', () => {
    const raw = { results: [
      { i: 1, purpose: null, items: ['축의금'] },
      { i: 0, purpose: 'work', items: ['신분증', '충전기'] },
    ] };
    expect(sanitizeHints(raw, 2)).toEqual([
      { purposeId: 'work', items: ['신분증', '충전기'] },
      { purposeId: null, items: ['축의금'] },
    ]);
  });

  it('준비물은 3개까지, 너무 긴 라벨·중복·매일 챙기는 물건은 뺀다', () => {
    const raw = { results: [{ i: 0, purpose: 'trip', items: [
      '지갑', '신분증', '신분증', '아주아주아주아주긴준비물이름입니다', '충전기', '선크림', '모자',
    ] }] };
    expect(sanitizeHints(raw, 1)[0]?.items).toEqual(['신분증', '충전기', '선크림']);
  });

  it('모르는 목적은 null로, 빠진 제목은 null(해석 못 함)로 둔다', () => {
    const raw = { results: [{ i: 0, purpose: 'shopping', items: [] }] };
    expect(sanitizeHints(raw, 2)).toEqual([null, null]);
  });

  it('범위 밖 인덱스, 깨진 응답은 무시한다', () => {
    expect(sanitizeHints({ results: [{ i: 5, purpose: 'work', items: [] }] }, 1)).toEqual([null]);
    expect(sanitizeHints('not json', 1)).toEqual([null]);
    expect(sanitizeHints(null, 1)).toEqual([null]);
  });
});

describe('하루 호출 상한', () => {
  const today = '2026-10-14';

  it('상한까지만 허용하고, 날짜가 바뀌면 다시 허용한다', () => {
    let usage = { day: '', dayCalls: 0, month: '', monthCalls: 0 };
    for (let n = 0; n < DAILY_CALL_LIMIT; n++) {
      expect(canCallToday(usage, today)).toBe(true);
      usage = recordCall(usage, today);
    }
    expect(canCallToday(usage, today)).toBe(false);
    expect(canCallToday(usage, '2026-10-15')).toBe(true);
  });

  it('월 호출 수는 같은 달이면 누적, 달이 바뀌면 1부터', () => {
    const usage = { day: '2026-10-13', dayCalls: 2, month: '2026-10', monthCalls: 7 };
    expect(recordCall(usage, today)).toEqual({ day: today, dayCalls: 1, month: '2026-10', monthCalls: 8 });
    expect(recordCall(usage, '2026-11-01').monthCalls).toBe(1);
  });
});

describe('pruneHintCache', () => {
  it('180일 지난 항목을 지운다', () => {
    const day = 24 * 60 * 60 * 1000;
    const now = 200 * day;
    const cache = { old: entry(null, { createdAt: 10 * day }), fresh: entry(null, { createdAt: 150 * day }) };
    expect(Object.keys(pruneHintCache(cache, now))).toEqual(['fresh']);
  });
});

describe('buildSuggestions', () => {
  const key = hashTitle('부산 출장');
  const cache = { [key]: entry({ purposeId: 'work', items: ['신분증', '충전기'] }) };

  it('캐시에 있는 미분류 일정을 제안으로 만든다', () => {
    expect(buildSuggestions([{ title: '부산 출장' }], {}, cache, [])).toEqual([
      { key, title: '부산 출장', purposeId: 'work', items: ['신분증', '충전기'] },
    ]);
  });

  it('이미 체크리스트에 있는 준비물은 뺀다', () => {
    expect(buildSuggestions([{ title: '부산 출장' }], {}, cache, ['충전기'])[0].items).toEqual(['신분증']);
  });

  it('거절한 제안, 키워드로 승격된 일정은 띄우지 않는다', () => {
    const rejected = { [key]: entry(cache[key].hint, { decision: 'rejected' }) };
    expect(buildSuggestions([{ title: '부산 출장' }], {}, rejected, [])).toEqual([]);
    expect(buildSuggestions([{ title: '부산 출장' }], { work: ['부산 출장'] }, cache, [])).toEqual([]);
  });

  it('수락해서 키워드로 승격된 일정은 다음 회차에 준비물만 다시 제안한다', () => {
    const accepted = { [key]: entry(cache[key].hint, { decision: 'accepted' }) };
    expect(buildSuggestions([{ title: '부산 출장' }], { work: ['부산 출장'] }, accepted, [])).toEqual([
      { key, title: '부산 출장', purposeId: null, items: ['신분증', '충전기'] },
    ]);
    // 준비물도 이미 다 있으면 띄울 게 없다
    expect(buildSuggestions([{ title: '부산 출장' }], { work: ['부산 출장'] }, accepted, ['신분증', '충전기'])).toEqual([]);
  });

  it('목적도 없고 남은 준비물도 없으면 띄우지 않는다', () => {
    const itemsOnly = { [hashTitle('결혼식')]: entry({ purposeId: null, items: ['축의금'] }) };
    expect(buildSuggestions([{ title: '결혼식' }], {}, itemsOnly, ['축의금'])).toEqual([]);
  });
});
