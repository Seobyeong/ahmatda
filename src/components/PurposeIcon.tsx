import React from 'react';
import { BookOpen, Briefcase, Dumbbell, Heart, Map as MapIcon } from 'lucide-react-native';
import type { PurposeId } from '../types';

// 목적 표시는 이모지 대신 체크리스트와 같은 선 아이콘을 쓴다 — 이모지는 기기마다 모양이 다르고
// 선 아이콘과 섞이면 화면이 두 가지 그림체가 된다.
const ICONS: Record<PurposeId, typeof Briefcase> = {
  work: Briefcase,
  workout: Dumbbell,
  study: BookOpen,
  date: Heart,
  trip: MapIcon,
};

interface PurposeIconProps {
  id: PurposeId;
  size?: number;
  color: string;
}

export function PurposeIcon({ id, size = 16, color }: PurposeIconProps) {
  const Icon = ICONS[id];
  return <Icon size={size} color={color} />;
}
