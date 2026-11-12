import { describe, expect, it } from 'vitest';
import { STAGES_LIST, type Committee, type StageKey } from '../../src/types';
import { calculateCurrentStage } from '../../src/utils/stageUtils';
import { committeeFlags } from '../../src/utils/committeeSync';

// The «current state» of a committee drives the filters, counts and badges of every screen.
const KEYS = STAGES_LIST.map((s) => s.key) as StageKey[];
const stagesFrom = (mask: number) =>
  Object.fromEntries(KEYS.map((k, i) => [k, { completed: Boolean(mask & (1 << i)) }])) as Committee['stages'];
const prefix = (n: number) => (1 << n) - 1;

describe('current stage of a committee', () => {
  it('every possible combination (512) gives a known stage with a label', () => {
    for (let mask = 0; mask < 1 << KEYS.length; mask++) {
      const s = calculateCurrentStage(stagesFrom(mask));
      expect(KEYS).toContain(s.key);
      expect(s.label.trim().length).toBeGreaterThan(0);
    }
  });

  it.each([
    [prefix(1), 'exam', 'في انتظار الامتحان'],
    [prefix(2), 'scoring', 'تم الامتحان'],
    [prefix(9), 'ceremony', 'تم الحفل'],
  ])('mask %i → %s «%s»', (mask, key, label) => {
    const s = calculateCurrentStage(stagesFrom(mask));
    expect(s.key).toBe(key);
    expect(s.label).toBe(label);
  });

  it('as stages are completed in order, the current stage never moves backwards', () => {
    let last = -1;
    for (let n = 1; n <= KEYS.length; n++) {
      const idx = KEYS.indexOf(calculateCurrentStage(stagesFrom(prefix(n))).key);
      expect(idx).toBeGreaterThanOrEqual(last);
      last = idx;
    }
  });

  it('«تم الحفل» is shown only when the ceremony stage is really completed', () => {
    for (let mask = 0; mask < 1 << KEYS.length; mask++) {
      const isCeremony = calculateCurrentStage(stagesFrom(mask)).label === 'تم الحفل';
      expect(isCeremony).toBe(Boolean(mask & (1 << KEYS.indexOf('ceremony'))));
    }
  });
});

describe('sheet flags follow the stages (a later stage implies the earlier ones)', () => {
  it('for every combination, flags are monotonic: ceremony ⇒ announced ⇒ reviewed ⇒ corrected ⇒ delivered', () => {
    for (let mask = 0; mask < 1 << KEYS.length; mask++) {
      const f = committeeFlags({ stages: stagesFrom(mask) } as Committee);
      const chain = [f.delivered, f.corrected, f.reviewed, f.announced, f.ceremony];
      chain.forEach((v, i) => { if (v) expect(chain.slice(0, i).every(Boolean), `mask ${mask}`).toBe(true); });
    }
  });
});
