import React from 'react';
import { Text, View } from 'react-native';
import { Sparkles } from 'lucide-react-native';
import { FontSize, Radius, makeStyles, useTheme } from '../constants/theme';
import { PURPOSES } from '../constants/purposes';
import { Button } from './ui';
import type { AiSuggestion } from '../services/ai/hints';

interface AiSuggestionCardProps {
  suggestions: AiSuggestion[];
  onAccept: (suggestion: AiSuggestion) => void;
  onReject: (suggestion: AiSuggestion) => void;
}

// 일정 기반 제안 — 체크리스트 카드 "아래"에 별도 카드로 둔다. 체크하는 도중에 AI 결과가
// 도착해도 체크리스트 항목의 위치가 움직이지 않게 하기 위해서다(AI 연결 설계 4장 규칙 3).
export function AiSuggestionCard({ suggestions, onAccept, onReject }: AiSuggestionCardProps) {
  const { Colors } = useTheme();
  const styles = useStyles();
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
            <Button label="아니요" variant="neutral" size="sm" pill onPress={() => onReject(s)} style={styles.rejectButton} accessibilityLabel={`${s.title} 제안 거절`} />
            <Button label="추가" variant="primary" size="sm" pill onPress={() => onAccept(s)} accessibilityLabel={`${s.title} 제안 추가`} />
          </View>
        </View>
      ))}
    </View>
  );
}

const useStyles = makeStyles(({ Colors, Role, Shadow }) => ({
  card: {
    // 체크리스트 카드와 겨루지 않게 옅은 면으로 둔다.
    backgroundColor: Colors.slate100,
    borderRadius: Radius.lg,
    padding: 16,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 8,
  },
  title: {
    fontSize: FontSize.label,
    fontWeight: '700',
    color: Colors.slate700,
  },
  row: {
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: Colors.slate200,
  },
  eventTitle: {
    fontSize: FontSize.body,
    fontWeight: '600',
    color: Colors.slate800,
  },
  purposeText: {
    fontSize: FontSize.caption,
    fontWeight: '400',
    color: Colors.slate500,
  },
  itemsText: {
    marginTop: 4,
    fontSize: FontSize.label,
    color: Colors.slate700,
  },
  buttonRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 8,
    marginTop: 8,
  },
  rejectButton: {
    backgroundColor: Colors.white,
  },
}));
