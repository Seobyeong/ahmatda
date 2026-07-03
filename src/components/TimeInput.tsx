import React, { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import { Colors } from '../constants/colors';

interface TimeInputProps {
  value: string; // "HH:mm"
  onChange: (value: string) => void;
  autoFocus?: boolean;
  compact?: boolean;
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

// 시/분을 별도 숫자 입력칸으로 나눠서 받는다 — keyboardType="numeric"의 숫자 키패드에는
// ':' 키가 없어서, 단일 TextInput으로는 사용자가 "HH:mm" 형식을 만들 방법이 없었다.
export function TimeInput({ value, onChange, autoFocus, compact }: TimeInputProps) {
  const [hh, mm] = value.split(':');
  const [hhText, setHhText] = useState(hh ?? '');
  const [mmText, setMmText] = useState(mm ?? '');
  const minuteRef = useRef<TextInput>(null);

  useEffect(() => {
    const [nextHh, nextMm] = value.split(':');
    setHhText(nextHh ?? '');
    setMmText(nextMm ?? '');
  }, [value]);

  const commit = (h: string, m: string) => {
    const hn = clamp(parseInt(h, 10) || 0, 0, 23);
    const mn = clamp(parseInt(m, 10) || 0, 0, 59);
    onChange(`${String(hn).padStart(2, '0')}:${String(mn).padStart(2, '0')}`);
  };

  const handleHourChange = (text: string) => {
    const digits = text.replace(/[^0-9]/g, '').slice(0, 2);
    setHhText(digits);
    commit(digits, mmText);
    if (digits.length === 2) minuteRef.current?.focus();
  };

  const handleMinuteChange = (text: string) => {
    const digits = text.replace(/[^0-9]/g, '').slice(0, 2);
    setMmText(digits);
    commit(hhText, digits);
  };

  const boxStyle = compact ? styles.boxCompact : styles.box;

  return (
    <View style={styles.row}>
      <TextInput
        style={boxStyle}
        value={hhText}
        onChangeText={handleHourChange}
        keyboardType="number-pad"
        maxLength={2}
        placeholder="08"
        placeholderTextColor={Colors.slate400}
        autoFocus={autoFocus}
      />
      <Text style={compact ? styles.colonCompact : styles.colon}>:</Text>
      <TextInput
        ref={minuteRef}
        style={boxStyle}
        value={mmText}
        onChangeText={handleMinuteChange}
        keyboardType="number-pad"
        maxLength={2}
        placeholder="15"
        placeholderTextColor={Colors.slate400}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  box: {
    borderWidth: 1,
    borderColor: Colors.slate200,
    borderRadius: 12,
    paddingVertical: 12,
    width: 56,
    textAlign: 'center',
    fontSize: 16,
    color: Colors.slate800,
    backgroundColor: Colors.white,
  },
  colon: {
    fontSize: 18,
    fontWeight: '700',
    color: Colors.slate400,
    marginHorizontal: 8,
  },
  boxCompact: {
    borderWidth: 1,
    borderColor: Colors.slate200,
    borderRadius: 8,
    paddingVertical: 4,
    width: 34,
    textAlign: 'center',
    fontSize: 14,
    color: Colors.slate800,
  },
  colonCompact: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.slate400,
    marginHorizontal: 4,
  },
});
