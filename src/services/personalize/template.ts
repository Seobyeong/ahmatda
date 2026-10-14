// 아맞다 — 템플릿 개인화의 프롬프트 (docs/AI-연결-설계.md 11장)
//
// 사용자가 이 텍스트를 자기가 구독 중인 AI 앱(ChatGPT·Claude·Gemini 등)에 붙여넣고 대화한다.
// 앱은 아무것도 전송하지 않는다. 그래서 템플릿에는 사용자 데이터(기존 루틴 등)를 넣지 않는다 —
// 중복은 가져올 때(importPlan.ts) 거른다.
//
// 출력 형식은 importPlan.ts의 parsePersonalization()과 반드시 맞아야 한다.

import { PURPOSES, PURPOSE_ORDER } from '@/constants/purposes';
import { SENSITIVITY_LABELS } from '@/constants/feedback';

export const PERSONALIZE_FORMAT_VERSION = 1;

// 템플릿 첫 문장. 사용자가 AI 답변 대신 템플릿 자체를 실수로 붙여넣으면, 템플릿의 예시
// 블록(사원증·PT 등)이 진짜 개인화 결과처럼 읽힌다. 가져오기에서 이 문장으로 걸러낸다.
export const TEMPLATE_MARKER = "너는 '아맞다' 앱의 개인화 도우미야.";

export function buildPersonalizeTemplate(): string {
  const purposes = PURPOSE_ORDER.map((id) => {
    const p = PURPOSES[id];
    return `- ${id} (${p.label}) — 기본 준비물: ${p.items.map((i) => i.label).join(', ')}`;
  }).join('\n');

  const sensitivity = ([1, 2, 3, 4, 5] as const)
    .map((level) => `${level} ${SENSITIVITY_LABELS[level]}`)
    .join(' / ');

  return `${TEMPLATE_MARKER} 아맞다는 외출 전에 챙길 것을 알려주는 앱이야.
나에게 아래 질문을 한 번에 하나씩 짧게 물어봐 줘. 내가 모르거나 건너뛰면 그 항목은 비워도 돼.
이름·주소·연락처 같은 개인정보는 묻지 마.

1. 평소 몇 시에 집을 나서?
2. 추위·더위를 얼마나 타? (${sensitivity})
3. 매일 또는 특정 요일마다 꼭 챙기는 물건은? (예: 월~금 사원증)
4. 캘린더에 자주 등록하는 일정 이름은? 각 일정이 아래 외출 목적 중 어디에 해당하는지 골라줘.
5. 아래 기본 준비물 중 나한테 필요 없는 게 있어?

외출 목적:
${purposes}

질문이 끝나면 설명 없이 아래 형식의 JSON 코드블록 하나만 출력해 줘. 값이 없는 항목은 빼도 돼.

\`\`\`json
{
  "ahmatda": ${PERSONALIZE_FORMAT_VERSION},
  "departureTime": "08:15",
  "sensitivity": 3,
  "routines": [{ "label": "사원증", "days": [1, 2, 3, 4, 5] }],
  "keywords": { "workout": ["PT", "테니스"] },
  "disabledPurposeItems": { "work": ["명함"] }
}
\`\`\`

규칙:
- departureTime은 24시간제 "HH:mm".
- routines의 days는 0=일요일, 1=월요일 … 6=토요일. 매일이면 days를 빼.
- keywords는 일정 제목에 들어 있을 짧은 단어(2~6글자)로, 위 외출 목적 id(work, workout, study, date, trip)별로.
- disabledPurposeItems에는 위 기본 준비물 이름을 그대로만 써.`;
}
