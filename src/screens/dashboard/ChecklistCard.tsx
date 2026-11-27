import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, Text, TextInput, View, type LayoutChangeEvent } from 'react-native';
import { ChevronDown, ChevronUp, Mic, Pin, Plus } from 'lucide-react-native';
import { ExpoSpeechRecognitionModule, useSpeechRecognitionEvent } from 'expo-speech-recognition';
import { PURPOSES } from '../../constants/purposes';
import { FontSize, Radius, Space, makeStyles, useTheme } from '../../constants/theme';
import { useAppStore } from '../../store';
import { ChecklistItem } from '../../components/ChecklistItem';
import { Mascot } from '../../components/Mascot';
import { ProgressBar } from '../../components/ProgressBar';
import { PurposeIcon } from '../../components/PurposeIcon';
import { Button, Card } from '../../components/ui';
import { ItemOptionsSheet } from '../../components/ItemOptionsSheet';
import { SETTLE_MS, splitChecklist } from '../../utils/checklistSections';

const TIER_LABELS: Record<0 | 1 | 2 | 3, string> = {
  0: '오늘만',
  1: '날씨 알림',
  2: '목적 준비물',
  3: '일상 루틴',
};

// 이 화면의 주인공 — 흰 면과 그림자는 여기에만 쓴다.
export function ChecklistCard({ onLayout }: { onLayout: (event: LayoutChangeEvent) => void }) {
  const { Role, PurposeColors } = useTheme();
  const styles = useStyles();
  const [quickAddText, setQuickAddText] = useState('');
  const [optionsLabel, setOptionsLabel] = useState<string | null>(null);
  // 시트는 항목 이름으로 연다 — 다시 조립되면 id가 바뀐다 (ItemOptionsSheet 참고)
  const openOptions = useCallback((id: string) => {
    const item = useAppStore.getState().checklist.find((i) => i.id === id);
    if (item) setOptionsLabel(item.label);
  }, []);

  const checklist = useAppStore((s) => s.checklist);
  const purposeId = useAppStore((s) => s.purposeId);
  const buildChecklist = useAppStore((s) => s.buildChecklist);
  const toggleCheck = useAppStore((s) => s.toggleCheck);
  const checkAll = useAppStore((s) => s.checkAll);
  const uncheckAll = useAppStore((s) => s.uncheckAll);
  const deleteItem = useAppStore((s) => s.deleteItem);
  const addTempItem = useAppStore((s) => s.addTempItem);
  const addPermanentRoutine = useAppStore((s) => s.addPermanentRoutine);
  const showToast = useAppStore((s) => s.showToast);

  // 실사용 빈도상 "오늘만 추가"가 압도적으로 많을 거라 보고, 매번 "오늘만/매일 루틴"을
  // 고르는 모달 없이 Enter 한 번으로 바로 오늘만 추가되게 한다. 매일 루틴으로 남기고
  // 싶을 때만 입력 중에 나타나는 별도 링크를 쓴다.
  const addToday = (label: string) => {
    if (!addTempItem(label)) showToast(`'${label}'은(는) 이미 목록에 있어요.`, null, 'info');
  };

  const handleQuickAddToday = () => {
    const trimmed = quickAddText.trim();
    if (!trimmed) return;
    addToday(trimmed);
    setQuickAddText('');
  };

  const handleQuickAddPermanent = () => {
    const trimmed = quickAddText.trim();
    if (!trimmed) return;
    if (addPermanentRoutine(trimmed)) {
      buildChecklist();
      showToast(`'${trimmed}'을(를) 매일 루틴에 넣었어요.`);
    } else {
      showToast(`'${trimmed}'은(는) 이미 루틴에 있어요.`, null, 'info');
    }
    setQuickAddText('');
  };

  // 루틴은 한 번에 영구 삭제된다(날씨·목적 항목은 영구 꺼짐). 잘못 눌러도 돌이킬 수 있게 되돌리기를 붙인다.
  const handleDeleteItem = useCallback(
    (id: string) => {
      const item = useAppStore.getState().checklist.find((i) => i.id === id);
      const undo = deleteItem(id);
      if (!item || !undo) return;
      const message = item.temp
        ? `'${item.label}'을(를) 지웠어요.`
        : item.permanent
          ? `'${item.label}'을(를) 루틴에서 지웠어요.`
          : `'${item.label}'은(는) 이제 추천하지 않아요.`;
      showToast(message, { label: '되돌리기', onPress: undo });
    },
    [deleteItem, showToast]
  );

  // 음성 인식 결과를 입력창에 실시간 반영하고, 최종 인식 결과가 나오면 바로
  // "오늘만" 추가까지 마친다 — 마이크 버튼 한 번 + 말하기로 손 안 대고 추가 가능.
  const [isListening, setIsListening] = useState(false);

  useSpeechRecognitionEvent('start', () => setIsListening(true));
  useSpeechRecognitionEvent('end', () => setIsListening(false));
  useSpeechRecognitionEvent('result', (event) => {
    const transcript = event.results[0]?.transcript ?? '';
    setQuickAddText(transcript);
    if (event.isFinal) {
      const trimmed = transcript.trim();
      if (trimmed) {
        addToday(trimmed);
        setQuickAddText('');
      }
    }
  });
  useSpeechRecognitionEvent('error', (event) => {
    // 'end' 이벤트가 안 오는 플랫폼 케이스에 대비해 여기서도 안전하게 내린다.
    setIsListening(false);
    // 침묵(no-speech/speech-timeout)이나 사용자가 직접 중지(aborted)한 경우는
    // 실패가 아니라 정상 시나리오라 굳이 에러 토스트를 띄우지 않는다.
    if (event.error === 'no-speech' || event.error === 'speech-timeout' || event.error === 'aborted') {
      return;
    }
    showToast('음성 인식에 실패했어요. 다시 시도해주세요.', null, 'error');
  });

  const handleVoiceAdd = async () => {
    if (isListening) {
      // 듣는 중에 마이크를 다시 누르는 건 "그만두겠다"는 뜻이다.
      // stop()은 최종 결과를 확정해서 돌려주는 API라 result 핸들러가 isFinal로
      // 항목을 추가해버린다 — 사용자가 방금 취소한 항목이 목록에 생긴다.
      // 취소에는 결과를 버리는 abort()를 쓴다.
      ExpoSpeechRecognitionModule.abort();
      return;
    }
    const permission = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
    if (!permission.granted) {
      showToast('마이크/음성 인식 권한이 필요해요.', null, 'warning');
      return;
    }
    ExpoSpeechRecognitionModule.start({
      lang: 'ko-KR',
      interimResults: true,
      continuous: false,
    });
  };

  // 꼭 챙김을 한 번도 안 써 봤으면 길게 누르기를 알려 준다 — 쓰기 시작하면 사라진다.
  const showEssentialHint = useAppStore(
    (s) => s.userSettings.essentialLabels.length === 0 && !s.checklist.some((i) => i.essential)
  );

  const total = checklist.length;
  const checkedCount = checklist.filter((i) => i.checked).length;
  const allChecked = total > 0 && checkedCount === total;

  const handleToggleAll = () => {
    if (allChecked) {
      uncheckAll();
    } else {
      checkAll();
    }
  };

  // 입력창에 글자를 칠 때마다(quickAddText) 다시 그려지는데, 그때마다 목록을
  // 다시 나누고 정렬할 필요는 없다.
  const [settling, setSettling] = useState<ReadonlySet<string>>(() => new Set());
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  useEffect(() => () => { timers.current.forEach(clearTimeout); }, []);
  const handleToggle = useCallback((id: string) => {
    const wasChecked = useAppStore.getState().checklist.find((i) => i.id === id)?.checked;
    toggleCheck(id);
    const old = timers.current.get(id);
    if (old) clearTimeout(old);
    timers.current.delete(id);
    if (wasChecked !== false) {
      // 챙김을 풀었으면 머물 이유가 없다
      setSettling((prev) => {
        if (!prev.has(id)) return prev;
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
      return;
    }
    setSettling((prev) => new Set(prev).add(id));
    timers.current.set(id, setTimeout(() => {
      timers.current.delete(id);
      setSettling((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }, SETTLE_MS));
  }, [toggleCheck]);
  const [packedOpen, setPackedOpen] = useState(false);
  const { sections: tierSections, packed } = useMemo(() => splitChecklist(checklist, settling), [checklist, settling]);
  // 챙긴 것이 없어지면 접힌 상태로 돌아간다 — 다음에 다시 생길 때 펼쳐진 채 나오지 않게
  useEffect(() => {
    if (packed.length === 0) setPackedOpen(false);
  }, [packed.length]);

  const activePurposeColor = purposeId ? PurposeColors[PURPOSES[purposeId].color].chip : undefined;
  // 목적 색은 체크리스트 머리와 진행 막대에 쓴다 — 목적을 바꾸면 주인공 카드의 색이 따라 바뀐다.
  const purposeAccent = activePurposeColor ?? Role.textMuted;
  const draft = quickAddText.trim();

  return (
    <Card variant="hero" style={styles.card} onLayout={onLayout}>
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          {purposeId ? (
            <View style={[styles.purposeBadge, { backgroundColor: PurposeColors[PURPOSES[purposeId].color].badge }]}>
              <PurposeIcon id={purposeId} size={18} color={purposeAccent} />
            </View>
          ) : null}
          <View>
            <Text style={styles.title} accessibilityRole="header">오늘의 체크리스트</Text>
            <Text
              style={[styles.meta, allChecked && styles.metaDone]}
              accessibilityLabel={`${purposeId ? `${PURPOSES[purposeId].shortLabel}, ` : ''}${total}개 중 ${checkedCount}개 챙김`}
            >
              {purposeId ? `${PURPOSES[purposeId].shortLabel} · ` : ''}
              {total}개 중 {checkedCount}개 챙김
            </Text>
          </View>
        </View>
        {total > 0 ? (
          <Button
            label={allChecked ? '전체 해제' : '모두 챙김'}
            variant="text"
            size="sm"
            onPress={handleToggleAll}
          />
        ) : null}
      </View>

      <ProgressBar checked={checkedCount} total={total} color={purposeAccent} />

      {allChecked ? (
        <View style={styles.doneBanner}>
          <Mascot mood="happy" size={52} />
          <View style={styles.stateTextArea}>
            <Text style={styles.doneTitle}>다 챙겼어요</Text>
            <Text style={styles.doneSub}>이대로 나가면 돼요.</Text>
          </View>
        </View>
      ) : null}

      {total === 0 ? (
        <View style={styles.emptyState}>
          <Mascot mood="idle" size={52} />
          <Text style={[styles.stateText, styles.stateTextArea]}>
            오늘 챙길 것이 아직 없어요. 위에서 목적을 고르거나 아래에 직접 추가해 보세요.
          </Text>
        </View>
      ) : null}

      {tierSections.map(({ tier, items }) => (
        <View key={tier} style={styles.tierSection}>
          <Text style={styles.tierLabel}>{TIER_LABELS[tier]}</Text>
          {items.map((item) => (
            <ChecklistItem
              key={item.id}
              item={item}
              onToggle={handleToggle}
              onDelete={handleDeleteItem}
              onOpenOptions={openOptions}
              purposeColor={activePurposeColor}
            />
          ))}
        </View>
      ))}

      {packed.length > 0 ? (
        <View style={styles.tierSection}>
          <Pressable
            style={styles.packedToggle}
            onPress={() => setPackedOpen((v) => !v)}
            accessibilityRole="button"
            accessibilityState={{ expanded: packedOpen }}
            accessibilityLabel={`챙긴 것 ${packed.length}개 ${packedOpen ? '접기' : '펼치기'}`}
          >
            <Text style={styles.packedLabel}>챙긴 것 {packed.length}개</Text>
            {packedOpen
              ? <ChevronUp size={16} color={Role.textMuted} />
              : <ChevronDown size={16} color={Role.textMuted} />}
          </Pressable>
          {packedOpen ? packed.map((item) => (
            <ChecklistItem
              key={item.id}
              item={item}
              onToggle={handleToggle}
              onDelete={handleDeleteItem}
              onOpenOptions={openOptions}
              purposeColor={activePurposeColor}
            />
          )) : null}
        </View>
      ) : null}

      {total > 0 && showEssentialHint ? (
        <Text style={styles.hint}>항목을 길게 누르면 '꼭 챙김'으로 정하거나 지울 수 있어요.</Text>
      ) : null}

      <ItemOptionsSheet label={optionsLabel} onClose={() => setOptionsLabel(null)} onDelete={handleDeleteItem} />

      <View style={styles.quickAddRow}>
        <TextInput
          style={styles.quickAddInput}
          value={quickAddText}
          onChangeText={setQuickAddText}
          placeholder={isListening ? '듣고 있어요…' : '오늘만 챙길 것 추가'}
          placeholderTextColor={Role.placeholder}
          onSubmitEditing={handleQuickAddToday}
          returnKeyType="done"
          submitBehavior="submit"
          maxLength={40}
          accessibilityLabel="오늘만 챙길 것 추가"
        />
        {/* 글자를 치면 마이크 자리가 추가 버튼이 된다. 예전엔 키보드의 완료 키로만 넣을 수 있어서
            넣는 방법이 화면에 보이지 않았다. */}
        {draft && !isListening ? (
          <Pressable
            style={[styles.micButton, styles.micButtonActive]}
            onPress={handleQuickAddToday}
            accessibilityRole="button"
            accessibilityLabel={`${draft} 오늘만 추가`}
          >
            <Plus size={20} color={Role.onAction} />
          </Pressable>
        ) : (
          <Pressable
            style={[styles.micButton, isListening && styles.micButtonActive]}
            onPress={handleVoiceAdd}
            accessibilityRole="button"
            accessibilityLabel={isListening ? '음성 입력 취소' : '음성으로 추가'}
          >
            <Mic size={20} color={isListening ? Role.onAction : Role.actionText} />
          </Pressable>
        )}
      </View>

      {draft && !isListening ? (
        <Button
          label="오늘만이 아니라 매일 루틴으로 추가"
          variant="text"
          size="sm"
          icon={<Pin size={14} color={Role.actionText} />}
          onPress={handleQuickAddPermanent}
          style={styles.quickAddPermanentButton}
          accessibilityLabel={`${draft} 매일 루틴으로 추가`}
        />
      ) : null}
    </Card>
  );
}

const useStyles = makeStyles(({ Role }) => ({
  card: {
    marginTop: Space.lg,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Space.md,
  },
  headerLeft: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.md,
  },
  purposeBadge: {
    width: 40,
    height: 40,
    borderRadius: Radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: FontSize.heading,
    fontWeight: '700',
    color: Role.text,
  },
  meta: {
    marginTop: 2,
    fontSize: FontSize.label,
    color: Role.textMuted,
  },
  metaDone: {
    color: Role.doneText,
    fontWeight: '700',
  },
  doneBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.md,
    marginTop: Space.lg,
    padding: Space.md,
    borderRadius: Radius.md,
    backgroundColor: Role.doneSoft,
  },
  doneTitle: {
    fontSize: FontSize.heading,
    fontWeight: '700',
    color: Role.doneText,
  },
  doneSub: {
    marginTop: 2,
    fontSize: FontSize.label,
    color: Role.textSub,
  },
  emptyState: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.md,
    marginTop: Space.lg,
  },
  stateTextArea: {
    flex: 1,
  },
  stateText: {
    fontSize: FontSize.body,
    lineHeight: 21,
    color: Role.textSub,
  },
  tierSection: {
    marginTop: 14,
  },
  tierLabel: {
    fontSize: FontSize.caption,
    fontWeight: '700',
    color: Role.textMuted,
    marginBottom: 2,
  },
  packedToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs,
    minHeight: 44,
    alignSelf: 'flex-start',
    paddingRight: Space.md,
  },
  packedLabel: {
    fontSize: FontSize.label,
    fontWeight: '700',
    color: Role.textMuted,
  },
  hint: {
    marginTop: Space.sm,
    fontSize: FontSize.caption,
    color: Role.textMuted,
  },
  quickAddRow: {
    marginTop: Space.lg,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
  },
  quickAddInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: Role.border,
    borderRadius: Radius.md,
    minHeight: 46,
    paddingVertical: 10,
    paddingHorizontal: 14,
    fontSize: FontSize.body,
    color: Role.text,
  },
  micButton: {
    width: 46,
    height: 46,
    borderRadius: Radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Role.actionSoft,
  },
  micButtonActive: {
    backgroundColor: Role.action,
  },
  quickAddPermanentButton: {
    alignSelf: 'flex-start',
    marginTop: Space.xs,
  },
}));
