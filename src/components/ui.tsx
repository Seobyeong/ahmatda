// 공용 부품 — 버튼과 카드. 화면마다 따로 만들던 "주요 버튼"·"흰 카드"를 하나로 모은다.
import React from 'react';
import { Pressable, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { FontSize, Radius, Space, makeStyles } from '../constants/theme';

type ButtonVariant = 'primary' | 'soft' | 'neutral' | 'text';
type ButtonSize = 'md' | 'sm';

interface ButtonProps {
  label: string;
  onPress: () => void;
  /** primary: 화면의 주된 행동 / soft: 그다음 행동 / neutral: 취소·닫기 / text: 글자만 */
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** 둥근 알약 모양 (줄 안에 들어가는 작은 버튼) */
  pill?: boolean;
  icon?: React.ReactNode;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
}

export function Button({
  label, onPress, variant = 'primary', size = 'md', pill = false, icon, disabled, style, accessibilityLabel,
}: ButtonProps) {
  const styles = useStyles();
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      // sm은 보이는 높이가 36이라 터치 영역을 위아래로 넓힌다 (44 이상).
      hitSlop={size === 'sm' ? 8 : undefined}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled: !!disabled }}
      style={({ pressed }) => [
        styles.base,
        size === 'sm' ? styles.sm : styles.md,
        pill && styles.pill,
        styles[variant],
        pressed && styles.pressed,
        disabled && styles.disabled,
        style,
      ]}
    >
      {icon}
      <Text style={[styles.label, size === 'sm' && styles.labelSm, styles[`${variant}Label`]]}>{label}</Text>
    </Pressable>
  );
}

interface CardProps {
  /** hero: 화면의 주인공(흰 면 + 그림자) / soft: 배경에 붙는 옅은 면 */
  variant?: 'hero' | 'soft';
  style?: StyleProp<ViewStyle>;
  children: React.ReactNode;
  onLayout?: React.ComponentProps<typeof View>['onLayout'];
}

export function Card({ variant = 'soft', style, children, onLayout }: CardProps) {
  const styles = useStyles();
  return (
    <View style={[variant === 'hero' ? styles.cardHero : styles.cardSoft, style]} onLayout={onLayout}>
      {children}
    </View>
  );
}

const useStyles = makeStyles(({ Role, Shadow }) => ({
  base: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Space.sm,
    borderRadius: Radius.md,
  },
  md: {
    minHeight: 48,
    paddingHorizontal: Space.lg,
  },
  sm: {
    minHeight: 36,
    paddingHorizontal: 14,
  },
  pill: {
    borderRadius: Radius.pill,
  },
  pressed: {
    opacity: 0.8,
  },
  disabled: {
    opacity: 0.5,
  },
  label: {
    fontSize: FontSize.body,
    fontWeight: '700',
  },
  labelSm: {
    fontSize: FontSize.label,
    fontWeight: '600',
  },
  cardHero: {
    backgroundColor: Role.surface,
    borderRadius: Radius.xl,
    padding: 18,
    ...Shadow.card,
  },
  cardSoft: {
    backgroundColor: Role.surfaceSoft,
    borderRadius: Radius.lg,
    padding: Space.lg,
  },

  // 버튼 종류별 면과 글자색
  primary: { backgroundColor: Role.action },
  soft: { backgroundColor: Role.actionSoft },
  neutral: { backgroundColor: Role.surfaceSoft },
  text: { backgroundColor: 'transparent', paddingHorizontal: 0 },
  primaryLabel: { color: Role.onAction },
  softLabel: { color: Role.actionText },
  neutralLabel: { color: Role.textSub },
  textLabel: { color: Role.actionText },
}));
