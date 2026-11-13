import React, { useEffect, useRef } from 'react';
import { Animated, Pressable, Text, View } from 'react-native';
import { Check } from 'lucide-react-native';
import { FontSize, Radius, makeStyles, useTheme } from '../constants/theme';
import type { ToastAction } from '../store';

interface ToastProps {
  message: string;
  /** 버튼 하나 (예: 되돌리기). 누르면 실행하고 토스트를 닫는다. */
  action?: ToastAction | null;
  onDone: () => void;
  /** 화면 아래에 고정된 버튼이 있으면 그 위로 띄운다. */
  bottomOffset?: number;
}

const DURATION_MS = 2600;
// 버튼이 있으면 읽고 누를 시간이 필요하다 — 되돌리기를 놓치면 루틴이 영구 삭제된다.
const DURATION_WITH_ACTION_MS = 6000;

export function Toast({ message, action, onDone, bottomOffset = 80 }: ToastProps) {
  const { Colors } = useTheme();
  const styles = useStyles();
  const translateY = useRef(new Animated.Value(10)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(translateY, { toValue: 0, duration: 200, useNativeDriver: true }),
      Animated.timing(opacity, { toValue: 1, duration: 200, useNativeDriver: true }),
    ]).start();

    const timer = setTimeout(() => {
      onDone();
    }, action ? DURATION_WITH_ACTION_MS : DURATION_MS);

    return () => clearTimeout(timer);
    // message가 빠져 있으면 토스트가 연달아 뜰 때 컴포넌트가 재마운트되지 않아
    // 타이머가 이어진다 — 두 번째 메시지가 남은 시간만큼만 보이고 사라진다.
    // (피드백 버튼을 연속으로 누르면 바로 재현된다)
  }, [message, action, translateY, opacity, onDone]);

  return (
    // box-none: 토스트 바깥은 뒤 화면으로 터치가 통과하고, 버튼만 눌린다.
    <View style={[styles.container, { bottom: bottomOffset }]} pointerEvents="box-none">
      <Animated.View
        style={[styles.pill, { opacity, transform: [{ translateY }] }]}
        // 화면 낭독기가 새 메시지를 읽어 준다 — 없으면 시각 사용자만 결과를 안다.
        accessibilityLiveRegion="polite"
        accessibilityRole="alert"
      >
        <Check size={16} color={Colors.emerald500} />
        <Text style={styles.text}>{message}</Text>
        {action ? (
          <Pressable
            style={styles.actionButton}
            onPress={() => {
              action.onPress();
              onDone();
            }}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel={action.label}
          >
            <Text style={styles.actionText}>{action.label}</Text>
          </Pressable>
        ) : null}
      </Animated.View>
    </View>
  );
}

const useStyles = makeStyles(({ Colors, Role, Shadow }) => ({
  container: {
    position: 'absolute',
    left: 20,
    right: 20,
    alignItems: 'center',
    zIndex: 999,
    // Android는 elevation이 그리는 순서를 정한다 — 설정 패널(elevation 20)보다 위에 뜨게.
    elevation: 30,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.inverse,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: Radius.pill,
    gap: 8,
  },
  text: {
    flexShrink: 1,
    color: Colors.onInverse,
    fontSize: FontSize.body,
    fontWeight: '500',
  },
  actionButton: {
    marginLeft: 6,
    paddingVertical: 4,
    paddingHorizontal: 4,
  },
  actionText: {
    color: Colors.inverseAction,
    fontSize: FontSize.body,
    fontWeight: '700',
  },
}));
