import { detectPurposeFromEvents, findMatchingEvent } from './purposes';

describe('detectPurposeFromEvents', () => {
  it('제목에 목적 키워드가 있으면 해당 목적을 반환한다', () => {
    const events = [{ title: '팀 회의', time: '10:00' }];
    expect(detectPurposeFromEvents(events, '08:00')).toBe('work');
  });

  it('매칭되는 이벤트가 없으면 null을 반환한다', () => {
    const events = [{ title: '아무 일정', time: '10:00' }];
    expect(detectPurposeFromEvents(events, '08:00')).toBeNull();
  });

  it('일정이 없으면 null을 반환한다', () => {
    expect(detectPurposeFromEvents([], '08:00')).toBeNull();
  });

  it('출발 시각 이후의 미래 이벤트를 과거 이벤트보다 우선한다', () => {
    // '헬스'(과거, 07:00)보다 '미팅'(미래, 09:00)이 departureTime(08:00) 기준으로
    // 우선순위가 높아야 하므로 work가 반환돼야 한다.
    const events = [
      { title: '헬스 수업', time: '07:00' },
      { title: '미팅', time: '09:00' },
    ];
    expect(detectPurposeFromEvents(events, '08:00')).toBe('work');
  });

  it('미래 이벤트 중에서는 출발 시각과 가장 가까운(이른) 이벤트를 우선한다', () => {
    const events = [
      { title: '회의 A (오전)', time: '10:00' },
      { title: '스터디 카페', time: '09:00' },
    ];
    // 09:00(스터디)이 10:00(회의)보다 먼저 오므로 study가 반환돼야 한다.
    expect(detectPurposeFromEvents(events, '08:00')).toBe('study');
  });

  it('기본 키워드에 없어도 customKeywords에 있으면 매칭한다', () => {
    const events = [{ title: '농구 동아리', time: '10:00' }];
    expect(detectPurposeFromEvents(events, '08:00')).toBeNull();
    expect(
      detectPurposeFromEvents(events, '08:00', { workout: ['농구'] })
    ).toBe('workout');
  });
});

describe('findMatchingEvent', () => {
  it('주어진 목적과 매칭되는 가장 우선순위 높은 이벤트를 반환한다', () => {
    const events = [
      { title: '회의 A', time: '10:00' },
      { title: '회의 B', time: '09:00' },
    ];
    // detectPurposeFromEvents와 동일한 우선순위 기준(가장 이른 미래 이벤트)을 써야 한다.
    expect(findMatchingEvent('work', events, '08:00')).toEqual({ title: '회의 B', time: '09:00' });
  });

  it('매칭되는 이벤트가 없으면 null을 반환한다', () => {
    const events = [{ title: '아무 일정', time: '10:00' }];
    expect(findMatchingEvent('work', events, '08:00')).toBeNull();
  });

  it('customKeywords로 매칭되는 이벤트도 찾는다', () => {
    const events = [{ title: '농구 동아리', time: '10:00' }];
    expect(findMatchingEvent('workout', events, '08:00')).toBeNull();
    expect(
      findMatchingEvent('workout', events, '08:00', { workout: ['농구'] })
    ).toEqual({ title: '농구 동아리', time: '10:00' });
  });
});
