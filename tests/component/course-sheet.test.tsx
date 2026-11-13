// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SummerCourseTrackerView } from '../../src/components/SummerCourseTrackerView';
import { DataService } from '../../src/services/DataService';
import type { Committee, Course } from '../../src/types';
import { grant } from './setup';
import { toast } from '../../src/components/Toasts';

const course: Course = { id: 'crs', name: 'sheetta', year: '', startDate: '', endDate: '', status: 'active', isDefault: true, createdAt: '' };
const stages = (n: number) =>
  Object.fromEntries(
    ['registration', 'exam', 'scoring', 'aggregation', 'review', 'sheet', 'accreditation', 'announcement', 'ceremony'].map((k, i) => [k, { completed: i < n }])
  ) as any;
const committee = (i: number, over: Partial<Committee> = {}): Committee => ({
  id: `c${i}`, committeeNumber: i, committeeName: `لجنة ${i}`, members: [], branch: '', competitionBook: 'كتاب',
  generalNotes: '', courseId: 'crs', courseName: 'sheetta', stages: stages(1), createdDate: '', createdAtTime: '', ...over,
});

function renderSheet(committees: Committee[], onUpdateCommitteeFields = vi.fn(async () => true)) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <SummerCourseTrackerView committees={committees} courses={[course]} currentCourseId="crs" currentUser={{ id: 'u1' } as any}
        onUpdateCommitteeFields={onUpdateCommitteeFields} />
    </QueryClientProvider>
  );
  return { onUpdateCommitteeFields };
}

beforeEach(() => {
  grant(['summerRows.read', 'summerRows.write', 'committees.update', 'committees.create']);
  vi.spyOn(DataService, 'getSummerCourseRows').mockResolvedValue([]);
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const rowOf = (n: number) => screen.getByRole('button', { name: new RegExp(`لجنة #${n}$`) }).closest('tr')!;

describe('course sheet screen', () => {
  it('shows the sheikh\'s place stored on the committee', async () => {
    renderSheet([committee(1, { sheikhName: 'هشام نعام', sheikhCountry: 'مسجد النور' })]);
    await waitFor(() => expect(screen.getByDisplayValue('مسجد النور')).toBeTruthy());
    expect(screen.getByDisplayValue('هشام نعام')).toBeTruthy();
  });

  it('status filters count right, including «لم يتم الحفل» and «في انتظار الامتحان»', async () => {
    renderSheet([committee(1, { stages: stages(1) }), committee(2, { stages: stages(2) }), committee(3, { stages: stages(9) })]);
    await waitFor(() => screen.getByText(/لم يتم الحفل \(2\)/));
    expect(screen.getByText(/في انتظار الامتحان \(1\)/)).toBeTruthy();
    expect(screen.getByText(/تم الحفل \(1\)/)).toBeTruthy();
    fireEvent.click(screen.getByText(/لم يتم الحفل \(2\)/));
    expect(screen.queryByRole('button', { name: /لجنة #3$/ })).toBeNull();
    expect(screen.getByRole('button', { name: /لجنة #1$/ })).toBeTruthy();
  });

  it('typing in a cell saves once, when leaving the cell, on the committee itself', async () => {
    const { onUpdateCommitteeFields } = renderSheet([committee(1, { sheikhCountry: 'قديم' })]);
    const input = (await screen.findByDisplayValue('قديم')) as HTMLInputElement;
    fireEvent.focus(input);
    for (const v of ['م', 'مس', 'مسج', 'مسجد']) fireEvent.change(input, { target: { value: v } });
    expect(onUpdateCommitteeFields).not.toHaveBeenCalled();
    fireEvent.blur(input);
    expect(onUpdateCommitteeFields).toHaveBeenCalledTimes(1);
    expect(onUpdateCommitteeFields).toHaveBeenCalledWith('c1', { sheikhCountry: 'مسجد' });
  });

  it('Escape cancels the edit; an unchanged cell sends nothing', async () => {
    const { onUpdateCommitteeFields } = renderSheet([committee(1, { sheikhName: 'الشيخ' })]);
    const input = (await screen.findByDisplayValue('الشيخ')) as HTMLInputElement;
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: 'خطأ' } });
    fireEvent.keyDown(input, { key: 'Escape' });
    fireEvent.blur(input);
    fireEvent.focus(input);
    fireEvent.blur(input);
    expect(onUpdateCommitteeFields).not.toHaveBeenCalled();
    expect(input.value).toBe('الشيخ');
  });

  it('students count saves as a number, never negative', async () => {
    const { onUpdateCommitteeFields } = renderSheet([committee(1, { studentsCount: 5 })]);
    await waitFor(() => rowOf(1));
    const input = within(rowOf(1)).getByDisplayValue('5') as HTMLInputElement;
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: '-3' } });
    fireEvent.blur(input);
    expect(onUpdateCommitteeFields).toHaveBeenCalledWith('c1', { studentsCount: 0 });
  });

  it('without the right to edit committees, a linked row edit is refused with a clear message (nothing saved)', async () => {
    grant(['summerRows.read', 'summerRows.write']);
    vi.spyOn(DataService, 'saveSummerCourseRow').mockImplementation(async (r: any) => r);
    const errors = vi.spyOn(toast, 'error');
    const { onUpdateCommitteeFields } = renderSheet([committee(1, { sheikhName: 'الشيخ' })]);
    const input = (await screen.findByDisplayValue('الشيخ')) as HTMLInputElement;
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: 'آخر' } });
    fireEvent.blur(input);
    expect(onUpdateCommitteeFields).not.toHaveBeenCalled();
    expect(DataService.saveSummerCourseRow).not.toHaveBeenCalled();
    expect(errors).toHaveBeenCalledWith(expect.stringMatching(/صلاحية تعديل اللجان/));
  });
});
