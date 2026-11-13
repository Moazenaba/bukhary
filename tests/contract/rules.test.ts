import fs from 'fs';
import { describe, expect, it } from 'vitest';
import { STAGES_LIST } from '../../src/types';
import { calculateCurrentStage } from '../../src/utils/stageUtils';
import { ceremonyStatusPdfTable } from '../../src/utils/reportExport';

// rules.json holds the rules the web app and the Android app must share (the app's tests read
// the same file from their own copy). If this test fails, a rule changed here only: change it in
// the app too, then update rules.json in both repositories.
const rules = JSON.parse(fs.readFileSync('tests/contract/rules.json', 'utf8'));

describe('shared rules (web side)', () => {
  it('stage order', () => {
    expect(STAGES_LIST.map((s) => s.key)).toEqual(rules.stageOrder);
  });

  it.each(rules.stageStates.map((s: any) => [s.completed.join('+') || 'nothing', s]))('state after %s', (_n, s: any) => {
    const stages = Object.fromEntries(rules.stageOrder.map((k: string) => [k, { completed: s.completed.includes(k) }]));
    expect(calculateCurrentStage(stages as any)).toMatchObject({ key: s.key, label: s.label });
  });

  it('«لم يتم الحفل» / «تم الحفل» report columns', () => {
    expect(ceremonyStatusPdfTable([], [], 'not_held').table.columns).toEqual(rules.ceremonyStatusColumns.not_held);
    expect(ceremonyStatusPdfTable([], [], 'held').table.columns).toEqual(rules.ceremonyStatusColumns.held);
  });
});
