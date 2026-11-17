// 아맞다 — 전역 상태 스토어 (Zustand + AsyncStorage persist)

import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { PURPOSES, findMatchingEvent, purposeItemKey } from '../constants/purposes';
import { FEEDBACK_DELTA } from '../constants/feedback';
import { getCurrentSlotIndex, getFeedbackOutingDate, getTodayString } from '../utils/time';
import { getUmbrellaBadge } from '../services/weather/forecastDate';
import { isOneOff, isRoutineActiveOn, pruneExpiredOneOffs } from '../utils/routines';
import { migrateV0toV1, migrateV1toV2, seedUpdatedAt } from './migrations';
import { ManualPurpose, isManualPurposeToday, restoredPurposeState } from './manualPurpose';
import { countRecentForgotten, getForgottenBadge } from '../utils/forgotten';
import { pruneHintCache, recordCall, type AiSuggestion } from '../services/ai/hints';
import type { PersonalizePlan } from '../services/personalize/importPlan';
import type {
  AiHintEntry,
  AiProviderId,
  AiState,
  CalendarEvent,
  ChecklistItem,
  CurrentWeather,
  FeedbackRecord,
  AlertPreference,
  CommuteMode,
  FeedbackType,
  ForgottenRecord,
  LeaveIntent,
  MapApp,
  PurposeId,
  UserSettings,
  WeatherSlot,
} from '../types';

interface AppState {
  // 체크리스트
  checklist: ChecklistItem[];
  checklistDate: string | null; // checklist가 마지막으로 빌드된 날짜("YYYY-MM-DD") — 당일 재실행 시 재빌드 여부 판단용
  permanentRoutines: ChecklistItem[];

  // 목적
  purposeId: PurposeId | null;
  autoDetected: boolean;
  autoDetectedEvent: CalendarEvent | null;
  // 그날 직접 고른 목적 — store/manualPurpose.ts 참고
  manualPurpose: ManualPurpose | null;

  // 날씨
  currentWeather: CurrentWeather | null;
  weatherTimeline: WeatherSlot[];
  weatherLoading: boolean;
  weatherOutOfArea: boolean; // 기상청 API 서비스 지역(국내) 밖에 있어서 조회를 시도하지 않음

  // 유저 설정
  userSettings: UserSettings;

  // 피드백
  feedbackHistory: FeedbackRecord[];
  todayFeedback: FeedbackType | null;

  // 자주 까먹는 항목 학습 — 외출(Wi-Fi 이탈) 시점에 미체크였던 항목 기록
  forgottenHistory: ForgottenRecord[];

  // AI 연결 (선택 기능) — 기기 로컬 전용
  ai: AiState;

  // 오늘 [떠나기]를 누른 기록 — 외출 판정의 "본인이 나간다고 말함" 신호
  // (docs/외출-감지-재설계.md 2·3장). date가 오늘이 아니면 지난 기록이다.
  leaveIntent: LeaveIntent | null;

  // UI 상태
  statusDismissed: boolean;
  toast: string | null;
  toastAction: ToastAction | null; // 토스트에 붙는 버튼 하나 (예: 삭제 되돌리기)
  scrollToChecklistRequested: boolean; // 알림 탭(딥링크)으로 체크리스트 스크롤 요청
  tomorrowPreviewRequested: boolean;   // 자기 전 정리 알림 탭 → 다음 외출 준비 화면 열기 요청
}

// 토스트에 붙는 버튼. 함수라 저장(persist) 대상이 아니다.
export interface ToastAction {
  label: string;
  onPress: () => void;
}

// 삭제를 되돌리는 함수 — 지울 게 없었으면 null
type Undo = (() => void) | null;

interface AppActions {
  // 체크리스트
  toggleCheck: (id: string) => void;
  checkAll: () => void;
  uncheckAll: () => void;
  // 추가했으면 true, 같은 이름이 이미 있어 넘어갔으면 false
  addTempItem: (label: string) => boolean;
  addPermanentRoutine: (label: string) => boolean;
  addOneOffItem: (label: string, date: string) => void;
  // 삭제는 되돌리는 함수를 돌려준다 — ✕ 한 번에 루틴이 영구 삭제되므로 화면이 "되돌리기"를 건다.
  deleteItem: (id: string) => Undo;
  removePermanentRoutine: (id: string) => Undo;
  setRoutineDays: (id: string, days: number[] | undefined) => void;
  buildChecklist: () => void;
  startNewDay: () => void;

  // 목적
  setPurpose: (id: PurposeId | null) => void;
  setAutoDetected: (purposeId: PurposeId | null, event: CalendarEvent | null) => void;

  // 날씨
  setWeather: (weather: CurrentWeather) => void;
  setTimeline: (slots: WeatherSlot[]) => void;
  setWeatherLoading: (loading: boolean) => void;
  setWeatherOutOfArea: (outOfArea: boolean) => void;

  // 유저 설정
  updateDepartureTime: (time: string) => void;
  setNightlyCheckTime: (time: string) => void;
  setAlertPreference: (pref: AlertPreference) => void;
  setAwayPlaceAlert: (on: boolean) => void;
  setCommuteMode: (mode: CommuteMode) => void;
  setHomeBssid: (bssid: string) => void;
  setSensitivity: (level: 1 | 2 | 3 | 4 | 5) => void;
  setMapApp: (app: MapApp) => void;
  completeOnboarding: () => void;
  ensureOnboardedDate: () => void;
  setWeatherItemEnabled: (label: string, enabled: boolean) => void;
  setPurposeItemEnabled: (purposeId: PurposeId, label: string, enabled: boolean) => void;
  addCustomKeyword: (purposeId: PurposeId, keyword: string) => void;
  removeCustomKeyword: (purposeId: PurposeId, keyword: string) => void;

  // 피드백
  applyFeedback: (val: FeedbackType, outingDate?: string) => void;

  // 자주 까먹는 항목
  recordForgotten: (labels: string[]) => void;

  // AI 연결
  setAiEnabled: (enabled: boolean) => void;
  setAiConsent: (provider: AiProviderId | null) => void;
  setAiStatus: (status: AiState['status']) => void;
  recordAiCall: () => void;
  putAiHints: (entries: Record<string, AiHintEntry>) => void;
  rejectAiSuggestion: (key: string) => void;
  acceptAiSuggestion: (suggestion: AiSuggestion) => void;

  // 템플릿 개인화 — 미리보기에서 사용자가 적용을 눌렀을 때
  applyPersonalization: (plan: PersonalizePlan) => void;

  // UI
  // [떠나기]
  recordLeaveIntent: () => void;
  clearLeaveIntent: () => void; // 진단 화면의 테스트 기록 지우기

  dismissStatus: () => void;
  showToast: (message: string, action?: ToastAction) => void;
  clearToast: () => void;
  requestScrollToChecklist: () => void;
  clearScrollToChecklistRequest: () => void;
  requestTomorrowPreview: () => void;
  clearTomorrowPreviewRequest: () => void;
}

type AppStore = AppState & AppActions;

// 체크리스트/루틴 아이템 id 생성.
// 기기 로컬 카운터(Date.now 기반)를 쓰면 같은 앱을 깐 두 기기가 같은 id를 만들 수
// 있어서, 나중에 계정 동기화나 공유 체크리스트를 붙이면 한쪽 항목이 조용히 덮어써진다.
// expo-crypto를 추가하면 네이티브 재빌드가 필요하므로 의존성 없이 RFC 4122 v4 형식을
// 만든다. Math.random은 암호학적으로 안전하진 않지만 여기서 필요한 건 유일성뿐이고,
// 항목 수 규모에서 충돌 확률은 무시할 수 있다.
function generateItemId(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

// 새 항목의 공통 모양. "오늘만" 항목과 루틴(매일·요일·특정 날짜)이 여러 액션에서
// 만들어지는데, 필드를 각자 나열하면 하나가 빠지거나 어긋나기 쉬워 한 곳에 모은다.
function newTempItem(label: string): ChecklistItem {
  return { id: generateItemId(), label, icon: 'sparkles', tier: 0, badge: null, checked: false, temp: true, permanent: false };
}

function newRoutine(label: string, condition: Pick<ChecklistItem, 'days' | 'onDate'> = {}): ChecklistItem {
  return {
    id: generateItemId(),
    label,
    icon: 'check-circle',
    tier: 3,
    badge: null,
    checked: false,
    temp: false,
    permanent: true,
    ...condition,
    updatedAt: Date.now(),
  };
}

// 지운 루틴을 원래 자리에 다시 넣는다 (이미 돌아와 있으면 그대로).
function reinsertRoutines(
  current: ChecklistItem[],
  removed: Array<{ routine: ChecklistItem; index: number }>
): ChecklistItem[] {
  const routines = [...current];
  removed.forEach(({ routine, index }) => {
    if (routines.some((r) => r.id === routine.id)) return;
    routines.splice(Math.min(index, routines.length), 0, routine);
  });
  return routines;
}

// persist는 set이 불릴 때마다 저장한다 — 토스트·로딩 표시처럼 저장 대상이 아닌 값만 바뀌어도
// 전체 상태를 다시 쓴다. 직전에 쓴 내용과 같으면 기기 저장소 쓰기를 건너뛴다.
const lastWritten = new Map<string, string>();
const dedupedAsyncStorage = {
  getItem: (key: string) => AsyncStorage.getItem(key),
  setItem: (key: string, value: string) => {
    if (lastWritten.get(key) === value) return Promise.resolve();
    // 쓰기가 끝난 뒤에만 기억한다 — 먼저 기억하면 쓰는 도중 들어온 같은 내용이 건너뛰어지고,
    // 그 쓰기가 실패했을 때 아무것도 저장되지 않은 채로 남는다.
    return AsyncStorage.setItem(key, value).then(() => {
      lastWritten.set(key, value);
    });
  },
  removeItem: (key: string) => {
    lastWritten.delete(key);
    return AsyncStorage.removeItem(key);
  },
};

// 이미 있으면 같은 배열을 그대로 돌려준다 — patchSettings가 참조 비교로 "안 바뀜"을
// 알아채서 updatedAt을 올리지 않게.
function appendUnique<T>(list: T[], value: T): T[] {
  return list.includes(value) ? list : [...list, value];
}

// 기기 로컬 전용 설정 — 계정 동기화 대상이 아니다.
// 기기마다 붙는 AP가 다르므로 homeBssid는 기기에 남아야 하고, 따라서 이 값을 바꿨다고
// userSettings 전체의 동기화 타임스탬프를 올리면 안 된다. 올리면 "집 Wi-Fi만 다시
// 등록한 기기"가 실제로 설정을 바꾼 기기를 이겨서 출발시각·민감도를 덮어쓴다.
const DEVICE_LOCAL_SETTING_KEYS: ReadonlySet<keyof UserSettings> = new Set(['homeBssid']);

// userSettings를 바꾸는 모든 경로가 이 함수를 지나가게 해서 updatedAt을 빠뜨릴 수
// 없게 한다. 동기화에서 뭐가 최신인지 판단하려면 예외 없이 기록돼 있어야 한다.
//
// 반대로 "안 바뀌었는데 올리는 것"도 막아야 한다. 값이 그대로인데 타임스탬프만
// 새로 찍히면, 아무것도 안 바꾼 기기가 실제로 바꾼 기기를 이긴다. 그래서 실제로
// 달라진 키가 있을 때만 갱신한다.
function patchSettings(state: AppStore, patch: Partial<UserSettings>): Partial<AppState> {
  const current = state.userSettings;
  const changedKeys = (Object.keys(patch) as Array<keyof UserSettings>).filter(
    (key) => !Object.is(current[key], patch[key])
  );

  if (changedKeys.length === 0) return {};

  const syncRelevant = changedKeys.some((key) => !DEVICE_LOCAL_SETTING_KEYS.has(key));
  return {
    userSettings: {
      ...current,
      ...patch,
      updatedAt: syncRelevant ? Date.now() : current.updatedAt,
    },
  };
}

// 기본 제공 루틴 — permanentRoutines의 초기 시드값. 다른 커스텀 루틴과 동일하게
// 설정 화면 "내 루틴" 목록에서 사용자가 자유롭게 삭제할 수 있다.

// 기본 루틴은 랜덤 id가 아니라 고정 id를 쓴다. 두 기기가 각각 기본값에서 시작해도
// 같은 항목이 같은 id를 갖게 되어, 동기화할 때 '집 열쇠'가 둘로 늘어나지 않는다.
const DEFAULT_ROUTINES: ChecklistItem[] = [
  { id: 'routine-default-key',      label: '집 열쇠', icon: 'key',        tier: 3, badge: null, checked: false, temp: false, permanent: true },
  { id: 'routine-default-wallet',   label: '지갑',    icon: 'wallet',     tier: 3, badge: null, checked: false, temp: false, permanent: true },
  { id: 'routine-default-airpods',  label: '에어팟',  icon: 'headphones', tier: 3, badge: null, checked: false, temp: false, permanent: true },
];

const defaultState: AppState = {
  checklist: [],
  checklistDate: null,
  permanentRoutines: DEFAULT_ROUTINES,

  purposeId: null,
  autoDetected: false,
  autoDetectedEvent: null,
  manualPurpose: null,

  currentWeather: null,
  weatherTimeline: [],
  weatherLoading: false,
  weatherOutOfArea: false,

  userSettings: {
    departureTime: '08:15',
    nightlyCheckTime: '22:00',
    alertPreference: 'normal',
    awayPlaceAlert: null,
    commuteMode: null,
    homeBssid: null,
    sensitivityLevel: 3,
    learnedDelta: 0,
    onboarded: false,
    onboardedDate: null,
    disabledWeatherItems: [],
    disabledPurposeItems: [],
    customKeywords: {},
    mapApp: 'kakao',
  },

  feedbackHistory: [],
  todayFeedback: null,

  forgottenHistory: [],

  ai: {
    enabled: false,
    provider: 'anthropic',
    consentedProvider: null,
    status: 'ok',
    pausedDay: null,
    usage: { day: '', dayCalls: 0, month: '', monthCalls: 0 },
    hintCache: {},
  },

  leaveIntent: null,

  statusDismissed: false,
  toast: null,
  toastAction: null,
  scrollToChecklistRequested: false,
  tomorrowPreviewRequested: false,
};

export const useAppStore = create<AppStore>()(
  persist(
    (set, get) => ({
      ...defaultState,

      // 체크리스트
      toggleCheck: (id) =>
        set((state) => ({
          checklist: state.checklist.map((item) =>
            item.id === id ? { ...item, checked: !item.checked } : item
          ),
        })),

      checkAll: () =>
        set((state) => ({
          checklist: state.checklist.map((item) => ({ ...item, checked: true })),
        })),

      uncheckAll: () =>
        set((state) => ({
          checklist: state.checklist.map((item) => ({ ...item, checked: false })),
        })),

      // 체크 상태를 이름으로 기억하므로(buildChecklist의 wasChecked) 같은 이름이 두 줄이면
      // 하나만 눌러도 재조립 때 둘 다 체크된다. 이미 있으면 더하지 않는다.
      addTempItem: (label) => {
        if (get().checklist.some((item) => item.label === label)) return false;
        set((state) => ({ checklist: [...state.checklist, newTempItem(label)] }));
        return true;
      },

      // 특정 날짜 1회 — 자기 전 정리의 "이 날만 추가". 조건 붙은 루틴으로 저장해서
      // 그날 조립 때 나타나고 지나면 정리된다 (docs/체크리스트-항목-속성.md 3장).
      // 00:30 정리처럼 그날이 오늘이면, DashboardScreen이 permanentRoutines 변화에 맞춰
      // 다시 조립하므로 오늘 체크리스트에도 바로 나타난다.
      addOneOffItem: (label, date) => {
        const exists = get().permanentRoutines.some((r) => r.label === label && r.onDate === date);
        if (exists) return;
        set((state) => ({
          permanentRoutines: [...state.permanentRoutines, newRoutine(label, { onDate: date })],
        }));
      },

      addPermanentRoutine: (label) => {
        if (get().permanentRoutines.some((r) => r.label === label && !isOneOff(r))) return false;
        set((state) => ({ permanentRoutines: [...state.permanentRoutines, newRoutine(label)] }));
        return true;
      },

      deleteItem: (id) => {
        const before = get();
        const index = before.checklist.findIndex((i) => i.id === id);
        if (index < 0) return null;
        const item = before.checklist[index];

        // 체크리스트 항목은 조립 때 새 id를 받아서 원래 루틴을 id로 찾을 수 없다. 라벨에 더해
        // "1회 항목인지"까지 같아야 지운다 — 매일 "노트북"과 그날만 "노트북"이 같이 있을 때
        // 하나를 지우면 다른 하나까지 사라지면 안 된다. (조립 때 {...routine}이라 onDate가 남아 있다.)
        const removedRoutines = item.permanent
          ? before.permanentRoutines.flatMap((routine, i) =>
              routine.label === item.label && routine.onDate === item.onDate ? [{ routine, index: i }] : []
            )
          : [];

        // tier 1(날씨 트리거)·tier 2(목적별) 항목은 매번 새로 생성되므로, 여기서 지우면
        // 그 순간만 사라졌다가 다음 재빌드 때 다시 나타난다. 사용자의 "삭제" 의도를
        // 지속시키려면 영구적으로 비활성화해야 한다.
        const { disabledWeatherItems, disabledPurposeItems } = before.userSettings;
        const purposeKey = item.tier === 2 && before.purposeId ? purposeItemKey(before.purposeId, item.label) : null;
        // 되돌릴 때는 이번 삭제로 새로 꺼진 것만 다시 켠다.
        const newlyDisabledWeather = item.tier === 1 && !disabledWeatherItems.includes(item.label);
        const newlyDisabledPurpose = purposeKey !== null && !disabledPurposeItems.includes(purposeKey);

        // 한 번의 set으로 끝낸다 — set마다 구독자 알림과 persist 저장(전체 상태 직렬화)이
        // 따라붙어서, 나눠 부르면 항목 하나 지우는 데 저장이 세 번 일어난다.
        set((state) => {
          const next: Partial<AppState> = { checklist: state.checklist.filter((i) => i.id !== id) };
          if (removedRoutines.length > 0) {
            const removedIds = new Set(removedRoutines.map(({ routine }) => routine.id));
            next.permanentRoutines = state.permanentRoutines.filter((routine) => !removedIds.has(routine.id));
          }
          if (item.tier === 1) {
            Object.assign(next, patchSettings(state, { disabledWeatherItems: appendUnique(state.userSettings.disabledWeatherItems, item.label) }));
          } else if (purposeKey) {
            Object.assign(next, patchSettings(state, { disabledPurposeItems: appendUnique(state.userSettings.disabledPurposeItems, purposeKey) }));
          }
          return next;
        });

        // 되돌리기 — 그 사이 다른 항목을 체크했을 수 있으니 통째로 덮어쓰지 않고 지운 것만 제자리에 넣는다.
        return () =>
          set((state) => {
            const next: Partial<AppState> = {};
            if (!state.checklist.some((i) => i.label === item.label)) {
              const checklist = [...state.checklist];
              checklist.splice(Math.min(index, checklist.length), 0, item);
              next.checklist = checklist;
            }
            if (removedRoutines.length > 0) {
              next.permanentRoutines = reinsertRoutines(state.permanentRoutines, removedRoutines);
            }
            if (newlyDisabledWeather) {
              Object.assign(next, patchSettings(state, { disabledWeatherItems: state.userSettings.disabledWeatherItems.filter((l) => l !== item.label) }));
            } else if (newlyDisabledPurpose) {
              Object.assign(next, patchSettings(state, { disabledPurposeItems: state.userSettings.disabledPurposeItems.filter((k) => k !== purposeKey) }));
            }
            return next;
          });
      },

      removePermanentRoutine: (id) => {
        const index = get().permanentRoutines.findIndex((routine) => routine.id === id);
        if (index < 0) return null;
        const routine = get().permanentRoutines[index];
        // 루틴을 지우면 재조립이 오늘 목록의 줄도 뺀다. 되돌릴 때 그 줄을 같이 돌려놓지 않으면
        // 재조립이 새 줄을 만들어서 체크해 둔 게 풀린다 (체크는 이전 목록의 이름으로 이어받는다).
        const rowIndex = get().checklist.findIndex(
          (item) => item.permanent && item.label === routine.label && item.onDate === routine.onDate
        );
        const row = rowIndex >= 0 ? get().checklist[rowIndex] : null;
        set((state) => ({
          permanentRoutines: state.permanentRoutines.filter((r) => r.id !== id),
        }));
        return () =>
          set((state) => {
            const next: Partial<AppState> = {
              permanentRoutines: reinsertRoutines(state.permanentRoutines, [{ routine, index }]),
            };
            if (row && !state.checklist.some((item) => item.label === row.label)) {
              const checklist = [...state.checklist];
              checklist.splice(Math.min(rowIndex, checklist.length), 0, row);
              next.checklist = checklist;
            }
            return next;
          });
      },

      // 루틴 요일 조건 설정 — 7일 전부 선택은 undefined(매일)로 정규화해서
      // "매일"과 "월~일 전부 체크"가 다른 상태로 남지 않게 한다.
      setRoutineDays: (id, days) =>
        set((state) => ({
          permanentRoutines: state.permanentRoutines.map((routine) =>
            routine.id === id
              ? { ...routine, days: days && days.length < 7 ? days : undefined, updatedAt: Date.now() }
              : routine
          ),
        })),

      buildChecklist: () => {
        const { currentWeather, weatherTimeline, purposeId, permanentRoutines, userSettings, checklist, checklistDate, forgottenHistory } = get();
        const nextId = generateItemId;

        // 어제 만든 목록이면 조립이 아니라 하루 전환이다 — startNewDay가 목록을 비우고
        // 당일 한정 상태를 함께 넘긴 뒤 다시 이 함수를 부른다. 여기서 날짜만 오늘로 찍고 넘어가면
        // 뒤따르는 "날짜가 다르면 startNewDay" 확인들이 전부 건너뛰어진다.
        if (checklistDate !== getTodayString()) {
          get().startNewDay();
          return;
        }
        const prevChecklist = checklist;

        // 최근 7일간 2회 이상 안 챙기고 나간 항목에 "이번 주 N번 놓침" 뱃지를 단다.
        // 날씨/일정 뱃지가 이미 있는 항목은 그쪽이 더 시급한 정보라 덮어쓰지 않는다.
        const forgottenCounts = countRecentForgotten(forgottenHistory, getTodayString());
        const withForgottenBadge = (item: ChecklistItem): ChecklistItem =>
          item.badge ? item : { ...item, badge: getForgottenBadge(forgottenCounts.get(item.label)) };

        // 라벨별 체크 상태를 기억해뒀다가 재빌드 후에도 유지한다 (목적 변경 등으로
        // 인한 재빌드 시 이미 챙긴 항목의 체크가 풀리는 것을 방지).
        const wasChecked = new Map<string, boolean>();
        prevChecklist.forEach((item) => {
          if (item.checked) wasChecked.set(item.label, true);
        });

        const items: ChecklistItem[] = [];

        // tier 0 — 오늘만 추가된 임시 항목은 재빌드 대상이 아니므로 그대로 유지한다.
        prevChecklist.filter((item) => item.temp).forEach((item) => items.push(item));

        // tier 1 — 날씨 트리거 (사용자가 설정에서 영구적으로 끈 항목은 제외)
        const isWeatherItemEnabled = (label: string) =>
          !userSettings.disabledWeatherItems.includes(label);

        if (currentWeather) {
          // 뱃지가 곧 "오늘 띄울 이유"다 — 없으면 그 항목은 오늘 해당 없음.
          // 우산: 지금 비 또는 남은 시간대 예보 — 자차는 지금 비만 (getUmbrellaBadge)
          // 라벨은 SettingsScreen의 WEATHER_ITEMS와 일치해야 한다.
          const weatherTriggers: Array<{ label: string; icon: string; badge: string | null }> = [
            {
              label: '우산',
              icon: 'umbrella',
              badge: getUmbrellaBadge(userSettings.commuteMode, currentWeather.rainAlert, weatherTimeline, getCurrentSlotIndex()),
            },
            { label: '마스크', icon: 'wind', badge: currentWeather.dustLevel === '나쁨' || currentWeather.dustLevel === '매우나쁨' ? `미세먼지 ${currentWeather.dustLevel}` : null },
            { label: '물병', icon: 'droplets', badge: currentWeather.heatAlert ? '폭염 대비' : null },
          ];
          weatherTriggers.forEach(({ label, icon, badge }) => {
            if (!badge || !isWeatherItemEnabled(label)) return;
            items.push({
              id: nextId(),
              label,
              icon,
              tier: 1,
              badge,
              checked: wasChecked.get(label) ?? false,
              temp: false,
              permanent: false,
            });
          });
        }

        // tier 2 — 목적별
        if (purposeId) {
          const purpose = PURPOSES[purposeId];
          const matchedEvent = currentWeather
            ? findMatchingEvent(
                purposeId,
                currentWeather.calendarEvents,
                userSettings.departureTime,
                userSettings.customKeywords
              )
            : null;
          const badge = matchedEvent
            ? `${matchedEvent.time} '${matchedEvent.title}' 연동됨`
            : null;

          const isPurposeItemEnabled = (label: string) =>
            !userSettings.disabledPurposeItems.includes(purposeItemKey(purposeId, label));

          purpose.items.filter((purposeItem) => isPurposeItemEnabled(purposeItem.label)).forEach((purposeItem) => {
            items.push({
              id: nextId(),
              label: purposeItem.label,
              icon: purposeItem.icon,
              tier: 2,
              badge,
              note: purposeItem.note,
              checked: wasChecked.get(purposeItem.label) ?? false,
              temp: false,
              permanent: false,
            });
          });
        }

        // tier 3 — 영구 루틴 (기본 제공 + 사용자 커스텀, 설정 화면에서 자유롭게 삭제 가능)
        // 요일·특정 날짜 조건이 있는 루틴은 오늘 해당할 때만 포함한다 (utils/routines.ts).
        // 이미 같은 이름이 있으면 건너뛴다 — 매일 "지갑"에 그날만 "지갑"을 또 더한 경우 등.
        // 체크 상태가 라벨 기준(wasChecked)이라 두 줄이 생기면 하나만 눌러도 둘 다 체크된다.
        const now = new Date();
        const present = new Set(items.map((i) => i.label));
        permanentRoutines
          .filter((routine) => isRoutineActiveOn(routine, now))
          .forEach((routine) => {
            if (present.has(routine.label)) return;
            present.add(routine.label);
            items.push({ ...routine, id: nextId(), checked: wasChecked.get(routine.label) ?? false });
          });

        set({ checklist: items.map(withForgottenBadge), checklistDate: getTodayString() });
      },

      // 날짜가 바뀌었을 때 호출 — 체크리스트를 새로 빌드하고, 자정을 넘겨도 리셋되지
      // 않는 당일 한정 UI 상태(피드백, 상태바 닫힘 여부)를 함께 초기화한다.
      startNewDay: () => {
        // 날짜가 지난 1회 항목은 하루가 바뀔 때 한 번만 정리한다. buildChecklist에서 하면
        // permanentRoutines 변화 → DashboardScreen 재조립 → 또 정리로 이어진다.
        const today = getTodayString();
        const { permanentRoutines, manualPurpose } = get();
        const pruned = pruneExpiredOneOffs(permanentRoutines, today);
        set({
          ...(pruned.length !== permanentRoutines.length ? { permanentRoutines: pruned } : {}),
          // 어제 목록은 아무것도 이어받지 않는다. 이어받으면 어제 체크한 항목이 오늘도 체크된 채로
          // 뜨고("다 챙겼어요"), "오늘만" 넣은 항목이 다음 날에도 남는다. 날짜를 먼저 오늘로 찍어야
          // 아래 buildChecklist가 다시 이 함수로 돌아오지 않는다.
          checklist: [],
          checklistDate: today,
          // 메모리에 남은 어제 날씨로 오늘 목록을 만들면 어제 비 예보의 우산이 오늘 날짜로 뜬다.
          // 비워 두면 대시보드가 새로 받아 채우고, 못 받으면 "가져오지 못했어요"가 보인다.
          currentWeather: null,
          weatherTimeline: [],
          // 앱을 켜 둔 채 날이 바뀌면 어제 목적이 메모리에 남아 있다 — 오늘 직접 고른 게 아니면 비운다.
          // 캘린더 자동감지는 대시보드가 열릴 때 다시 돈다. 앱 밖(출발 알림·위젯)에서 전환되면
          // 앱을 열기 전까지 목적 준비물 없이 루틴만 알린다 — 어제 일정으로 고른 목적을 쓰는 것보다 낫다.
          ...(isManualPurposeToday(manualPurpose, today)
            ? {}
            : { purposeId: null, autoDetected: false, autoDetectedEvent: null }),
          todayFeedback: null,
          statusDismissed: false,
        });
        get().buildChecklist();
      },

      // 목적
      setPurpose: (id) =>
        set({
          purposeId: id,
          autoDetected: false,
          autoDetectedEvent: null,
          manualPurpose: { date: getTodayString(), id },
        }),

      // 오늘 직접 고른 목적이 있으면 자동감지는 무시한다 — 앱을 켤 때마다 도는 감지가
      // (일정이 없으면 null로) 수동 선택을 지워버리던 문제.
      setAutoDetected: (purposeId, event) => {
        if (isManualPurposeToday(get().manualPurpose, getTodayString())) return;
        set({ purposeId, autoDetected: purposeId !== null, autoDetectedEvent: event });
      },

      // 날씨
      setWeather: (weather) => set({ currentWeather: weather }),

      setTimeline: (slots) => set({ weatherTimeline: slots }),

      setWeatherLoading: (loading) => set({ weatherLoading: loading }),
      setWeatherOutOfArea: (outOfArea) => set({ weatherOutOfArea: outOfArea }),

      // 유저 설정
      updateDepartureTime: (time) => set((state) => patchSettings(state, { departureTime: time })),
      setNightlyCheckTime: (time) => set((state) => patchSettings(state, { nightlyCheckTime: time })),
      // 성향을 다시 고르면 집 밖 머묾 알림도 성향을 따르게 되돌린다 (스위치로 따로 정한 값은 풀림).
      // 같은 성향을 다시 누른 건 바꾼 게 아니다 — 스위치로 끈 값을 지우지 않는다.
      setAlertPreference: (pref) => set((state) =>
        state.userSettings.alertPreference === pref
          ? {}
          : patchSettings(state, { alertPreference: pref, awayPlaceAlert: null })
      ),
      setAwayPlaceAlert: (on) => set((state) => patchSettings(state, { awayPlaceAlert: on })),
      setCommuteMode: (mode) => set((state) => patchSettings(state, { commuteMode: mode })),

      setHomeBssid: (bssid) => set((state) => patchSettings(state, { homeBssid: bssid })),

      setSensitivity: (level) => set((state) => patchSettings(state, { sensitivityLevel: level })),
      setMapApp: (app) => set((state) => patchSettings(state, { mapApp: app })),

      completeOnboarding: () => set((state) => patchSettings(state, { onboarded: true, onboardedDate: getTodayString() })),
      ensureOnboardedDate: () => set((state) =>
        state.userSettings.onboarded && !state.userSettings.onboardedDate
          ? patchSettings(state, { onboardedDate: getTodayString() })
          : {}
      ),

      setWeatherItemEnabled: (label, enabled) =>
        set((state) =>
          patchSettings(state, {
            disabledWeatherItems: enabled
              ? state.userSettings.disabledWeatherItems.filter((l) => l !== label)
              : appendUnique(state.userSettings.disabledWeatherItems, label),
          })
        ),

      setPurposeItemEnabled: (purposeId, label, enabled) =>
        set((state) => {
          const key = purposeItemKey(purposeId, label);
          return patchSettings(state, {
            disabledPurposeItems: enabled
              ? state.userSettings.disabledPurposeItems.filter((k) => k !== key)
              : appendUnique(state.userSettings.disabledPurposeItems, key),
          });
        }),

      addCustomKeyword: (purposeId, keyword) =>
        set((state) => {
          const trimmed = keyword.trim();
          const existing = state.userSettings.customKeywords[purposeId] ?? [];
          // 변화가 없으면 updatedAt도 건드리지 않는다 — 실제 변경이 없는데 수정 시각만
          // 올라가면 동기화에서 엉뚱한 쪽이 최신으로 이긴다.
          if (!trimmed || existing.includes(trimmed)) return state;
          return patchSettings(state, {
            customKeywords: {
              ...state.userSettings.customKeywords,
              [purposeId]: [...existing, trimmed],
            },
          });
        }),

      removeCustomKeyword: (purposeId, keyword) =>
        set((state) => {
          const existing = state.userSettings.customKeywords[purposeId] ?? [];
          if (!existing.includes(keyword)) return state;
          return patchSettings(state, {
            customKeywords: {
              ...state.userSettings.customKeywords,
              [purposeId]: existing.filter((k) => k !== keyword),
            },
          });
        }),

      // 피드백
      // 오늘 이미 준 피드백과 같은 값이면 무시하고, 다른 값으로 바꾸는 경우 이전
      // 보정치를 먼저 되돌린 뒤 새로 적용한다 — 그래야 앱 재시작이나 재선택으로
      // learnedDelta가 중복 조정되지 않는다.
      // 조정 대상은 learnedDelta(학습값)뿐이다. 사용자가 고른 기준값(sensitivityLevel)은
      // 건드리지 않으므로, 나중에 민감도를 다시 골라도 여기 쌓인 학습이 사라지지 않는다.
      // 피드백은 달력 날짜가 아니라 "가장 최근 외출"에 붙는다 (getFeedbackOutingDate).
      // 앱 화면과 자기 전 정리 알림이 같은 규칙을 써야 한다 — 다르면 00:30에 알림으로
      // 답하고 앱에서 또 누를 때 같은 외출이 두 날짜로 갈라져 보정치가 두 번 쌓인다.
      // outingDate는 테스트·특수 경로용으로만 넘긴다.
      applyFeedback: (val, outingDate) =>
        set((state) => {
          const today = getTodayString();
          const date = outingDate ?? getFeedbackOutingDate(state.userSettings.departureTime);
          // 같은 날 답을 바꾸면 이전 답의 보정치를 되돌리고 새 답을 더한다. 이전 답은
          // 그 날짜의 기록에서 찾는다 — todayFeedback은 오늘 것만 들고 있어 전날 외출엔 못 쓴다.
          const previous = state.feedbackHistory.find((r) => r.date === date)?.val ?? null;
          if (previous === val) return {};

          let learnedDelta = state.userSettings.learnedDelta;
          if (previous) learnedDelta -= FEEDBACK_DELTA[previous];
          learnedDelta += FEEDBACK_DELTA[val];

          return {
            ...patchSettings(state, { learnedDelta }),
            // 대시보드의 선택 표시는 오늘 외출 것만 — 전날 외출 답이 오늘 칩에 켜지면 안 된다.
            ...(date === today ? { todayFeedback: val } : {}),
            // 하루 1건씩 영구 누적되는 persist 데이터라 캡이 없으면 무한 성장한다.
            // 화면(설정 패널)에서는 최근 3건만 쓰므로 최근 90건이면 충분하다.
            feedbackHistory: [
              ...state.feedbackHistory.filter((r) => r.date !== date),
              { date, val, updatedAt: Date.now() },
            ]
              .sort((a, b) => a.date.localeCompare(b.date))
              .slice(-90),
          };
        }),

      // 자주 까먹는 항목 — 외출(Wi-Fi 이탈) 감지 시점의 미체크 라벨을 기록한다.
      // WifiMonitorService.checkOnce()가 날짜 기준으로 하루 1회만 부르지만, 같은 날
      // 중복 호출돼도 안전하도록 그날 기록은 교체한다. 뱃지 집계는 최근 7일만 쓰므로
      // 30일치만 남긴다.
      recordForgotten: (labels) =>
        set((state) => {
          if (labels.length === 0) return {};
          const today = getTodayString();
          return {
            forgottenHistory: [
              ...state.forgottenHistory.filter((r) => r.date !== today),
              { date: today, labels },
            ].slice(-30),
          };
        }),

      // AI 연결 — 동의 없이 켜지지 않게, 켜는 경로는 setAiConsent 이후에만 쓴다.
      setAiEnabled: (enabled) => set((state) => ({ ai: { ...state.ai, enabled } })),

      // 동의를 철회(null)하면 AI도 함께 끄고, 그동안 받은 해석 결과도 지운다 —
      // 개인정보처리방침에 "끄거나 키를 삭제하면 동의도 철회"된다고 고지하므로, 철회 후에
      // 호출이 나가거나 철회 전 결과가 남아 있으면 안 된다.
      setAiConsent: (provider) =>
        set((state) => ({
          ai: {
            ...state.ai,
            consentedProvider: provider,
            enabled: provider === null ? false : state.ai.enabled,
            status: 'ok',
            pausedDay: null,
            hintCache: provider === null ? {} : state.ai.hintCache,
          },
        })),

      setAiStatus: (status) =>
        set((state) => ({
          ai: { ...state.ai, status, pausedDay: status === 'quotaExceeded' ? getTodayString() : null },
        })),

      recordAiCall: () =>
        set((state) => ({ ai: { ...state.ai, usage: recordCall(state.ai.usage, getTodayString()) } })),

      putAiHints: (entries) =>
        set((state) => ({
          ai: { ...state.ai, hintCache: pruneHintCache({ ...state.ai.hintCache, ...entries }, Date.now()) },
        })),

      rejectAiSuggestion: (key) =>
        set((state) => {
          const entry = state.ai.hintCache[key];
          if (!entry) return {};
          return {
            ai: { ...state.ai, hintCache: { ...state.ai.hintCache, [key]: { ...entry, decision: 'rejected' } } },
          };
        }),

      // 수락 = 학습 승격(설계 3장 L2). 목적이 있으면 그 일정 제목을 자동감지 키워드로
      // 추가해서 다음부터는 AI 없이 로컬에서 처리되게 하고, 준비물은 오늘만 항목으로 넣는다.
      // 키워드는 사용자가 직접 수락한 것만, 설정 화면에서 보이고 지울 수 있는 형태로 저장된다.
      // ⚠️ customKeywords는 userSettings 안에 있어 [계정 동기화 대상]이다. 즉 수락한 일정
      // 제목은 계정 동기화를 붙이면 기기 밖으로 나간다. 동기화를 구현할 때 개인정보처리방침의
      // "수락한 경우 일정 제목이 키워드로 저장" 고지에 동기화 사실도 함께 적어야 한다.
      acceptAiSuggestion: (suggestion) => {
        const { purposeId, items, key, title } = suggestion;
        if (purposeId) get().addCustomKeyword(purposeId, title);

        // 준비물 추가와 수락 표시는 한 번의 set으로 — 항목마다 따로 부르면 그 수만큼 저장이 돈다.
        set((state) => {
          const existing = new Set(state.checklist.map((item) => item.label));
          const added = items.filter((label) => !existing.has(label)).map(newTempItem);
          const entry = state.ai.hintCache[key];
          return {
            ...(added.length > 0 ? { checklist: [...state.checklist, ...added] } : {}),
            ...(entry
              ? { ai: { ...state.ai, hintCache: { ...state.ai.hintCache, [key]: { ...entry, decision: 'accepted' as const } } } }
              : {}),
          };
        });
      },

      // 템플릿 개인화(AI 연결 설계 11장). 계획은 buildPersonalizePlan()이 이미 검증·중복 제거한
      // "추가만" 계획이라 여기서는 그대로 반영한다. userSettings 변경은 patchSettings 한 번으로
      // 모아서 updatedAt이 한 번만 올라가게 한다.
      applyPersonalization: (plan) =>
        set((state) => {
          const settings = state.userSettings;
          const patch: Partial<UserSettings> = {};
          if (plan.departureTime) patch.departureTime = plan.departureTime.to;
          if (plan.sensitivity) patch.sensitivityLevel = plan.sensitivity.to;

          if (plan.keywords.length > 0) {
            const customKeywords = { ...settings.customKeywords };
            plan.keywords.forEach(({ purposeId, keyword }) => {
              const existing = customKeywords[purposeId] ?? [];
              if (!existing.includes(keyword)) customKeywords[purposeId] = [...existing, keyword];
            });
            patch.customKeywords = customKeywords;
          }

          if (plan.disableItems.length > 0) {
            const keys = plan.disableItems
              .map(({ purposeId, label }) => purposeItemKey(purposeId, label))
              .filter((key) => !settings.disabledPurposeItems.includes(key));
            if (keys.length > 0) patch.disabledPurposeItems = [...settings.disabledPurposeItems, ...keys];
          }

          const existingLabels = new Set(state.permanentRoutines.filter((r) => !isOneOff(r)).map((r) => r.label));
          const newRoutines: ChecklistItem[] = plan.routines
            .filter(({ label }) => !existingLabels.has(label))
            .map(({ label, days }) => newRoutine(label, days ? { days } : {}));

          return {
            ...patchSettings(state, patch),
            ...(newRoutines.length > 0 ? { permanentRoutines: [...state.permanentRoutines, ...newRoutines] } : {}),
          };
        }),

      recordLeaveIntent: () => set({ leaveIntent: { date: getTodayString(), at: Date.now() } }),
      clearLeaveIntent: () => set({ leaveIntent: null }),

      // UI
      dismissStatus: () => set({ statusDismissed: true }),
      showToast: (message, action) => set({ toast: message, toastAction: action ?? null }),
      clearToast: () => set({ toast: null, toastAction: null }),
      requestScrollToChecklist: () => set({ scrollToChecklistRequested: true }),
      clearScrollToChecklistRequest: () => set({ scrollToChecklistRequested: false }),
      requestTomorrowPreview: () => set({ tomorrowPreviewRequested: true }),
      clearTomorrowPreviewRequest: () => set({ tomorrowPreviewRequested: false }),
    }),
    {
      name: 'ahmatda-storage',
      storage: createJSONStorage(() => dedupedAsyncStorage),

      // 저장 스키마 버전. 앞으로 필드 이름이나 구조가 바뀔 때마다 올리고 migrate에
      // 변환을 추가한다. version 없이 출시하면 이미 기기에 깔린 데이터를 나중에
      // 구분할 방법이 없어져서, 출시 전에 반드시 잡아둬야 하는 값이다.
      version: 2,

      // v0 → v1: 아이템 id를 number에서 string으로 바꿈.
      // v1 → v2: deltaOffset(기준값+학습값 혼합)을 learnedDelta(학습값만)로 분리.
      migrate: (persistedState, version) => {
        let state = (persistedState ?? {}) as Record<string, unknown>;

        if (version < 1) state = migrateV0toV1(state);
        if (version < 2) state = migrateV1toV2(state);

        // 어느 경로로 올라왔든 updatedAt이 비어 있으면 채운다.
        state = seedUpdatedAt(state);

        // 마이그레이션 결과는 "저장된 부분집합"이라 AppStore 전체를 만족하지 않는다.
        // 빠진 필드는 뒤이어 실행되는 merge가 defaultState에서 채운다.
        return state as unknown as AppStore;
      },

      // 기본 merge는 최상위 키만 얕게 합치기 때문에, 예전 버전에 저장된 userSettings에
      // 새로 추가된 필드(예: disabledPurposeItems)가 없으면 그대로 undefined가 된다.
      // userSettings만 defaultState 기준으로 한 겹 더 깊게 합쳐서 항상 완전한 형태를 보장한다.
      merge: (persistedState, currentState) => {
        const persisted = persistedState as Partial<AppStore> | undefined;
        return {
          ...currentState,
          ...persisted,
          userSettings: { ...currentState.userSettings, ...persisted?.userSettings },
          // 오늘 직접 고른 목적이면 되살린다. 복원 직후 체크리스트 재빌드가 목적 준비물을
          // 빼버리지 않게 merge 단계에서 바로 넣는다.
          ...restoredPurposeState(persisted?.manualPurpose, getTodayString()),
          // ai도 나중에 필드가 늘 수 있어 같은 이유로 한 겹 더 합친다.
          // 해석 결과 캐시는 앱이 켜질 때마다 만료분을 지운다 — 새 호출이 없어도(AI를 끄고
          // 안 쓰는 경우 등) 개인정보처리방침의 "180일 후 자동 삭제"가 지켜지게.
          ai: {
            ...currentState.ai,
            ...persisted?.ai,
            hintCache: pruneHintCache(persisted?.ai?.hintCache ?? {}, Date.now()),
          },
        };
      },
      // 나중에 계정을 붙일 때를 위한 구분:
      //   [계정 동기화 대상]  permanentRoutines, userSettings(homeBssid 제외),
      //                      feedbackHistory, forgottenHistory
      //   [기기 로컬 전용]    checklist/checklistDate(오늘 것), todayFeedback, leaveIntent,
      //                      userSettings.homeBssid(기기가 붙는 AP는 기기마다 다름),
      //                      WeatherService 날씨 캐시, WifiMonitorService 알림 dedup 키,
      //                      ai(키가 기기 보안 저장소에 있어 다른 기기로 옮기면 안 됨)
      partialize: (state) => ({
        checklist: state.checklist,
        checklistDate: state.checklistDate,
        // 오늘 직접 고른 목적. 목적 id만이라 캘린더 일정 내용은 저장되지 않는다.
        manualPurpose: state.manualPurpose,
        permanentRoutines: state.permanentRoutines,
        userSettings: state.userSettings,
        feedbackHistory: state.feedbackHistory,
        forgottenHistory: state.forgottenHistory,
        // 같은 날 앱이 재시작돼도(기기 재부팅, 강제 종료 등) 오늘 이미 준 피드백을
        // 기억해야 applyFeedback의 재선택 방지 로직이 제대로 동작한다.
        todayFeedback: state.todayFeedback,
        // 캐시 키는 일정 제목의 해시라 제목 원문은 저장되지 않는다(services/ai/hints.ts).
        ai: state.ai,
        // 앱이 꺼졌다 켜져도(잠금화면 액션은 앱 프로세스 밖에서 돌 수 있다) 오늘 누른
        // 기록이 남아야 외출 판정에 쓸 수 있다. 기기 로컬 전용.
        leaveIntent: state.leaveIntent,
      }),
    }
  )
);

// persist 복원이 끝날 때까지 기다린다. 알림 액션은 앱이 종료된 상태에서도(headless)
// 실행될 수 있는데, 그때 바로 getState()를 읽으면 AsyncStorage 복원 전 기본값
// (빈 체크리스트)을 보고 "다 챙겼어요"라고 판단해버린다.
export function whenHydrated(): Promise<void> {
  if (useAppStore.persist.hasHydrated()) return Promise.resolve();
  return new Promise((resolve) => {
    const unsub = useAppStore.persist.onFinishHydration(() => {
      unsub();
      resolve();
    });
  });
}
