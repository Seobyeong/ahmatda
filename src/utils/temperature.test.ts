import { calcPerceivedTemp, formatPerceivedFormula, formatTemp, getEffectiveDelta, getExposureAdjust } from './temperature';

describe('calcPerceivedTemp', () => {
  it('보정 요인이 없으면 실제 온도를 그대로 반환한다', () => {
    expect(calcPerceivedTemp(20, 50, 2, 0)).toBe(20);
  });

  it('습도 80% 초과면 +2 보정한다', () => {
    expect(calcPerceivedTemp(20, 85, 0, 0)).toBe(22);
  });

  it('습도 70% 초과 80% 이하면 +1 보정한다 (경계값 80도 이 구간에 포함)', () => {
    expect(calcPerceivedTemp(20, 75, 0, 0)).toBe(21);
    expect(calcPerceivedTemp(20, 80, 0, 0)).toBe(21);
  });

  it('습도 30% 미만이면 -1 보정한다 (경계값 30은 보정 없음)', () => {
    expect(calcPerceivedTemp(20, 25, 0, 0)).toBe(19);
    expect(calcPerceivedTemp(20, 30, 0, 0)).toBe(20);
  });

  it('풍속 10 초과면 -4 보정한다', () => {
    expect(calcPerceivedTemp(20, 50, 12, 0)).toBe(16);
  });

  it('풍속 5 초과 10 이하면 -2 보정한다 (경계값 10도 이 구간에 포함)', () => {
    expect(calcPerceivedTemp(20, 50, 7, 0)).toBe(18);
    expect(calcPerceivedTemp(20, 50, 10, 0)).toBe(18);
  });

  it('풍속 3 초과 5 이하면 -1 보정한다', () => {
    expect(calcPerceivedTemp(20, 50, 4, 0)).toBe(19);
    expect(calcPerceivedTemp(20, 50, 5, 0)).toBe(19);
  });

  it('deltaOffset을 그대로 더한다', () => {
    expect(calcPerceivedTemp(20, 50, 2, 3)).toBe(23);
    expect(calcPerceivedTemp(20, 50, 2, -2)).toBe(18);
  });

  it('습도/풍속/deltaOffset 보정을 모두 합산한다', () => {
    // 20 + 2(습도>80) - 4(풍속>10) + 1(deltaOffset) = 19
    expect(calcPerceivedTemp(20, 90, 15, 1)).toBe(19);
  });

  it('최종 결과를 반올림한다', () => {
    expect(calcPerceivedTemp(20.4, 50, 2, 0)).toBe(20);
    expect(calcPerceivedTemp(20.5, 50, 2, 0)).toBe(21);
  });
});

describe('formatTemp', () => {
  it('숫자에 °C 단위를 붙인다', () => {
    expect(formatTemp(20)).toBe('20°C');
    expect(formatTemp(-3)).toBe('-3°C');
  });
});

describe('formatPerceivedFormula', () => {
  it('deltaOffset이 0 이상이면 + 부호를 붙인다', () => {
    expect(formatPerceivedFormula(20, 50, 2, 1, 21)).toBe(
      '20° + f(H:50%, W:2m/s) + Δt(+1°) ≒ 21°C'
    );
    expect(formatPerceivedFormula(20, 50, 2, 0, 20)).toBe(
      '20° + f(H:50%, W:2m/s) + Δt(+0°) ≒ 20°C'
    );
  });

  it('deltaOffset이 음수면 별도 부호 없이 그대로 표시한다', () => {
    expect(formatPerceivedFormula(20, 50, 2, -2, 18)).toBe(
      '20° + f(H:50%, W:2m/s) + Δt(-2°) ≒ 18°C'
    );
  });
});

describe('getEffectiveDelta', () => {
  it('민감도 기준값과 학습값을 합산한다', () => {
    expect(getEffectiveDelta(3, 0)).toBe(0);   // 보통 + 학습 없음
    expect(getEffectiveDelta(1, 0)).toBe(-2);  // 매우 추위 탐
    expect(getEffectiveDelta(5, 0)).toBe(2);   // 매우 더위 탐
  });

  it('학습값이 기준값에 더해진다', () => {
    expect(getEffectiveDelta(3, -3)).toBe(-3);
    expect(getEffectiveDelta(4, -3)).toBe(-2); // 기준 +1, 학습 -3
  });

  // 이 분리의 존재 이유 — 민감도를 다시 골라도 학습값은 보존돼야 한다.
  it('민감도를 바꿔도 학습값이 사라지지 않는다', () => {
    const learned = -3; // 2주간 "추웠음" 누적
    const before = getEffectiveDelta(3, learned);
    const after = getEffectiveDelta(4, learned);
    expect(before).toBe(-3);
    expect(after).toBe(-2);       // 기준값만 +1 움직임
    expect(after - before).toBe(1); // 학습분은 그대로 살아있음
  });
});

describe('getExposureAdjust — 도보·자전거 노출 보정', () => {
  it('도보가 아니면 0', () => {
    expect(getExposureAdjust(5, 'transit')).toBe(0);
    expect(getExposureAdjust(5, 'car')).toBe(0);
    expect(getExposureAdjust(5, null)).toBe(0);
  });

  it('추운 날은 더 춥게, 더운 날은 더 덥게, 쾌적 구간은 그대로', () => {
    expect(getExposureAdjust(17, 'walk')).toBe(-1);
    expect(getExposureAdjust(18, 'walk')).toBe(0);
    expect(getExposureAdjust(26, 'walk')).toBe(0);
    expect(getExposureAdjust(27, 'walk')).toBe(1);
  });
});

describe('formatPerceivedFormula — 노출 보정 표시', () => {
  it('보정이 있을 때만 도보 항을 붙인다', () => {
    expect(formatPerceivedFormula(10, 50, 1, 0, 9, -1)).toBe('10° + f(H:50%, W:1m/s) + Δt(+0°) + 도보(-1°) ≒ 9°C');
    expect(formatPerceivedFormula(10, 50, 1, 0, 10)).toBe('10° + f(H:50%, W:1m/s) + Δt(+0°) ≒ 10°C');
  });
});
