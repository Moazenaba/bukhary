// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SummerCourseTrackerView } from '../../src/components/SummerCourseTrackerView';
import { DataService } from '../../src/services/DataService';
import type { Committee, Course } from '../../src/types';
import { grant } from './setup';

const course: Course = { id: 'crs', name: 'sheetta', year: '', startDate: '', endDate: '', status: 'active', isDefault: true, createdAt: '' };
const committee = (n: number): Committee => ({
  id: `c${n}`, committeeNumber: n, committeeName: `لجنة ${n}`, members: [], branch: '', competitionBook: '', generalNotes: '',
  courseId: 'crs', stages: {} as any, createdDate: '', createdAtTime: '',
});

function renderSheet(props: Record<string, unknown>) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <SummerCourseTrackerView committees={[committee(3), committee(7)]} courses={[course]} currentCourseId="crs" currentUser={{ id: 'u1' } as any} {...props} />
    </QueryClientProvider>
  );
}

beforeEach(() => {
  grant(['summerRows.read', 'summerRows.write', 'committees.create', 'committees.update', 'courses.write']);
  vi.spyOn(DataService, 'getSummerCourseRows').mockResolvedValue([]);
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('course sheet: add row and add course windows', () => {
  it('«إضافة صف جديد» creates a committee with the next number and the typed sheikh', async () => {
    const onAddCommitteeFromRow = vi.fn(async (c: Committee) => c);
    renderSheet({ onAddCommitteeFromRow });
    fireEvent.click(screen.getAllByRole('button', { name: /إضافة صف/ })[0]);
    fireEvent.change(await screen.findByPlaceholderText('اسم الشيخ المشرف على اللجنة...'), { target: { value: 'الشيخ هشام' } });
    fireEvent.click(screen.getByRole('button', { name: /إضافة الصف واللجنة/ }));
    await waitFor(() => expect(onAddCommitteeFromRow).toHaveBeenCalledTimes(1));
    expect(onAddCommitteeFromRow.mock.calls[0][0]).toMatchObject({ committeeNumber: 8, sheikhName: 'الشيخ هشام', courseId: 'crs', committeeName: 'لجنة الشيخ هشام' });
    await waitFor(() => expect(screen.queryByRole('button', { name: /إضافة الصف واللجنة/ })).toBeNull());
  });

  it('«إضافة دورة جديدة» adds the course and switches the sheet to it; an empty name is refused', async () => {
    const created: Course = { ...course, id: 'crs-new', name: 'دورة جديدة' };
    const onAddCourse = vi.fn(async () => created);
    const onSelectCourse = vi.fn();
    renderSheet({ onAddCourse, onSelectCourse });
    fireEvent.click(screen.getAllByRole('button', { name: /دورة جديدة/ })[0]);
    fireEvent.click(await screen.findByRole('button', { name: /حفظ وإضافة الدورة/ }));
    expect(onAddCourse).not.toHaveBeenCalled();
    fireEvent.change(screen.getByPlaceholderText(/مثال: دورة الصيف/), { target: { value: 'دورة جديدة' } });
    fireEvent.click(screen.getByRole('button', { name: /حفظ وإضافة الدورة/ }));
    await waitFor(() => expect(onAddCourse).toHaveBeenCalledWith(expect.objectContaining({ name: 'دورة جديدة' })));
    await waitFor(() => expect(onSelectCourse).toHaveBeenCalledWith('crs-new'));
  });
});
