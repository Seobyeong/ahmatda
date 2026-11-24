// 디자인 기준 — 글자 크기·간격·둥글기·그림자·색 역할을 한 곳에서 정한다.
// 화면마다 숫자를 직접 쓰지 않고 여기 이름을 쓴다.
//
// 색은 기기의 밝은/어두운 화면 설정과 사용자가 고른 메인 색(설정 > 앱 색상)을 따른다. 화면에서는
//   const useStyles = makeStyles(({ Colors, Role, Shadow }) => ({ ... }));   // 파일 맨 아래
//   const styles = useStyles();                                              // 컴포넌트 안
//   const { Colors, Role } = useTheme();                                     // 아이콘 색처럼 스타일 밖에서 쓸 때
// 로 받는다.
import { StyleSheet, useColorScheme } from 'react-native';
import { Palettes, buildPurposeColors, resolveAccent, withAccent, type Palette, type PurposeColorMap, type Scheme } from './colors';
import { useAppStore } from '../store';
import type { AccentId } from '../types';

// 글자 크기는 여섯 단계만 쓴다. 가장 작은 글자가 12다 (11은 걸어가며 읽기 어렵다).
export const FontSize = {
  caption: 12, // 보조 설명, 뱃지
  label: 13,   // 버튼·칩 글자, 짧은 안내
  body: 15,    // 본문
  heading: 17, // 카드 제목, 체크리스트 항목
  title: 20,   // 화면 제목, 강조 숫자
  display: 40, // 체감온도처럼 화면에 하나뿐인 큰 숫자
} as const;

export const Space = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
} as const;

export const Radius = {
  sm: 8,     // 작은 뱃지, 체크박스
  md: 12,    // 입력창, 버튼, 안쪽 상자
  lg: 16,    // 가벼운 줄·보조 영역
  xl: 20,    // 주인공 카드, 모달
  pill: 999, // 칩, 둥근 버튼
} as const;

// 그림자는 화면의 주인공에만 쓴다 — 전부 떠 있으면 아무것도 떠 보이지 않는다.
// 어두운 화면에서는 그림자가 거의 안 보여서, 면의 밝기 차이(카드 면이 배경보다 밝다)가 같은 일을 한다.
function buildShadow(scheme: Scheme) {
  const color = scheme === 'dark' ? '#000000' : '#1e293b';
  return {
    card: {
      shadowColor: color,
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.08,
      shadowRadius: 12,
      elevation: 3,
    },
    floating: {
      shadowColor: color,
      shadowOffset: { width: 0, height: -2 },
      shadowOpacity: 0.08,
      shadowRadius: 8,
      elevation: 12,
    },
  } as const;
}

// 색의 역할. 남색은 "누를 수 있는 것"에만 쓴다 — 표시와 버튼이 같은 색이면
// 어디를 눌러야 하는지 색으로 알 수 없다. 챙김·완료는 초록이다.
// 면으로 쓰는 색과 글자로 쓰는 색을 나눈다 — 어두운 화면에서는 둘의 밝기가 달라야 읽힌다.
function buildRole(c: Palette) {
  return {
    action: c.indigo600,      // 버튼 면
    actionText: c.indigoText, // 누를 수 있는 글자·아이콘
    actionSoft: c.indigo50,
    onAction: c.onColor,
    onActionSub: c.indigo100,

    done: c.emerald600,      // 챙김 표시의 면
    doneText: c.emeraldText, // 챙김·완료 글자
    doneSoft: c.emerald50,

    warn: c.amber700,
    warnSoft: c.amber50,
    danger: c.red500,

    text: c.slate800,
    textStrong: c.slate700,
    textSub: c.slate600,
    textMuted: c.slate500, // 카드 면에서 본문으로 쓸 수 있는 가장 옅은 색
    placeholder: c.slate500,

    bg: c.bgDefault,
    surface: c.white,        // 주인공 카드
    surfaceSoft: c.slate100, // 보조 영역 — 배경에 붙어 보이는 옅은 면
    border: c.slate200,
  };
}

export interface Theme {
  scheme: Scheme;
  accent: AccentId;
  Colors: Palette;
  Role: ReturnType<typeof buildRole>;
  Shadow: ReturnType<typeof buildShadow>;
  PurposeColors: PurposeColorMap;
}

function buildTheme(scheme: Scheme, accent: AccentId): Theme {
  const Colors = withAccent(scheme, accent);
  return {
    scheme,
    accent,
    Colors,
    Role: buildRole(Colors),
    Shadow: buildShadow(scheme),
    // 목적 색(출근=남색 등)은 메인 색과 상관없이 고정이다 — 메인 색을 따라가면
    // 다른 목적의 색과 겹칠 수 있다.
    PurposeColors: buildPurposeColors(Palettes[scheme]),
  };
}

type ThemeKey = `${Scheme}:${AccentId}`;
const THEMES = new Map<ThemeKey, Theme>();

function getTheme(scheme: Scheme, accent: AccentId): Theme {
  const key: ThemeKey = `${scheme}:${accent}`;
  let theme = THEMES.get(key);
  if (!theme) {
    theme = buildTheme(scheme, accent);
    THEMES.set(key, theme);
  }
  return theme;
}

export function useScheme(): Scheme {
  return useColorScheme() === 'dark' ? 'dark' : 'light';
}

export function useAccent(): AccentId {
  return resolveAccent(useAppStore((s) => s.userSettings.accentColor));
}

export function useTheme(): Theme {
  return getTheme(useScheme(), useAccent());
}

// 스타일을 (밝은/어두운 화면 × 메인 색)마다 한 번씩만 만든다. 돌려주는 훅은 지금 화면에 맞는 쪽을 준다.
export function makeStyles<T extends StyleSheet.NamedStyles<T> | StyleSheet.NamedStyles<any>>(
  factory: (theme: Theme) => T
): () => T {
  const cache = new Map<ThemeKey, T>();
  return () => {
    const scheme = useScheme();
    const accent = useAccent();
    const key: ThemeKey = `${scheme}:${accent}`;
    let styles = cache.get(key);
    if (!styles) {
      styles = StyleSheet.create(factory(getTheme(scheme, accent)));
      cache.set(key, styles);
    }
    return styles;
  };
}
