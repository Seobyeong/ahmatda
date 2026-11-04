import { parseLeaveLink } from './leaveLink';

describe('parseLeaveLink', () => {
  it('위젯 링크에서 n을 꺼낸다', () => {
    expect(parseLeaveLink('ahmatda://leave?n=3fa9c01b2d4e5f60')).toBe('3fa9c01b2d4e5f60');
  });

  it('다른 파라미터가 섞여도 n만', () => {
    expect(parseLeaveLink('ahmatda://leave?x=1&n=abc&y=2')).toBe('abc');
  });

  it.each([
    null, undefined, '', 'ahmatda://leave', 'ahmatda://leave?n=',
    'ahmatda://leave?n=%E0%A4%A',   // 깨진 퍼센트 인코딩 — 던지지 않고 null
    'https://example.com/leave?n=1', 'ahmatda://leaveX?n=1', 'ahmatda://other?n=1',
  ])('%s → null', (url) => expect(parseLeaveLink(url as string | null)).toBeNull());
});
