jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);

import { useAppStore } from './index';
import { getTodayString } from '../utils/time';

const initial = useAppStore.getState();
const labels = () => useAppStore.getState().checklist.map((i) => i.label);
const find = (label: string) => useAppStore.getState().checklist.find((i) => i.label === label)!;

beforeEach(() => {
  useAppStore.setState(initial, true);
  useAppStore.getState().startNewDay();
});

describe('하루가 바뀔 때', () => {
  it('어제 체크와 "오늘만" 항목을 이어받지 않는다', () => {
    const s = useAppStore.getState();
    s.addTempItem('USB');
    s.checkAll();
    useAppStore.setState({ checklistDate: '2000-01-01' }); // 어제 만든 목록인 셈

    useAppStore.getState().startNewDay();

    expect(labels()).toEqual(['집 열쇠', '지갑', '에어팟']);
    expect(useAppStore.getState().checklist.every((i) => !i.checked)).toBe(true);
    expect(useAppStore.getState().checklistDate).toBe(getTodayString());
  });

  it('같은 날 다시 조립하면 체크와 "오늘만" 항목이 남는다', () => {
    const s = useAppStore.getState();
    s.addTempItem('USB');
    s.toggleCheck(find('지갑').id);

    useAppStore.getState().buildChecklist();

    expect(labels()).toContain('USB');
    expect(find('지갑').checked).toBe(true);
  });

  it('어제 직접 고른 목적은 비우고, 오늘 고른 목적은 둔다', () => {
    useAppStore.getState().setPurpose('workout');
    useAppStore.setState({ checklistDate: '2000-01-01' });
    useAppStore.getState().startNewDay();
    expect(useAppStore.getState().purposeId).toBe('workout');

    useAppStore.setState({ checklistDate: '2000-01-01', manualPurpose: { date: '2000-01-01', id: 'workout' } });
    useAppStore.getState().startNewDay();
    expect(useAppStore.getState().purposeId).toBeNull();
    expect(labels()).not.toContain('운동복');
  });
});

describe('같은 이름 중복 방지', () => {
  it('"오늘만" 항목은 이미 있으면 더하지 않는다', () => {
    expect(useAppStore.getState().addTempItem('USB')).toBe(true);
    expect(useAppStore.getState().addTempItem('USB')).toBe(false);
    expect(useAppStore.getState().addTempItem('지갑')).toBe(false);
    expect(labels().filter((l) => l === 'USB')).toHaveLength(1);
  });

  it('매일 루틴은 같은 이름이 있으면 더하지 않는다', () => {
    expect(useAppStore.getState().addPermanentRoutine('지갑')).toBe(false);
    expect(useAppStore.getState().addPermanentRoutine('우산')).toBe(true);
    expect(useAppStore.getState().permanentRoutines).toHaveLength(4);
  });
});

describe('삭제 되돌리기', () => {
  it('루틴 항목을 지우면 루틴도 지워지고, 되돌리면 둘 다 제자리로 온다', () => {
    const undo = useAppStore.getState().deleteItem(find('지갑').id);
    expect(labels()).toEqual(['집 열쇠', '에어팟']);
    expect(useAppStore.getState().permanentRoutines.map((r) => r.label)).toEqual(['집 열쇠', '에어팟']);

    undo!();
    expect(labels()).toEqual(['집 열쇠', '지갑', '에어팟']);
    expect(useAppStore.getState().permanentRoutines.map((r) => r.label)).toEqual(['집 열쇠', '지갑', '에어팟']);
  });

  it('되돌려도 그 사이 체크한 다른 항목은 그대로다', () => {
    const undo = useAppStore.getState().deleteItem(find('지갑').id);
    useAppStore.getState().toggleCheck(find('에어팟').id);
    undo!();
    expect(find('에어팟').checked).toBe(true);
  });

  it('목적 준비물은 꺼지고, 되돌리면 다시 켜진다', () => {
    useAppStore.getState().setPurpose('work');
    useAppStore.getState().buildChecklist();
    const undo = useAppStore.getState().deleteItem(find('명함').id);
    expect(useAppStore.getState().userSettings.disabledPurposeItems).toEqual(['work:명함']);

    undo!();
    expect(useAppStore.getState().userSettings.disabledPurposeItems).toEqual([]);
    expect(labels()).toContain('명함');
  });

  it('설정에서 지운 루틴도 되돌릴 수 있다', () => {
    const undo = useAppStore.getState().removePermanentRoutine('routine-default-key');
    expect(useAppStore.getState().permanentRoutines).toHaveLength(2);
    undo!();
    expect(useAppStore.getState().permanentRoutines[0].label).toBe('집 열쇠');
  });

  it('설정에서 지운 루틴을 되돌리면 체크해 둔 것도 돌아온다', () => {
    useAppStore.getState().toggleCheck(find('집 열쇠').id);
    const undo = useAppStore.getState().removePermanentRoutine('routine-default-key');
    useAppStore.getState().buildChecklist(); // 화면이 루틴 변화에 맞춰 다시 조립한다
    expect(labels()).not.toContain('집 열쇠');

    undo!();
    useAppStore.getState().buildChecklist();

    expect(labels()).toEqual(['집 열쇠', '지갑', '에어팟']);
    expect(find('집 열쇠').checked).toBe(true);
  });

  it('없는 항목이면 null', () => {
    expect(useAppStore.getState().deleteItem('nope')).toBeNull();
    expect(useAppStore.getState().removePermanentRoutine('nope')).toBeNull();
  });
});
