// 아맞다 — 외출 판정 신호 기록 (docs/외출-감지-재설계.md 3장, 6단계)
//
// Wi-Fi 이탈·복귀와 집 반경 이탈·재진입이 "언제" 있었는지만 기기에 남긴다. 좌표는 남기지 않는다
// (8장 원칙). 걷기 시작은 네이티브 모듈이 따로 들고 있고, [떠나기]는 store에 있다 — 판정할 때
// DepartureService가 셋을 모아 decideDeparture에 넘긴다.
//
// 신호는 서로 다른 실행 맥락에서 들어온다: 앱 화면의 Wi-Fi 리스너, 백그라운드 폴링, 지오펜스
// 태스크. 그래서 메모리가 아니라 AsyncStorage에 둔다.

import AsyncStorage from '@react-native-async-storage/async-storage';
import { SAFETY_MAX_AGE_MS, type DepartureSignal } from './decide';

const LOG_KEY = 'departure_signal_log';

// 판정이 보는 가장 오래된 신호(안전장치 2시간)보다 조금 더 둔다.
export const LOG_RETENTION_MS = SAFETY_MAX_AGE_MS + 60 * 60 * 1000;

export type LoggedSignalType = 'wifiExit' | 'wifiReturn' | 'locationExit' | 'locationEnter';

const WIFI: ReadonlySet<LoggedSignalType> = new Set(['wifiExit', 'wifiReturn']);
const LOCATION: ReadonlySet<LoggedSignalType> = new Set(['locationExit', 'locationEnter']);

// 순수 함수 — 기록에 신호 하나를 더한다.
// 같은 출처(Wi-Fi / 위치)의 마지막 상태와 같으면 더하지 않는다. 폴링이 15분마다 "집 밖"을
// 다시 보더라도 이탈 시각은 처음 본 때로 남아야 안전장치(이탈 후 5분)가 제대로 센다.
export function appendSignal(
  log: DepartureSignal[],
  signal: { type: LoggedSignalType; at: number },
  now: number
): DepartureSignal[] {
  const kept = log.filter((s) => now - s.at <= LOG_RETENTION_MS);
  const source = WIFI.has(signal.type) ? WIFI : LOCATION;
  const last = lastOf(kept, source);
  if (last?.type === signal.type) return kept;
  return [...kept, { type: signal.type, at: signal.at }].sort((a, b) => a.at - b.at);
}

function lastOf(log: DepartureSignal[], source: ReadonlySet<LoggedSignalType>): DepartureSignal | undefined {
  let last: DepartureSignal | undefined;
  for (const s of log) {
    if (source.has(s.type as LoggedSignalType) && (!last || s.at >= last.at)) last = s;
  }
  return last;
}

// 같은 JS 런타임 안에서 읽고-고쳐-쓰기가 겹치지 않게 줄 세운다 (Wi-Fi 리스너와 지오펜스
// 태스크가 거의 동시에 들어오는 경우 — 현관을 나서는 순간이 바로 그렇다).
let queue: Promise<unknown> = Promise.resolve();

function serialized<T>(work: () => Promise<T>): Promise<T> {
  const next = queue.then(work, work);
  queue = next.catch(() => {});
  return next;
}

async function read(): Promise<DepartureSignal[]> {
  try {
    const raw = await AsyncStorage.getItem(LOG_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export const SignalLog = {
  record(type: LoggedSignalType, at: number = Date.now()): Promise<void> {
    return serialized(async () => {
      const next = appendSignal(await read(), { type, at }, Date.now());
      await AsyncStorage.setItem(LOG_KEY, JSON.stringify(next));
    });
  },

  // 판정용. 기록과 같은 줄에 세워서, 방금 들어온 신호를 읽기 전에 판정하는 일이 없게 한다.
  getAll(): Promise<DepartureSignal[]> {
    return serialized(read);
  },

  // 진단 화면의 "테스트 기록 지우기" — 같은 날 실기기 시나리오를 반복할 때
  clear(): Promise<void> {
    return serialized(() => AsyncStorage.removeItem(LOG_KEY));
  },
};
