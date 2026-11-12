// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AddCommitteeModal } from '../../src/components/AddCommitteeModal';
import { STAGES_LIST } from '../../src/types';
import type { Course } from '../../src/types';
import { calculateCurrentStage } from '../../src/utils/stageUtils';
import { grant } from './setup';

const course: Course = { id: 'crs', name: 'sheetta', year: '', startDate: '', endDate: '', status: 'active', isDefault: true, createdAt: '' };
const KEYS = STAGES_LIST.map((s) => s.key);

beforeEach(() => grant(['committees.create', 'courses.write', 'books.write']));
afterEach(cleanup);

function submitWith(stage: string) {
  const onAdd = vi.fn();
  const { container } = render(
    <AddCommitteeModal isOpen onClose={() => {}} onAddCommittee={onAdd} nextCommitteeNumber={7} savedBooks={['كتاب']} courses={[course]} defaultCourseId="crs" />
  );
  fireEvent.change(screen.getByRole('textbox', { name: 'اسم اللجنة' }), { target: { value: 'لجنة تجربة' } });
  const select = Array.from(container.querySelectorAll('select')).find((s) => s.querySelector('option[value="exam"]'))!;
  fireEvent.change(select, { target: { value: stage } });
  fireEvent.submit(container.querySelector('form')!);
  return onAdd;
}

describe('add committee form', () => {
  const options = ['exam', 'scoring', 'aggregation', 'review', 'sheet', 'announcement', 'ceremony'];

  it.each(options)('start stage «%s» produces stages without gaps, and that stage is not yet done', (stage) => {
    const onAdd = submitWith(stage);
    expect(onAdd).toHaveBeenCalledTimes(1);
    const c = onAdd.mock.calls[0][0];
    const flags = KEYS.map((k) => Boolean(c.stages[k]?.completed));
    flags.forEach((f, i) => { if (f) expect(flags.slice(0, i).every(Boolean)).toBe(true); });
    expect(c.stages[stage].completed).toBe(false);
    expect(c.stages[KEYS[KEYS.indexOf(stage as any) - 1]].completed).toBe(true);
  });

  it('the «waiting for the ceremony» start does not claim the ceremony was held', () => {
    const c = submitWith('ceremony').mock.calls[0][0];
    expect(calculateCurrentStage(c.stages).label).not.toBe('تم الحفل');
  });

  it('options are listed in the real stage order', () => {
    const { container } = render(
      <AddCommitteeModal isOpen onClose={() => {}} onAddCommittee={vi.fn()} nextCommitteeNumber={1} savedBooks={[]} courses={[course]} defaultCourseId="crs" />
    );
    const select = Array.from(container.querySelectorAll('select')).find((s) => s.querySelector('option[value="exam"]'))!;
    const order = Array.from(select.querySelectorAll('option')).map((o) => KEYS.indexOf(o.value as any));
    expect([...order].sort((a, b) => a - b)).toEqual(order);
  });
});
