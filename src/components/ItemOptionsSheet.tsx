import React, { useEffect, useState } from 'react';
import { Modal, Pressable, Switch, Text, View } from 'react-native';
import { Trash2, X } from 'lucide-react-native';
import { FontSize, Radius, Space, makeStyles, useTheme } from '../constants/theme';
import { useAppStore } from '../store';
import { countRecentForgotten, FORGOTTEN_BADGE_THRESHOLD } from '../utils/forgotten';
import { getTodayString } from '../utils/time';
import { Button } from './ui';
import { LostItemContent } from './LostItemSheet';
import { canDeleteItem, getDeleteHint } from './ChecklistItem';

// 항목을 길게 누르면 열린다 — 항목에 붙는 속성을 고르는 곳 (docs/체크리스트-항목-속성.md 2.1).
// 꼭 챙김과 지우기(줄마다 있던 ✕를 여기로 옮겼다 — 체크 옆이라 잘못 누르기 쉬웠다).
// 속성은 전부 선택 사항이라 안 열어도 지금과 똑같이 동작한다.
//
// 항목은 id가 아니라 이름으로 찾는다 — 날씨를 새로 받거나 목적이 바뀌어 목록이 다시 조립되면
// 항목 id가 전부 새로 나와서, id로 찾으면 보고 있던 시트가 저절로 닫힌다. 이름은 목록 안에서 하나뿐이다.
export function ItemOptionsSheet({ label, onClose, onDelete }: {
  label: string | null;
  onClose: () => void;
  // 지운 뒤 되돌리기 토스트는 부르는 쪽이 띄운다
  onDelete?: (id: string) => void;
}) {
  const styles = useStyles();
  const { Colors, Role } = useTheme();
  const item = useAppStore((s) => (label ? s.checklist.find((i) => i.label === label) ?? null : null));
  const forgottenHistory = useAppStore((s) => s.forgottenHistory);
  const setItemEssential = useAppStore((s) => s.setItemEssential);
  const [mode, setMode] = useState<'options' | 'lost'>('options');

  // 다른 항목으로 다시 열면 처음 화면부터
  useEffect(() => {
    if (label) setMode('options');
  }, [label]);

  // 자주 놓친 항목이면 꼭 챙김을 권한다 — 켜는 건 사용자가 (속성 문서 2.2: 제안만, 자동으로 켜지 않음)
  const forgotten = item ? countRecentForgotten(forgottenHistory, getTodayString()).get(item.label) ?? 0 : 0;
  const essential = Boolean(item?.essential);

  return (
    <Modal visible={item !== null} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <Pressable style={styles.dismissArea} onPress={onClose} accessibilityLabel="닫기" />
        <View style={styles.sheet}>
          {mode === 'lost' ? (
            <LostItemContent onClose={onClose} label={item?.label} />
          ) : (
            <>
              <View style={styles.header}>
                <Text style={styles.title} accessibilityRole="header" numberOfLines={2}>{item?.label}</Text>
                <Pressable onPress={onClose} hitSlop={8} accessibilityRole="button" accessibilityLabel="닫기">
                  <X size={20} color={Role.textMuted} />
                </Pressable>
              </View>

              <View style={styles.row}>
                <View style={styles.rowText}>
                  <Text style={styles.rowLabel}>꼭 챙김</Text>
                  <Text style={styles.rowSub}>
                    {item?.temp
                      ? '오늘 하루만 꼭 챙길 것으로 둬요. 안 챙기고 나가면 알림 맨 앞에 와요.'
                      : '안 챙기고 나가면 알림 맨 앞에 오고, 잠금화면·위젯에도 먼저 보여요.'}
                  </Text>
                </View>
                <Switch
                  value={essential}
                  onValueChange={(value) => { if (item) setItemEssential(item.id, value); }}
                  trackColor={{ false: Colors.slate200, true: Colors.indigo600 }}
                  thumbColor={Colors.onColor}
                  accessibilityLabel={`${item?.label ?? ''} 꼭 챙김`}
                />
              </View>

              {!essential && forgotten >= FORGOTTEN_BADGE_THRESHOLD ? (
                <Text style={styles.suggest}>
                  최근 일주일에 {forgotten}번 안 챙기고 나갔어요. 꼭 챙김으로 두면 놓쳤을 때 더 눈에 띄게 알려 드려요.
                </Text>
              ) : null}

              <View style={styles.footer}>
                <Button
                  label="밖에서 잃어버렸어요"
                  variant="text"
                  size="sm"
                  onPress={() => setMode('lost')}
                />
                {item && onDelete && canDeleteItem(item) ? (
                  <Button
                    label="지우기"
                    variant="text"
                    size="sm"
                    icon={<Trash2 size={14} color={Role.dangerText} />}
                    textStyle={styles.deleteText}
                    accessibilityHint={getDeleteHint(item)}
                    onPress={() => {
                      onDelete(item.id);
                      onClose();
                    }}
                  />
                ) : null}
              </View>
            </>
          )}
        </View>
      </View>
    </Modal>
  );
}

const useStyles = makeStyles(({ Role }) => ({
  backdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(15, 23, 42, 0.4)',
  },
  dismissArea: {
    flex: 1,
  },
  sheet: {
    backgroundColor: Role.surface,
    borderTopLeftRadius: Radius.xl,
    borderTopRightRadius: Radius.xl,
    paddingHorizontal: Space.xl,
    paddingTop: 18,
    paddingBottom: 32,
    gap: Space.sm,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Space.md,
    marginBottom: Space.xs,
  },
  title: {
    flex: 1,
    fontSize: FontSize.heading,
    fontWeight: '700',
    color: Role.text,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.md,
    minHeight: 56,
  },
  rowText: {
    flex: 1,
  },
  rowLabel: {
    fontSize: FontSize.body,
    fontWeight: '600',
    color: Role.textStrong,
  },
  rowSub: {
    marginTop: 2,
    fontSize: FontSize.caption,
    lineHeight: 17,
    color: Role.textMuted,
  },
  suggest: {
    padding: Space.md,
    borderRadius: Radius.md,
    backgroundColor: Role.warnSoft,
    color: Role.warn,
    fontSize: FontSize.label,
    lineHeight: 19,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: Space.xs,
  },
  deleteText: {
    color: Role.dangerText,
  },
}));
