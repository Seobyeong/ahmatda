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

describe('꼭 챙김', () => {
  it('루틴을 꼭 챙김으로 두면 다음 날 조립에도 이어지고, 끄면 풀린다', () => {
    useAppStore.getState().setItemEssential(find('지갑').id, true);
    expect(find('지갑').essential).toBe(true);
    expect(useAppStore.getState().userSettings.essentialLabels).toEqual(['지갑']);

    useAppStore.setState({ checklistDate: '2000-01-01' });
    useAppStore.getState().startNewDay();
    expect(find('지갑').essential).toBe(true);
    expect(find('집 열쇠').essential).toBe(false);

    useAppStore.getState().setItemEssential(find('지갑').id, false);
    expect(find('지갑').essential).toBe(false);
    expect(useAppStore.getState().userSettings.essentialLabels).toEqual([]);
  });

  it('"오늘만" 항목은 설정에 이름을 남기지 않고 그 항목에만 표시한다', () => {
    useAppStore.getState().addTempItem('반품 택배');
    useAppStore.getState().setItemEssential(find('반품 택배').id, true);
    expect(find('반품 택배').essential).toBe(true);
    expect(useAppStore.getState().userSettings.essentialLabels).toEqual([]);

    // 같은 날 다시 조립해도 남는다
    useAppStore.getState().buildChecklist();
    expect(find('반품 택배').essential).toBe(true);
  });

  it('바뀐 게 없으면 설정 수정 시각을 올리지 않는다', () => {
    useAppStore.getState().setItemEssential(find('지갑').id, true);
    const at = useAppStore.getState().userSettings.updatedAt;
    useAppStore.getState().setItemEssential(find('지갑').id, true);
    expect(useAppStore.getState().userSettings.updatedAt).toBe(at);
  });

  it('루틴을 지우면 꼭 챙김 이름도 거두고, 되돌리면 돌아온다', () => {
    useAppStore.getState().setItemEssential(find('지갑').id, true);
    const undo = useAppStore.getState().deleteItem(find('지갑').id)!;
    expect(useAppStore.getState().userSettings.essentialLabels).toEqual([]);

    undo();
    expect(useAppStore.getState().userSettings.essentialLabels).toEqual(['지갑']);
  });

  it('설정에서 루틴을 지워도 거두고, 되돌리면 돌아온다', () => {
    useAppStore.getState().setItemEssential(find('지갑').id, true);
    const undo = useAppStore.getState().removePermanentRoutine('routine-default-wallet')!;
    expect(useAppStore.getState().userSettings.essentialLabels).toEqual([]);
    undo();
    expect(useAppStore.getState().userSettings.essentialLabels).toEqual(['지갑']);
  });

  it('같은 이름의 루틴이 남아 있으면 그날만 항목을 지워도 꼭 챙김을 둔다', () => {
    useAppStore.getState().setItemEssential(find('지갑').id, true);
    useAppStore.getState().addOneOffItem('지갑', '2099-01-01');
    useAppStore.getState().removePermanentRoutine(
      useAppStore.getState().permanentRoutines.find((r) => r.onDate === '2099-01-01')!.id
    );
    expect(useAppStore.getState().userSettings.essentialLabels).toEqual(['지갑']);
  });

  it('"오늘만" 항목이 같은 이름의 꼭 챙김 루틴을 가리면 꼭 챙김을 이어받고, 끄면 이름도 거둔다', () => {
    // 오늘만 'USB'를 먼저 넣고, 나중에 같은 이름의 루틴을 꼭 챙김으로 둔 경우 — 조립 때 루틴 줄은 빠진다
    useAppStore.getState().addTempItem('USB');
    useAppStore.getState().addPermanentRoutine('USB');
    useAppStore.setState((s) => ({ userSettings: { ...s.userSettings, essentialLabels: ['USB'] } }));
    useAppStore.getState().buildChecklist();
    expect(labels().filter((l) => l === 'USB')).toHaveLength(1);
    expect(find('USB').temp).toBe(true);
    expect(find('USB').essential).toBe(true);

    useAppStore.getState().setItemEssential(find('USB').id, false);
    useAppStore.getState().buildChecklist();
    expect(find('USB').essential).toBe(false);
    expect(useAppStore.getState().userSettings.essentialLabels).toEqual([]);
  });
});

describe('앱에서 등록한 일정', () => {
  it('목적·나가는 시간·그날 챙길 것을 남기고, 지난 표시는 정리한다', () => {
    useAppStore.setState({ taggedEvents: { old: { purposeId: 'work', date: '2000-01-01' } }, departureDates: {} });
    useAppStore.getState().registerEvent({
      eventId: 'ev1', date: '2099-12-24', purposeId: 'workout', departureTime: '13:00', items: ['라켓', '라켓'],
    });
    const s = useAppStore.getState();
    expect(s.taggedEvents).toEqual({ ev1: { purposeId: 'workout', date: '2099-12-24' } });
    expect(s.departureDates['2099-12-24']).toBe('13:00');
    expect(s.permanentRoutines.filter((r) => r.label === '라켓' && r.onDate === '2099-12-24')).toHaveLength(1);
  });
});

describe('같은 날 일정을 또 넣으면', () => {
  it('더 이른 나가는 시간을 지킨다', () => {
    useAppStore.setState({ departureDates: {} });
    const reg = (eventId: string, departureTime: string) => useAppStore.getState().registerEvent({
      eventId, date: '2099-12-24', purposeId: null, departureTime, items: [],
    });
    reg('m', '08:00');
    reg('e', '18:00');
    expect(useAppStore.getState().departureDates['2099-12-24']).toBe('08:00');
    reg('x', '07:30');
    expect(useAppStore.getState().departureDates['2099-12-24']).toBe('07:30');
  });
  it('오늘이면 오늘만 바꾸기를 풀고 날짜별 계획으로 합친다', () => {
    useAppStore.setState({ departureDates: {}, departureToday: { date: getTodayString(), plan: 'off' } });
    useAppStore.getState().registerEvent({ eventId: 't', date: getTodayString(), purposeId: null, departureTime: '14:00', items: [] });
    expect(useAppStore.getState().departureToday).toBeNull();
    expect(useAppStore.getState().departureDates[getTodayString()]).toBe('14:00');
  });
});
