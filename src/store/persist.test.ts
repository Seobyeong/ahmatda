jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);

import { useAppStore } from './index';

// 저장 목록(partialize)에 빠지면 앱이 꺼졌다 켜질 때 조용히 사라진다 — 사용자가 만든 데이터는 여기 있어야 한다.
describe('저장 대상', () => {
  const saved = Object.keys(useAppStore.persist.getOptions().partialize!(useAppStore.getState()) as object);

  it('사용자가 만든 데이터는 저장된다', () => {
    ['checklist', 'permanentRoutines', 'userSettings', 'memos', 'alarms', 'departureToday', 'leaveIntent', 'deletions']
      .forEach((key) => expect(saved).toContain(key));
  });

  it('화면 상태는 저장하지 않는다', () => {
    ['toast', 'toastAction', 'ringingAlarm', 'weatherLoading'].forEach((key) => expect(saved).not.toContain(key));
  });
});
