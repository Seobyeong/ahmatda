import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, View } from 'react-native';
import { Colors } from '../constants/colors';

interface ProgressBarProps {
  checked: number;
  total: number;
}

export function ProgressBar({ checked, total }: ProgressBarProps) {
  const pct = total === 0 ? 0 : (checked / total) * 100;
  const widthAnim = useRef(new Animated.Value(pct)).current;

  useEffect(() => {
    Animated.timing(widthAnim, {
      toValue: pct,
      duration: 500,
      useNativeDriver: false,
    }).start();
  }, [pct, widthAnim]);

  const color = pct === 100 ? Colors.emerald500 : Colors.indigo600;

  return (
    <View style={styles.track}>
      <Animated.View
        style={[
          styles.fill,
          {
            backgroundColor: color,
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

const styles = StyleSheet.create({
  track: {
    height: 4,
    backgroundColor: Colors.slate100,
    borderRadius: 2,
    overflow: 'hidden',
  },
  fill: {
    height: 4,
    borderRadius: 2,
  },
});
