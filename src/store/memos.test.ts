jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);

import { MEMO_LIMIT, useAppStore } from './index';
import { formatMemoTime } from '../components/MemoModal';

const initial = useAppStore.getState();
const texts = () => useAppStore.getState().memos.map((m) => m.text);

beforeEach(() => {
  useAppStore.setState(initial, true);
});

describe('메모', () => {
  it('최신이 앞에, 앞뒤 공백은 지우고 빈 글은 넣지 않는다', () => {
    const s = useAppStore.getState();
    expect(s.addMemo('  우유 사기 ')).toBe(true);
    expect(s.addMemo('   ')).toBe(false);
    s.addMemo('택배 확인');
    expect(texts()).toEqual(['택배 확인', '우유 사기']);
  });

  it('날이 바뀌어도 남는다', () => {
    useAppStore.getState().addMemo('우유 사기');
    useAppStore.setState({ checklistDate: '2000-01-01' });
    useAppStore.getState().startNewDay();
    expect(texts()).toEqual(['우유 사기']);
  });

  it('지운 자리에 되돌린다', () => {
    const s = useAppStore.getState();
    ['a', 'b', 'c'].forEach((t) => s.addMemo(t)); // c, b, a
    const b = useAppStore.getState().memos[1];
    const undo = useAppStore.getState().deleteMemo(b.id);
    expect(texts()).toEqual(['c', 'a']);
    undo?.();
    expect(texts()).toEqual(['c', 'b', 'a']);
    expect(useAppStore.getState().deleteMemo('없는 id')).toBeNull();
  });

  it('상한을 넘으면 오래된 것부터 빠진다', () => {
    const s = useAppStore.getState();
    for (let i = 0; i <= MEMO_LIMIT; i++) s.addMemo(`m${i}`);
    const memos = useAppStore.getState().memos;
    expect(memos).toHaveLength(MEMO_LIMIT);
    expect(memos[0].text).toBe(`m${MEMO_LIMIT}`);
    expect(memos.some((m) => m.text === 'm0')).toBe(false);
  });
});

describe('formatMemoTime', () => {
  const now = new Date(2026, 10, 18, 12, 0);
  it('오늘이면 시각만, 아니면 날짜까지', () => {
    expect(formatMemoTime(new Date(2026, 10, 18, 8, 5).getTime(), now)).toBe('오늘 08:05');
    expect(formatMemoTime(new Date(2026, 10, 17, 21, 30).getTime(), now)).toBe('11/17 21:30');
  });
});
