jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);

import { DELETION_KEEP_MS, useAppStore } from './index';

const initial = useAppStore.getState();
const deleted = () => useAppStore.getState().deletions.map((d) => `${d.kind}:${d.id}`);

beforeEach(() => {
  useAppStore.setState(initial, true);
});

describe('삭제 기록 (동기화 준비)', () => {
  it('루틴·메모·알람을 지우면 남고, 되돌리면 거둔다', () => {
    const s = useAppStore.getState();
    const undoRoutine = s.removePermanentRoutine('routine-default-key');
    s.addMemo('우유');
    const memoId = useAppStore.getState().memos[0].id;
    const undoMemo = useAppStore.getState().deleteMemo(memoId);
    useAppStore.getState().addAlarm({ time: '07:00', days: [], enabled: true, label: '' });
    const alarmId = useAppStore.getState().alarms[0].id;
    useAppStore.getState().removeAlarm(alarmId);

    expect(deleted()).toEqual(['routine:routine-default-key', `memo:${memoId}`, `alarm:${alarmId}`]);
    undoRoutine?.();
    undoMemo?.();
    expect(deleted()).toEqual([`alarm:${alarmId}`]);
  });

  it('오래된 기록은 다음 삭제 때 정리된다', () => {
    useAppStore.setState({ deletions: [{ kind: 'memo', id: 'old', at: Date.now() - DELETION_KEEP_MS - 1 }] });
    useAppStore.getState().removePermanentRoutine('routine-default-wallet');
    expect(deleted()).toEqual(['routine:routine-default-wallet']);
  });

  it('알람은 바꿀 때마다 수정 시각이 남는다', () => {
    useAppStore.getState().addAlarm({ time: '07:00', days: [], enabled: true, label: '' });
    const a = useAppStore.getState().alarms[0];
    expect(a.updatedAt).toEqual(expect.any(Number));
  });
});
