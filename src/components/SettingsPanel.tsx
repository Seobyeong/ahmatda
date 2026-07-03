import React, { useEffect, useRef, useState } from 'react';
import { Animated, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import RNCalendarEvents from 'react-native-calendar-events';
import { X } from 'lucide-react-native';
import { Colors } from '../constants/colors';
import { useAppStore } from '../store';
import type { FeedbackType } from '../types';

interface SettingsPanelProps {
  visible: boolean;
  onClose: () => void;
}

const FEEDBACK_LABELS: Record<FeedbackType, string> = {
  cold: '추웠음',
  good: '적당함',
  hot: '더웠음',
};

// tier1 날씨 트리거 항목 — buildChecklist()에서 생성하는 라벨과 반드시 일치해야 한다.
const WEATHER_ITEMS: { label: string; description: string }[] = [
  { label: '우산', description: '비 예보 시 표시' },
  { label: '마스크', description: '미세먼지 나쁨일 때 표시' },
  { label: '물병', description: '폭염 주의보일 때 표시' },
];

export function SettingsPanel({ visible, onClose }: SettingsPanelProps) {
  const translateY = useRef(new Animated.Value(visible ? 0 : -300)).current;

  useEffect(() => {
    Animated.timing(translateY, {
      toValue: visible ? 0 : -300,
      duration: 250,
      useNativeDriver: true,
    }).start();
  }, [visible, translateY]);

  const departureTime = useAppStore((s) => s.userSettings.departureTime);
  const deltaOffset = useAppStore((s) => s.userSettings.deltaOffset);
  const disabledWeatherItems = useAppStore((s) => s.userSettings.disabledWeatherItems);
  const permanentRoutines = useAppStore((s) => s.permanentRoutines);
  const feedbackHistory = useAppStore((s) => s.feedbackHistory);
  const updateDepartureTime = useAppStore((s) => s.updateDepartureTime);
  const removePermanentRoutine = useAppStore((s) => s.removePermanentRoutine);
  const setWeatherItemEnabled = useAppStore((s) => s.setWeatherItemEnabled);

  const [editingTime, setEditingTime] = useState(false);
  const [timeInput, setTimeInput] = useState(departureTime);
  const [calendarConnected, setCalendarConnected] = useState(false);

  useEffect(() => {
    if (!visible) return;
    RNCalendarEvents.checkPermissions()
      .then((status) => setCalendarConnected(status === 'authorized'))
      .catch(() => setCalendarConnected(false));
  }, [visible]);

  const startEditingTime = () => {
    setTimeInput(departureTime);
    setEditingTime(true);
  };

  const commitTime = () => {
    updateDepartureTime(timeInput);
    setEditingTime(false);
  };

  const deltaColor =
    deltaOffset > 0 ? Colors.red500 : deltaOffset < 0 ? Colors.blue500 : Colors.slate600;
  const deltaLabel = deltaOffset > 0 ? `+${deltaOffset}` : `${deltaOffset}`;

  const recentFeedback = feedbackHistory.slice(-3).reverse();

  return (
    <Animated.View style={[styles.container, { transform: [{ translateY }] }]}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>설정</Text>
          <Pressable onPress={onClose} hitSlop={8}>
            <X size={20} color={Colors.slate500} />
          </Pressable>
        </View>

        <View style={styles.row}>
          <Text style={styles.rowLabel}>외출 시간</Text>
          {editingTime ? (
            <TextInput
              style={styles.timeInput}
              value={timeInput}
              onChangeText={setTimeInput}
              onSubmitEditing={commitTime}
              onBlur={commitTime}
              keyboardType="numeric"
              autoFocus
              maxLength={5}
            />
          ) : (
            <Pressable onPress={startEditingTime}>
              <Text style={styles.rowValue}>{departureTime}</Text>
            </Pressable>
          )}
        </View>

        <View style={styles.row}>
          <Text style={styles.rowLabel}>Δt 보정치</Text>
          <Text style={[styles.rowValue, { color: deltaColor }]}>{deltaLabel}°C</Text>
        </View>

        <View style={styles.row}>
          <Text style={styles.rowLabel}>캘린더 연동</Text>
          <Text style={styles.rowValue}>{calendarConnected ? '연결됨' : '권한 없음'}</Text>
        </View>

        <Text style={styles.sectionTitle}>날씨 알림 항목</Text>
        {WEATHER_ITEMS.map((weatherItem) => {
          const enabled = !disabledWeatherItems.includes(weatherItem.label);
          return (
            <View key={weatherItem.label} style={styles.weatherRow}>
              <View style={styles.weatherTextArea}>
                <Text style={styles.routineLabel}>{weatherItem.label}</Text>
                <Text style={styles.weatherDescription}>{weatherItem.description}</Text>
              </View>
              <Switch
                value={enabled}
                onValueChange={(value) => setWeatherItemEnabled(weatherItem.label, value)}
                trackColor={{ false: Colors.slate200, true: Colors.indigo600 }}
                thumbColor={Colors.white}
              />
            </View>
          );
        })}

        <Text style={styles.sectionTitle}>내 루틴</Text>
        {permanentRoutines.length === 0 ? (
          <Text style={styles.emptyText}>등록된 루틴이 없어요.</Text>
        ) : (
          permanentRoutines.map((routine) => (
            <View key={routine.id} style={styles.routineRow}>
              <Text style={styles.routineLabel}>{routine.label}</Text>
              <Pressable onPress={() => removePermanentRoutine(routine.id)} hitSlop={8}>
                <X size={16} color={Colors.slate400} />
              </Pressable>
            </View>
          ))
        )}

        <Text style={styles.sectionTitle}>최근 피드백 기록</Text>
        {recentFeedback.length === 0 ? (
          <Text style={styles.emptyText}>아직 기록이 없어요.</Text>
        ) : (
          recentFeedback.map((record, i) => (
            <View key={`${record.date}-${i}`} style={styles.feedbackRow}>
              <Text style={styles.feedbackDate}>{record.date}</Text>
              <Text style={styles.feedbackValue}>{FEEDBACK_LABELS[record.val]}</Text>
            </View>
          ))
        )}
      </ScrollView>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: '100%',
    left: 0,
    right: 0,
    maxHeight: 420,
    backgroundColor: Colors.white,
    borderBottomLeftRadius: 20,
    borderBottomRightRadius: 20,
    zIndex: 20,
    elevation: 20,
    shadowColor: Colors.slate800,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 10,
  },
  content: {
    padding: 20,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.slate800,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: Colors.slate100,
  },
  rowLabel: {
    fontSize: 13,
    color: Colors.slate500,
  },
  rowValue: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.slate800,
  },
  timeInput: {
    borderWidth: 1,
    borderColor: Colors.slate200,
    borderRadius: 8,
    paddingVertical: 4,
    paddingHorizontal: 10,
    fontSize: 14,
    color: Colors.slate800,
    minWidth: 70,
    textAlign: 'right',
  },
  sectionTitle: {
    marginTop: 18,
    marginBottom: 8,
    fontSize: 13,
    fontWeight: '700',
    color: Colors.slate600,
  },
  emptyText: {
    fontSize: 12,
    color: Colors.slate400,
  },
  routineRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
  },
  routineLabel: {
    fontSize: 13,
    color: Colors.slate700,
  },
  weatherRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
  },
  weatherTextArea: {
    flex: 1,
  },
  weatherDescription: {
    marginTop: 2,
    fontSize: 11,
    color: Colors.slate400,
  },
  feedbackRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 6,
  },
  feedbackDate: {
    fontSize: 12,
    color: Colors.slate400,
  },
  feedbackValue: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.slate600,
  },
});
