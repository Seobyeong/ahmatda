// 아맞다 — 귀가 루틴 연결 (C4). 판단은 homecoming.ts의 순수 함수가, 여기서는 저장·알림만.
//
// 나간 것: 외출 확정·집 반경 이탈 (markOutingToday) — Wi-Fi가 끊긴 것만으로는 세지 않는다
//          (집에서 Wi-Fi를 끈 채 30분이 지나 다시 켜면 귀가로 잘못 알리게 된다).
// 돌아온 것: 집 Wi-Fi에 붙은 것을 봄 (백그라운드 확인·앱 복귀) · 집 반경 재진입.

import AsyncStorage from '@react-native-async-storage/async-storage';
import { getTodayString } from '@/utils/time';
import { EMPTY_HOMECOMING, arrivedHome, homecomingTasks, withLeft, withSent, type HomecomingState } from './homecoming';

const KEY = 'homecoming_state';

let queue: Promise<unknown> = Promise.resolve();
function serialized<T>(work: () => Promise<T>): Promise<T> {
  const next = queue.then(work, work);
  queue = next.catch(() => {});
  return next;
}

async function read(): Promise<HomecomingState> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    return raw ? { ...EMPTY_HOMECOMING, ...(JSON.parse(raw) as Partial<HomecomingState>) } : EMPTY_HOMECOMING;
  } catch {
    return EMPTY_HOMECOMING;
  }
}

async function write(state: HomecomingState): Promise<void> {
  await AsyncStorage.setItem(KEY, JSON.stringify(state));
}

export const HomecomingService = {
  noteLeft(now: number = Date.now()): Promise<void> {
    return serialized(async () => {
      const state = await read();
      const next = withLeft(state, now, getTodayString());
      if (next !== state) await write(next);
    }).catch(() => {});
  },

  noteHome(now: number = Date.now()): Promise<void> {
    return serialized(async () => {
      const state = await read();
      if (state.leftAt === null) return;
      const today = getTodayString();
      const { state: next, notify } = arrivedHome(state, now, today);
      await write(next);
      if (!notify) return;

      // 동적 import — store·알림은 이 모듈을 부르는 쪽(outingLog 등)과 순환이 생긴다
      const { useAppStore, whenHydrated } = await import('@/store');
      await whenHydrated();
      const { userSettings, checklist, checklistDate } = useAppStore.getState();
      if (!userSettings.homecomingAlert) return;
      // 챙겨 나간 것은 나간 날의 목록이다 (자정 넘어 돌아왔으면 어제 목록)
      const packed = checklistDate === state.leftDate ? checklist.filter((i) => i.checked).map((i) => i.label) : [];
      const tasks = homecomingTasks(userSettings.homecomingTasks, packed);
      if (tasks.length === 0) return;
      const { NotificationService } = await import('@/services/notification/NotificationService');
      await NotificationService.showHomecoming(tasks);
      // 실제로 보냈을 때만 그날 한 번을 쓴다
      await write(withSent(next, today));
    }).catch(() => {});
  },

  inspect(): Promise<HomecomingState> {
    return read();
  },
};
