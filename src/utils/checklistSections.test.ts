import { splitChecklist } from './checklistSections';
import type { ChecklistItem } from '../types';

const item = (id: string, tier: 0 | 1 | 2 | 3, checked = false, essential = false) =>
  ({ id, label: id, tier, checked, essential, icon: 'check-circle' }) as unknown as ChecklistItem;

describe('splitChecklist', () => {
  it('챙긴 것은 맨 아래로 모으고, 안 챙긴 것은 분류별로 꼭 챙김을 위로', () => {
    const { sections, packed } = splitChecklist([
      item('우산', 1, true), item('지갑', 3), item('열쇠', 3, false, true), item('명함', 2, true),
    ], new Set());
    expect(sections.map((s) => [s.tier, s.items.map((i) => i.id)])).toEqual([[3, ['열쇠', '지갑']]]);
    expect(packed.map((i) => i.id)).toEqual(['우산', '명함']);
  });

  it('방금 챙긴 것은 잠깐 제자리에 남는다', () => {
    const { sections, packed } = splitChecklist([item('우산', 1, true), item('지갑', 3)], new Set(['우산']));
    expect(sections.map((s) => s.tier)).toEqual([1, 3]);
    // 분류 안에서도 자리를 지킨다 (아래로 튀지 않음)
    const same = splitChecklist([item('지갑', 3, true), item('열쇠', 3), item('우산', 3)], new Set(['지갑']));
    expect(same.sections[0].items.map((i) => i.id)).toEqual(['지갑', '열쇠', '우산']);
    expect(packed).toEqual([]);
  });
});
