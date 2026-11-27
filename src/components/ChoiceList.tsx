import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { CircleCheck } from 'lucide-react-native';
import { FontSize, Radius, makeStyles, useTheme } from '../constants/theme';
import type { Choice } from '../constants/preferences';

interface ChoiceListProps<T extends string> {
  choices: Choice<T>[];
  value: T | null;
  onChange: (value: T) => void;
}

// 설명이 붙은 단일 선택 목록 — 첫 사용 설문과 설정 화면 공용.
// 고른 것은 색만이 아니라 두꺼운 테두리 + 체크 아이콘으로도 구분한다 — 어두운 화면에서는 옅은 남색 면과
// 카드 면의 밝기 차이가 작아서 색만으로는 잘 안 보였다 (B6).
export function ChoiceList<T extends string>({ choices, value, onChange }: ChoiceListProps<T>) {
  const styles = useStyles();
  const { Role } = useTheme();
  return (
    <View style={styles.list} accessibilityRole="radiogroup">
      {choices.map((choice) => {
        const selected = choice.value === value;
        return (
          <Pressable
            key={choice.value}
            style={[styles.option, selected && styles.optionSelected]}
            onPress={() => onChange(choice.value)}
            accessibilityRole="radio"
            accessibilityState={{ checked: selected }}
            accessibilityLabel={`${choice.label}. ${choice.description}`}
          >
            <View style={styles.textArea}>
              <Text style={[styles.label, selected && styles.labelSelected]}>{choice.label}</Text>
              <Text style={styles.description}>{choice.description}</Text>
            </View>
            {selected ? <CircleCheck size={20} color={Role.actionText} /> : <View style={styles.iconSpace} />}
          </Pressable>
        );
      })}
    </View>
  );
}

const useStyles = makeStyles(({ Colors, Role, Shadow }) => ({
  list: {
    gap: 8,
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    // 테두리가 1 → 2로 두꺼워져도 글자가 밀리지 않게 안쪽 여백을 같이 맞춘다
    padding: 12,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.slate200,
    backgroundColor: Colors.white,
  },
  optionSelected: {
    padding: 11,
    borderWidth: 2,
    borderColor: Colors.indigo600,
    backgroundColor: Colors.indigo50,
  },
  textArea: {
    flex: 1,
  },
  iconSpace: {
    width: 20,
  },
  label: {
    fontSize: FontSize.body,
    fontWeight: '600',
    color: Colors.slate700,
  },
  labelSelected: {
    color: Colors.indigoText,
  },
  description: {
    marginTop: 2,
    fontSize: FontSize.caption,
    color: Colors.slate500,
  },
}));
