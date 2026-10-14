import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Sparkles } from 'lucide-react-native';
import { Colors } from '../constants/colors';
import { PURPOSES } from '../constants/purposes';
import type { AiSuggestion } from '../services/ai/hints';

interface AiSuggestionCardProps {
  suggestions: AiSuggestion[];
  onAccept: (suggestion: AiSuggestion) => void;
  onReject: (suggestion: AiSuggestion) => void;
}

// 일정 기반 제안 — 체크리스트 카드 "아래"에 별도 카드로 둔다. 체크하는 도중에 AI 결과가
// 도착해도 체크리스트 항목의 위치가 움직이지 않게 하기 위해서다(AI 연결 설계 4장 규칙 3).
export function AiSuggestionCard({ suggestions, onAccept, onReject }: AiSuggestionCardProps) {
  if (suggestions.length === 0) return null;

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <Sparkles size={14} color={Colors.violet600} />
        <Text style={styles.title}>일정 기반 제안</Text>
      </View>

      {suggestions.map((s) => (
        <View key={s.key} style={styles.row}>
          <Text style={styles.eventTitle} numberOfLines={1}>
            {s.title}
            {s.purposeId ? (
              <Text style={styles.purposeText}>  · {PURPOSES[s.purposeId].shortLabel} 일정으로 인식</Text>
            ) : null}
          </Text>
          {s.items.length > 0 ? (
            <Text style={styles.itemsText}>{s.items.join(', ')} 챙기기</Text>
          ) : null}
          <View style={styles.buttonRow}>
            <Pressable style={styles.rejectButton} onPress={() => onReject(s)} hitSlop={6}>
              <Text style={styles.rejectText}>아니요</Text>
            </Pressable>
            <Pressable style={styles.acceptButton} onPress={() => onAccept(s)} hitSlop={6}>
              <Text style={styles.acceptText}>추가</Text>
            </Pressable>
          </View>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.white,
    borderRadius: 20,
    padding: 18,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 8,
  },
  title: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.slate700,
  },
  row: {
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: Colors.slate100,
  },
  eventTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.slate800,
  },
  purposeText: {
    fontSize: 12,
    fontWeight: '400',
    color: Colors.slate500,
  },
  itemsText: {
    marginTop: 4,
    fontSize: 13,
    color: Colors.violet600,
  },
  buttonRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 8,
    marginTop: 8,
  },
  rejectButton: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 50,
    backgroundColor: Colors.slate100,
  },
  rejectText: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.slate500,
  },
  acceptButton: {
    paddingVertical: 6,
    paddingHorizontal: 14,
    borderRadius: 50,
    backgroundColor: Colors.violet50,
  },
  acceptText: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.violet600,
  },
});
