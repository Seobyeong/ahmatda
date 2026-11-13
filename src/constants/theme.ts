// 디자인 기준 — 글자 크기·간격·둥글기·그림자·색 역할을 한 곳에서 정한다.
// 화면마다 숫자를 직접 쓰지 않고 여기 이름을 쓴다. 다크 모드도 이 위에 얹는다.
import { Colors } from './colors';

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
export const Shadow = {
  card: {
    shadowColor: Colors.slate800,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 3,
  },
  floating: {
    shadowColor: Colors.slate800,
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 12,
  },
} as const;

// 색의 역할. 남색은 "누를 수 있는 것"에만 쓴다 — 표시와 버튼이 같은 색이면
// 어디를 눌러야 하는지 색으로 알 수 없다. 챙김·완료는 초록이다.
export const Role = {
  action: Colors.indigo600,
  actionSoft: Colors.indigo50,
  onAction: Colors.white,
  onActionSub: Colors.indigo100,

  done: Colors.emerald600,
  doneSoft: Colors.emerald50,

  warn: Colors.amber700,
  warnSoft: Colors.amber50,
  danger: Colors.red500,

  text: Colors.slate800,
  textStrong: Colors.slate700,
  textSub: Colors.slate600,
  textMuted: Colors.slate500, // 흰 배경에서 본문으로 쓸 수 있는 가장 옅은 색
  placeholder: Colors.slate500,

  bg: Colors.bgDefault,
  surface: Colors.white,     // 주인공 카드
  surfaceSoft: Colors.slate100, // 보조 영역 — 배경에 붙어 보이는 옅은 면
  border: Colors.slate200,
} as const;
