import React, { useEffect, useRef } from 'react';
import { Animated, Pressable, Text, View } from 'react-native';
import { FontSize, Radius, makeStyles } from '../constants/theme';
import { SENSITIVITY_LABELS } from '../constants/feedback';

interface SensitivityButtonProps {
  value: 1 | 2 | 3 | 4 | 5;
  selected: boolean;
  onPress: () => void;
}

function SensitivityButton({ value, selected, onPress }: SensitivityButtonProps) {
  const styles = useStyles();
  const scale = useRef(new Animated.Value(selected ? 1.1 : 1)).current;

  useEffect(() => {
    Animated.spring(scale, {
      toValue: selected ? 1.1 : 1,
      useNativeDriver: true,
      friction: 6,
      tension: 80,
    }).start();
  }, [selected, scale]);

  return (
    <Animated.View style={{ transform: [{ scale }] }}>
      <Pressable
        onPress={onPress}
        style={[styles.sensitivityButton, selected && styles.sensitivityButtonActive]}
        accessibilityRole="radio"
        accessibilityState={{ checked: selected }}
        accessibilityLabel={`민감도 ${value}, ${SENSITIVITY_LABELS[value]}`}
      >
        <Text
          style={[styles.sensitivityButtonText, selected && styles.sensitivityButtonTextActive]}
        >
          {value}
        </Text>
      </Pressable>
    </Animated.View>
  );
}

interface SensitivitySelectorProps {
  value: 1 | 2 | 3 | 4 | 5;
  onChange: (value: 1 | 2 | 3 | 4 | 5) => void;
}

// 온보딩과 설정 화면(재조정)에서 공유하는 체온 민감도 선택 UI.
export function SensitivitySelector({ value, onChange }: SensitivitySelectorProps) {
  const styles = useStyles();
  return (
    <View>
      <View style={styles.sensitivityRow} accessibilityRole="radiogroup" accessibilityLabel="체온 민감도 (1 추위 많이 탐 ~ 5 더위 많이 탐)">
        {([1, 2, 3, 4, 5] as const).map((v) => (
          <SensitivityButton key={v} value={v} selected={value === v} onPress={() => onChange(v)} />
        ))}
      </View>

      <View style={styles.sensitivitySpectrum}>
        <Text style={styles.spectrumLabel}>추위 많이 탐</Text>
        <Text style={styles.spectrumLabel}>더위 많이 탐</Text>
      </View>

      <Text style={styles.sensitivityCurrentLabel}>{SENSITIVITY_LABELS[value]}</Text>
    </View>
  );
}

const useStyles = makeStyles(({ Colors, Role, Shadow }) => ({
  sensitivityRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  sensitivityButton: {
    width: 52,
    height: 52,
    borderRadius: Radius.pill,
    borderWidth: 1.5,
    borderColor: Colors.slate200,
    backgroundColor: Colors.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sensitivityButtonActive: {
    backgroundColor: Colors.indigo600,
    borderColor: Colors.indigo600,
  },
  sensitivityButtonText: {
    fontSize: FontSize.heading,
    fontWeight: '700',
    color: Colors.slate500,
  },
  sensitivityButtonTextActive: {
    color: Colors.onColor,
  },
  sensitivitySpectrum: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 4,
  },
  spectrumLabel: {
    fontSize: FontSize.caption,
    color: Colors.slate400,
  },
  sensitivityCurrentLabel: {
    marginTop: 20,
    fontSize: FontSize.heading,
    fontWeight: '700',
    color: Colors.slate800,
    textAlign: 'center',
  },
}));
