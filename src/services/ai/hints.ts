// 아맞다 — AI 일정 해석의 순수 로직 (docs/AI-연결-설계.md 3장 "호출을 줄이는 층")
//
// 네이티브·네트워크 의존 없이 유닛테스트로 검증할 수 있게 분리했다. 토큰이 새는
// 지점(이미 아는 일정을 또 보냄, 같은 제목을 다시 물음, 상한 없이 호출)은 전부
// 여기서 막는다.

import { PURPOSE_ORDER, matchPurposeByTitle, type CustomKeywords } from '@/constants/purposes';
import type { AiEventHint, AiHintEntry, AiUsage, PurposeId } from '@/types';

export const MAX_ITEMS_PER_HINT = 3;
export const MAX_ITEM_LABEL_LENGTH = 12;
export const MAX_TITLES_PER_CALL = 5;
// 하루 호출 상한 — 키 설정 실수나 버그로 요금이 폭주하지 않게 막는 장치. 정상 사용이면
// 하루치 미분류 일정을 한 번에 묶으므로(L3) 1~2회면 충분하다.
export const DAILY_CALL_LIMIT = 3;
const CACHE_TTL_MS = 180 * 24 * 60 * 60 * 1000;
const CACHE_MAX_ENTRIES = 300;

// CalendarService가 제목 없는 일정에 넣는 기본값 — 보내봐야 해석할 게 없다.
const UNTITLED = '제목 없음';

// 매일 챙기는 물건은 기본 루틴이 이미 맡는다. 프롬프트로도 빼달라고 하지만,
// 모델이 넣어 보내도 여기서 한 번 더 거른다.
const DAILY_ITEMS = new Set(['지갑', '휴대폰', '핸드폰', '스마트폰', '열쇠', '집 열쇠', '집열쇠']);

// 같은 일정이 공백·대소문자만 다르게 들어와도 같은 캐시 항목을 쓰게 한다.
export function normalizeTitle(title: string): string {
  return title.normalize('NFC').trim().replace(/\s+/g, ' ').toLowerCase();
}

// 캐시 키. 개인정보처리방침상 일정 제목 원문은 기기에도 저장하지 않으므로 해시만 남긴다.
// 충돌 위험을 줄이려고 시드가 다른 FNV-1a 32비트 두 개를 이어 붙인다(64비트).
// 보안용 해시가 아니라 "원문을 그대로 남기지 않는" 용도다.
export function hashTitle(title: string): string {
  const normalized = normalizeTitle(title);
  const fnv = (seed: number) => {
    let h = seed >>> 0;
    for (let i = 0; i < normalized.length; i++) {
      h ^= normalized.charCodeAt(i);
      h = Math.imul(h, 0x01000193) >>> 0;
    }
    return h.toString(16).padStart(8, '0');
  };
  return fnv(0x811c9dc5) + fnv(0x01234567);
}

// L0 + L1: AI로 보낼 제목만 고른다.
//   - 로컬 키워드에 걸리는 일정은 안 보낸다 (이미 앎)
//   - 캐시에 있는 제목은 안 보낸다 (이미 물어봄 — 결과가 "모름"이어도)
//   - 같은 제목은 한 번만, 한 번에 최대 MAX_TITLES_PER_CALL개
//   - 예외: 묶음 요청이 통째로 실패해 retrySingly로 표시된 제목은 다시 보내되 혼자 보낸다.
//     같이 묶으면 문제의 제목 하나 때문에 나머지도 또 실패한다.
export function pickTitlesForAi(
  events: { title: string }[],
  customKeywords: CustomKeywords | undefined,
  cache: Record<string, AiHintEntry>
): string[] {
  const seen = new Set<string>();
  const picked: string[] = [];
  for (const ev of events) {
    const title = ev.title.trim();
    if (!title || title === UNTITLED) continue;
    if (matchPurposeByTitle(title, customKeywords)) continue;
    const key = hashTitle(title);
    if (seen.has(key)) continue;
    seen.add(key);
    const cached = cache[key];
    if (cached?.retrySingly) return [title];
    if (cached || picked.length >= MAX_TITLES_PER_CALL) continue;
    picked.push(title);
  }
  return picked;
}

// 모델 응답을 앱이 믿을 수 있는 모양으로 정리한다. 구조화 출력이 maxItems·길이 제한을
// 지원하지 않으므로 개수·길이·목적 enum을 여기서 다시 강제한다.
// 반환 배열은 titles와 같은 순서·길이이며, 응답에 빠진 제목은 null(해석 못 함)이다.
export function sanitizeHints(raw: unknown, titleCount: number): (AiEventHint | null)[] {
  const out: (AiEventHint | null)[] = Array.from({ length: titleCount }, () => null);
  const results = (raw as { results?: unknown } | null)?.results;
  if (!Array.isArray(results)) return out;

  for (const r of results) {
    if (!r || typeof r !== 'object') continue;
    const { i, purpose, items } = r as { i?: unknown; purpose?: unknown; items?: unknown };
    if (typeof i !== 'number' || !Number.isInteger(i) || i < 0 || i >= titleCount) continue;
    if (out[i]) continue; // 같은 인덱스가 두 번 오면 첫 번째만

    const purposeId = PURPOSE_ORDER.includes(purpose as PurposeId) ? (purpose as PurposeId) : null;
    const cleaned: string[] = [];
    if (Array.isArray(items)) {
      for (const item of items) {
        if (typeof item !== 'string') continue;
        const label = item.trim().replace(/\s+/g, ' ');
        if (!label || label.length > MAX_ITEM_LABEL_LENGTH) continue;
        if (DAILY_ITEMS.has(label) || cleaned.includes(label)) continue;
        cleaned.push(label);
        if (cleaned.length >= MAX_ITEMS_PER_HINT) break;
      }
    }
    out[i] = purposeId || cleaned.length > 0 ? { purposeId, items: cleaned } : null;
  }
  return out;
}

// L6: 하루 상한. 날짜가 바뀌었으면 오늘 호출 수는 0으로 본다.
export function canCallToday(usage: AiUsage, today: string): boolean {
  return usage.day !== today || usage.dayCalls < DAILY_CALL_LIMIT;
}

export function recordCall(usage: AiUsage, today: string): AiUsage {
  const month = today.slice(0, 7);
  return {
    day: today,
    dayCalls: usage.day === today ? usage.dayCalls + 1 : 1,
    month,
    monthCalls: usage.month === month ? usage.monthCalls + 1 : 1,
  };
}

// 캐시가 무한히 자라지 않게 — 오래된 항목을 지우고 개수 상한을 둔다.
export function pruneHintCache(
  cache: Record<string, AiHintEntry>,
  now: number
): Record<string, AiHintEntry> {
  const fresh = Object.entries(cache).filter(([, e]) => now - e.createdAt < CACHE_TTL_MS);
  fresh.sort(([, a], [, b]) => b.createdAt - a.createdAt);
  return Object.fromEntries(fresh.slice(0, CACHE_MAX_ENTRIES));
}

export interface AiSuggestion {
  key: string;       // 캐시 키(제목 해시)
  title: string;     // 화면 표시용 — 화면 상태에서만 쓰고 저장하지 않는다
  purposeId: PurposeId | null;
  items: string[];   // 오늘 체크리스트에 아직 없는 것만
}

// 화면에 띄울 "일정 기반 제안". 캐시만 읽는다 — 여기서 AI를 부르지 않는다(지연 0).
//   - 로컬 키워드에 걸리는 일정은 제외. 단, 한 번 수락한 제안은 목적이 키워드로 승격돼
//     로컬에 걸리게 되므로, 그때부터는 목적 없이 준비물만 다시 제안한다 — 안 그러면
//     매주 반복되는 일정에서 수락했던 준비물이 다음 회차부터 사라진다.
//   - 거절한 제안은 다시 띄우지 않는다
//   - 준비물이 이미 체크리스트에 있으면 그 항목은 뺀다
export function buildSuggestions(
  events: { title: string }[],
  customKeywords: CustomKeywords | undefined,
  cache: Record<string, AiHintEntry>,
  checklistLabels: string[]
): AiSuggestion[] {
  const have = new Set(checklistLabels);
  const seen = new Set<string>();
  const out: AiSuggestion[] = [];
  for (const ev of events) {
    const title = ev.title.trim();
    if (!title) continue;
    const key = hashTitle(title);
    if (seen.has(key)) continue;
    seen.add(key);
    const entry = cache[key];
    if (!entry?.hint || entry.decision === 'rejected') continue;
    const matchedLocally = matchPurposeByTitle(title, customKeywords) !== null;
    if (matchedLocally && entry.decision !== 'accepted') continue;
    const purposeId = matchedLocally ? null : entry.hint.purposeId;
    const items = entry.hint.items.filter((label) => !have.has(label));
    if (!purposeId && items.length === 0) continue;
    out.push({ key, title, purposeId, items });
  }
  return out;
}
