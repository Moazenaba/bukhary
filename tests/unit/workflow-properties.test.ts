import { describe, expect, it } from 'vitest';
import { STAGE_KEYS, type StageKey } from '../../server/schemas.ts';
import { type CommitteeState, applyCommitteeAction, localDate, normalizeStageOrder } from '../../server/workflow.ts';

// Property-based: thousands of random sequences of stage changes (seeded, so a failure repeats).
// Whatever people click, in whatever order, the stored stages must always make sense.

function rng(seed: number) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32);
}
const actor = { id: 'u', name: 'أحمد' };
const NOW = '2026-06-15T10:00:00.000Z';
const empty = (): CommitteeState => ({ stages: {}, receivedByAssistant: null, examApprovedBy: null, scoringDetails: {}, aggregationDetails: {}, ceremonyDetails: {} });
const done = (s: CommitteeState['stages']) => STAGE_KEYS.map((k) => Boolean(s?.[k]?.completed));
/** The completed stages are always 0..n-1: no stage done after one that is not. */
const isPrefix = (flags: boolean[]) => flags.every((f, i) => !f || flags.slice(0, i).every(Boolean));

describe('stage actions keep the order, for any sequence of clicks', () => {
  it('5000 random sequences never leave a gap', () => {
    const r = rng(42);
    for (let run = 0; run < 5000; run++) {
      let state = empty();
      for (let step = 0; step < 25; step++) {
        const stage = STAGE_KEYS[Math.floor(r() * STAGE_KEYS.length)] as StageKey;
        const type = r() < 0.65 ? 'completeStage' : 'reopenStage';
        try {
          state = applyCommitteeAction(state, { type, stage } as any, actor, NOW);
        } catch {
          // Refused: the state must not change, which the next assertion also covers.
        }
        expect(isPrefix(done(state.stages)), `run ${run} step ${step}`).toBe(true);
      }
    }
  });

  it('a refused action never changes anything', () => {
    const s = applyCommitteeAction(empty(), { type: 'completeStage', stage: 'registration' }, actor, NOW);
    const before = JSON.stringify(s);
    expect(() => applyCommitteeAction(s, { type: 'completeStage', stage: 'review' }, actor, NOW)).toThrow();
    expect(JSON.stringify(s)).toBe(before);
  });

  it('completing is idempotent: the first time and who did it are kept', () => {
    let s = applyCommitteeAction(empty(), { type: 'completeStage', stage: 'registration' }, actor, NOW);
    s = applyCommitteeAction(s, { type: 'completeStage', stage: 'registration' }, { id: 'x', name: 'غيره' }, '2030-01-01T00:00:00Z');
    expect(s.stages.registration).toMatchObject({ completedAt: NOW, completedBy: 'أحمد' });
  });
});

describe('whole saves are normalised the same way', () => {
  it('any set of ticked stages becomes a gap-free prefix (512 combinations)', () => {
    for (let mask = 0; mask < 1 << STAGE_KEYS.length; mask++) {
      const stages: Record<string, any> = {};
      STAGE_KEYS.forEach((k, i) => (stages[k] = { completed: Boolean(mask & (1 << i)) }));
      normalizeStageOrder({}, stages, actor, NOW, { ceremonyDate: '2026-01-01' });
      const flags = done(stages);
      expect(isPrefix(flags)).toBe(true);
      // Nothing that was ticked is ever unticked.
      STAGE_KEYS.forEach((_, i) => { if (mask & (1 << i)) expect(flags[i]).toBe(true); });
    }
  });

  it('reopening an earlier stage while a later stays done is refused', () => {
    const before = { registration: { completed: true }, exam: { completed: true }, scoring: { completed: true } };
    const after = { registration: { completed: true }, exam: { completed: false }, scoring: { completed: true } };
    expect(() => normalizeStageOrder(before, after, actor, NOW)).toThrow(/تليها/);
  });
});

describe('the ceremony is never «held» before its day', () => {
  const ready = () => {
    let s = empty();
    for (const k of STAGE_KEYS.slice(0, -1)) s = applyCommitteeAction(s, { type: 'completeStage', stage: k } as any, actor, NOW);
    return s;
  };
  it.each([
    ['tomorrow', '2026-06-16', false],
    ['today', '2026-06-15', true],
    ['yesterday', '2026-06-14', true],
    ['no date', undefined, true],
  ])('%s', (_label, date, ok) => {
    const s = ready();
    s.ceremonyDetails = date ? { ceremonyDate: date } : {};
    const run = () => applyCommitteeAction(s, { type: 'completeStage', stage: 'ceremony' }, actor, NOW);
    if (ok) expect(run().stages.ceremony.completed).toBe(true);
    else expect(run).toThrow(/لم يأتِ بعد/);
  });

  it('«today» is Cairo\'s date, not the server\'s UTC date', () => {
    // 23:30 UTC on the 14th is already the 15th in Cairo (UTC+2 or +3).
    expect(localDate('2026-06-14T23:30:00Z')).toBe('2026-06-15');
    expect(localDate('not a date')).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
