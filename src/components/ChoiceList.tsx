import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Colors } from '../constants/colors';
import type { Choice } from '../constants/preferences';

interface ChoiceListProps<T extends string> {
  choices: Choice<T>[];
  value: T | null;
  onChange: (value: T) => void;
}

// 설명이 붙은 단일 선택 목록 — 첫 사용 설문과 설정 화면 공용
export function ChoiceList<T extends string>({ choices, value, onChange }: ChoiceListProps<T>) {
  return (
    <View style={styles.list}>
      {choices.map((choice) => {
        const selected = choice.value === value;
        return (
          <Pressable
            key={choice.value}
            style={[styles.option, selected && styles.optionSelected]}
            onPress={() => onChange(choice.value)}
            accessibilityRole="radio"
            accessibilityState={{ checked: selected }}
          >
            <Text style={[styles.label, selected && styles.labelSelected]}>{choice.label}</Text>
            <Text style={styles.description}>{choice.description}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  list: {
    gap: 8,
  },
  option: {
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.slate200,
    backgroundColor: Colors.white,
  },
  optionSelected: {
    borderColor: Colors.indigo600,
    backgroundColor: Colors.indigo50,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.slate700,
  },
  labelSelected: {
    color: Colors.indigo600,
  },
  description: {
    marginTop: 2,
    fontSize: 12,
    color: Colors.slate500,
  },
});
