// 아맞다 — 템플릿 개인화 결과 가져오기 (docs/AI-연결-설계.md 11장)
//
// 사용자가 AI 앱에서 복사해 온 텍스트는 신뢰할 수 없는 입력이다. 여기서는 데이터로만
// 해석하고, 형식·개수·길이를 검증하고, 기존 값을 지우지 않는 "추가 계획"만 만든다.
// 실제 반영은 사용자가 미리보기를 보고 적용을 눌렀을 때 store가 한다.

import { PURPOSES, PURPOSE_ORDER } from '@/constants/purposes';
import type { ChecklistItem, PurposeId, UserSettings } from '@/types';
import { isOneOff } from '@/utils/routines';
import { PERSONALIZE_FORMAT_VERSION, TEMPLATE_MARKER } from './template';

const MAX_ROUTINES = 15;
const MAX_KEYWORDS_PER_PURPOSE = 10;
const MAX_LABEL_LENGTH = 20;
const MAX_INPUT_LENGTH = 20_000;

export interface PersonalizePlan {
  departureTime?: { from: string; to: string };
  sensitivity?: { from: UserSettings['sensitivityLevel']; to: UserSettings['sensitivityLevel'] };
  routines: { label: string; days?: number[] }[];
  keywords: { purposeId: PurposeId; keyword: string }[];
  disableItems: { purposeId: PurposeId; label: string }[];
  skipped: string[]; // 반영하지 않은 항목과 이유 — 미리보기에 보여준다
}

export type ParseResult = { ok: true; data: Record<string, unknown> } | { ok: false; error: string };

// AI 앱에서 복사하면 따옴표가 스마트 따옴표로 바뀌어 오는 경우가 있다.
function normalizeQuotes(text: string): string {
  return text.replace(/[“”„‟]/g, '"').replace(/[‘’]/g, "'");
}

// start 위치의 '{'와 짝이 맞는 '}'까지 잘라낸다. 문자열 안의 괄호는 세지 않는다.
function sliceBalancedObject(text: string, start: number): string | null {
  let depth = 0;
  let inString = false;
  for (let i = start; i < text.length; i++) {
    const c = text[i];
    if (inString) {
      if (c === '\\') i++;
      else if (c === '"') inString = false;
      continue;
    }
    if (c === '"') inString = true;
    else if (c === '{') depth++;
    else if (c === '}') {
      depth--;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }
  return null;
}

// 설명 문장·코드블록 표시가 섞인 텍스트에서 "ahmatda" 키가 든 JSON 객체를 찾는다.
export function parsePersonalization(input: string): ParseResult {
  if (input.length > MAX_INPUT_LENGTH) return { ok: false, error: '붙여넣은 내용이 너무 길어요.' };
  const text = normalizeQuotes(input);
  if (text.includes(TEMPLATE_MARKER)) {
    return { ok: false, error: '템플릿을 그대로 붙여넣으셨어요. AI와 대화한 뒤 AI가 준 답변을 붙여넣어 주세요.' };
  }

  let sawOtherVersion = false;
  for (let i = text.indexOf('{'); i !== -1; i = text.indexOf('{', i + 1)) {
    const candidate = sliceBalancedObject(text, i);
    if (!candidate || !candidate.includes('ahmatda')) continue;
    try {
      const obj = JSON.parse(candidate);
      if (!obj || typeof obj !== 'object' || Array.isArray(obj)) continue;
      if (obj.ahmatda === PERSONALIZE_FORMAT_VERSION) return { ok: true, data: obj };
      if ('ahmatda' in obj) sawOtherVersion = true;
    } catch {
      // 다음 '{'부터 다시 시도
    }
  }
  return {
    ok: false,
    error: sawOtherVersion
      ? '지원하지 않는 형식 버전이에요. 앱의 최신 템플릿으로 다시 받아주세요.'
      : 'AI 답변에서 아맞다 형식의 블록을 찾지 못했어요. 코드블록 전체를 복사해 주세요.',
  };
}

function cleanLabel(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const label = value.trim().replace(/\s+/g, ' ');
  return label && label.length <= MAX_LABEL_LENGTH ? label : null;
}

// "8:15" 같은 한 자리 시각도 받아준다.
function cleanTime(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const m = value.trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return `${String(h).padStart(2, '0')}:${m[2]}`;
}

// 요일 배열 정리. undefined = 매일. 잘못된 값이 섞이면 null(이 루틴은 건너뜀) — 요일을
// 멋대로 "매일"로 바꾸면 사용자가 말한 것과 다른 날 알림이 뜬다.
function cleanDays(value: unknown): number[] | undefined | null {
  if (value === undefined || value === null) return undefined;
  if (!Array.isArray(value)) return null;
  if (!value.every((d) => Number.isInteger(d) && d >= 0 && d <= 6)) return null;
  const days = [...new Set(value as number[])].sort((a, b) => a - b);
  if (days.length === 0 || days.length === 7) return undefined;
  return days;
}

const isPurposeId = (key: string): key is PurposeId => PURPOSE_ORDER.includes(key as PurposeId);

export function buildPersonalizePlan(
  data: Record<string, unknown>,
  current: { userSettings: UserSettings; permanentRoutines: ChecklistItem[] }
): PersonalizePlan {
  const { userSettings, permanentRoutines } = current;
  const plan: PersonalizePlan = { routines: [], keywords: [], disableItems: [], skipped: [] };

  if (data.departureTime !== undefined) {
    const to = cleanTime(data.departureTime);
    if (!to) plan.skipped.push('출발 시각 형식이 올바르지 않아요.');
    else if (to !== userSettings.departureTime) plan.departureTime = { from: userSettings.departureTime, to };
  }

  if (data.sensitivity !== undefined) {
    const to = data.sensitivity;
    if (to === 1 || to === 2 || to === 3 || to === 4 || to === 5) {
      if (to !== userSettings.sensitivityLevel) plan.sensitivity = { from: userSettings.sensitivityLevel, to };
    } else {
      plan.skipped.push('체온 민감도는 1~5 중 하나여야 해요.');
    }
  }

  if (Array.isArray(data.routines)) {
    // 특정 날짜 1회 항목은 "이미 있는 루틴"이 아니다 — 같은 이름을 매일 루틴으로 받을 수 있어야 한다.
    const existing = new Set(permanentRoutines.filter((r) => !isOneOff(r)).map((r) => r.label.trim()));
    for (const raw of data.routines.slice(0, MAX_ROUTINES)) {
      const label = cleanLabel((raw as { label?: unknown } | null)?.label);
      if (!label) continue;
      const days = cleanDays((raw as { days?: unknown }).days);
      if (days === null) {
        plan.skipped.push(`루틴 '${label}'의 요일 형식이 올바르지 않아요.`);
        continue;
      }
      if (existing.has(label)) {
        plan.skipped.push(`루틴 '${label}'은(는) 이미 있어요.`);
        continue;
      }
      existing.add(label);
      plan.routines.push(days ? { label, days } : { label });
    }
  }

  if (data.keywords && typeof data.keywords === 'object' && !Array.isArray(data.keywords)) {
    // 이미 어느 목적에든 걸리는 키워드는 추가해도 의미가 없다(먼저 걸린 목적이 이긴다).
    const taken = new Map<string, PurposeId>();
    for (const pid of PURPOSE_ORDER) {
      for (const kw of [...PURPOSES[pid].calKeywords, ...(userSettings.customKeywords[pid] ?? [])]) {
        if (!taken.has(kw)) taken.set(kw, pid);
      }
    }
    for (const [pid, list] of Object.entries(data.keywords as Record<string, unknown>)) {
      if (!isPurposeId(pid) || !Array.isArray(list)) continue;
      for (const raw of list.slice(0, MAX_KEYWORDS_PER_PURPOSE)) {
        const keyword = cleanLabel(raw);
        if (!keyword) continue;
        const owner = taken.get(keyword);
        if (owner === pid) continue; // 이미 같은 목적에 있음 — 조용히 건너뜀
        if (owner) {
          plan.skipped.push(`키워드 '${keyword}'은(는) 이미 '${PURPOSES[owner].shortLabel}'에 쓰이고 있어요.`);
          continue;
        }
        taken.set(keyword, pid);
        plan.keywords.push({ purposeId: pid, keyword });
      }
    }
  }

  if (data.disabledPurposeItems && typeof data.disabledPurposeItems === 'object' && !Array.isArray(data.disabledPurposeItems)) {
    for (const [pid, list] of Object.entries(data.disabledPurposeItems as Record<string, unknown>)) {
      if (!isPurposeId(pid) || !Array.isArray(list)) continue;
      const known = new Set(PURPOSES[pid].items.map((i) => i.label));
      for (const raw of list) {
        const label = cleanLabel(raw);
        if (!label) continue;
        if (!known.has(label)) {
          plan.skipped.push(`'${label}'은(는) ${PURPOSES[pid].shortLabel} 기본 준비물에 없어요.`);
          continue;
        }
        if (userSettings.disabledPurposeItems.includes(`${pid}:${label}`)) continue;
        if (plan.disableItems.some((d) => d.purposeId === pid && d.label === label)) continue;
        plan.disableItems.push({ purposeId: pid, label });
      }
    }
  }

  return plan;
}

export function isEmptyPlan(plan: PersonalizePlan): boolean {
  return (
    !plan.departureTime &&
    !plan.sensitivity &&
    plan.routines.length === 0 &&
    plan.keywords.length === 0 &&
    plan.disableItems.length === 0
  );
}
