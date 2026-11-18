import { VOICES, renderAlert, type AlertVars } from './alertVoices';

const vars: AlertVars = { items: ['우산', '노트북', '충전기'], count: 3, departureTime: '08:30' };
const none: AlertVars = { items: [], count: 0, departureTime: '08:30' };

describe('renderAlert — 캐릭터 말투', () => {
  it('기본 말투는 지금까지의 문구와 같다', () => {
    expect(renderAlert('urgent', 'basic', '', vars)).toEqual({ title: '아 맞다! 🚨', lead: '아직 안 챙긴 것이 있어요:' });
    expect(renderAlert('lastCheck', 'basic', '', vars).title).toBe('나가기 전에 3개 남았어요');
    expect(renderAlert('departure', 'basic', '', none).title).toBe('아맞다 🎒');
  });

  it('캐릭터마다 다르게, 물건은 두 개까지', () => {
    expect(renderAlert('urgent', 'friend', '', vars).title).toBe('야야 우산, 노트북 놓고 갔다!! 🚨');
    expect(renderAlert('urgent', 'mom', '', vars).title).toBe('또 우산, 노트북 두고 갔지! 🚨');
    expect(renderAlert('lastCheck', 'secretary', '', vars).title).toBe('나가시기 전에 3건 확인 부탁드립니다');
  });

  it('{물건} 문장인데 물건 이름을 모르면 기본 문장으로', () => {
    expect(renderAlert('urgent', 'friend', '', { ...vars, items: [] }).title).toBe('아 맞다! 🚨');
  });

  it('모든 캐릭터가 모든 알림 문구를 갖고, 빈칸이 남지 않는다', () => {
    const kinds = ['departure', 'lastCheck', 'urgent', 'placeLeave', 'nightly', 'nightlyPreview'] as const;
    VOICES.forEach((v) => kinds.forEach((k) => {
      const { title } = renderAlert(k, v.id, '', vars);
      expect(title.length).toBeGreaterThan(0);
      expect(title).not.toMatch(/\{.+?\}/);
    }));
  });
});

describe('renderAlert — 직접 쓰기', () => {
  const custom = '{물건} 챙겼어? {개수}개 남았다, {출발} 출발!';
  it('빈칸을 채워 제목으로, 본문 첫 줄은 없다', () => {
    expect(renderAlert('urgent', 'custom', custom, vars)).toEqual({ title: '우산, 노트북 챙겼어? 3개 남았다, 08:30 출발!', lead: null });
    expect(renderAlert('placeLeave', 'custom', custom, vars).lead).toBeNull();
  });
  it('물건이 없거나 자기 전 정리거나 문장이 비면 기본 말투', () => {
    expect(renderAlert('departure', 'custom', custom, none).title).toBe('아맞다 🎒');
    expect(renderAlert('nightly', 'custom', custom, vars).title).toBe('아맞다 — 오늘 하루 어땠나요?');
    expect(renderAlert('urgent', 'custom', '  ', vars).title).toBe('아 맞다! 🚨');
  });
});

describe('renderAlert — 특수 문자', () => {
  it('물건 이름의 $ 기호를 그대로 둔다', () => {
    const v = { items: ['$$ 현금', "a$&b"], count: 2, departureTime: '08:30' };
    expect(renderAlert('urgent', 'custom', '{물건} 챙겼어?', v).title).toBe("$$ 현금, a$&b 챙겼어?");
  });
});
