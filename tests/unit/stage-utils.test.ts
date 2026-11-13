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
    [0, 'registration', 'في انتظار الامتحان'],
    [prefix(1), 'registration', 'في انتظار الامتحان'],
    [prefix(2), 'exam', 'تم الامتحان'],
    [prefix(3), 'scoring', 'تم التصحيح'],
    [prefix(4), 'aggregation', 'تم التجميع'],
    [prefix(5), 'review', 'تمت المراجعة'],
    [prefix(6), 'sheet', 'تمت كتابة الكشف'],
    [prefix(7), 'accreditation', 'تم الاعتماد'],
    [prefix(8), 'announcement', 'تم إعلان النتيجة'],
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

describe('every state tells the truth', () => {
  it('each state has its own key and label (no two states share a filter)', () => {
    const seen = new Map<string, string>();
    for (let n = 1; n <= KEYS.length; n++) {
      const s = calculateCurrentStage(stagesFrom(prefix(n)));
      if (seen.has(s.key)) expect(seen.get(s.key)).toBe(s.label);
      seen.set(s.key, s.label);
    }
    expect(new Set(seen.values()).size).toBe(seen.size);
    expect(seen.size).toBe(KEYS.length); // one state per stage (nothing done = «في انتظار الامتحان», like registered only)
  });

  it('a label says «تم X» only when X is really completed', () => {
    for (let n = 2; n <= KEYS.length; n++) {
      const stages = stagesFrom(prefix(n));
      const s = calculateCurrentStage(stages);
      expect(s.label.startsWith('تم')).toBe(true);
      expect(stages[s.key].completed).toBe(true);
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
