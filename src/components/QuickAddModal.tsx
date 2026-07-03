import React from 'react';
import { Modal, Pressable, StyleSheet, Text } from 'react-native';
import { Colors } from '../constants/colors';

interface QuickAddModalProps {
  label: string;
  onTodayOnly: () => void;
  onPermanent: () => void;
  onCancel: () => void;
}

export function QuickAddModal({ label, onTodayOnly, onPermanent, onCancel }: QuickAddModalProps) {
  return (
    <Modal transparent animationType="slide" visible onRequestClose={onCancel}>
      <Pressable style={styles.overlay} onPress={onCancel}>
        <Pressable style={styles.panel} onPress={() => {}}>
          <Text style={styles.header}>
            추가할 항목 <Text style={styles.headerLabel}>{label}</Text>
          </Text>

          <Pressable style={[styles.optionButton, styles.todayOption]} onPress={onTodayOnly}>
            <Text style={[styles.optionTitle, styles.todayText]}>⏱ 오늘만 추가</Text>
            <Text style={styles.optionDescription}>오늘 체크리스트에만 임시로 추가돼요.</Text>
          </Pressable>

          <Pressable style={[styles.optionButton, styles.permanentOption]} onPress={onPermanent}>
            <Text style={[styles.optionTitle, styles.permanentText]}>📌 매일 루틴에 추가</Text>
            <Text style={styles.optionDescription}>
              날씨·목적 관계없이 항상 체크리스트에 나타나요.
            </Text>
          </Pressable>

          <Pressable style={styles.cancelButton} onPress={onCancel}>
            <Text style={styles.cancelText}>취소</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.5)',
    justifyContent: 'flex-end',
  },
  panel: {
    backgroundColor: Colors.white,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    paddingBottom: 32,
  },
  header: {
    fontSize: 14,
    color: Colors.slate500,
    marginBottom: 16,
  },
  headerLabel: {
    fontWeight: '700',
    color: Colors.slate800,
  },
  optionButton: {
    borderRadius: 14,
    padding: 16,
    marginBottom: 12,
  },
  todayOption: {
    backgroundColor: Colors.sky50,
  },
  permanentOption: {
    backgroundColor: Colors.emerald50,
  },
  optionTitle: {
    fontSize: 15,
    fontWeight: '700',
  },
  todayText: {
    color: Colors.sky600,
  },
  permanentText: {
    color: Colors.emerald600,
  },
  optionDescription: {
    marginTop: 4,
    fontSize: 12,
    color: Colors.slate600,
  },
  cancelButton: {
    marginTop: 4,
    alignItems: 'center',
    paddingVertical: 10,
  },
  cancelText: {
    fontSize: 14,
    color: Colors.slate400,
    fontWeight: '500',
  },
});
