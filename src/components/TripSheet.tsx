import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, Text, TextInput, View,
} from 'react-native';
import * as Location from 'expo-location';
import { Check, Minus, Plus, Trash2, X } from 'lucide-react-native';
import { FontSize, Radius, Space, makeStyles, useTheme } from '../constants/theme';
import { useAppStore } from '../store';
import { WeatherService } from '../services/weather/WeatherService';
import {
  MAX_TRIP_NIGHTS, addDays, tripDates, tripNights, tripWhen, weatherTripItems, type Trip,
} from '../utils/trip';
import { getTodayString } from '../utils/time';
import { Button } from './ui';

const DAY_NAMES = ['일', '월', '화', '수', '목', '금', '토'];
const START_CHOICES = 60; // 오늘부터 두 달
// 단기예보가 닿는 날 — 그 뒤 날은 출발이 가까워지면 다시 받는다
const FORECAST_DAYS = 3;

function chipLabel(date: string, today: string): string {
  if (date === today) return '오늘';
  if (date === addDays(today, 1)) return '내일';
  const [y, m, d] = date.split('-').map(Number);
  return `${m}/${d} (${DAY_NAMES[new Date(y, m - 1, d).getDay()]})`;
}

// 여행·며칠 외출 짐 목록 (C5) — tripId가 없으면 새로 만들기, 있으면 그 여행의 짐.
// 목적지를 넣으면 예보가 닿는 날의 날씨 짐(우산·겉옷 등)을 더한다. 열 때마다 다시 받아 채운다.
export function TripSheet({ visible, tripId, onClose, onCreated }: {
  visible: boolean;
  tripId: string | null;
  onClose: () => void;
  onCreated: (id: string) => void;
}) {
  const styles = useStyles();
  const { Role } = useTheme();
  const today = getTodayString();
  const trip = useAppStore((s) => (tripId ? s.trips.find((t) => t.id === tripId) ?? null : null));
  const addTrip = useAppStore((s) => s.addTrip);
  const deleteTrip = useAppStore((s) => s.deleteTrip);
  const toggleTripItem = useAppStore((s) => s.toggleTripItem);
  const addTripItem = useAppStore((s) => s.addTripItem);
  const removeTripItem = useAppStore((s) => s.removeTripItem);
  const setTripWeather = useAppStore((s) => s.setTripWeather);
  const showToast = useAppStore((s) => s.showToast);

  // 만들기
  const [name, setName] = useState('');
  const [start, setStart] = useState(addDays(today, 1));
  const [nights, setNights] = useState(1);
  const [destination, setDestination] = useState('');
  // 보기
  const [draft, setDraft] = useState('');
  const [weatherNote, setWeatherNote] = useState<string | null>(null);
  const [weatherBusy, setWeatherBusy] = useState(false);

  const startChoices = useMemo(() => Array.from({ length: START_CHOICES }, (_, i) => addDays(today, i)), [today]);

  useEffect(() => {
    if (!visible || tripId) return;
    setName('');
    setStart(addDays(today, 1));
    setNights(1);
    setDestination('');
  }, [visible, tripId, today]);

  // 날씨 짐 — 목적지 좌표를 찾아 예보가 닿는 여행 날만
  const tripKey = trip ? `${trip.id}|${trip.start}|${trip.end}|${trip.destination ?? ''}` : null;
  useEffect(() => {
    setWeatherBusy(false);
    if (!visible || !trip) return;
    setWeatherNote(null);
    if (!trip.destination) {
      setWeatherNote('목적지를 넣으면 그곳 날씨에 맞는 짐도 더해요.');
      return;
    }
    const reachable = tripDates(trip).filter((d) => d >= today && d <= addDays(today, FORECAST_DAYS - 1));
    if (reachable.length === 0) {
      setWeatherNote(`날씨 짐은 출발 ${FORECAST_DAYS}일 전부터 예보를 보고 더해요.`);
      return;
    }
    let cancelled = false;
    setWeatherBusy(true);
    (async () => {
      try {
        const [place] = await Location.geocodeAsync(trip.destination!);
        if (!place) throw new Error('no place');
        // 하루 전체(00시부터) — 묵는 여행이라 아침·밤 기온도 본다. 예보는 한 번만 받는다.
        const days = reachable.map((date) => {
          const [y, m, d] = date.split('-').map(Number);
          return new Date(y, m - 1, d);
        });
        const results = await WeatherService.getDayOutlooks(place.latitude, place.longitude, days, '00:00');
        const outlooks = reachable.map((date, i) => ({ date, outlook: results[i] }));
        if (cancelled) return;
        setTripWeather(trip.id, weatherTripItems(outlooks));
        const later = tripDates(trip).some((d) => d > addDays(today, FORECAST_DAYS - 1));
        setWeatherNote(later ? `${reachable.length}일치 예보를 봤어요. 나머지 날은 가까워지면 더해요.` : `${trip.destination} 예보를 봤어요.`);
      } catch {
        if (!cancelled) setWeatherNote(`'${trip.destination}' 날씨를 찾지 못했어요. 날씨 짐 없이 보여 드려요.`);
      } finally {
        if (!cancelled) setWeatherBusy(false);
      }
    })();
    return () => {
      cancelled = true;
      setWeatherBusy(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, tripKey]);

  const create = () => {
    const id = addTrip({ name: name || '여행', start, end: addDays(start, nights), destination: destination || null });
    onCreated(id);
  };

  const remove = (t: Trip) => {
    const undo = deleteTrip(t.id);
    onClose();
    if (undo) showToast(`'${t.name}' 짐 목록을 지웠어요.`, { label: '되돌리기', onPress: undo });
  };

  const addItem = () => {
    if (!trip) return;
    if (addTripItem(trip.id, draft)) setDraft('');
  };

  const packed = trip ? trip.items.filter((i) => i.checked).length : 0;

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <KeyboardAvoidingView style={styles.backdrop} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.sheet}>
          <View style={styles.header}>
            <View style={styles.flex}>
              <Text style={styles.title} accessibilityRole="header" numberOfLines={1}>
                {trip ? trip.name : '여행 짐 싸기'}
              </Text>
              {trip ? (
                <Text style={styles.hint}>
                  {chipLabel(trip.start, today)}{tripNights(trip) > 0 ? ` ~ ${chipLabel(trip.end, today)} · ${tripNights(trip)}박` : ' · 당일'}
                  {' · '}{tripWhen(trip, today)}{trip.destination ? ` · ${trip.destination}` : ''}
                </Text>
              ) : null}
            </View>
            <Pressable onPress={onClose} hitSlop={8} accessibilityRole="button" accessibilityLabel="닫기">
              <X size={20} color={Role.textMuted} />
            </Pressable>
          </View>

          {!trip ? (
            <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
              <Text style={styles.hint}>일상 체크리스트와 따로, 며칠 묵는 외출의 짐을 챙겨요. 출발 전날 밤에도 알려 드려요.</Text>
              <TextInput
                style={styles.input}
                value={name}
                onChangeText={setName}
                placeholder="이름 (예: 부산 여행)"
                placeholderTextColor={Role.placeholder}
                maxLength={30}
                accessibilityLabel="여행 이름"
              />
              <Text style={styles.label}>출발</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
                {startChoices.map((d) => {
                  const selected = d === start;
                  return (
                    <Pressable
                      key={d}
                      style={[styles.chip, selected && styles.chipSelected]}
                      onPress={() => setStart(d)}
                      accessibilityRole="radio"
                      accessibilityState={{ checked: selected }}
                    >
                      <Text style={[styles.chipText, selected && styles.chipTextSelected]}>{chipLabel(d, today)}</Text>
                    </Pressable>
                  );
                })}
              </ScrollView>
              <View style={styles.row}>
                <Text style={styles.label}>{nights === 0 ? '당일치기' : `${nights}박 ${nights + 1}일`}</Text>
                <View style={styles.stepper}>
                  <Pressable
                    style={styles.stepButton}
                    onPress={() => setNights((n) => Math.max(0, n - 1))}
                    accessibilityRole="button"
                    accessibilityLabel="하루 줄이기"
                  >
                    <Minus size={18} color={Role.actionText} />
                  </Pressable>
                  <Pressable
                    style={styles.stepButton}
                    onPress={() => setNights((n) => Math.min(MAX_TRIP_NIGHTS, n + 1))}
                    accessibilityRole="button"
                    accessibilityLabel="하루 늘리기"
                  >
                    <Plus size={18} color={Role.actionText} />
                  </Pressable>
                </View>
              </View>
              <TextInput
                style={styles.input}
                value={destination}
                onChangeText={setDestination}
                placeholder="목적지 (선택 — 예: 부산 해운대)"
                placeholderTextColor={Role.placeholder}
                maxLength={40}
                accessibilityLabel="목적지"
              />
              <Text style={styles.hint}>목적지는 날씨를 찾는 데만 쓰고 이 기기에만 저장해요.</Text>
              <Button label="짐 목록 만들기" onPress={create} style={styles.primary} />
            </ScrollView>
          ) : (
            <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
              <View style={styles.row}>
                <Text style={styles.label}>{trip.items.length}개 중 {packed}개 챙김</Text>
                {weatherBusy ? <ActivityIndicator size="small" color={Role.textMuted} /> : null}
              </View>
              {weatherNote ? <Text style={styles.hint}>{weatherNote}</Text> : null}
              {trip.items.map((item) => (
                <View key={item.id} style={styles.itemRow}>
                  <Pressable
                    style={styles.itemMain}
                    onPress={() => toggleTripItem(trip.id, item.id)}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: item.checked }}
                    accessibilityLabel={item.reason ? `${item.label}, ${item.reason}` : item.label}
                  >
                    <View style={[styles.checkbox, item.checked && styles.checkboxChecked]}>
                      {item.checked ? <Check size={14} color={Role.onAction} /> : null}
                    </View>
                    <View style={styles.flex}>
                      <Text style={[styles.itemText, item.checked && styles.itemTextChecked]}>{item.label}</Text>
                      {item.reason ? <Text style={styles.hint}>{item.reason}</Text> : null}
                    </View>
                  </Pressable>
                  <Pressable
                    onPress={() => removeTripItem(trip.id, item.id)}
                    hitSlop={8}
                    accessibilityRole="button"
                    accessibilityLabel={`${item.label} 빼기`}
                  >
                    <X size={16} color={Role.textMuted} />
                  </Pressable>
                </View>
              ))}
              <View style={styles.row}>
                <TextInput
                  style={[styles.input, styles.flex]}
                  value={draft}
                  onChangeText={setDraft}
                  placeholder="짐 더하기"
                  placeholderTextColor={Role.placeholder}
                  onSubmitEditing={addItem}
                  returnKeyType="done"
                  maxLength={30}
                  accessibilityLabel="짐 더하기"
                />
                <Pressable style={styles.addButton} onPress={addItem} accessibilityRole="button" accessibilityLabel="짐 더하기">
                  <Plus size={18} color={Role.actionText} />
                </Pressable>
              </View>
              <Button
                label="이 짐 목록 지우기"
                variant="text"
                size="sm"
                icon={<Trash2 size={14} color={Role.dangerText} />}
                textStyle={styles.deleteText}
                onPress={() => remove(trip)}
                style={styles.deleteButton}
              />
            </ScrollView>
          )}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const useStyles = makeStyles(({ Role }) => ({
  backdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(15, 23, 42, 0.4)',
  },
  sheet: {
    maxHeight: '92%',
    backgroundColor: Role.surface,
    borderTopLeftRadius: Radius.xl,
    borderTopRightRadius: Radius.xl,
    paddingTop: 18,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.md,
    paddingHorizontal: Space.xl,
    marginBottom: Space.sm,
  },
  title: {
    fontSize: FontSize.heading,
    fontWeight: '700',
    color: Role.text,
  },
  body: {
    paddingHorizontal: Space.xl,
    paddingBottom: 40,
    gap: Space.sm,
  },
  label: {
    marginTop: Space.xs,
    fontSize: FontSize.label,
    fontWeight: '600',
    color: Role.textStrong,
  },
  hint: {
    fontSize: FontSize.caption,
    color: Role.textMuted,
  },
  input: {
    minHeight: 44,
    paddingHorizontal: Space.md,
    borderRadius: Radius.md,
    backgroundColor: Role.surfaceSoft,
    fontSize: FontSize.body,
    color: Role.text,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Space.sm,
  },
  flex: {
    flex: 1,
  },
  chips: {
    gap: Space.sm,
  },
  chip: {
    minHeight: 36,
    paddingHorizontal: Space.md,
    borderRadius: Radius.pill,
    borderWidth: 1,
    borderColor: Role.border,
    justifyContent: 'center',
  },
  chipSelected: {
    borderColor: Role.action,
    backgroundColor: Role.actionSoft,
  },
  chipText: {
    fontSize: FontSize.label,
    color: Role.textStrong,
  },
  chipTextSelected: {
    color: Role.actionText,
    fontWeight: '700',
  },
  stepper: {
    flexDirection: 'row',
    gap: Space.sm,
  },
  stepButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: Radius.md,
    backgroundColor: Role.actionSoft,
  },
  primary: {
    marginTop: Space.md,
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
  },
  itemMain: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.md,
    minHeight: 48,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: Radius.sm,
    borderWidth: 2,
    borderColor: Role.textMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxChecked: {
    backgroundColor: Role.done,
    borderColor: Role.done,
  },
  itemText: {
    fontSize: FontSize.body,
    color: Role.text,
  },
  itemTextChecked: {
    color: Role.textMuted,
    textDecorationLine: 'line-through',
  },
  addButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: Radius.md,
    backgroundColor: Role.actionSoft,
  },
  deleteButton: {
    alignSelf: 'flex-start',
    marginTop: Space.md,
  },
  deleteText: {
    color: Role.dangerText,
  },
}));
