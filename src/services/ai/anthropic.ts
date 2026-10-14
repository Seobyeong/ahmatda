// 아맞다 — Anthropic(Claude) 일정 해석 호출
//
// 공식 TS SDK는 README에 "React Native is not supported"라고 명시돼 있어서 fetch로
// 직접 호출한다(docs/AI-연결-설계.md 8장 2번). 필요한 건 엔드포인트 하나·JSON 본문
// 하나라 SDK 없이도 작고, 번들도 늘지 않는다.
//
// 프롬프트·스키마는 scripts/ai-eval/run.mjs와 같아야 한다 — 평가한 요청과 앱이 보내는
// 요청이 다르면 평가 결과가 의미 없어진다. 한쪽을 고치면 다른 쪽도 같이 고칠 것.

import { PURPOSE_ORDER } from '@/constants/purposes';
import { sanitizeHints } from './hints';
import type { AiEventHint } from '@/types';

const ENDPOINT = 'https://api.anthropic.com/v1/messages';
const API_VERSION = '2023-06-01';
const TIMEOUT_MS = 8_000;

// [잠정] 기본 모델 — 8장 1번 평가(scripts/ai-eval) 결과로 확정한다.
// 단순 분류라 작은 모델 + 추론 끔을 기본으로 둔다(추론 토큰은 출력 단가로 과금).
// Haiku 5.5는 effort가 high 이하일 때만 thinking을 끌 수 있다.
export const ANTHROPIC_MODEL = 'claude-haiku-5-5';
const REQUEST_OPTIONS = {
  thinking: { type: 'disabled' },
  output_config: { effort: 'low' },
} as const;

// 출력은 제목 5개 × (목적 + 준비물 3개) 수준의 JSON이라 수백 토큰이면 충분하다.
// 너무 낮으면 잘린 JSON이 와서 버려야 하므로 넉넉히 둔다(과금은 실제 생성분만).
const MAX_TOKENS = 1024;

// 고정 프롬프트는 짧게 유지한다 — 512토큰 미만이라 프롬프트 캐싱이 안 걸리므로,
// 캐싱 대신 길이 자체를 줄이는 게 유일한 절약 수단이다.
const SYSTEM = [
  '외출 준비 앱이다. 일정 제목마다 외출 목적과, 그 일정 때문에 추가로 챙길 준비물을 고른다.',
  '목적: work(출근·업무), workout(운동), study(공부·시험), date(약속·모임·공연), trip(여행·나들이). 어디에도 안 맞으면 null.',
  '준비물: 지갑·휴대폰·열쇠처럼 매일 챙기는 것은 빼고, 이 일정이라 필요한 것만 0~3개. 각각 짧은 명사.',
].join('\n');

const SCHEMA = {
  type: 'object',
  properties: {
    results: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          i: { type: 'integer' },
          purpose: { anyOf: [{ type: 'string', enum: PURPOSE_ORDER }, { type: 'null' }] },
          // maxItems는 구조화 출력이 지원하지 않는다 → sanitizeHints에서 3개로 자른다
          items: { type: 'array', items: { type: 'string' } },
        },
        required: ['i', 'purpose', 'items'],
        additionalProperties: false,
      },
    },
  },
  required: ['results'],
  additionalProperties: false,
};

// 실패 종류에 따라 호출부의 처리가 다르다(설계 7장):
//   auth      키 무효 → AI 일시 정지, 설정에 표시
//   quota     잔액 부족(402) → 오늘은 중단
//   transient 오프라인·타임아웃·서버 과부하·분당 요청 한도(429) → 다음 미리 계산 시점에 재시도
//   unusable  응답은 왔지만 쓸 수 없음(거절·잘림) → 해당 제목은 "모름"으로 캐시
export type AiErrorKind = 'auth' | 'quota' | 'transient' | 'unusable';

export class AiCallError extends Error {
  constructor(public kind: AiErrorKind, message: string) {
    super(message);
  }
}

export async function classifyEventsWithAnthropic(
  apiKey: string,
  titles: string[]
): Promise<(AiEventHint | null)[]> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  let res: Response;
  try {
    res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': API_VERSION,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: ANTHROPIC_MODEL,
        max_tokens: MAX_TOKENS,
        system: SYSTEM,
        // 일정 제목만 보낸다 — 시간·장소·메모는 보내지 않는다(동의 화면 문구와 일치해야 함)
        messages: [{ role: 'user', content: titles.map((t, i) => `${i}: ${t}`).join('\n') }],
        thinking: REQUEST_OPTIONS.thinking,
        output_config: {
          ...REQUEST_OPTIONS.output_config,
          format: { type: 'json_schema', schema: SCHEMA },
        },
      }),
      signal: controller.signal,
    });
  } catch (e) {
    throw new AiCallError('transient', e instanceof Error ? e.message : 'network error');
  } finally {
    clearTimeout(timer);
  }

  if (res.status === 401 || res.status === 403) throw new AiCallError('auth', `HTTP ${res.status}`);
  // 402는 결제·잔액 문제라 오늘 안에는 안 풀린다. 429는 분당 요청 한도 같은 일시적 제한이라
  // 하루를 통째로 멈추면 안 되고, 다음 미리 계산 때 다시 시도하면 된다.
  if (res.status === 402) throw new AiCallError('quota', `HTTP ${res.status}`);
  // 400은 요청 형식 문제일 수 있다. 이걸 "모름"으로 캐시하면 앱 버그가 고쳐져도 그 제목을
  // 다시 안 묻게 되므로, 캐시하지 않고 재시도 대상으로 둔다.
  if (!res.ok) throw new AiCallError('transient', `HTTP ${res.status}`);

  let body: { stop_reason?: string; content?: { type: string; text?: string }[] };
  try {
    body = await res.json();
  } catch {
    throw new AiCallError('transient', 'invalid JSON body');
  }

  // 거절(refusal)·잘림(max_tokens)이면 출력이 스키마를 지키지 않을 수 있다.
  if (body.stop_reason !== 'end_turn') {
    throw new AiCallError('unusable', `stop_reason=${body.stop_reason}`);
  }
  const text = body.content?.find((b) => b.type === 'text')?.text;
  try {
    return sanitizeHints(JSON.parse(text ?? ''), titles.length);
  } catch {
    throw new AiCallError('unusable', 'unparseable output');
  }
}
