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
  }, [translateY, opacity, onDone]);

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
