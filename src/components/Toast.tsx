import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';
import { Check } from 'lucide-react-native';
import { Colors } from '../constants/colors';

interface ToastProps {
  message: string;
  onDone: () => void;
}

export function Toast({ message, onDone }: ToastProps) {
  const translateY = useRef(new Animated.Value(10)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(translateY, { toValue: 0, duration: 200, useNativeDriver: true }),
      Animated.timing(opacity, { toValue: 1, duration: 200, useNativeDriver: true }),
    ]).start();

    const timer = setTimeout(() => {
      onDone();
    }, 2600);

    return () => clearTimeout(timer);
    // message가 빠져 있으면 토스트가 연달아 뜰 때 컴포넌트가 재마운트되지 않아
    // 타이머가 이어진다 — 두 번째 메시지가 남은 시간만큼만 보이고 사라진다.
    // (피드백 버튼을 연속으로 누르면 바로 재현된다)
  }, [message, translateY, opacity, onDone]);

  return (
    <View style={styles.container} pointerEvents="none">
      <Animated.View style={[styles.pill, { opacity, transform: [{ translateY }] }]}>
        <Check size={16} color={Colors.emerald500} />
        <Text style={styles.text}>{message}</Text>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    bottom: 80,
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 999,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.slate800,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 50,
    gap: 8,
  },
  text: {
    color: Colors.white,
    fontSize: 14,
    fontWeight: '500',
  },
});
