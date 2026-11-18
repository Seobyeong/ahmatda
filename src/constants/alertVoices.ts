// 아맞다 — 알림 말투 (캐릭터별 문구 세트 + 직접 쓰는 문장)
//
// 알림의 "말"만 바꾼다. 무엇을 언제 보낼지(판단)와 물건 목록·버튼(표시 내용)은 그대로다.
// 캐릭터는 차차 늘린다 — 여기 VOICES에 한 벌 추가하면 설정 화면과 알림에 같이 나타난다.
// 캐릭터는 자체 창작이다 (기존 작품 캐릭터·특정인 말투 흉내 금지).
//
// 직접 쓰기는 문장 하나에 빈칸({물건} {개수} {출발})을 넣는 방식이다. 물건을 말하는 알림
// 네 가지(출발 전·마지막 확인·아 맞다·장소 떠남)의 제목으로 쓰고, 채울 값이 없는 경우
// (다 챙김, 내일 울릴 예약처럼 아직 모르는 경우)와 자기 전 정리는 기본 말투로 돌아간다.

import type { AlertVoiceId } from '@/types';

export type AlertKind = 'departure' | 'lastCheck' | 'urgent' | 'placeLeave' | 'nightly' | 'nightlyPreview';

interface VoiceLines {
  departure: string;
  lastCheck: string;
  urgent: string;
  urgentLead: string;
  placeLeave: string;
  placeLeaveLead: string;
  nightly: string;
  nightlyPreview: string;
}

export interface AlertVoice {
  id: Exclude<AlertVoiceId, 'custom'>;
  label: string;
  description: string;
  lines: VoiceLines;
}

export const VOICES: AlertVoice[] = [
  {
    id: 'basic',
    label: '기본',
    description: '담백하게 알려요',
    lines: {
      departure: '아맞다 🎒',
      lastCheck: '나가기 전에 {개수}개 남았어요',
      urgent: '아 맞다! 🚨',
      urgentLead: '아직 안 챙긴 것이 있어요:',
      placeLeave: '두고 가는 거 없나요? 👀',
      placeLeaveLead: '여기서 꺼내 쓴 물건 챙기셨나요?',
      nightly: '아맞다 — 오늘 하루 어땠나요?',
      nightlyPreview: '다음 외출에 챙길 게 있어요',
    },
  },
  {
    id: 'secretary',
    label: '깍듯한 비서',
    description: '정중하게, 빠짐없이 보고해요',
    lines: {
      departure: '외출 준비 상황을 보고드립니다 🎒',
      lastCheck: '나가시기 전에 {개수}건 확인 부탁드립니다',
      urgent: '잠시만요, {물건}을(를) 두고 나오셨습니다 🚨',
      urgentLead: '아직 챙기지 않으신 물건입니다:',
      placeLeave: '자리를 뜨시기 전에 확인 부탁드립니다 👀',
      placeLeaveLead: '이곳에서 꺼내 쓰신 물건입니다.',
      nightly: '오늘 하루 수고 많으셨습니다',
      nightlyPreview: '다음 외출 준비물을 정리해 두었습니다',
    },
  },
  {
    id: 'friend',
    label: '친한 친구',
    description: '반말로 편하게 챙겨 줘요',
    lines: {
      departure: '야 30분 뒤에 나가야 돼 🎒',
      lastCheck: '잠깐! 아직 {개수}개 안 챙겼어',
      urgent: '야야 {물건} 놓고 갔다!! 🚨',
      urgentLead: '이거 안 챙겼잖아:',
      placeLeave: '일어나기 전에 한번 봐 👀',
      placeLeaveLead: '여기서 꺼낸 거 다 넣었지?',
      nightly: '오늘 어땠어? 춥진 않았어?',
      nightlyPreview: '다음에 나갈 때 이거 챙겨야 돼',
    },
  },
  {
    id: 'mom',
    label: '잔소리 엄마',
    description: '걱정 섞인 잔소리로 꼭 챙기게 해요',
    lines: {
      departure: '30분 뒤에 나가지? 챙길 건 다 챙겼고? 🎒',
      lastCheck: '{개수}개나 남았잖아, 다 챙기고 나가',
      urgent: '또 {물건} 두고 갔지! 🚨',
      urgentLead: '얼른 와서 챙겨 가:',
      placeLeave: '거기 두고 오는 거 없지? 👀',
      placeLeaveLead: '꺼내 쓴 거 다시 넣었는지 봐 봐.',
      nightly: '오늘 옷은 따뜻하게 입었니?',
      nightlyPreview: '다음에 나갈 땐 이거 꼭 챙겨',
    },
  },
];

export const DEFAULT_VOICE: AlertVoiceId = 'basic';

// 직접 쓰기에 넣을 수 있는 빈칸. 설정 화면이 누르면 끼워 넣는 버튼으로 보여준다.
export const PLACEHOLDERS = [
  { token: '{물건}', description: '안 챙긴 물건 (최대 2개)' },
  { token: '{개수}', description: '안 챙긴 개수' },
  { token: '{출발}', description: '외출 시간' },
] as const;

export const CUSTOM_TEXT_MAX = 60;
export const CUSTOM_TEXT_EXAMPLE = '{물건} 챙겼어? 아직 {개수}개 남았어!';

export interface AlertVars {
  items: string[];  // 이 알림이 말하는 물건 (급한 순)
  count: number;    // 물건 전체 개수 (items보다 많을 수 있다)
  departureTime: string;
}

export interface AlertText {
  title: string;
  lead: string | null; // 본문 첫 줄 (물건 목록 위). null이면 목록만.
}

const ITEM_NAMES_MAX = 2;

function fill(template: string, vars: AlertVars): string {
  const names = vars.items.slice(0, ITEM_NAMES_MAX).join(', ');
  return template
    // 바꿀 값을 함수로 넘긴다 — 문자열로 넘기면 물건 이름의 "$$"·"$&" 같은 글자가 특수 기호로 풀린다.
    .replace(/\{물건\}/g, () => names)
    .replace(/\{개수\}/g, () => String(vars.count))
    .replace(/\{출발\}/g, () => vars.departureTime)
    .trim();
}

export function findVoice(id: AlertVoiceId | undefined): AlertVoice {
  return VOICES.find((v) => v.id === id) ?? VOICES[0];
}

// 직접 쓴 문장을 이 알림에 쓸 수 있는지 — 물건을 말하는 알림이고, 말할 물건이 있을 때만.
function canUseCustom(kind: AlertKind, custom: string, vars: AlertVars): boolean {
  if (!custom.trim()) return false;
  if (kind === 'nightly' || kind === 'nightlyPreview') return false;
  return vars.count > 0 && vars.items.length > 0;
}

export function renderAlert(
  kind: AlertKind,
  voiceId: AlertVoiceId | undefined,
  customText: string | undefined,
  vars: AlertVars
): AlertText {
  const leadOf = (lines: VoiceLines): string | null =>
    kind === 'urgent' ? lines.urgentLead : kind === 'placeLeave' ? lines.placeLeaveLead : null;

  if (voiceId === 'custom' && canUseCustom(kind, customText ?? '', vars)) {
    // 직접 쓴 문장이 제목이 되고, 본문은 물건 목록만 둔다 (말투가 섞이지 않게).
    return { title: fill(customText!, vars), lead: null };
  }

  const lines = findVoice(voiceId === 'custom' ? DEFAULT_VOICE : voiceId).lines;
  // {물건}이 들어간 문장인데 말할 물건이 없으면(예: 이름 없이 개수만 아는 경우) 기본 말투 문장으로.
  let title = lines[kind];
  if (title.includes('{물건}') && vars.items.length === 0) title = VOICES[0].lines[kind];
  return { title: fill(title, vars), lead: leadOf(lines) };
}

// 설정 화면 미리보기 — "아 맞다" 알림이 이 말투로 어떻게 오는지.
export const SAMPLE_VARS: AlertVars = { items: ['우산', '노트북'], count: 3, departureTime: '08:30' };
