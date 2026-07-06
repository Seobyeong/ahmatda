// 아맞다 — 전역 상태 스토어 (Zustand + AsyncStorage persist)

import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { PURPOSES, findMatchingEvent } from '../constants/purposes';
import { FEEDBACK_DELTA } from '../constants/feedback';
import { getTodayString } from '../utils/time';
import { countRecentForgotten, getForgottenBadge } from '../utils/forgotten';
import type {
  CalendarEvent,
  ChecklistItem,
  CurrentWeather,
  FeedbackRecord,
  FeedbackType,
  ForgottenRecord,
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

  // UI 상태
  statusDismissed: boolean;
  toast: string | null;
  scrollToChecklistRequested: boolean; // 알림 탭(딥링크)으로 체크리스트 스크롤 요청
}

interface AppActions {
  // 체크리스트
  toggleCheck: (id: number) => void;
  checkAll: () => void;
  uncheckAll: () => void;
  addTempItem: (label: string) => void;
  addPermanentRoutine: (label: string) => void;
  deleteItem: (id: number) => void;
  removePermanentRoutine: (id: number) => void;
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
  updateDeltaOffset: (delta: number) => void;
  setHomeBssid: (bssid: string) => void;
  setSensitivity: (level: 1 | 2 | 3 | 4 | 5) => void;
  completeOnboarding: () => void;
  setWeatherItemEnabled: (label: string, enabled: boolean) => void;
  setPurposeItemEnabled: (purposeId: PurposeId, label: string, enabled: boolean) => void;

  // 피드백
  applyFeedback: (val: FeedbackType) => void;

  // 자주 까먹는 항목
  recordForgotten: (labels: string[]) => void;

  // UI
  dismissStatus: () => void;
  showToast: (message: string) => void;
  clearToast: () => void;
  requestScrollToChecklist: () => void;
  clearScrollToChecklistRequest: () => void;
}

type AppStore = AppState & AppActions;

// 체크리스트/루틴 아이템 id 생성 — 세션 내에서 항상 유일하도록 단조 증가 카운터를 쓴다.
// 이전에는 각 액션(임시 항목 추가/루틴 추가/체크리스트 재빌드)이 각자
// `Date.now() + 로컬 인덱스`로 독립 계산했는데, 서로 다른 액션이 같은 밀리초에
// 우연히 같은 값을 계산할 수 있어 이론상 id 충돌이 가능했다.
let nextItemId = Date.now();
function generateItemId(): number {
  return nextItemId++;
}

// 기본 제공 루틴 — permanentRoutines의 초기 시드값. 다른 커스텀 루틴과 동일하게
// 설정 화면 "내 루틴" 목록에서 사용자가 자유롭게 삭제할 수 있다.
// 목적별(tier2) 준비물은 같은 라벨이 여러 목적에 중복 등장하므로(예: '노트북'이 출근/공부
// 둘 다에 있음) 목적별로 구분해서 끄고 켤 수 있게 "purposeId:라벨" 형식의 키를 쓴다.
const purposeItemKey = (purposeId: PurposeId, label: string) => `${purposeId}:${label}`;

const DEFAULT_ROUTINES: ChecklistItem[] = [
  { id: 1, label: '집 열쇠', icon: 'key', tier: 3, badge: null, checked: false, temp: false, permanent: true },
  { id: 2, label: '지갑', icon: 'wallet', tier: 3, badge: null, checked: false, temp: false, permanent: true },
  { id: 3, label: '에어팟', icon: 'headphones', tier: 3, badge: null, checked: false, temp: false, permanent: true },
];

const defaultState: AppState = {
  checklist: [],
  checklistDate: null,
  permanentRoutines: DEFAULT_ROUTINES,

  purposeId: null,
  autoDetected: false,
  autoDetectedEvent: null,

  currentWeather: null,
  weatherTimeline: [],
  weatherLoading: false,
  weatherOutOfArea: false,

  userSettings: {
    departureTime: '08:15',
    deltaOffset: 0,
    homeBssid: null,
    sensitivityLevel: 3,
    onboarded: false,
    disabledWeatherItems: [],
    disabledPurposeItems: [],
  },

  feedbackHistory: [],
  todayFeedback: null,

  forgottenHistory: [],

  statusDismissed: false,
  toast: null,
  scrollToChecklistRequested: false,
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

      addTempItem: (label) =>
        set((state) => ({
          checklist: [
            ...state.checklist,
            {
              id: generateItemId(),
              label,
              icon: 'sparkles',
              tier: 0,
              badge: null,
              checked: false,
              temp: true,
              permanent: false,
            },
          ],
        })),

      addPermanentRoutine: (label) =>
        set((state) => ({
          permanentRoutines: [
            ...state.permanentRoutines,
            {
              id: generateItemId(),
              label,
              icon: 'check-circle',
              tier: 3,
              badge: null,
              checked: false,
              temp: false,
              permanent: true,
            },
          ],
        })),

      deleteItem: (id) => {
        const item = get().checklist.find((i) => i.id === id);
        if (!item) return;

        set((state) => ({
          checklist: state.checklist.filter((i) => i.id !== id),
        }));

        if (item.permanent) {
          set((state) => ({
            permanentRoutines: state.permanentRoutines.filter(
              (routine) => routine.label !== item.label
            ),
          }));
        }

        // tier 1(날씨 트리거)·tier 2(목적별) 항목은 매번 새로 생성되므로, 여기서 지우면
        // 그 순간만 사라졌다가 다음 재빌드 때 다시 나타난다. 사용자의 "삭제" 의도를
        // 지속시키려면 영구적으로 비활성화해야 한다.
        if (item.tier === 1) {
          set((state) => ({
            userSettings: {
              ...state.userSettings,
              disabledWeatherItems: state.userSettings.disabledWeatherItems.includes(item.label)
                ? state.userSettings.disabledWeatherItems
                : [...state.userSettings.disabledWeatherItems, item.label],
            },
          }));
        }

        if (item.tier === 2) {
          const { purposeId } = get();
          if (purposeId) {
            const key = purposeItemKey(purposeId, item.label);
            set((state) => ({
              userSettings: {
                ...state.userSettings,
                disabledPurposeItems: state.userSettings.disabledPurposeItems.includes(key)
                  ? state.userSettings.disabledPurposeItems
                  : [...state.userSettings.disabledPurposeItems, key],
              },
            }));
          }
        }
      },

      removePermanentRoutine: (id) =>
        set((state) => ({
          permanentRoutines: state.permanentRoutines.filter((routine) => routine.id !== id),
        })),

      buildChecklist: () => {
        const { currentWeather, purposeId, permanentRoutines, userSettings, checklist: prevChecklist, forgottenHistory } = get();
        const nextId = generateItemId;

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
          if (currentWeather.rainAlert && isWeatherItemEnabled('우산')) {
            items.push({
              id: nextId(),
              label: '우산',
              icon: 'umbrella',
              tier: 1,
              badge: '오늘 비 예보',
              checked: wasChecked.get('우산') ?? false,
              temp: false,
              permanent: false,
            });
          }
          if (currentWeather.dustLevel === '나쁨' && isWeatherItemEnabled('마스크')) {
            items.push({
              id: nextId(),
              label: '마스크',
              icon: 'wind',
              tier: 1,
              badge: '미세먼지 나쁨',
              checked: wasChecked.get('마스크') ?? false,
              temp: false,
              permanent: false,
            });
          }
          if (currentWeather.heatAlert && isWeatherItemEnabled('물병')) {
            items.push({
              id: nextId(),
              label: '물병',
              icon: 'droplets',
              tier: 1,
              badge: '폭염 대비',
              checked: wasChecked.get('물병') ?? false,
              temp: false,
              permanent: false,
            });
          }
        }

        // tier 2 — 목적별
        if (purposeId) {
          const purpose = PURPOSES[purposeId];
          const matchedEvent = currentWeather
            ? findMatchingEvent(purposeId, currentWeather.calendarEvents, userSettings.departureTime)
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
        permanentRoutines.forEach((routine) => {
          items.push({ ...routine, id: nextId(), checked: wasChecked.get(routine.label) ?? false });
        });

        set({ checklist: items.map(withForgottenBadge), checklistDate: getTodayString() });
      },

      // 날짜가 바뀌었을 때 호출 — 체크리스트를 새로 빌드하고, 자정을 넘겨도 리셋되지
      // 않는 당일 한정 UI 상태(피드백, 상태바 닫힘 여부)를 함께 초기화한다.
      startNewDay: () => {
        get().buildChecklist();
        set({ todayFeedback: null, statusDismissed: false });
      },

      // 목적
      setPurpose: (id) =>
        set({ purposeId: id, autoDetected: false, autoDetectedEvent: null }),

      setAutoDetected: (purposeId, event) =>
        set({ purposeId, autoDetected: purposeId !== null, autoDetectedEvent: event }),

      // 날씨
      setWeather: (weather) => set({ currentWeather: weather }),

      setTimeline: (slots) => set({ weatherTimeline: slots }),

      setWeatherLoading: (loading) => set({ weatherLoading: loading }),
      setWeatherOutOfArea: (outOfArea) => set({ weatherOutOfArea: outOfArea }),

      // 유저 설정
      updateDepartureTime: (time) =>
        set((state) => ({
          userSettings: { ...state.userSettings, departureTime: time },
        })),

      updateDeltaOffset: (delta) =>
        set((state) => ({
          userSettings: { ...state.userSettings, deltaOffset: delta },
        })),

      setHomeBssid: (bssid) =>
        set((state) => ({
          userSettings: { ...state.userSettings, homeBssid: bssid },
        })),

      setSensitivity: (level) =>
        set((state) => ({
          userSettings: { ...state.userSettings, sensitivityLevel: level },
        })),

      completeOnboarding: () =>
        set((state) => ({
          userSettings: { ...state.userSettings, onboarded: true },
        })),

      setWeatherItemEnabled: (label, enabled) =>
        set((state) => ({
          userSettings: {
            ...state.userSettings,
            disabledWeatherItems: enabled
              ? state.userSettings.disabledWeatherItems.filter((l) => l !== label)
              : state.userSettings.disabledWeatherItems.includes(label)
                ? state.userSettings.disabledWeatherItems
                : [...state.userSettings.disabledWeatherItems, label],
          },
        })),

      setPurposeItemEnabled: (purposeId, label, enabled) =>
        set((state) => {
          const key = purposeItemKey(purposeId, label);
          return {
            userSettings: {
              ...state.userSettings,
              disabledPurposeItems: enabled
                ? state.userSettings.disabledPurposeItems.filter((k) => k !== key)
                : state.userSettings.disabledPurposeItems.includes(key)
                  ? state.userSettings.disabledPurposeItems
                  : [...state.userSettings.disabledPurposeItems, key],
            },
          };
        }),

      // 피드백
      // 오늘 이미 준 피드백과 같은 값이면 무시하고, 다른 값으로 바꾸는 경우 이전
      // 보정치를 먼저 되돌린 뒤 새로 적용한다 — 그래야 앱 재시작이나 재선택으로
      // deltaOffset이 중복 조정되지 않는다.
      applyFeedback: (val) =>
        set((state) => {
          if (state.todayFeedback === val) return {};

          let deltaOffset = state.userSettings.deltaOffset;
          if (state.todayFeedback) deltaOffset -= FEEDBACK_DELTA[state.todayFeedback];
          deltaOffset += FEEDBACK_DELTA[val];

          const today = getTodayString();
          return {
            userSettings: { ...state.userSettings, deltaOffset },
            todayFeedback: val,
            // 하루 1건씩 영구 누적되는 persist 데이터라 캡이 없으면 무한 성장한다.
            // 화면(설정 패널)에서는 최근 3건만 쓰므로 최근 90건이면 충분하다.
            feedbackHistory: [
              ...state.feedbackHistory.filter((r) => r.date !== today),
              { date: today, val },
            ].slice(-90),
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

      // UI
      dismissStatus: () => set({ statusDismissed: true }),
      showToast: (message) => set({ toast: message }),
      clearToast: () => set({ toast: null }),
      requestScrollToChecklist: () => set({ scrollToChecklistRequested: true }),
      clearScrollToChecklistRequest: () => set({ scrollToChecklistRequested: false }),
    }),
    {
      name: 'ahmatda-storage',
      storage: createJSONStorage(() => AsyncStorage),
      // 기본 merge는 최상위 키만 얕게 합치기 때문에, 예전 버전에 저장된 userSettings에
      // 새로 추가된 필드(예: disabledPurposeItems)가 없으면 그대로 undefined가 된다.
      // userSettings만 defaultState 기준으로 한 겹 더 깊게 합쳐서 항상 완전한 형태를 보장한다.
      merge: (persistedState, currentState) => {
        const persisted = persistedState as Partial<AppStore> | undefined;
        return {
          ...currentState,
          ...persisted,
          userSettings: { ...currentState.userSettings, ...persisted?.userSettings },
        };
      },
      partialize: (state) => ({
        checklist: state.checklist,
        checklistDate: state.checklistDate,
        permanentRoutines: state.permanentRoutines,
        userSettings: state.userSettings,
        feedbackHistory: state.feedbackHistory,
        forgottenHistory: state.forgottenHistory,
        // 같은 날 앱이 재시작돼도(기기 재부팅, 강제 종료 등) 오늘 이미 준 피드백을
        // 기억해야 applyFeedback의 재선택 방지 로직이 제대로 동작한다.
        todayFeedback: state.todayFeedback,
      }),
    }
  )
);
