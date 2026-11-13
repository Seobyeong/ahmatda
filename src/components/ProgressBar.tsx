import React, { useEffect, useRef } from 'react';
import { Animated, View } from 'react-native';
import { makeStyles, useTheme } from '../constants/theme';

interface ProgressBarProps {
  checked: number;
  total: number;
  /** 진행 중 색 — 고른 목적의 색을 넘긴다. 다 챙기면 항상 초록이다. */
  color?: string;
}

export function ProgressBar({ checked, total, color }: ProgressBarProps) {
  const { Role } = useTheme();
  const styles = useStyles();
  const pct = total === 0 ? 0 : (checked / total) * 100;
  const widthAnim = useRef(new Animated.Value(pct)).current;

  useEffect(() => {
    Animated.timing(widthAnim, {
      toValue: pct,
      duration: 500,
      useNativeDriver: false,
    }).start();
  }, [pct, widthAnim]);

  return (
    <View style={styles.track}>
      <Animated.View
        style={[
          styles.fill,
          {
            backgroundColor: pct === 100 ? Role.done : color ?? Role.textMuted,
            width: widthAnim.interpolate({
              inputRange: [0, 100],
              outputRange: ['0%', '100%'],
              extrapolate: 'clamp',
            }),
          },
        ]}
      />
    </View>
  );
}

const useStyles = makeStyles(({ Colors, Role, Shadow }) => ({
  track: {
    height: 6,
    backgroundColor: Role.surfaceSoft,
    borderRadius: 3,
    overflow: 'hidden',
  },
  fill: {
    height: 6,
    borderRadius: 3,
  },
}));
