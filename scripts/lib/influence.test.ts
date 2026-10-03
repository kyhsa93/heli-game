import { describe, expect, it } from 'vitest';
import { diffInterval, roleVerdict, spreadVerdict, wilson } from './influence';

describe('P0 influence verdicts (#193)', () => {
  it('gives the Wilson interval for a win rate', () => {
    const [lo, hi] = wilson({ wins: 30, n: 100 });
    expect(lo).toBeCloseTo(0.219, 2);
    expect(hi).toBeCloseTo(0.396, 2);
  });

  it('cannot judge a 20pp gap from twenty seeds a side, and can from a hundred', () => {
    expect(roleVerdict({ wins: 10, n: 20 }, { wins: 6, n: 20 }).verdict).toBe('undecided');
    expect(roleVerdict({ wins: 65, n: 100 }, { wins: 30, n: 100 }).verdict).toBe('pass');
  });

  it('fails a role that plainly does not beat idle, and one that wins every time', () => {
    expect(roleVerdict({ wins: 30, n: 100 }, { wins: 30, n: 100 }).verdict).toBe('fail');
    expect(roleVerdict({ wins: 100, n: 100 }, { wins: 30, n: 100 }).verdict).toBe('fail');
  });

  it('fails roles that are far apart and passes roles that are close', () => {
    expect(spreadVerdict([{ wins: 90, n: 100 }, { wins: 50, n: 100 }]).verdict).toBe('fail');
    expect(spreadVerdict([{ wins: 60, n: 200 }, { wins: 62, n: 200 }]).verdict).toBe('pass');
  });

  it('gives a difference interval that contains the observed difference', () => {
    const [lo, hi] = diffInterval({ wins: 60, n: 100 }, { wins: 30, n: 100 });
    expect(lo).toBeLessThan(0.3);
    expect(hi).toBeGreaterThan(0.3);
  });
});
