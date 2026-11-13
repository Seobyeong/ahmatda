import React from 'react';
import { Circle, Defs, LinearGradient, Path, Rect, Stop, Svg } from 'react-native-svg';
import { Colors } from '../constants/colors';

// 앱 아이콘의 느낌표 말풍선. 평소 화면에는 로고(logo)로만 작게 나오고,
// 상태 화면(다 챙김·빈 목록·실패)에서만 얼굴이 생긴다 — 매일 보는 화면은 조용하게 둔다.
export type MascotMood = 'logo' | 'idle' | 'happy' | 'sorry';

interface MascotProps {
  mood?: MascotMood;
  size?: number;
}

const BUBBLE =
  'M38 20h44a24 24 0 0 1 24 24v20a24 24 0 0 1-24 24H60L38 108V88a24 24 0 0 1-24-24V44a24 24 0 0 1 24-24z';

const LINE = { stroke: Colors.white, strokeWidth: 3.5, strokeLinecap: 'round', fill: 'none' } as const;

export function Mascot({ mood = 'idle', size = 72 }: MascotProps) {
  return (
    // 장식이라 화면 낭독기는 건너뛴다 — 옆의 글이 같은 내용을 말한다.
    <Svg
      width={size}
      height={size}
      viewBox="0 0 120 120"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <Defs>
        <LinearGradient id="mascotBody" x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor="#6366f1" />
          <Stop offset="1" stopColor={Colors.violet600} />
        </LinearGradient>
      </Defs>
      <Path d={BUBBLE} fill="url(#mascotBody)" />

      {mood === 'logo' ? (
        <>
          <Rect x={55} y={34} width={10} height={28} rx={5} fill={Colors.white} />
          <Circle cx={60} cy={72} r={6} fill={Colors.white} />
        </>
      ) : null}

      {mood === 'idle' ? (
        <>
          <Circle cx={46} cy={50} r={5} fill={Colors.white} />
          <Circle cx={74} cy={50} r={5} fill={Colors.white} />
          <Path d="M52 64Q60 70 68 64" {...LINE} />
        </>
      ) : null}

      {mood === 'happy' ? (
        <>
          <Path d="M40 53Q46 45 52 53" {...LINE} />
          <Path d="M68 53Q74 45 80 53" {...LINE} />
          <Path d="M49 62Q60 76 71 62" {...LINE} />
          <Circle cx={100} cy={24} r={14} fill={Colors.emerald500} stroke={Colors.white} strokeWidth={3} />
          <Path
            d="M93.5 24.5l4.5 4.5 8.5-9"
            stroke={Colors.white}
            strokeWidth={3.2}
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
          />
        </>
      ) : null}

      {mood === 'sorry' ? (
        <>
          <Circle cx={46} cy={53} r={5} fill={Colors.white} />
          <Circle cx={74} cy={53} r={5} fill={Colors.white} />
          {/* 눈썹은 바깥쪽이 내려가야 미안한 얼굴이다 — 안쪽이 내려가면 화난 얼굴이 된다. */}
          <Path d="M38 45l11-4M82 45l-11-4" stroke={Colors.white} strokeWidth={3} strokeLinecap="round" />
          <Path d="M52 70Q60 64 68 70" {...LINE} />
          <Path d="M100 12c5 7 8 11 8 15a8 8 0 0 1-16 0c0-4 3-8 8-15z" fill={Colors.sky400} />
        </>
      ) : null}
    </Svg>
  );
}
