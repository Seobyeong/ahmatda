import { calcPerceivedTemp, formatPerceivedFormula, formatTemp } from './temperature';

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
