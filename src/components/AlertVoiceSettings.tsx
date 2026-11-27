import React, { useEffect, useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import { FontSize, Radius, Space, makeStyles, useTheme } from '../constants/theme';
import { ChoiceList } from './ChoiceList';
import { Button } from './ui';
import { useAppStore, type ToastTone } from '../store';
import { NotificationService } from '../services/notification/NotificationService';
import {
  CUSTOM_TEXT_EXAMPLE, CUSTOM_TEXT_MAX, PLACEHOLDERS, SAMPLE_VARS, VOICES, renderAlert,
} from '../constants/alertVoices';
import type { Choice } from '../constants/preferences';
import type { AlertVoiceId } from '../types';

// 설정 > 알림 말투. 캐릭터를 고르거나, 빈칸을 넣은 문장 하나를 직접 쓴다.
// 고르는 칸마다 "아 맞다" 알림이 그 말투로 어떻게 오는지 예시를 붙인다.
const CHOICES: Choice<AlertVoiceId>[] = [
  ...VOICES.map((v) => ({
    value: v.id,
    label: v.label,
    description: `${v.description}\n예) ${renderAlert('urgent', v.id, '', SAMPLE_VARS).title}`,
  })),
  { value: 'custom', label: '직접 쓰기', description: '내가 쓴 문장으로 알려요' },
];

export function AlertVoiceSettings({ titleStyle, onMessage }: {
  titleStyle: object;
  onMessage: (text: string, tone?: ToastTone) => void;
}) {
  const styles = useStyles();
  const { Role } = useTheme();
  const voice = useAppStore((s) => s.userSettings.alertVoice);
  const saved = useAppStore((s) => s.userSettings.customAlertText);
  const setAlertVoice = useAppStore((s) => s.setAlertVoice);
  const setCustomAlertText = useAppStore((s) => s.setCustomAlertText);

  // 글자마다 저장하면 예약 알림을 글자마다 다시 건다 — [저장]을 눌렀을 때만 반영한다.
  const [draft, setDraft] = useState(saved || CUSTOM_TEXT_EXAMPLE);
  useEffect(() => {
    if (saved) setDraft(saved);
  }, [saved]);

  const handleSelect = (id: AlertVoiceId) => {
    setAlertVoice(id);
    // 직접 쓰기를 처음 고르면 예시 문장을 바로 써 둔다 — 비어 있으면 기본 말투로 오기 때문.
    if (id === 'custom' && !saved) setCustomAlertText(draft);
  };

  const insert = (token: string) => {
    setDraft((d) => (d + token).slice(0, CUSTOM_TEXT_MAX));
  };

  const handleSave = () => {
    const text = draft.trim();
    if (!text) {
      onMessage('문장을 써 주세요.', 'warning');
      return;
    }
    setCustomAlertText(text);
    onMessage('알림 문장을 저장했어요.');
  };

  const handlePreview = async () => {
    try {
      await NotificationService.previewVoice();
    } catch {
      onMessage('알림을 보낼 수 없어요. 알림 권한을 확인해 주세요.', 'error');
    }
  };

  const preview = renderAlert('urgent', 'custom', draft, SAMPLE_VARS).title;

  return (
    <View>
      <Text style={titleStyle}>알림 말투</Text>
      <ChoiceList choices={CHOICES} value={voice} onChange={handleSelect} />

      {voice === 'custom' ? (
        <View style={styles.customBox}>
          <TextInput
            style={styles.input}
            value={draft}
            onChangeText={(t) => setDraft(t.slice(0, CUSTOM_TEXT_MAX))}
            placeholder={CUSTOM_TEXT_EXAMPLE}
            placeholderTextColor={Role.placeholder}
            maxLength={CUSTOM_TEXT_MAX}
            accessibilityLabel="알림 문장"
          />
          <View style={styles.chips}>
            {PLACEHOLDERS.map((p) => (
              <Pressable
                key={p.token}
                style={({ pressed }) => [styles.chip, pressed && styles.pressed]}
                onPress={() => insert(p.token)}
                accessibilityRole="button"
                accessibilityLabel={`${p.token} 넣기 — ${p.description}`}
              >
                <Text style={styles.chipText}>{p.token}</Text>
              </Pressable>
            ))}
          </View>
          <Text style={styles.help}>
            {'{물건}'} 안 챙긴 물건 · {'{개수}'} 남은 개수 · {'{출발}'} 외출 시간{'\n'}
            물건을 말하는 알림에 이 문장이 제목으로 가요. 자기 전 정리처럼 물건이 없는 알림은 기본 말투로 와요.
          </Text>
          <Text style={styles.preview}>예) {preview}</Text>
          <Button
            label={draft.trim() === saved ? '저장됨' : '저장'}
            size="sm"
            onPress={handleSave}
            disabled={draft.trim() === saved}
            style={styles.saveButton}
          />
        </View>
      ) : null}

      <Button label="알림 미리 받아 보기" variant="soft" size="sm" onPress={handlePreview} style={styles.previewButton} />
    </View>
  );
}

const useStyles = makeStyles(({ Role }) => ({
  customBox: {
    marginTop: Space.md,
    gap: Space.sm,
  },
  input: {
    paddingHorizontal: Space.md,
    paddingVertical: 10,
    borderRadius: Radius.md,
    backgroundColor: Role.surfaceSoft,
    fontSize: FontSize.body,
    color: Role.text,
  },
  chips: {
    flexDirection: 'row',
    gap: Space.sm,
  },
  chip: {
    paddingHorizontal: Space.md,
    paddingVertical: 6,
    borderRadius: Radius.pill,
    backgroundColor: Role.actionSoft,
  },
  chipText: {
    fontSize: FontSize.label,
    fontWeight: '600',
    color: Role.actionText,
  },
  pressed: {
    opacity: 0.7,
  },
  help: {
    fontSize: FontSize.caption,
    lineHeight: 17,
    color: Role.textMuted,
  },
  preview: {
    fontSize: FontSize.label,
    color: Role.textStrong,
  },
  saveButton: {
    alignSelf: 'flex-end',
  },
  previewButton: {
    marginTop: Space.md,
    alignSelf: 'flex-start',
  },
}));
