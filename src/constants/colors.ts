// 색 팔레트 — 밝은 화면용과 어두운 화면용 두 벌.
// 이름은 밝은 화면 기준(Tailwind)이다. 어두운 화면에서는 같은 이름이 "같은 역할의 색"을 가리킨다:
// white는 카드 면, slate800은 본문 글자처럼 — 그래서 어두운 쪽은 회색 단계가 뒤집혀 있다.
// 화면에서는 직접 가져다 쓰지 않고 useTheme()/makeStyles()로 받는다 (constants/theme.ts).

import type { AccentId } from '../types';

const light = {
  // Primary
  indigo600: '#4f46e5', // 버튼 면·테두리
  indigoText: '#4f46e5', // 누를 수 있는 글자·아이콘
  violet600: '#7c3aed',

  // Purpose colors
  indigo50:  '#eef2ff',
  indigo100: '#e0e7ff',
  indigo200: '#c7d2fe',
  emerald600:'#059669', // 챙김 표시의 면
  emeraldText:'#059669', // 챙김·완료 글자
  emerald50: '#ecfdf5',
  violet50:  '#f5f3ff',
  rose500:   '#f43f5e',
  rose50:    '#fff1f2',
  amber500:  '#f59e0b',
  amber50:   '#fffbeb',
  amber700:  '#b45309',

  // Weather
  sky500:    '#0ea5e9',
  sky400:    '#38bdf8',
  sky600:    '#0284c7',
  sky50:     '#f0f9ff',
  orange400: '#fb923c',
  orange600: '#ea580c',
  orange50:  '#fff7ed',
  blue500:   '#3b82f6',
  blue400:   '#60a5fa',
  blue600:   '#2563eb',
  blue50:    '#eff6ff',
  indigo400: '#818cf8',

  // Neutral
  // 글자색 기준: 카드 면에서 slate500 이상만 본문·설명 글자로 쓴다 (대비 4.5:1 이상).
  // slate400은 대비가 낮아 입력창 안내 문구(placeholder)·장식에만 쓴다.
  slate800:  '#1e293b',
  slate700:  '#334155',
  slate600:  '#475569',
  slate500:  '#64748b',
  slate400:  '#94a3b8',
  slate300:  '#cbd5e1',
  slate200:  '#e2e8f0',
  slate100:  '#f1f5f9',
  slate50:   '#f8fafc',
  white:     '#ffffff', // 카드 면
  onColor:   '#ffffff', // 색 있는 면(버튼 등) 위의 글자·아이콘 — 두 화면 모두 흰색

  // 화면과 반대 밝기의 면 (토스트, 고른 칩) 과 그 위의 글자
  inverse:       '#1e293b',
  onInverse:     '#ffffff',
  inverseAction: '#c7d2fe',
  // 토스트 면 위의 상태 아이콘 (완료는 emerald500)
  inverseDone:   '#34d399',
  inverseWarn:   '#fbbf24',
  inverseError:  '#f87171',

  // Status
  emerald500: '#10b981',
  emerald100: '#d1fae5',
  red500:     '#ef4444',
  redText:    '#dc2626', // 글자로 쓰는 빨강 (흰 면에서 4.5:1 이상)

  // Background
  bgDefault:  '#f8fafc',
};

export type Palette = { [K in keyof typeof light]: string };

const dark: Palette = {
  indigo600: '#6366f1',
  indigoText: '#a5b4fc',
  violet600: '#8b5cf6',

  indigo50:  '#252a55',
  indigo100: '#e0e7ff',
  indigo200: '#c7d2fe',
  emerald600:'#059669',
  emeraldText:'#34d399',
  emerald50: '#0f2e27',
  violet50:  '#2b2250',
  rose500:   '#f43f5e',
  rose50:    '#3b1723',
  amber500:  '#f59e0b',
  amber50:   '#33270f',
  amber700:  '#fbbf24',

  sky500:    '#38bdf8',
  sky400:    '#38bdf8',
  sky600:    '#7dd3fc',
  sky50:     '#0e2a3f',
  orange400: '#fb923c',
  orange600: '#fb923c',
  orange50:  '#3a2010',
  blue500:   '#60a5fa',
  blue400:   '#60a5fa',
  blue600:   '#93c5fd',
  blue50:    '#15264d',
  indigo400: '#818cf8',

  slate800:  '#f1f5f9',
  slate700:  '#d5dde8',
  slate600:  '#b4c0d0',
  slate500:  '#94a3b8',
  slate400:  '#64748b',
  slate300:  '#3b4a63',
  slate200:  '#2a3a52',
  slate100:  '#19243a',
  slate50:   '#141d30',
  white:     '#1e293b',
  onColor:   '#ffffff',

  inverse:       '#e2e8f0',
  onInverse:     '#0f172a',
  inverseAction: '#4338ca',
  inverseDone:   '#047857',
  inverseWarn:   '#b45309',
  inverseError:  '#dc2626',

  emerald500: '#10b981',
  emerald100: '#134e3a',
  red500:     '#f87171',
  redText:    '#fca5a5',

  bgDefault:  '#0f172a',
};

export const Palettes = { light, dark } as const;
export type Scheme = keyof typeof Palettes;

// 앱 메인 색 — 사용자가 설정에서 고른다. 팔레트의 "누를 수 있는 것" 색(indigo 계열 이름)만 바꿔 끼운다.
// 이름은 그대로 indigo600 등이지만 뜻은 "메인 색"이다.
// 고를 수 있는 색은 일부러 정해 둔 것만 둔다 — 색마다 두 화면에서 대비를 맞춰 두었다:
//   흰 글자 ↔ 버튼 면, 글자색 ↔ 카드 면·옅은 면 모두 4.5:1 이상.
// 초록·빨강·주황은 넣지 않는다 — 챙김(초록)·위험(빨강)·주의(주황)와 같은 색이 되면
// 버튼과 상태 표시를 색으로 구분할 수 없다.

type AccentKeys = 'indigo600' | 'indigoText' | 'indigo50' | 'indigo100' | 'inverseAction';
type AccentTones = Record<AccentKeys, string>;

export const ACCENTS: { id: AccentId; label: string; light: AccentTones; dark: AccentTones }[] = [
  {
    id: 'indigo', label: '남보라',
    light: { indigo600: '#4f46e5', indigoText: '#4f46e5', indigo50: '#eef2ff', indigo100: '#e0e7ff', inverseAction: '#c7d2fe' },
    dark:  { indigo600: '#6366f1', indigoText: '#a5b4fc', indigo50: '#252a55', indigo100: '#e0e7ff', inverseAction: '#4338ca' },
  },
  {
    id: 'violet', label: '보라',
    light: { indigo600: '#7c3aed', indigoText: '#7c3aed', indigo50: '#f5f3ff', indigo100: '#ede9fe', inverseAction: '#ddd6fe' },
    dark:  { indigo600: '#7c3aed', indigoText: '#c4b5fd', indigo50: '#2b2250', indigo100: '#ede9fe', inverseAction: '#6d28d9' },
  },
  {
    id: 'pink', label: '분홍',
    light: { indigo600: '#db2777', indigoText: '#be185d', indigo50: '#fdf2f8', indigo100: '#fce7f3', inverseAction: '#fbcfe8' },
    dark:  { indigo600: '#db2777', indigoText: '#f9a8d4', indigo50: '#3b1730', indigo100: '#fce7f3', inverseAction: '#be185d' },
  },
  {
    id: 'blue', label: '파랑',
    light: { indigo600: '#2563eb', indigoText: '#2563eb', indigo50: '#eff6ff', indigo100: '#dbeafe', inverseAction: '#bfdbfe' },
    dark:  { indigo600: '#2563eb', indigoText: '#93c5fd', indigo50: '#15264d', indigo100: '#dbeafe', inverseAction: '#1d4ed8' },
  },
  {
    id: 'cyan', label: '청록',
    light: { indigo600: '#0e7490', indigoText: '#0e7490', indigo50: '#ecfeff', indigo100: '#cffafe', inverseAction: '#a5f3fc' },
    dark:  { indigo600: '#0e7490', indigoText: '#67e8f9', indigo50: '#0b2e36', indigo100: '#cffafe', inverseAction: '#155e75' },
  },
  {
    id: 'slate', label: '먹색',
    light: { indigo600: '#334155', indigoText: '#334155', indigo50: '#e2e8f0', indigo100: '#e2e8f0', inverseAction: '#cbd5e1' },
    dark:  { indigo600: '#475569', indigoText: '#cbd5e1', indigo50: '#2a3a52', indigo100: '#e2e8f0', inverseAction: '#334155' },
  },
];

export const DEFAULT_ACCENT: AccentId = 'indigo';

// 저장된 값이 목록에 없으면(예전 버전·다른 기기에서 온 값) 기본 색을 쓴다.
export function resolveAccent(id: string | undefined | null): AccentId {
  return ACCENTS.some((a) => a.id === id) ? (id as AccentId) : DEFAULT_ACCENT;
}

export function withAccent(scheme: Scheme, accent: AccentId): Palette {
  const tones = (ACCENTS.find((a) => a.id === accent) ?? ACCENTS[0])[scheme];
  return { ...Palettes[scheme], ...tones };
}

// 캐릭터·로고처럼 화면 밝기와 상관없이 같은 색이어야 하는 그림용
export const BrandColors = light;

// 목적별 색상 맵
export type PurposeColorMap = Record<string, {
  chip: string;
  section: string;
  badge: string;
  badgeText: string;
}>;

export function buildPurposeColors(c: Palette): PurposeColorMap {
  return {
    indigo:  { chip: c.indigo600,  section: c.indigo600,  badge: c.indigo50,  badgeText: c.indigoText },
    emerald: { chip: c.emerald600, section: c.emerald600, badge: c.emerald50, badgeText: c.emeraldText },
    violet:  { chip: c.violet600,  section: c.violet600,  badge: c.violet50,  badgeText: c.violet600 },
    rose:    { chip: c.rose500,    section: c.rose500,    badge: c.rose50,    badgeText: c.rose500 },
    amber:   { chip: c.amber500,   section: c.amber500,   badge: c.amber50,   badgeText: c.amber500 },
  };
}
