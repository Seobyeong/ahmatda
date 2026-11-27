import React, { useEffect, useRef } from 'react';
import { Animated, View } from 'react-native';
import { makeStyles, useTheme } from '../constants/theme';

interface ProgressBarProps {
  checked: number;
  total: number;
}

// 챙긴 만큼 차오르는 막대라 체크박스와 같은 초록으로 칠한다 (2026-11-28 — 남색은 누를 수 있는 것의 색).
export function ProgressBar({ checked, total }: ProgressBarProps) {
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
            backgroundColor: Role.done,
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
