import React, { useState } from 'react';
import { FlatList, KeyboardAvoidingView, Modal, Platform, Pressable, Text, TextInput, View } from 'react-native';
import { X } from 'lucide-react-native';
import { FontSize, Radius, Space, makeStyles, useTheme } from '../constants/theme';
import { Button } from './ui';
import { useAppStore, type Memo } from '../store';

// 빠른 메모 — [떠나기] 옆 버튼으로 연다. 급할 때 바로 쓰도록 입력칸에 곧장 커서가 간다.
// 체크리스트와는 따로 놀고, 날이 바뀌어도 지울 때까지 남는다.
export function MemoModal({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const styles = useStyles();
  const { Role } = useTheme();
  const memos = useAppStore((s) => s.memos);
  const addMemo = useAppStore((s) => s.addMemo);
  const deleteMemo = useAppStore((s) => s.deleteMemo);

  const [draft, setDraft] = useState('');
  // 방금 지운 메모 하나만 되돌릴 수 있다. 모달 위라 대시보드 토스트가 가려져 안쪽에 둔다.
  const [undo, setUndo] = useState<(() => void) | null>(null);

  const handleSave = () => {
    if (addMemo(draft)) setDraft('');
  };

  const handleDelete = (id: string) => {
    const restore = deleteMemo(id);
    setUndo(() => restore);
  };

  const handleClose = () => {
    setUndo(null);
    onClose();
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={handleClose}>
      <KeyboardAvoidingView
        style={styles.backdrop}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.sheet}>
          <View style={styles.header}>
            <Text style={styles.title}>메모</Text>
            <Pressable onPress={handleClose} hitSlop={8} accessibilityRole="button" accessibilityLabel="메모 닫기">
              <X size={20} color={Role.textMuted} />
            </Pressable>
          </View>

          <View style={styles.inputBox}>
            <TextInput
              style={styles.input}
              value={draft}
              onChangeText={setDraft}
              placeholder="잊기 전에 적어 두세요"
              placeholderTextColor={Role.placeholder}
              multiline
              autoFocus
              accessibilityLabel="메모 입력"
            />
            <Button label="저장" onPress={handleSave} disabled={!draft.trim()} style={styles.saveButton} />
          </View>

          {undo ? (
            <View style={styles.undoRow}>
              <Text style={styles.undoText}>메모를 지웠어요.</Text>
              <Button
                label="되돌리기"
                variant="text"
                size="sm"
                onPress={() => {
                  undo();
                  setUndo(null);
                }}
              />
            </View>
          ) : null}

          <FlatList
            data={memos}
            keyExtractor={(m) => m.id}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={styles.list}
            ListEmptyComponent={<Text style={styles.empty}>아직 메모가 없어요.</Text>}
            renderItem={({ item }) => <MemoRow memo={item} onDelete={() => handleDelete(item.id)} />}
          />
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function MemoRow({ memo, onDelete }: { memo: Memo; onDelete: () => void }) {
  const styles = useStyles();
  const { Role } = useTheme();
  return (
    <View style={styles.row}>
      <View style={styles.rowText}>
        <Text style={styles.memoText} selectable>{memo.text}</Text>
        <Text style={styles.memoTime}>{formatMemoTime(memo.createdAt)}</Text>
      </View>
      <Pressable onPress={onDelete} hitSlop={10} accessibilityRole="button" accessibilityLabel={`메모 지우기: ${memo.text}`}>
        <X size={16} color={Role.textMuted} />
      </Pressable>
    </View>
  );
}

// 오늘이면 시각만, 아니면 날짜와 시각.
export function formatMemoTime(ms: number, now = new Date()): string {
  const d = new Date(ms);
  const hm = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  const sameDay = d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate();
  return sameDay ? `오늘 ${hm}` : `${d.getMonth() + 1}/${d.getDate()} ${hm}`;
}

const useStyles = makeStyles(({ Role }) => ({
  backdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(15, 23, 42, 0.4)',
  },
  sheet: {
    maxHeight: '85%',
    backgroundColor: Role.surface,
    borderTopLeftRadius: Radius.xl,
    borderTopRightRadius: Radius.xl,
    paddingBottom: Space.lg,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Space.xl,
    paddingTop: 18,
    paddingBottom: Space.sm,
  },
  title: {
    fontSize: FontSize.heading,
    fontWeight: '700',
    color: Role.text,
  },
  inputBox: {
    paddingHorizontal: Space.xl,
    gap: Space.sm,
  },
  input: {
    minHeight: 80,
    maxHeight: 160,
    paddingHorizontal: Space.md,
    paddingVertical: 10,
    borderRadius: Radius.md,
    backgroundColor: Role.surfaceSoft,
    fontSize: FontSize.body,
    color: Role.text,
    textAlignVertical: 'top',
  },
  saveButton: {
    alignSelf: 'flex-end',
  },
  undoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: Space.sm,
    paddingHorizontal: Space.xl,
  },
  undoText: {
    fontSize: FontSize.caption,
    color: Role.textSub,
  },
  list: {
    paddingHorizontal: Space.xl,
    paddingTop: Space.sm,
  },
  empty: {
    marginTop: Space.md,
    fontSize: FontSize.label,
    color: Role.textMuted,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Space.md,
    paddingVertical: Space.md,
    borderBottomWidth: 1,
    borderBottomColor: Role.border,
  },
  rowText: {
    flex: 1,
  },
  memoText: {
    fontSize: FontSize.body,
    lineHeight: 21,
    color: Role.text,
  },
  memoTime: {
    marginTop: 2,
    fontSize: FontSize.caption,
    color: Role.textMuted,
  },
}));
