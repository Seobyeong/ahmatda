// 아맞다 — AI 일정 해석 미리 계산 (docs/AI-연결-설계.md 4장 "지연 0")
//
// 화면과 알림은 AI를 기다리지 않는다. 이 서비스가 뒤에서 결과를 캐시에 채워두고,
// 화면은 buildSuggestions()로 캐시만 읽는다. 출발 알림 경로(BackgroundTaskService
// ._runCheck)에서는 절대 부르지 않는다.
//
// 모든 실패는 조용히 끝난다 — AI가 실패해도 앱의 핵심 판단은 그대로 동작해야 한다.

import { useAppStore } from '@/store';
import { getTodayString } from '@/utils/time';
import { AiKeyStore } from './AiKeyStore';
import { AiCallError, classifyEventsWithAnthropic } from './anthropic';
import { canCallToday, hashTitle, pickTitlesForAi } from './hints';
import type { AiHintEntry } from '@/types';

// 대시보드 진입과 백그라운드 fetch가 겹치면 동시에 두 번 호출하지 않고 순서대로 처리한다.
// 앞 실행에 합쳐버리면 뒤 호출이 가져온 일정(예: 내일 일정)이 그 회차에 통째로 빠진다.
// 뒤 실행은 앞 실행이 채운 캐시를 보고 이미 물어본 제목은 건너뛰므로 중복 호출은 없다.
let queue: Promise<void> = Promise.resolve();

export const AiHintService = {
  precompute(events: { title: string }[]): Promise<void> {
    queue = queue.then(() => run(events)).catch(() => {});
    return queue;
  },
};

// 켜져 있고, 지금 제공자에 동의했는지. 키를 읽는 동안이나 응답을 기다리는 동안 사용자가
// 끄거나 키를 지울 수 있으므로, await 전후로 매번 다시 확인한다.
function isAllowed(): boolean {
  const { ai } = useAppStore.getState();
  return ai.enabled && ai.consentedProvider === ai.provider;
}

async function run(events: { title: string }[]): Promise<void> {
  if (!isAllowed()) return;

  const { ai, userSettings } = useAppStore.getState();
  const today = getTodayString();

  // 키 무효·한도 초과로 멈춰 있으면 호출하지 않는다
  if (ai.status === 'invalidKey') return;
  if (ai.status === 'quotaExceeded') {
    if (ai.pausedDay === today) return;
    useAppStore.getState().setAiStatus('ok'); // 다음 날 자동 재개
  }
  if (!canCallToday(ai.usage, today)) return;

  // L0 + L1: 로컬 키워드에 걸리거나 이미 물어본 제목은 빼고, 남은 게 없으면 호출하지 않는다
  const titles = pickTitlesForAi(events, userSettings.customKeywords, ai.hintCache);
  if (titles.length === 0) return;

  const apiKey = await AiKeyStore.get(ai.provider);
  if (!apiKey || !isAllowed()) return;

  // 상한은 실패한 호출도 센다 — 키가 틀렸거나 서버가 계속 실패해도 하루 몇 번 이상은 안 나간다.
  useAppStore.getState().recordAiCall();

  const now = Date.now();
  const store = () => useAppStore.getState();
  try {
    const hints = await classifyEventsWithAnthropic(apiKey, titles);
    // 응답을 기다리는 사이 사용자가 끄거나 동의를 철회했으면 결과를 남기지 않는다.
    if (!isAllowed()) return;
    const entries: Record<string, AiHintEntry> = {};
    titles.forEach((title, i) => {
      entries[hashTitle(title)] = { hint: hints[i], createdAt: now };
    });
    store().putAiHints(entries);
  } catch (e) {
    if (!isAllowed()) return;
    const kind = e instanceof AiCallError ? e.kind : 'transient';
    if (kind === 'auth') store().setAiStatus('invalidKey');
    else if (kind === 'quota') store().setAiStatus('quotaExceeded');
    else if (kind === 'unusable') {
      // 응답은 왔는데 못 쓰는 경우(거절·잘림). 혼자 보낸 제목이면 그 제목이 원인이므로
      // "모름"으로 굳혀 다시 묻지 않는다. 여럿을 묶어 보냈으면 어느 제목 때문인지 모르므로
      // 다음에 한 제목씩 따로 묻게 표시만 한다 — 문제없는 제목까지 180일간 막히지 않게.
      const single = titles.length === 1;
      const entries: Record<string, AiHintEntry> = {};
      titles.forEach((title) => {
        entries[hashTitle(title)] = single
          ? { hint: null, createdAt: now }
          : { hint: null, retrySingly: true, createdAt: now };
      });
      store().putAiHints(entries);
    }
    // transient: 아무것도 남기지 않는다 — 다음 미리 계산 시점에 다시 시도
  }
}
